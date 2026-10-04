#!/usr/bin/env python3
"""Selbstoptimierung des ganzen Systems (Inhaber 04.10.2026: „bekommen wir es hin das sich das system also gehirn etc
selbst optimiert“). Ein gemeinsamer Kreislauf für alle Stellschrauben, die noch nicht automatisch nach Wirkung
nachgeführt wurden. Läuft im Wachhund (alle 30 min); je Stellschraube höchstens eine Änderung je Tag.

  messen → (genug Daten?) → Schritt → nach N Tagen bewerten → wirkt: bleibt · wirkt nicht: zurück

Stellschrauben (Messgröße · Mindestdaten · Schritt · Bewertung):
  versand_menge       Bounce-Quote Erstmails S2 US/UK/FR (3 T) · ≥ 50 Mails · Faktor ±0,1 (0,5 … 1,0) · 3 T
                      > 3 % → weniger (Schutz), < 1,5 % → zurück Richtung 1,0. Nie über config/versand.yaml,
                      Notbremse (5 %) bleibt unverändert.
  dauerpruefung       Lead-Fehlerquote der Dauerprüfung (3 T) · ≥ 300 Prüfungen · Budget +0,5 (bis 2×),
                      Prüfabstände ×0,5 · 3 T. > 5 % → mehr/öfter prüfen (Schutz), < 1 % → zurück zum Standard.
                      Die Drei-Stufen-Freigabe selbst ändert sich nie.
  kaeufer_kategorien  ok-Quote je Käufer-Kategorie im Kunden-Werk (14 T) · gesamt ≥ 1000, Kategorie ≥ 200 ·
                      Kategorie unter 60 % des Schnitts → zuletzt prüfen (nichts fällt weg) · 7 T: ok-Quote gesamt
                      muss ≥ 2 % (relativ) steigen, sonst zurück; danach 14 T Pause für diese Kategorie.
  ab_naechster        A/B-Gewinner übernimmt schon `ab.py auswerten`. Hier: ist ein Schritt × Land frei, startet der
                      älteste fertige Test-Entwurf (nur S2 × config/fokus.yaml tests, gleiche Prüfungen wie
                      ab.py starten). Bewertung = Testergebnis (B gewinnt = wirkt), nie zurück.
  Lead-Werk-Quellen   schon abgedeckt: Autopilot in scripts/werk_plan.py (Plätze nach grünen je Platz-Stunde).

Regeln: ohne genug Daten nichts ändern. Schutz-Änderungen (weniger Versand, öfter prüfen) bleiben auch ohne
messbare Wirkung; Lockerungen und Umschichtungen gehen zurück, wenn sie nicht wirken. Jede Änderung und jede
Rücknahme steht in decisions (kurz_titel ≤ 60, kurz_grund ≤ 160 über lib/kurz.py) und in selbstopt_changes.
Nie: Prüfregeln, Drei-Stufen-Freigabe, Sperrliste, Notbremse, Abmeldung, Länder, Kosten, Preise, Löschen,
Tests außerhalb S2 × US/UK/FR. Sendet nichts, löscht nichts.

  python scripts/selbstopt.py lauf [--apply]     # bewerten + anpassen (ohne --apply nur anzeigen)
  python scripts/selbstopt.py stand              # Stellschrauben und letzte Änderungen (JSON)
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import selbstopt_state as S  # noqa: E402

SEGMENT = "S2"
PREFIX = "Selbstopt: "
JE_TAG = dt.timedelta(hours=20)       # je Stellschraube höchstens eine Änderung je Tag

# versand_menge
V_FENSTER, V_MIN_N, V_HOCH, V_GUT, V_SCHRITT, V_TAGE = 3, 50, 0.03, 0.015, 0.1, 3
# dauerpruefung
P_FENSTER, P_MIN_N, P_HOCH, P_GUT, P_TAGE = 3, 300, 0.05, 0.01, 3
# kaeufer_kategorien
K_FENSTER, K_MIN_GESAMT, K_MIN_KAT, K_ANTEIL, K_PLUS, K_TAGE, K_PAUSE, K_MAX_JE_LAUF = 14, 1000, 200, 0.6, 0.02, 7, 14, 2
K_MIN_NACHHER = 500


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _ts(x) -> dt.datetime | None:
    if not x:
        return None
    try:
        d = dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def _pct(x: float | None) -> str:
    return "–" if x is None else f"{x * 100:.1f}".replace(".", ",") + " %"


def _countries() -> list[str]:
    from lib.fokus import test_scope
    return test_scope()[1] or ["US", "UK", "FR"]


# ------------------------------------------------------------------------------------------------ Regeln (rein)
def versand_schritt(faktor: float, quote: float | None, n: int) -> tuple[float, str] | None:
    """(neuer Faktor, art) oder None. Nie über 1,0 (= config/versand.yaml), nie unter 0,5."""
    if quote is None or n < V_MIN_N:
        return None
    f = round(faktor, 2)
    if quote > V_HOCH and f > S.VERSAND_MIN:
        return round(max(S.VERSAND_MIN, f - V_SCHRITT), 2), "schutz"
    if quote < V_GUT and f < S.VERSAND_MAX:
        return round(min(S.VERSAND_MAX, f + V_SCHRITT), 2), "lockern"
    return None


def pruef_schritt(budget: float, intervall: float, quote: float | None, n: int) -> tuple[dict, str] | None:
    """({budget_faktor, intervall_faktor}, art) oder None. Nur zwischen Standard (1/1) und 2× Budget / ½ Abstand."""
    if quote is None or n < P_MIN_N:
        return None
    if quote > P_HOCH and (budget < S.BUDGET_MAX or intervall > S.INTERVALL_MIN):
        return {"budget_faktor": min(S.BUDGET_MAX, budget + 0.5), "intervall_faktor": S.INTERVALL_MIN}, "schutz"
    if quote < P_GUT and (budget > S.BUDGET_MIN or intervall < S.INTERVALL_MAX):
        b = max(S.BUDGET_MIN, budget - 0.5)
        return {"budget_faktor": b, "intervall_faktor": S.INTERVALL_MAX if b <= S.BUDGET_MIN else intervall}, "lockern"
    return None


def kategorien_schwach(rows: list[dict], hinten: set[str], pause: set[str]) -> tuple[float | None, int, list[dict]]:
    """(ok-Quote gesamt, n gesamt, schwache Kategorien) – nur mit genug Daten, schwächste zuerst."""
    n = sum(int(r.get("n") or 0) for r in rows)
    ok = sum(int(r.get("ok") or 0) for r in rows)
    if n < K_MIN_GESAMT:
        return (ok / n if n else None), n, []
    avg = ok / n
    out = []
    for r in rows:
        kat = str(r.get("kategorie") or "").strip().lower().replace(" ", "_")
        rn, rok = int(r.get("n") or 0), int(r.get("ok") or 0)
        if not kat or rn < K_MIN_KAT or kat in hinten or kat in pause:
            continue
        q = rok / rn
        if q < K_ANTEIL * avg:
            out.append({"kategorie": kat, "n": rn, "ok": rok, "quote": round(q, 4)})
    out.sort(key=lambda x: x["quote"])
    return round(avg, 4), n, out


def bewerten(ch: dict, wert: float | None, n: int) -> str | None:
    """wirkt | neutral | zurueck | None (zu wenig Daten). Schutz-Änderungen gehen nie zurück."""
    s, art, basis = ch["schraube"], ch.get("art"), ch.get("basis")
    basis = float(basis) if basis is not None else None
    if s == "versand_menge":
        if wert is None or n < V_MIN_N:
            return None
        if art == "schutz":
            return "wirkt" if basis is not None and wert < basis else "neutral"
        return "zurueck" if wert > V_HOCH else "wirkt"
    if s == "dauerpruefung":
        if wert is None or n < P_MIN_N:
            return None
        if art == "schutz":
            return "wirkt" if basis is not None and wert < basis else "neutral"
        return "zurueck" if wert > P_HOCH else "wirkt"
    if s == "kaeufer_kategorien":
        if wert is None or n < K_MIN_NACHHER or basis is None:
            return None
        return "wirkt" if wert >= basis * (1 + K_PLUS) else "zurueck"
    return None


# ------------------------------------------------------------------------------------------------ Messen (DB)
def mess_versand(db, a: dt.datetime, b: dt.datetime) -> tuple[float | None, int]:
    from lib.deliverability import count_bounces
    msgs = db.select_all("messages", {"status": "eq.sent", "kind": "eq.initial", "sent_at": f"gte.{a.isoformat()}",
                                      "select": "id,sent_at,prospects!inner(country,segment_id)",
                                      "prospects.segment_id": f"eq.{SEGMENT}",
                                      "prospects.country": f"in.({','.join(_countries())})"}) or []
    ids = {str(m["id"]) for m in msgs if (_ts(m.get("sent_at")) or b) < b}
    if not ids:
        return None, 0
    ev = db.select_all("email_events", {"type": "in.(bounced,complained)", "occurred_at": f"gte.{a.isoformat()}",
                                        "select": "type,payload,message_id"}) or []
    hard, _ = count_bounces([e for e in ev if str(e.get("message_id")) in ids])
    return round(hard / len(ids), 4), len(ids)


def mess_pruefung(db, a: dt.datetime, b: dt.datetime) -> tuple[float | None, int]:
    rows = db.select("run_stats", {"werk": "eq.dauerpruefung", "finished_at": f"gte.{a.isoformat()}",
                                   "select": "candidates,green,extra,finished_at", "limit": "5000"}) or []
    n = f = 0
    for r in rows:
        if (_ts(r.get("finished_at")) or b) >= b or ((r.get("extra") or {}).get("art") == "kaeufer"):
            continue
        n += int(r.get("candidates") or 0)
        f += int(r.get("candidates") or 0) - int(r.get("green") or 0)
    return (round(f / n, 4) if n else None), n


def mess_kategorien(db, a: dt.datetime) -> list[dict]:
    return db.rpc("selbstopt_kategorien", {"p_since": a.isoformat(), "p_segment": SEGMENT,
                                           "p_countries": _countries()}) or []


# ------------------------------------------------------------------------------------------------ Schreiben
def set_state(db, schraube: str, wert: dict, t: dt.datetime) -> None:
    db.insert("selbstopt_state", {"schraube": schraube, "wert": wert, "updated_at": t.isoformat()}, upsert_on="schraube")


def record(db, t: dt.datetime, schraube: str, art: str, vorher: dict, nachher: dict, messgroesse: str,
           basis: float | None, basis_n: int, tage: int, titel: str, grund: str, ziel: str = "ALL") -> dict:
    from lib.kurz import insert_decisions, kuerzen
    titel, grund = kuerzen(titel, 60), kuerzen(grund, 160)
    if schraube in ("versand_menge", "dauerpruefung"):
        # neue Stufe ersetzt die offene: deren Bewertung würde sonst einen älteren Wert zurückholen
        db.update("selbstopt_changes", {"schraube": schraube, "status": "offen"},
                  {"status": "neutral", "bewertet_at": t.isoformat()})
    dec = (insert_decisions(db, {"type": "note", "subject": f"{PREFIX}{titel}", "reasoning": grund, "status": "done",
                                 "metrics": {"selbstopt": schraube, "ziel": ziel, "vorher": vorher, "nachher": nachher,
                                             "messgroesse": messgroesse, "basis": basis, "n": basis_n},
                                 "kurz_titel": titel, "kurz_grund": grund}) or [{}])[0]
    row = {"schraube": schraube, "ziel": ziel, "art": art, "status": "offen", "vorher": vorher, "nachher": nachher,
           "messgroesse": messgroesse, "basis": basis, "basis_n": basis_n, "kurz_titel": titel, "kurz_grund": grund,
           "bewerten_ab": (t + dt.timedelta(days=tage)).isoformat(), "created_at": t.isoformat(),
           "decision_id": dec.get("id")}
    return (db.insert("selbstopt_changes", row) or [row])[0]


def _recent(changes: list[dict], schraube: str, t: dt.datetime) -> bool:
    return any(c["schraube"] == schraube and (_ts(c.get("created_at")) or t) > t - JE_TAG for c in changes)


# ------------------------------------------------------------------------------------------------ Lauf
def evaluate(db, t: dt.datetime, apply: bool, changes: list[dict]) -> list[dict]:
    out = []
    for ch in changes:
        if ch.get("status") != "offen":
            continue
        if ch["schraube"] == "ab_naechster":
            out += _eval_ab(db, t, apply, ch)
            continue
        if (_ts(ch.get("bewerten_ab")) or t) > t:
            continue
        a = _ts(ch.get("created_at")) or t
        if ch["schraube"] == "versand_menge":
            wert, n = mess_versand(db, a, t)
        elif ch["schraube"] == "dauerpruefung":
            wert, n = mess_pruefung(db, a, t)
        elif ch["schraube"] == "kaeufer_kategorien":
            rows = mess_kategorien(db, a)
            n = sum(int(r.get("n") or 0) for r in rows)
            wert = round(sum(int(r.get("ok") or 0) for r in rows) / n, 4) if n else None
        else:
            continue
        v = bewerten(ch, wert, n)
        if v is None:
            continue
        out.append({"id": ch.get("id"), "titel": ch["kurz_titel"], "urteil": v, "wert": wert, "n": n})
        if not apply:
            continue
        db.update("selbstopt_changes", {"id": ch["id"]}, {"status": v, "wert_nachher": wert, "n_nachher": n,
                                                          "bewertet_at": t.isoformat()})
        if v == "zurueck":
            _undo(db, t, ch, wert, n)
    return out


def _undo(db, t: dt.datetime, ch: dict, wert: float | None, n: int) -> None:
    from lib.kurz import insert_decisions, kuerzen
    s = ch["schraube"]
    cur = S.get(db, s)
    if s == "kaeufer_kategorien":
        hinten = [k for k in (cur.get("hinten") or []) if k != ch["ziel"]]
        pause = {**(cur.get("pause") or {}), ch["ziel"]: (t + dt.timedelta(days=K_PAUSE)).isoformat()}
        set_state(db, s, {**cur, "hinten": hinten, "pause": pause}, t)
    else:
        set_state(db, s, ch.get("vorher") or {}, t)
    titel = kuerzen(f"Zurück: {ch['kurz_titel']}", 60)
    grund = kuerzen(f"Wirkt nicht: {ch['messgroesse']} {_pct(wert)} (vorher {_pct(_f(ch.get('basis')))}, n={n}).", 160)
    insert_decisions(db, {"type": "note", "subject": f"{PREFIX}{titel}", "reasoning": grund, "status": "done",
                          "metrics": {"selbstopt": s, "zurueck": ch.get("id"), "wert": wert, "n": n},
                          "kurz_titel": titel, "kurz_grund": grund})


def _f(x) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _eval_ab(db, t: dt.datetime, apply: bool, ch: dict) -> list[dict]:
    tid = (ch.get("nachher") or {}).get("test_id")
    row = (db.select("ab_tests", {"id": f"eq.{tid}", "select": "status,gewinner"}) or [None])[0] if tid else None
    if not row or row.get("status") in ("entwurf", "laeuft"):
        return []
    v = "wirkt" if row.get("status") == "gewonnen" and row.get("gewinner") == "B" else "neutral"
    if apply:
        db.update("selbstopt_changes", {"id": ch["id"]}, {"status": v, "bewertet_at": t.isoformat()})
    return [{"id": ch.get("id"), "titel": ch["kurz_titel"], "urteil": v}]


def adjust(db, t: dt.datetime, apply: bool, changes: list[dict]) -> list[dict]:
    out: list[dict] = []
    open_ = {c["schraube"] for c in changes if c.get("status") == "offen"}

    # 1. Versand-Tagesmenge nach Bounce-Quote
    if not _recent(changes, "versand_menge", t):
        cur = S.get(db, "versand_menge")
        f = S.versand_faktor(wert=cur)
        q, n = mess_versand(db, t - dt.timedelta(days=V_FENSTER), t)
        step = versand_schritt(f, q, n)
        if step and not (step[1] == "lockern" and "versand_menge" in open_):
            nf, art = step
            titel = f"Versand {'weniger' if art == 'schutz' else 'mehr'}: Menge × {nf:g}".replace(".", ",")
            grund = f"Bounce-Quote {_pct(q)} bei {n} Mails (3 Tage); nie über das Tagesziel."
            out.append({"schraube": "versand_menge", "titel": titel, "grund": grund})
            if apply:
                set_state(db, "versand_menge", {"faktor": nf}, t)
                record(db, t, "versand_menge", art, {"faktor": f}, {"faktor": nf}, "Bounce-Quote", q, n, V_TAGE, titel, grund)

    # 2. Dauerprüfung: Budget und Prüfabstände nach Fehlerquote
    if not _recent(changes, "dauerpruefung", t):
        cur = S.get(db, "dauerpruefung")
        b, i = S.pruef_faktoren(wert=cur)
        q, n = mess_pruefung(db, t - dt.timedelta(days=P_FENSTER), t)
        step = pruef_schritt(b, i, q, n)
        if step and not (step[1] == "lockern" and "dauerpruefung" in open_):
            neu, art = step
            titel = (f"Öfter prüfen: Budget × {neu['budget_faktor']:g}" if art == "schutz"
                     else f"Prüfung zurück Richtung Standard (× {neu['budget_faktor']:g})").replace(".", ",")
            grund = f"Lead-Fehlerquote {_pct(q)} bei {n} Prüfungen (3 Tage); Freigabe-Regeln unverändert."
            out.append({"schraube": "dauerpruefung", "titel": titel, "grund": grund})
            if apply:
                set_state(db, "dauerpruefung", neu, t)
                record(db, t, "dauerpruefung", art, {"budget_faktor": b, "intervall_faktor": i}, neu,
                       "Lead-Fehlerquote", q, n, P_TAGE, titel, grund)

    # 3. Käufer-Kategorien im Kunden-Werk nach ok-Quote
    if not _recent(changes, "kaeufer_kategorien", t):
        cur = S.get(db, "kaeufer_kategorien")
        hinten = S.kategorien_hinten(wert=cur)
        pause = {k for k, bis in (cur.get("pause") or {}).items() if (_ts(bis) or t) > t}
        avg, n, weak = kategorien_schwach(mess_kategorien(db, t - dt.timedelta(days=K_FENSTER)), hinten, pause)
        for w in weak[:K_MAX_JE_LAUF]:
            name = w["kategorie"].replace("_", " ")
            titel = f"Käufer: „{name}“ zuletzt prüfen"
            grund = f"ok-Quote {_pct(w['quote'])} statt Schnitt {_pct(avg)} ({w['n']} geprüft, 14 Tage)."
            out.append({"schraube": "kaeufer_kategorien", "titel": titel, "grund": grund})
            if apply:
                hinten.add(w["kategorie"])
                cur = {**cur, "hinten": sorted(hinten)}
                set_state(db, "kaeufer_kategorien", cur, t)
                record(db, t, "kaeufer_kategorien", "lockern", {"hinten": False}, {"hinten": True}, "ok-Quote Käufer",
                       avg, n, K_TAGE, titel, grund, ziel=w["kategorie"])

    # 4. A/B: nächsten fertigen Test-Entwurf starten, wenn Schritt × Land frei ist (nur Test-Freigabe)
    out += next_ab(db, t, apply)
    return out


def next_ab(db, t: dt.datetime, apply: bool) -> list[dict]:
    from lib import ab
    from lib.fokus import test_allowed
    drafts = db.select("ab_tests", {"status": "eq.entwurf", "select": "id,step,country,segment_id,element,hypothese",
                                    "order": "created_at.asc", "limit": "50"}) or []
    if not drafts:
        return []
    running = {(r["step"], r["country"]) for r in db.select("ab_tests", {"status": "eq.laeuft", "select": "step,country"}) or []}
    for d in drafts:
        st = ab.step(d.get("step")) or {}
        if not st or st.get("pausiert") or not test_allowed(d.get("segment_id"), d.get("country")):
            continue
        if (d["step"], d["country"]) in running:
            continue
        titel = f"A/B gestartet: {st.get('titel', d['step'])} {d['country']}"
        grund = f"Schritt frei, ältester Entwurf: {d.get('hypothese') or d.get('element')}"
        if apply:
            import ab as ab_cli
            try:
                ab_cli.starten(db, d["id"])
            except (ab_cli.AbError, ValueError) as exc:
                return [{"schraube": "ab_naechster", "titel": titel, "grund": f"abgelehnt: {exc}"}]
            record(db, t, "ab_naechster", "test", {}, {"test_id": d["id"]}, "A/B-Ergebnis", None, 0, 0, titel, grund,
                   ziel=f"{d['step']}/{d['country']}")
        return [{"schraube": "ab_naechster", "titel": titel, "grund": grund}]
    return []


def lauf(db, t: dt.datetime | None = None, apply: bool = False) -> dict:
    t = t or now()
    changes = db.select("selbstopt_changes", {"select": "*", "created_at": f"gte.{(t - dt.timedelta(days=60)).isoformat()}",
                                              "order": "created_at.desc", "limit": "500"}) or []
    bewertet = evaluate(db, t, apply, changes)
    if apply and bewertet:
        changes = db.select("selbstopt_changes", {"select": "*", "created_at": f"gte.{(t - dt.timedelta(days=60)).isoformat()}",
                                                  "order": "created_at.desc", "limit": "500"}) or []
    geaendert = adjust(db, t, apply, changes)
    return {"bewertet": bewertet, "geaendert": geaendert,
            "basis": "ok" if bewertet or geaendert else "nichts zu tun oder noch keine Basis"}


def stand(db) -> dict:
    st = db.select("selbstopt_state", {"select": "*"}) or []
    ch = db.select("selbstopt_changes", {"select": "created_at,schraube,ziel,art,status,kurz_titel,kurz_grund",
                                         "order": "created_at.desc", "limit": "10"}) or []
    return {"stellschrauben": st, "letzte": ch}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    db = DB()
    if argv[0] == "lauf":
        print(json.dumps(lauf(db, apply="--apply" in argv), ensure_ascii=False, indent=1, default=str))
        return 0
    if argv[0] == "stand":
        print(json.dumps(stand(db), ensure_ascii=False, indent=1, default=str))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
