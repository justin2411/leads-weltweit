"""Abteilungs-Motor: JARVIS baut sich selbst (Inhaber 04.10.2026: „Lass JARVIS sich selber bauen für viele verschiedene
Bereiche, die wir im Dashboard haben; er soll alles nutzen und dafür Agenten haben, damit er Umsatz vergrößert“).

Je Abteilung (signalwerk.departments) Ziel gegen Ist → Lücke 0–1. Gewichtet nach Umsatznähe (Vertrieb, Kundenservice,
Marketing/Proben vor Finanzen/Strategie vor Qualität/Produktion vor Recht) bekommen die 2–3 Abteilungen mit der größten
gewichteten Lücke je höchstens einen offenen Auftrag in agent_tasks (Fach-Agent der Abteilung, Ziel, Erfolgskennzahl,
Grenzen). Ergebnis je Abteilung in signalwerk.department_gaps (Büro /dashboard/firma/[bereich]: „Lücke zum Ziel“).

Quellen (nur lesend): firma_lage(Segment, Länder) für die Fokus-Tests (config/fokus.yaml `tests`, heute S2 × US/UK/FR),
Soll aus company_goals (Ziel-Key der Abteilung), sonst departments.ziel_soll. Fehlt ein Ist oder Soll → keine Lücke,
kein Auftrag (nie erfundene Zahlen).

Regeln:
  - höchstens 1 offener Motor-Auftrag je Abteilung, höchstens 6 offene Motor-Aufträge gesamt, höchstens 3 neue je Lauf
  - kein neuer Auftrag derselben Abteilung binnen 24 h nach dem letzten Motor-Auftrag (Wirkung abwarten)
  - Auftrag nur an einen freien Agenten A1–A8, einer bleibt für den Inhaber frei
  - höchstens alle 2 h ein Lauf mit Aufträgen (Wachhund ruft alle 15–30 min auf)
  - settings.brain_enabled = false oder werke_paused.agenten → nur rechnen und anzeigen, keine Aufträge
  - Aufträge ändern nie Versand (einschalten/erhöhen), Länder, Sperrliste, Notbremse, Freigabe, Prüfregeln; kosten
    nichts; löschen nichts (feste Vorlagen, Prüfung `sicher`)

  python scripts/abteilungen_motor.py lauf            # nur rechnen und anzeigen
  python scripts/abteilungen_motor.py lauf --apply    # Lücken speichern, Aufträge anlegen
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib.kurz import GRUND_MAX, TITEL_MAX, kuerzen  # noqa: E402

BY = "Abteilungs-Motor"   # agent_tasks.created_by
OPEN = ("offen", "laeuft")
AGENT_COUNT = 8           # A1–A8
KEEP_FREE = 1
MAX_OFFEN = 6             # offene Motor-Aufträge gesamt
MAX_NEU = 3               # neue je Lauf (2–3 Abteilungen mit der größten Lücke)
TOP = 3
COOLDOWN = dt.timedelta(hours=24)
TAKT = dt.timedelta(minutes=110)    # „alle 2 h“ (Wachhund-Läufe liegen 15–30 min auseinander)
MIN_LUECKE = 0.05         # darunter gilt das Ziel als erreicht
MIN_ERSTMAILS = 30        # Antwortquote erst ab dieser Menge bewerten
MIN_GEPRUEFT = 20         # Fehlerquote erst ab dieser Menge bewerten
BRIEF_MAX = 1000

# Umsatznähe (Auftrag Inhaber: „Vertrieb/Antworten/Proben vor Infrastruktur“)
GEWICHT = {"vertrieb": 1.0, "kundenservice": 1.0, "marketing": 0.9, "finanzen": 0.6, "strategie": 0.6,
           "qualitaet": 0.5, "produktion": 0.5, "recht": 0.3}
GEWICHT_SONST = 0.4

GRENZEN = ("Grenzen: nur S2 × {scope}; Versand nie einschalten oder über die Limits erhöhen; Länder, Sperrliste, "
           "Notbremse, Freigabe und Prüfregeln unverändert; keine Kosten; nichts löschen.")

# Feste Vorlagen je Abteilung: (kind, Titel, Aufgabe, Erfolgskennzahl). {ist}/{soll}/{einheit} aus der Lücke.
VORLAGEN: dict[str, tuple[str, str, str, str]] = {
    "vertrieb": ("gehirn", "Antwortquote {ist}{einheit} → {soll}{einheit} heben",
                 "Trichter-Agent: schwächsten Schritt je Land (cohort_funnel) mit Zahlen nennen und genau einen Test "
                 "für Betreff oder Einstieg als Entwurf für den Test-Agenten anlegen (ab.py, eine Sache je Test).",
                 "Antwortquote der Erstmails nach 14 Tagen"),
    "kundenservice": ("frage", "{ist} offene Kaufinteressen vorbereiten",
                      "Je offene Antwort mit Kaufinteresse oder Frage eine passende Probe aus dem Vorrat und einen "
                      "kurzen Antwort-Entwurf im Cockpit vorbereiten (draft_text). Nicht selbst senden, keine Preise.",
                      "offene Kaufinteressen = 0"),
    "marketing": ("gehirn", "Proben {ist}/Woche → {soll} steigern",
                  "Test-Agent: Weg Landingpage → Probe-Button (web_funnel) je Land prüfen, den schwächsten Schritt "
                  "nennen und genau einen Seiten-Test (Variante B) für Webagenturen anlegen.",
                  "angeforderte Proben in 7 Tagen"),
    "finanzen": ("gehirn", "Umsatz {ist} → {soll}/Monat: Hebel finden",
                 "Finanz-Agent: Weg Probe → Tarifseite → Stripe → Abo (7/30 Tage) messen, den Schritt mit dem größten "
                 "Verlust nennen und einen Vorschlag als Wissensnotiz anlegen. Preise nicht ändern.",
                 "Umsatz pro Monat (MRR)"),
    "strategie": ("gehirn", "Kunden {ist} → {soll}: stärksten Hebel wählen",
                  "Strategie-Agent: Lücken aller Abteilungen (department_gaps) lesen, den einen Hebel mit der größten "
                  "Wirkung auf zahlende Kunden wählen und als kurze Entscheidung (decisions) festhalten.",
                  "zahlende Kunden"),
    "qualitaet": ("pruefen", "Lead-Fehler {ist}{einheit} → {soll}{einheit} senken",
                  "Qualitäts-Agent: Ausreißer der Dauerprüfung (lead_checks, pruef_stats_daily) lesen, Quelle/Feld mit "
                  "den meisten Fehlern finden und in der Quelle beheben (PR).",
                  "Fehlerquote der Freigabe-Stichprobe"),
    "produktion": ("quelle", "Grüne Leads {ist} → {soll}/Woche",
                   "Quellen-Agent: schwächste Lead-Linie (run_stats, 7 Tage) finden, Quelle verbessern oder nach "
                   "Scout-Regeln eine neue kostenlose Quelle testen (≥ 10 grüne Leads) und einbinden.",
                   "grüne Leads in 7 Tagen"),
    "recht": ("pruefen", "Spam-Beschwerden {ist} → {soll}: Ursache",
              "Recht-Agent: Beschwerden und Abmeldungen (30 Tage) je Postfach und Text lesen, Pflichtfußzeile und "
              "Abmeldelink prüfen, Ursache in 1 Satz als Wissensnotiz. Nur lesen und melden.",
              "Spam-Beschwerden in 30 Tagen"),
}

# Aktionen, die ein Motor-Auftrag nie verlangen darf (Prüfung der Aufgabe, nicht des Grenzen-Satzes)
_VERBOTEN = re.compile(
    r"versand\s+(ein|an)schalten|aktiv:\s*true|limit\w*\s+erh[öo]h|tagesziel\s+erh[öo]h|sperrliste\s+(änder|leer|aufheb)"
    r"|notbremse\s+(aus|lösen|änder)|freigabe\s+(locker|aus|änder)|prüfregel\w*\s+(änder|locker)"
    r"|countries\.yaml|allowed:\s*true|lösch|delete|truncate|drop\s|bezahl|kauf\w*\s+(tarif|upgrade)|upgrade|preis\w*\s+änder",
    re.I)


def sicher(aufgabe: str) -> bool:
    """True, wenn die Aufgabe keine verbotene Aktion verlangt."""
    return not _VERBOTEN.search(aufgabe or "")


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _num(x) -> float | None:
    if x is None or x == "":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v else None


def ist_wert(key: str, lage: dict) -> float | None:
    """Ist einer Ziel-Kennzahl aus firma_lage (gleiche Bedeutung wie im Büro; Prozent als 0–100)."""
    lage = lage or {}
    if key == "antwortquote":
        laender = (lage.get("laender") or {}).values()
        n = sum(_num((x or {}).get("erstmails")) or 0 for x in laender)
        r = sum(_num((x or {}).get("antworten")) or 0 for x in laender)
        return None if n < MIN_ERSTMAILS else round(100 * r / n, 2)
    if key == "lead_fehler":
        b, n = _num(lage.get("bestanden")), _num(lage.get("bestanden_n")) or 0
        return None if b is None or n < MIN_GEPRUEFT else round((1 - b) * 100, 2)
    return _num(lage.get(key))


def luecke(ist: float | None, soll: float | None, richtung: str) -> float | None:
    """0 = Ziel erreicht, 1 = maximal weit weg. hoch: 1 − Ist/Soll; runter: 1 − Soll/Ist (Soll 0: jedes Ist > 0 = 1)."""
    if ist is None or soll is None:
        return None
    if richtung == "runter":
        if ist <= soll:
            return 0.0
        return 1.0 if soll <= 0 else round(1 - soll / ist, 4)
    if soll <= 0:
        return 0.0
    return round(max(0.0, min(1.0, 1 - ist / soll)), 4)


def soll_von(dep: dict, ziele: list[dict]) -> tuple[float | None, str]:
    """Soll und Richtung: company_goals (Ziel-Key) vor departments.ziel_soll."""
    g = next((z for z in ziele or [] if z.get("key") == dep.get("ziel_key")), None)
    if g:
        return _num(g.get("soll")), ("runter" if g.get("richtung") == "runter" else "hoch")
    return _num(dep.get("ziel_soll")), ("runter" if dep.get("ziel_richtung") == "runter" else "hoch")


def _fmt(v: float | None) -> str:
    if v is None:
        return "–"
    return f"{v:,.1f}".rstrip("0").rstrip(".").replace(",", "X").replace(".", ",").replace("X", ".")


def bewerten(deps: list[dict], lage: dict, ziele: list[dict]) -> list[dict]:
    """Lücke je Abteilung, sortiert nach gewichteter Lücke (größte zuerst). Reine Funktion."""
    out = []
    for d in deps:
        slug = str(d.get("slug") or "")
        if not slug or d.get("aktiv") is False:
            continue
        key = str(d.get("ziel_key") or "")
        soll, richtung = soll_von(d, ziele)
        ist = ist_wert(key, lage)
        lk = luecke(ist, soll, richtung)
        g = GEWICHT.get(slug, GEWICHT_SONST)
        out.append({"slug": slug, "name": d.get("name") or slug, "ziel_key": key, "ist": ist, "soll": soll,
                    "richtung": richtung, "luecke": lk, "gewicht": g, "score": round((lk or 0) * g, 4),
                    "sort": int(d.get("sort") or 0), "einheit": " %" if key in ("antwortquote", "lead_fehler") else ""})
    out.sort(key=lambda x: (-x["score"], x["sort"], x["slug"]))
    for i, x in enumerate(out, 1):
        x["rang"] = i
    return out


def auftrag(x: dict, rolle: str | None, scope: tuple[list[str], list[str]]) -> dict | None:
    """Auftrag aus der festen Vorlage der Abteilung; None ohne Vorlage oder wenn die Aufgabe nicht sicher ist."""
    v = VORLAGEN.get(x["slug"])
    if not v:
        return None
    kind, titel, aufgabe, kennzahl = v
    if not sicher(aufgabe):
        return None
    segs, countries = scope
    # Testfälle nur für Segment × Land aus der Freigabe-Liste (heute S2 × US/UK/FR)
    from lib.fokus import test_allowed
    laender = [c for c in countries if test_allowed("S2", c, scope)]
    if "S2" not in segs or not laender:
        return None
    vals = {"ist": _fmt(x["ist"]), "soll": _fmt(x["soll"]), "einheit": x["einheit"]}
    t = kuerzen(titel.format(**vals), TITEL_MAX)
    lk = round((x["luecke"] or 0) * 100)
    grund = kuerzen(f"{x['name']}: {lk} % Lücke zum Ziel ({vals['ist']}{x['einheit']} statt {vals['soll']}{x['einheit']}).",
                    GRUND_MAX)
    scope_txt = "/".join(laender)
    brief = (f"Motor {x['name']}: {t}. Ziel: Lücke {lk} % schließen. {aufgabe} Erfolgskennzahl: {kennzahl}. "
             f"{GRENZEN.format(scope=scope_txt)}")
    return {"kind": kind, "rolle": rolle, "titel": t, "grund": grund, "brief": kuerzen(brief, BRIEF_MAX)}


def _ts(x) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(str(x).replace("Z", "+00:00")) if x else None
    except ValueError:
        return None


def schalter(db) -> tuple[bool, str]:
    """(Aufträge erlaubt?, Grund). brain_enabled = false oder werke_paused.agenten → nur anzeigen."""
    try:
        st = (db.select("settings", {"select": "brain_enabled", "limit": "1"}) or [{}])[0]
    except Exception:  # noqa: BLE001 - nicht lesbar = vorsichtig nur anzeigen
        return False, "Einstellungen nicht lesbar"
    if st.get("brain_enabled") is False:
        return False, "Gehirn aus (brain_enabled = false)"
    try:
        rows = db.select("owner_settings", {"select": "key,value", "key": "eq.werke_paused"}) or []
    except Exception:  # noqa: BLE001
        return False, "Pausen nicht lesbar"
    v = rows[0].get("value") if rows else None
    if isinstance(v, dict) and v.get("agenten"):
        return False, "Agenten pausiert durch Inhaber"
    return True, ""


def rollen_je_abteilung(db, deps: list[dict]) -> dict[str, str]:
    """Fach-Agent je Abteilung: Leitung (leitung_rolle) vor dem ersten aktiven Agenten der Abteilung."""
    roles = db.select("agent_roles", {"select": "slug,department,aktiv,sort", "aktiv": "eq.true"}) or []
    out = {}
    for d in deps:
        mine = sorted((r for r in roles if r.get("department") == d.get("slug")), key=lambda r: int(r.get("sort") or 0))
        lead = d.get("leitung_rolle")
        if lead and any(r["slug"] == lead for r in roles):
            out[d["slug"]] = lead
        elif mine:
            out[d["slug"]] = mine[0]["slug"]
    return out


def lauf(db, t: dt.datetime, apply: bool, lage: dict | None = None, scope=None) -> dict:
    from lib.fokus import test_scope
    scope = scope or test_scope()
    segs, countries = scope
    deps = db.select("departments", {"select": "slug,name,ziel_key,ziel_soll,ziel_richtung,leitung_rolle,sort,aktiv",
                                     "aktiv": "eq.true", "order": "sort.asc"}) or []
    ziele = db.select("company_goals", {"select": "key,soll,richtung"}) or []
    if lage is None:
        lage = db.rpc("firma_lage", {"p_segment": segs[0] if segs else "S2", "p_countries": countries}) or {}
    rows = bewerten(deps, lage, ziele)
    rollen = rollen_je_abteilung(db, deps)
    erlaubt, warum = schalter(db)
    out = {"modus": "auftrag" if erlaubt else "anzeigen", "grund": warum, "luecken": rows, "neu": []}

    motor = db.select("agent_tasks", {"created_by": f"eq.{BY}", "select": "id,status,rolle,brief,created_at",
                                      "order": "created_at.desc", "limit": "200"}) or []
    offen = [m for m in motor if m.get("status") in OPEN]
    prefix = {x["slug"]: f"Motor {x['name']}:" for x in rows}

    def letzter(slug: str) -> dict | None:
        return next((m for m in motor if str(m.get("brief") or "").startswith(prefix[slug])), None)

    # Takt: höchstens alle 2 h ein Lauf (Wachhund ruft öfter auf) – dazwischen nichts schreiben
    last = max((_ts(r.get("updated_at")) for r in (db.select("department_gaps", {"select": "updated_at",
                "order": "updated_at.desc", "limit": "1"}) or [])), default=None)
    if apply and last and t - last < TAKT:
        out.update(modus="warten", grund="letzter Motor-Lauf vor < 2 h")
        return out

    plan = {}
    if erlaubt:
        busy = db.select("agent_tasks", {"status": f"in.({','.join(OPEN)})", "select": "agent,rolle"}) or []
        busy_roles = {b.get("rolle") for b in busy if b.get("rolle")}
        frei = [n for n in range(1, AGENT_COUNT + 1) if n not in {int(b["agent"]) for b in busy if str(b.get("agent", "")).isdigit()}]
        n_offen = len(offen)
        for x in rows[:TOP]:
            if len(out["neu"]) >= MAX_NEU or n_offen >= MAX_OFFEN or len(frei) <= KEEP_FREE:
                break
            if (x["luecke"] or 0) < MIN_LUECKE:
                continue
            prev = letzter(x["slug"])
            if prev and (prev.get("status") in OPEN or t - (_ts(prev.get("created_at")) or t) < COOLDOWN):
                plan[x["slug"]] = prev
                continue
            a = auftrag(x, rollen.get(x["slug"]), scope)
            if not a or (a.get("rolle") and a["rolle"] in busy_roles):
                continue  # Fach-Agent arbeitet schon an etwas (z. B. Übergabe) – kein zweiter Auftrag
            row = {"agent": frei.pop(0), "status": "offen", "kind": a["kind"], "brief": a["brief"],
                   "grund": a["grund"], "created_by": BY}
            if a.get("rolle"):
                row["rolle"] = a["rolle"]
                busy_roles.add(a["rolle"])
            if apply:
                task = (db.insert("agent_tasks", row) or [{}])[0]
            else:
                task = {**row, "id": None}
            n_offen += 1
            plan[x["slug"]] = {**task, "titel": a["titel"]}
            out["neu"].append({"abteilung": x["slug"], "agent": f"A{row['agent']}", "titel": a["titel"]})

    if apply:
        stamp = t.isoformat()
        batch = []
        for x in rows:
            p = plan.get(x["slug"]) or next((m for m in offen if str(m.get("brief") or "").startswith(prefix[x["slug"]])), None)
            a = auftrag(x, rollen.get(x["slug"]), scope) if (x["luecke"] or 0) >= MIN_LUECKE else None
            batch.append({
                "slug": x["slug"], "ziel_key": x["ziel_key"], "ist": x["ist"], "soll": x["soll"], "richtung": x["richtung"],
                "luecke": x["luecke"], "gewicht": x["gewicht"], "rang": x["rang"],
                "titel": (p or {}).get("titel") or (a or {}).get("titel") or None, "grund": (a or {}).get("grund"),
                "task_id": (p or {}).get("id"), "modus": out["modus"], "updated_at": stamp,
            })
        if batch:
            db.insert("department_gaps", batch, upsert_on="slug")
    return out


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help") or argv[0] != "lauf":
        print(__doc__)
        return 1
    from lib.db import DB
    res = lauf(DB(), now(), "--apply" in argv)
    for x in res["luecken"]:
        lk = "–" if x["luecke"] is None else f"{round(x['luecke'] * 100)} %"
        print(f"{x['rang']}. {x['name']:<14} Lücke {lk:>6}  Ist {_fmt(x['ist'])} / Soll {_fmt(x['soll'])}  Gewicht {x['gewicht']}")
    print(json.dumps({"modus": res["modus"], "grund": res["grund"], "neu": res["neu"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
