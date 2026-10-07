"""A/B je Schritt (Inhaber 04.10.2026: „das gehirn soll jeden einzelnen unserer steps a/b splittesten können, damit es
mit den quoten immer genau schauen kann wo es KPIs weiter optimieren kann damit am ende mehr kunden bei rauskommen“).

Ein Gerüst für die ganze Kette (Schritte und Trichter in app/lib/ab-schritte.json, gleiche Regeln wie app/lib/ab.ts):

- Zuweisung: fest je Empfänger/Besucher über einen Hash (sha256(salt:einheit)), nie Cookie oder Browser-Speicher.
  Einheit = Käufer-ID (Mails), Probe/Checkout-ID oder Tages-Besucher-Hash (Website, lib/visitor.ts).
- Messung: signalwerk.ab_events (exposure = Variante gesehen/bekommen, conversion = Ziel erreicht); Antworten auf
  Mails zählt die Sicht ab_results direkt aus inbound_replies (nach dem Kontakt), Landingpages aus page_events.
- Auswertung: Bayes mit Beta(1+k, 1+n−k), P(B > A) per Normal-Näherung; Gewinner erst bei ≥ 95 % und Mindestmenge
  je Variante, sonst „läuft“; nach 21 Tagen ohne Entscheidung gestoppt (A bleibt).
- Regeln: nur Segment × Land aus config/fokus.yaml `tests` (Webagenturen US/UK/FR), immer nur EIN Element pro Test,
  höchstens ein laufender Test je Schritt und Land (auch per Datenbank-Index), Texte ohne Garantien, Druck, Preise oder
  Zahlen außer der 10. Nie Teil eines Tests: Drei-Stufen-Freigabe, Sperrliste, Abmeldelink/Pflichtfußzeile, Notbremse,
  Länder- und Prüfregeln, Preise (gleich in allen Ländern). Mail-Varianten müssen lint_draft bestehen, sonst bekommt
  die Mail die Kontrolle und zählt nicht.
- Gewinner übernehmen: ein beendeter Test mit Gewinner B gilt danach für alle (overrides), bis ein neuer Test ihn ablöst.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path

REG_FILE = Path(__file__).resolve().parents[2] / "app" / "lib" / "ab-schritte.json"
KEYS = ("A", "B")
STATUS = ("entwurf", "laeuft", "gewonnen", "gestoppt")
HYP_MAX = 160
GRUND_MAX = 160
_REG: dict | None = None


def registry() -> dict:
    global _REG
    if _REG is None:
        _REG = json.loads(REG_FILE.read_text(encoding="utf-8"))
    return _REG


def step(key: str | None) -> dict | None:
    return next((s for s in registry()["schritte"] if s["key"] == key), None)


def station(key: str | None) -> dict | None:
    return next((s for s in registry()["stationen"] if s["key"] == key), None)


# ------------------------------------------------------------------------------------------- Zuweisung
def assign(salt: str | None, unit: str | None) -> str:
    """'A' oder 'B', fest je Einheit. Leeres Salz = Betreff-A/B vom 04.10.2026 (drafts.subject_variant: Hash der
    Käufer-ID), damit dieselben Käufer dieselbe Variante behalten."""
    u = str(unit or "")
    key = f"{salt}:{u}" if salt else u
    return KEYS[hashlib.sha256(key.encode("utf-8")).digest()[0] % 2]


# ------------------------------------------------------------------------------------------- Statistik
def phi(x: float) -> float:
    """Standardnormalverteilung (Abramowitz/Stegun 7.1.26, Fehler < 1,5e-7) – gleiche Formel wie app/lib/ab.ts."""
    s = 1.0 if x >= 0 else -1.0
    z = abs(x) / math.sqrt(2.0)
    t = 1.0 / (1.0 + 0.3275911 * z)
    y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * math.exp(-z * z)
    return 0.5 * (1.0 + s * y)


def p_b_better(n_a: int, k_a: int, n_b: int, k_b: int) -> float:
    """P(Quote B > Quote A) mit Beta(1+k, 1+n−k) je Variante (Normal-Näherung der Beta-Verteilungen)."""
    def mv(n: int, k: int) -> tuple[float, float]:
        n, k = max(0, int(n)), max(0, min(int(k), int(n)))
        m = (k + 1) / (n + 2)
        return m, m * (1 - m) / (n + 3)
    ma, va = mv(n_a, k_a)
    mb, vb = mv(n_b, k_b)
    return phi((mb - ma) / math.sqrt(va + vb))


def rate(n: int, k: int) -> float:
    return min(k, n) / n if n > 0 else 0.0


def evaluate(test: dict, rows: list[dict], now: dt.datetime | None = None) -> dict:
    """Stand eines laufenden Tests: status 'laeuft' | 'gewonnen' | 'gestoppt', gewinner, sicherheit (0–1), grund.
    rows = [{variant, n, k}] aus ab_results."""
    reg = registry()
    now = now or dt.datetime.now(dt.timezone.utc)
    by = {r["variant"]: r for r in rows}
    a, b = by.get("A", {"n": 0, "k": 0}), by.get("B", {"n": 0, "k": 0})
    p = p_b_better(a["n"], a["k"], b["n"], b["k"])
    leader = "B" if p > 0.5 + 1e-6 else "A" if p < 0.5 - 1e-6 else None
    sure = max(p, 1 - p)
    min_n = int(test.get("min_n") or (step(test.get("step")) or {}).get("min_n") or 100)
    started = _ts(test.get("gestartet")) or now
    days = (now - started).total_seconds() / 86400
    enough = a["n"] >= min_n and b["n"] >= min_n
    out = {"sicherheit": round(sure, 4), "p_b": round(p, 4), "leader": leader, "gewinner": None, "status": "laeuft",
           "tage": round(days, 1), "grund": ""}
    ra, rb = rate(a["n"], a["k"]), rate(b["n"], b["k"])
    if enough and leader and sure >= reg["sicherheit"]:
        out.update(status="gewonnen", gewinner=leader,
                   grund=f"{leader} gewinnt: {_pct(rb if leader == 'B' else ra)} gegen {_pct(ra if leader == 'B' else rb)}, "
                         f"Sicherheit {_pct(sure, 0)}")
    elif days >= reg["max_tage"]:
        out.update(status="gestoppt", grund=f"{reg['max_tage']} Tage ohne klare Entscheidung – A bleibt")
    elif not enough:
        out["grund"] = f"zu wenig Daten ({min(a['n'], b['n'])} von {min_n} je Variante)"
    else:
        out["grund"] = f"läuft, Sicherheit {_pct(sure, 0)}"
    return out


def _pct(x: float, digits: int = 1) -> str:
    return f"{x * 100:.{digits}f}".replace(".", ",") + " %"


def _ts(x) -> dt.datetime | None:
    if not x:
        return None
    if isinstance(x, dt.datetime):
        return x if x.tzinfo else x.replace(tzinfo=dt.timezone.utc)
    try:
        return dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except ValueError:
        return None


# ------------------------------------------------------------------------------------------- Regeln
_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿\U0001F000-\U0001F2FF]")


def check_value(step_key: str, element: str, value) -> list[str]:
    """Fehler eines Variantenwerts (leer = in Ordnung). Gleiche Regeln wie app/lib/ab.ts checkValue."""
    s = step(step_key)
    if not s:
        return ["Schritt unbekannt"]
    spec = s["elemente"].get(element)
    if not spec:
        return [f"Element „{element}“ gibt es bei {s['titel']} nicht (erlaubt: {', '.join(s['elemente'])})"]
    if spec["art"] == "zahl":
        try:
            v = int(str(value).strip())
        except ValueError:
            return ["ganze Zahl erwartet"]
        return [] if spec["min"] <= v <= spec["max"] else [f"{spec['min']}–{spec['max']} erlaubt"]
    if spec["art"] == "wahl":
        return [] if str(value) in spec["werte"] else [f"erlaubt: {', '.join(spec['werte'])}"]
    t = re.sub(r"\s+", " ", str(value or "")).strip()
    errs = []
    if not t:
        errs.append("Text fehlt")
    if len(t) > spec["max"]:
        errs.append(f"höchstens {spec['max']} Zeichen (ist {len(t)})")
    low = t.lower()
    for w in registry()["verboten"]:
        if w in low:
            errs.append(f"verboten: „{w.strip()}“")
    if [x for x in re.findall(r"\d+", t) if x != "10"]:
        errs.append("keine Zahlen außer der 10 (keine erfundenen Zahlen)")
    if re.search(r"https?://|www\.|<\s*/?[a-z]", low):
        errs.append("keine Links oder HTML")
    if _EMOJI.search(t):
        errs.append("keine Emojis")
    if element == "betreff" and re.match(r"^\s*(re|fw|fwd|aw|wg|tr)\s*:", t, re.I):
        errs.append("Betreff täuscht eine Antwort vor")
    if spec.get("frage") and not t.endswith("?"):
        errs.append("muss eine Ja/Nein-Frage sein (endet mit ?)")
    return errs


def check_test(step_key: str, segment: str, country: str, element: str, b, a=None, hypothese: str = "",
               scope: tuple[list[str], list[str]] | None = None) -> list[str]:
    """Darf dieser Test angelegt werden? Freigabe-Liste, ein Element, Werte, Hypothese."""
    from lib.fokus import test_allowed
    errs = []
    if not step(step_key):
        return ["Schritt unbekannt"]
    if step(step_key).get("pausiert"):  # z. B. Versandzeit: Versand läuft rund um die Uhr (Inhaber 04.10.2026)
        return [f"Schritt pausiert: {step(step_key)['pausiert']}"]
    if not test_allowed(segment, country, scope):
        errs.append("Tests nur Webagenturen US/UK/FR (config/fokus.yaml tests)")
    errs += check_value(step_key, element, b)
    if a not in (None, ""):
        errs += [f"A: {e}" for e in check_value(step_key, element, a)]
        if str(a).strip() == str(b).strip():
            errs.append("A und B sind gleich")
    h = re.sub(r"\s+", " ", hypothese or "").strip()
    if not 5 <= len(h) <= HYP_MAX:
        errs.append(f"Hypothese: 5–{HYP_MAX} Zeichen")
    return errs


def variant_value(test: dict, key: str):
    """Wert des Elements in Variante key (None = Kontrolle unverändert)."""
    v = next((x for x in test.get("varianten") or [] if x.get("key") == key), None) or {}
    return v.get(test["element"])


# ------------------------------------------------------------------------------------------- Mails
CLOSING = re.compile(r"^(best regards|kind regards|regards|bien cordialement|cordialement|atenciosamente|"
                     r"saludos cordiales)\b", re.I)


def _paras(body: str) -> list[str]:
    return [p for p in re.split(r"\n\s*\n", (body or "").strip()) if p.strip()]


def replace_element(body: str, element: str, text: str) -> str | None:
    """Ein Element einer Mail ersetzen: einstieg = erster Absatz nach der Anrede, frage = letzter Satz (die Ja/Nein-
    Frage) im letzten Absatz mit Frage vor dem Gruß – das Angebot davor bleibt. None, wenn die Stelle nicht eindeutig
    ist (dann bleibt die Mail unverändert und zählt nicht)."""
    ps = _paras(body)
    end = next((i for i, p in enumerate(ps) if CLOSING.match(p.strip())), len(ps))
    if element == "einstieg":
        if len(ps) < 3 or len(ps[0].split()) > 8 or not ps[0].rstrip().endswith((",", ":")) or end < 2:
            return None
        ps[1] = text
    elif element == "frage":
        idx = next((i for i in range(end - 1, 0, -1) if ps[i].rstrip().endswith("?")), None)
        if idx is None:
            return None
        parts = re.split(r"(?<=[.!?])\s+(?=\S)", ps[idx].strip())
        ps[idx] = " ".join(parts[:-1] + [text])
    else:
        return None
    return "\n\n".join(ps)


MAIL_STEPS = {"initial": ("mail_betreff", "mail_einstieg"), "followup": ("nachfass",),
              "sample_followup": ("probe_nachfrage",)}


def _firm(p: dict) -> str:
    """Kurzname der Firma für {firma} im Einstieg (wie die Anrede der Kaltmail)."""
    try:
        from drafts import short_name
        return short_name(p.get("company_name") or "") or ""
    except Exception:  # noqa: BLE001
        return ""


def _apply(test: dict, value, subject: str, body: str, firm: str = "") -> tuple[str, str] | None:
    el = test["element"]
    if value in (None, ""):
        return subject, body
    if isinstance(value, str) and "{firma}" in value:
        if not firm:
            return None
        value = value.replace("{firma}", firm)
    if el == "betreff":
        return str(value), body
    if el in ("einstieg", "frage"):
        nb = replace_element(body, el, str(value))
        return (subject, nb) if nb is not None else None
    return subject, body  # tage/fenster wirken nicht auf den Text


class Ctx:
    """Laufende Tests und übernommene Gewinner (einmal je Lauf geladen). Fehlt die Tabelle, ist alles leer."""

    def __init__(self, db=None, tests: list[dict] | None = None):
        if tests is None:
            try:
                tests = db.select("ab_tests", {"status": "in.(laeuft,gewonnen)", "select": "*",
                                               "order": "beendet.asc.nullsfirst"}) if db is not None else []
            except Exception as exc:  # noqa: BLE001 - A/B darf den Versand nie stoppen
                print(f"A/B-Tests nicht lesbar ({exc.__class__.__name__}) – ohne Tests weiter")
                tests = []
        self.tests = tests or []
        self.belege: BelegQuelle | None = None  # outreach.py setzt sie (Beleg-Einstieg); ohne Quelle keine Variante B

    def running(self, step_key: str, segment: str | None, country: str | None) -> dict | None:
        from lib.fokus import test_allowed
        if not test_allowed(segment, country):
            return None
        return next((t for t in self.tests if t.get("status") == "laeuft" and t.get("step") == step_key
                     and (t.get("country") or "").upper() == (country or "").upper()
                     and (t.get("segment_id") or "") == (segment or "")), None)

    def overrides(self, step_key: str, segment: str | None, country: str | None) -> dict:
        """Übernommene Gewinner (status gewonnen, Gewinner B): neuester je Element gilt für alle."""
        from lib.fokus import test_allowed
        if not test_allowed(segment, country):
            return {}
        out = {}
        done = [t for t in self.tests if t.get("status") == "gewonnen" and t.get("gewinner") == "B"
                and t.get("step") == step_key and (t.get("country") or "").upper() == (country or "").upper()
                and (t.get("segment_id") or "") == (segment or "")]
        for t in sorted(done, key=lambda t: str(t.get("beendet") or "")):
            v = variant_value(t, "B")
            if v not in (None, ""):
                out[t["element"]] = v
        return out

    def value(self, step_key: str, element: str, segment, country, unit) -> tuple[object, dict]:
        """Wert eines Elements für diese Einheit: laufender Test (Variante) vor Gewinner vor None.
        Zweites Ergebnis = Marke {test_id: variante} (leer ohne Test)."""
        t = self.running(step_key, segment, country)
        if t and t.get("element") == element:
            k = assign(t.get("salt") or "", unit)
            v = variant_value(t, k)
            if v in (None, ""):
                v = self.overrides(step_key, segment, country).get(element)
            return v, {str(t["id"]): k}
        return self.overrides(step_key, segment, country).get(element), {}

    def prepare_message(self, m: dict, p: dict, segment: str | None, kind: str, lint) -> tuple[str, str, dict]:
        """(Betreff, Text, Marken) einer freigegebenen Mail kurz vor dem Versand. lint(subject, body) -> bool.
        Zuerst übernommene Gewinner, dann der laufende Test: die Variante B muss sich anwenden lassen und die
        Schreibregeln bestehen – sonst bleibt die Mail unverändert und zählt nicht (A und B gleich behandelt)."""
        subject, body = m.get("subject") or "", m.get("body") or ""
        country = p.get("country")
        marks: dict = {}
        firm = _firm(p)
        for sk in MAIL_STEPS.get(kind, ()):
            for el, v in self.overrides(sk, segment, country).items():
                res = _apply({"element": el}, v, subject, body, firm)
                if res and lint(*res):
                    subject, body = res
            t = self.running(sk, segment, country)
            if not t or t["element"] not in ("betreff", "einstieg", "frage"):
                continue
            if is_beleg_test(t):
                res = self._beleg(t, m, p, subject, body, firm, lint)
                if res:
                    subject, body, marks[str(t["id"])] = res
                continue
            res_b = _apply(t, variant_value(t, "B"), subject, body, firm)
            res_a = _apply(t, variant_value(t, "A"), subject, body, firm)
            if not res_a or not res_b or not lint(*res_a) or not lint(*res_b):
                continue
            k = assign(t.get("salt") or "", p.get("id"))
            subject, body = res_b if k == "B" else res_a
            marks[str(t["id"])] = k
        return subject, body, marks

    def _beleg(self, t: dict, m: dict, p: dict, subject: str, body: str, firm: str, lint) -> tuple[str, str, str] | None:
        """Beleg-Einstieg (Auftrag c5da4536): Variante B hängt 2 echte, freigegebene Premium-Anlässe aus dem Land des
        Käufers an den Einstieg ({belege}). A und B gleich behandelt: der Käufer zählt nur, wenn das Land bereit ist
        (freie Premium-Leads ≥ 400) und A sowie eine typische B-Fassung die Schreibregeln bestehen. Bei B müssen danach
        echte Belege da sein, die Fassung mit ihnen die Regeln bestehen und die Reservierung für genau diesen Käufer
        gelingen – sonst bleibt die Mail unverändert und zählt nicht."""
        from lib import belege
        src, cc = self.belege, (p.get("country") or "").upper()
        muster = belege.muster(cc)
        if src is None or not muster or not src.bereit(cc):
            return None
        vb = str(variant_value(t, "B") or "")
        res_a = _apply(t, variant_value(t, "A"), subject, body, firm)
        res_m = _apply(t, vb.replace(BELEGE, muster), subject, body, firm)
        if not res_a or not res_m or not lint(*res_a) or not lint(*res_m):
            return None
        k = assign(t.get("salt") or "", p.get("id"))
        if k == "A":
            # gleich behandelt: A zählt nur, solange B-Käufer gerade Belege bekommen könnten
            return (*res_a, "A") if src.vorrat(cc) else None
        for _ in range(BELEG_VERSUCHE):
            pick = src.ziehen(cc)
            if not pick:
                return None
            text, ids = pick
            res_b = _apply(t, vb.replace(BELEGE, text), subject, body, firm)
            if not res_b or not lint(*res_b):
                continue  # z. B. sehr lange Firmennamen: nächstes Paar (die Leads bleiben frei)
            if not src.reservieren(p, m, t, ids):
                return None
            return (*res_b, "B")
        return None

    def send_window(self, segment: str | None, country: str | None, unit) -> tuple[str | None, dict]:
        """Versandzeit-Test: 'frueh' (erste Hälfte des Fensters) oder 'spaet' (zweite Hälfte), sonst None."""
        if (step("mail_zeit") or {}).get("pausiert"):  # Versand rund um die Uhr (Inhaber 04.10.2026)
            return None, {}
        v, mark = self.value("mail_zeit", "fenster", segment, country, unit)
        return (str(v) if v in ("frueh", "spaet") else None), mark

    def days(self, step_key: str, segment, country, unit, default: int) -> tuple[int, dict]:
        """Tage bis zur Nachfass-/Probe-Nachfrage für diese Einheit (Test oder Gewinner), sonst default."""
        v, mark = self.value(step_key, "tage", segment, country, unit)
        try:
            return (int(v) if v not in (None, "") else default), mark
        except (TypeError, ValueError):
            return default, {}

    def min_days(self, step_key: str, default: int) -> int:
        """Kleinste mögliche Wartezeit (für die Abfrage der Kandidaten)."""
        vals = [default]
        for t in self.tests:
            if t.get("step") == step_key and t.get("element") == "tage" and t.get("status") in ("laeuft", "gewonnen"):
                for v in t.get("varianten") or []:
                    try:
                        vals.append(int(v.get("tage")))
                    except (TypeError, ValueError):
                        pass
        return min(vals)


# ------------------------------------------------------------------------------------------- Beleg-Einstieg
BELEGE = "{belege}"    # Platzhalter in Variante B (mail_einstieg), ersetzt durch lib.belege.einstieg()
BELEG_VERSUCHE = 3     # so viele Beleg-Paare je Mail, falls ein Paar die Wortgrenze sprengt
BELEG_SEITE = 40       # Kandidaten je Abruf (in einem Rutsch durch die Drei-Stufen-Freigabe)
BELEG_SEITEN = 5       # höchstens so viele Abrufe je Land und Lauf
BELEG_ALT_STUNDEN = 2  # nicht gesendete Reservierungen abgebrochener Läufe danach zurückgeben


def is_beleg_test(t: dict) -> bool:
    v = variant_value(t, "B")
    return t.get("step") == "mail_einstieg" and t.get("element") == "einstieg" and isinstance(v, str) and BELEGE in v


def beleg_check(t: dict) -> list[str]:
    """Zusatzregeln eines Beleg-Tests (ab.py anlegen/starten): Platzhalter genau einmal in B, nie in A, A gesetzt."""
    vb, va = variant_value(t, "B"), variant_value(t, "A")
    errs = []
    if str(vb or "").count(BELEGE) != 1:
        errs.append("Beleg-Test: {belege} genau einmal in B")
    if not va:
        errs.append("Beleg-Test: A muss den heutigen Einstieg enthalten")
    elif BELEGE in str(va):
        errs.append("Beleg-Test: {belege} nie in A")
    return errs


class BelegQuelle:
    """Freigegebene Premium-Leads für den Beleg-Einstieg (je Lauf ein Vorrat je Land).

    Auswahl: S2, Land des Käufers, Status new, Premium (≥ 70 Punkte, Stufe premium, Ereignis ≤ 14 Tage), Anlass mit
    Kurzform (lib.belege.ANLASS), Firmenname mit erkannter Kapitalgesellschaft (keine Personennamen), je Firma einmal.
    Jeder Kandidat geht vorher durch die Drei-Stufen-Freigabe (lib.release_gate; im echten Lauf mit Live-Nachprüfung und
    Protokoll, im Probelauf ohne Schreiben). Reservierung atomar per beleg_reservieren(): Leads 'new' → 'reserved' für
    genau diesen Käufer (beleg_reservierungen), nie an andere. Ging die Mail nicht raus, gibt freigeben_offen() sie
    zurück. Jeder Fehler (Tabelle fehlt, Netz) = keine Belege: die Mail bleibt unverändert und zählt nicht."""

    def __init__(self, db, live: bool, log=print, gate=None, today: dt.date | None = None):
        self.db, self.live, self.log, self.gate = db, live, log, gate
        self.today = today or dt.datetime.now(dt.timezone.utc).date()
        self._ready: dict[str, bool] = {}
        self._pool: dict[str, list[dict]] = {}
        self._offset: dict[str, int] = {}
        self._used: set[str] = set()           # Firmen, die in diesem Lauf schon Kandidat waren (je Firma einmal)
        self.offen: dict[str, list[str]] = {}  # message_id -> in diesem Lauf reserviert, noch nicht gesendet
        if live:
            try:  # Reservierungen abgebrochener Läufe zurückgeben (nie gesendete Mails)
                db.rpc("beleg_freigeben", {"p_message": None, "p_stunden": BELEG_ALT_STUNDEN})
            except Exception as exc:  # noqa: BLE001 - z. B. Migration fehlt: dann gar keine Belege
                log(f"Beleg-Einstieg aus ({exc.__class__.__name__}) – Mails bleiben unverändert")
                self._ready = {c: False for c in ("US", "UK", "FR")}

    def bereit(self, cc: str) -> bool:
        """Freie Premium-Leads im Land ≥ 2 × Bedarf (lib.belege.bereit, heute nur US)."""
        from lib import belege
        if cc not in self._ready:
            try:
                rows = self.db.rpc("premium_status", {}) or []
                frei = next((int(r.get("premium_frei") or 0) for r in rows
                             if r.get("segment_id") == "S2" and (r.get("country") or "").upper() == cc), 0)
            except Exception as exc:  # noqa: BLE001
                self.log(f"Beleg-Einstieg: Premium-Bestand nicht lesbar ({exc.__class__.__name__})")
                frei = 0
            self._ready[cc] = belege.bereit(frei)
        return self._ready[cc]

    def _fill(self, cc: str) -> None:
        from lib import belege
        lang = "fr" if cc == "FR" else "en"
        need, cap = belege.BELEGE_JE_MAIL, BELEG_SEITE * BELEG_SEITEN
        while len(self._pool.get(cc, [])) < need and self._offset.get(cc, 0) < cap:
            off = self._offset.get(cc, 0)
            self._offset[cc] = off + BELEG_SEITE
            since = (self.today - dt.timedelta(days=14)).isoformat()
            rows = self.db.select("leads", {
                "segment_id": "eq.S2", "country": f"eq.{cc}", "status": "eq.new", "premium_score": "gte.70",
                "premium->>tier": "eq.premium", "event_date": f"gte.{since}",
                "signal_type": f"in.({','.join(sorted(belege.ANLASS[lang]))})",
                "order": "premium_score.desc,event_date.desc,id.asc", "limit": str(BELEG_SEITE), "offset": str(off),
                "select": "id,company_id,signal_type,event_date"}) or []
            if not rows:
                self._offset[cc] = cap
                break
            cids = sorted({r["company_id"] for r in rows if r.get("company_id")})
            names = {c["id"]: c.get("name") or "" for c in (self.db.select(
                "watch_companies", {"id": f"in.({','.join(cids)})", "select": "id,name"}) if cids else []) or []}
            cand = []
            for r in rows:
                name = " ".join((names.get(r.get("company_id")) or "").split())
                key = name.lower()
                if not name or key in self._used:
                    continue  # je Firma höchstens einmal im Lauf (auch über Seiten hinweg)
                ld = {**r, "company_name": name, "country": cc}
                if belege.zeile(ld, lang) is None:
                    continue  # keine Kapitalgesellschaft, Anlass ohne Kurzform oder ohne Datum
                self._used.add(key)
                cand.append(ld)
            if cand:
                ok = self._release(cand, cc)
                self._pool.setdefault(cc, []).extend(c for c in cand if c["id"] in ok)

    def _release(self, cand: list[dict], cc: str) -> set[str]:
        """Drei-Stufen-Freigabe (+ Inhaber-Regeln): nur freigegebene Leads sind Belege."""
        if self.gate is not None:
            return set(self.gate(cand, cc))
        from lib import release_gate as G
        vs = G.check(self.db, [c["id"] for c in cand], country=cc, live=self.live)
        if self.live:
            G.persist(self.db, vs, "beleg_einstieg", log=self.log)
        return {v.lead_id for v in vs if v.ok}

    def vorrat(self, cc: str) -> bool:
        """Gibt es gerade mindestens ein Beleg-Paar (ohne es zu verbrauchen)?"""
        from lib import belege
        try:
            self._fill(cc)
        except Exception as exc:  # noqa: BLE001 - Belege dürfen den Versand nie stoppen
            self.log(f"Beleg-Einstieg: Auswahl nicht möglich ({exc.__class__.__name__})")
            self._offset[cc] = BELEG_SEITE * BELEG_SEITEN
        return len(self._pool.get(cc, [])) >= belege.BELEGE_JE_MAIL

    def ziehen(self, cc: str) -> tuple[str, list[str]] | None:
        """(Beleg-Satz, Lead-IDs) aus 2 freigegebenen Leads verschiedener Firmen, oder None."""
        from lib import belege
        if not self.vorrat(cc):
            return None
        pool = self._pool[cc]
        pick = [pool.pop(0) for _ in range(belege.BELEGE_JE_MAIL)]
        text = belege.einstieg(pick, cc)
        return (text, [x["id"] for x in pick]) if text else None

    def reservieren(self, p: dict, m: dict, t: dict, ids: list[str]) -> bool:
        """Leads atomar für genau diesen Käufer reservieren. Probelauf: nichts schreiben (nur Vorschau)."""
        if not self.live:
            return True
        try:
            self.db.rpc("beleg_freigeben", {"p_message": m["id"], "p_stunden": BELEG_ALT_STUNDEN})  # alter Versuch
            got = self.db.rpc("beleg_reservieren", {"p_prospect": p["id"], "p_message": m["id"], "p_test": t["id"],
                                                    "p_lead_ids": ids})
        except Exception as exc:  # noqa: BLE001 - vergeben oder Tabelle fehlt: Mail unverändert
            self.log(f"Beleg-Einstieg: Reservierung nicht möglich ({str(exc)[:80]})")
            return False
        if sorted(str(x) for x in (got or [])) != sorted(ids):
            return False
        self.offen[str(m["id"])] = list(ids)
        return True

    def gesendet(self, message_id) -> None:
        """Mail ist raus: Reservierung bleibt dauerhaft für diesen Käufer."""
        if self.offen.pop(str(message_id), None) is None:
            return
        try:
            self.db.rpc("beleg_gesendet", {"p_message": str(message_id)})
        except Exception as exc:  # noqa: BLE001 - Leads bleiben trotzdem 'reserved' (nie an andere)
            self.log(f"Beleg-Einstieg: Versand nicht vermerkt ({exc.__class__.__name__})")

    def freigeben_offen(self) -> int:
        """Ende des Laufs: Reservierungen von Mails, die nicht rausgingen, zurückgeben (Leads wieder 'new')."""
        n = 0
        for mid in list(self.offen):
            try:
                self.db.rpc("beleg_freigeben", {"p_message": mid, "p_stunden": BELEG_ALT_STUNDEN})
                n += 1
            except Exception as exc:  # noqa: BLE001 - spätestens ein Lauf nach 2 h gibt sie zurück
                self.log(f"Beleg-Einstieg: Rückgabe später ({exc.__class__.__name__})")
            self.offen.pop(mid, None)
        return n


# ------------------------------------------------------------------------------------------- Datenbank
def record(db, marks: dict, unit, kind: str = "exposure") -> int:
    """Ereignisse je Marke {test_id: variante} schreiben (doppelte ignoriert). Fehler stoppen nie den Ablauf."""
    rows = [{"test_id": tid, "variant": v, "unit": str(unit)[:80], "kind": kind} for tid, v in (marks or {}).items()
            if v in KEYS and unit]
    if not rows:
        return 0
    try:
        db.insert("ab_events", rows, upsert_on="test_id,unit,kind", ignore_duplicates=True)
        return len(rows)
    except Exception as exc:  # noqa: BLE001
        print(f"A/B-Ereignis nicht gespeichert ({exc.__class__.__name__})")
        return 0


def results(db) -> dict[str, list[dict]]:
    """ab_results je Test: {test_id: [{variant, n, k, k_positiv}]}."""
    out: dict[str, list[dict]] = {}
    for r in db.select("ab_results", {"select": "*"}) or []:
        out.setdefault(str(r["test_id"]), []).append(r)
    return out


def funnel(db, days: int = 30, scope: tuple[list[str], list[str]] | None = None) -> list[dict]:
    """Trichter der Test-Freigabe (Webagenturen US/UK/FR): [{station, n, k}] über ab_funnel."""
    from lib.fokus import test_scope
    segs, countries = scope or test_scope()
    return db.rpc("ab_funnel", {"p_segments": segs, "p_countries": countries, "p_days": days}) or []


def engpass(rows: list[dict]) -> dict | None:
    """Engpass = Station mit dem größten Abfall gegenüber ihrem Richtwert (Quote/Richtwert am kleinsten),
    nur Stationen mit genug Daten (engpass_min_n). None ohne Daten."""
    reg = registry()
    best = None
    for r in rows:
        st = station(r.get("station"))
        n, k = int(r.get("n") or 0), int(r.get("k") or 0)
        if not st or n < reg["engpass_min_n"]:
            continue
        score = rate(n, k) / st["richtwert"]
        if best is None or score < best[0]:
            best = (score, {**r, "score": round(score, 3), "titel": st["titel"]})
    return best[1] if best else None


def melden(db, titel: str, grund: str, subject: str, metrics: dict | None = None, update: bool = True) -> None:
    """Entscheidung mit Kurzfassung (decisions) und kurze Meldung im goldenen Gehirn-Chat."""
    from lib.kurz import insert_decisions, kuerzen
    insert_decisions(db, {"type": "note", "subject": subject[:300], "reasoning": grund, "metrics": metrics or {},
                          "status": "done", "kurz_titel": kuerzen(titel, 60), "kurz_grund": kuerzen(grund, GRUND_MAX)})
    if not update:
        return
    try:
        import jarvis_chat
        jarvis_chat.gehirn_update(db, f"A/B: {kuerzen(titel, 60)}\n{kuerzen(grund, 160)}",
                                  [{"label": "A/B je Schritt", "url": "/dashboard/gehirn#ab"}])
    except Exception as exc:  # noqa: BLE001 - Meldung darf nie den Test stoppen
        print(f"Gehirn-Chat nicht erreichbar ({exc.__class__.__name__})")
