#!/usr/bin/env python3
"""A/B je Schritt – Werkzeug für Gehirn und JARVIS (Inhaber 04.10.2026: „das gehirn soll jeden einzelnen unserer steps
a/b splittesten können, damit es mit den quoten immer genau schauen kann wo es KPIs weiter optimieren kann damit am
ende mehr kunden bei rauskommen“). Regeln und Statistik: scripts/lib/ab.py, Schritte: app/lib/ab-schritte.json.

  python scripts/ab.py trichter [--tage 30]      # Quote je Station (Webagenturen US/UK/FR) + Engpass (JSON)
  python scripts/ab.py liste [--alle]            # Tests mit n, Quote, Sicherheit je Variante (JSON)
  python scripts/ab.py vorschlag                 # Engpass zuerst: welche Schritte/Länder ohne laufenden Test (JSON)
  python scripts/ab.py anlegen <schritt> <land> <element> --b "<Wert>" --hypothese "<≤ 160 Zeichen>"
                       [--a "<Wert>"] [--min-n N] [--starten]
        # Variante B ändert genau EIN Element (A = heutiger Stand, unverändert). Texte: Sprache des Landes, §7,
        # ohne Garantien, Druck, Preise, Zahlen außer 10. Nur S2 in US/UK/FR. Exit 2 = abgelehnt (Grund steht da).
  python scripts/ab.py starten <test_id>          # höchstens 1 laufender Test je Schritt und Land
  python scripts/ab.py beenden <test_id> --grund "<≤ 160 Zeichen>"   # gestoppt, A bleibt
  python scripts/ab.py auswerten [--apply]       # Gewinner (≥ 95 % + Mindestmenge) übernehmen, 21 Tage → gestoppt
                                                 # (läuft im Wachhund); jede Entscheidung in decisions + Gehirn-Chat
  python scripts/ab.py engpass-log [--zeigen]    # Engpass höchstens 1×/h nach decisions; ≥ 6 der letzten 8 und
                                                 # ≥ 24 h, kein laufender Test → genau ein Agenten-Auftrag (Wachhund)

Schritte: mail_betreff, mail_einstieg, mail_zeit, nachfass, antwort, landing, probe_mail, probe_nachfrage, tarif,
checkout. Nie Teil eines Tests: Drei-Stufen-Freigabe, Sperrliste, Abmeldelink/Pflichtfußzeile, Notbremse, Länder- und
Prüfregeln, Preise. Sendet nichts, löscht nichts.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import ab  # noqa: E402

BY = "Gehirn (ab.py)"


class AbError(Exception):
    pass


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _opt(argv: list[str], name: str) -> str | None:
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return None


def _label(t: dict) -> str:
    s = ab.step(t.get("step")) or {}
    return f"{s.get('titel', t.get('step'))} {t.get('country')}"


def _value(step_key: str, element: str, raw):
    spec = (ab.step(step_key) or {}).get("elemente", {}).get(element, {})
    if spec.get("art") == "zahl" and raw not in (None, ""):
        return int(str(raw).strip())
    return " ".join(str(raw).split()) if isinstance(raw, str) else raw


def anlegen(db, step_key: str, country: str, element: str, b, hypothese: str, a=None, min_n: int | None = None,
            segment: str = "S2", by: str = BY) -> dict:
    country = (country or "").upper()
    errs = ab.check_test(step_key, segment, country, element, b, a, hypothese)
    if errs:
        raise AbError("; ".join(errs))
    s = ab.step(step_key)
    row = {"step": step_key, "segment_id": segment, "country": country, "element": element,
           "hypothese": " ".join(hypothese.split()), "messung": s["messung"],
           "varianten": [{"key": "A", **({element: _value(step_key, element, a)} if a not in (None, "") else {})},
                         {"key": "B", element: _value(step_key, element, b)}],
           "status": "entwurf", "min_n": int(min_n or s["min_n"]), "created_by": by}
    return (db.insert("ab_tests", row) or [row])[0]


def _landing_setup(db, t: dict) -> list[dict]:
    """Landingpage-Test: Variante B als eigene page_variant (live, 50/50), A bekommt 50 %. Nur mit Freigabe
    „Seiten selbst live“ und Rechtstexten (settings)."""
    st = (db.select("settings", {"select": "auto_publish_pages,legal_ready", "limit": "1"}) or [{}])[0]
    if not (st.get("auto_publish_pages") and st.get("legal_ready")):
        raise AbError("Seiten selbst live ist aus (settings) – Landingpage-Test geht erst danach")
    pages = db.select("landing_pages", {"segment_id": f"eq.{t['segment_id']}", "country": f"eq.{t['country']}",
                                        "status": "eq.live", "select": "id,slug"})
    if not pages:
        raise AbError("keine Live-Seite für dieses Land")
    vs = db.select("page_variants", {"page_id": f"eq.{pages[0]['id']}", "select": "*"}) or []
    live = [v for v in vs if v.get("status") == "live"]
    if len(live) != 1:
        raise AbError("auf der Seite läuft schon ein Varianten-Test (genau eine Live-Variante nötig)")
    base = live[0]
    used = {v.get("variant_key") for v in vs}
    key = next(k for k in "BCDEFGHIJKLMNOPQRSTUVWXYZ" if k not in used)
    b_val = ab.variant_value(t, "B")
    a_val = ab.variant_value(t, "A")
    copy_cols = ("headline", "subheadline", "signals", "sample_leads", "pricing", "cta_label", "faq")
    new = {c: base.get(c) for c in copy_cols}
    new.update({"page_id": pages[0]["id"], "variant_key": key, t["element"]: b_val, "status": "live",
                "traffic_share": 50, "changed_element": t["element"], "created_by": "brain"})
    if a_val not in (None, "") and a_val != base.get(t["element"]):
        raise AbError("A muss bei der Landingpage der heutige Stand sein (A leer lassen)")
    row = (db.insert("page_variants", new) or [new])[0]
    db.update("page_variants", {"id": base["id"]}, {"traffic_share": 50})
    return [{"key": "A", "variant_id": base["id"]}, {"key": "B", "variant_id": row.get("id"), t["element"]: b_val}]


def starten(db, test_id: str) -> dict:
    t = (db.select("ab_tests", {"id": f"eq.{test_id}", "select": "*"}) or [None])[0]
    if not t:
        raise AbError("Test unbekannt")
    if t["status"] != "entwurf":
        raise AbError(f"Test ist schon {t['status']}")
    b = ab.variant_value(t, "B")
    errs = ab.check_test(t["step"], t["segment_id"], t["country"], t["element"], b, ab.variant_value(t, "A"),
                         t.get("hypothese") or "")
    if errs:
        raise AbError("; ".join(errs))
    if db.select("ab_tests", {"step": f"eq.{t['step']}", "country": f"eq.{t['country']}", "status": "eq.laeuft",
                              "select": "id"}):
        raise AbError("für diesen Schritt und dieses Land läuft schon ein Test (höchstens einer)")
    upd = {"status": "laeuft", "gestartet": now().isoformat()}
    if t["step"] == "landing":
        upd.update(varianten=_landing_setup(db, t), quelle="page_variants")
    db.update("ab_tests", {"id": t["id"]}, upd)
    s = ab.step(t["step"]) or {}
    ab.melden(db, f"Test gestartet: {_label(t)}", t.get("hypothese") or "",
              f"Test: {s.get('titel', t['step'])} {t['country']} · {t['element']}",
              {"test_id": t["id"], "step": t["step"], "element": t["element"], "varianten": t.get("varianten"),
               "min_n": t.get("min_n"), "messung": t.get("messung")})
    return {**t, **upd}


def _finish_landing(db, t: dict, winner: str | None) -> None:
    """Gewinner bekommt 100 %, die andere Variante wird stillgelegt (BRAIN.md 5.1)."""
    ids = {v.get("key"): v.get("variant_id") for v in t.get("varianten") or []}
    keep = winner or "A"
    for k, vid in ids.items():
        if not vid:
            continue
        db.update("page_variants", {"id": vid}, {"traffic_share": 100} if k == keep else {"status": "retired", "traffic_share": 0})


def beenden(db, test_id: str, grund: str, status: str = "gestoppt", winner: str | None = None, metrics=None) -> dict:
    t = (db.select("ab_tests", {"id": f"eq.{test_id}", "select": "*"}) or [None])[0]
    if not t:
        raise AbError("Test unbekannt")
    if t["status"] not in ("laeuft", "entwurf"):
        raise AbError(f"Test ist schon {t['status']}")
    grund = " ".join((grund or "").split())
    if not 3 <= len(grund) <= ab.GRUND_MAX:
        raise AbError(f"Grund: 3–{ab.GRUND_MAX} Zeichen")
    upd = {"status": status, "beendet": now().isoformat(), "gewinner": winner, "grund": grund}
    db.update("ab_tests", {"id": t["id"]}, upd)
    if t.get("quelle") == "page_variants" and t["status"] == "laeuft":
        _finish_landing(db, t, winner)
    title = (f"{winner} gewinnt: {_label(t)}" if status == "gewonnen" else f"Test gestoppt: {_label(t)}")
    ab.melden(db, title, grund, f"Test-Ergebnis: {_label(t)} · {t['element']}",
              {"test_id": t["id"], "status": status, "gewinner": winner, **(metrics or {})})
    return {**t, **upd}


def liste(db, alle: bool = False) -> list[dict]:
    params = {"select": "*", "order": "created_at.desc"}
    if not alle:
        params["status"] = "in.(entwurf,laeuft)"
    tests = db.select("ab_tests", params) or []
    res = ab.results(db)
    out = []
    for t in tests:
        rows = [{"variant": r["variant"], "n": int(r.get("n") or 0), "k": int(r.get("k") or 0)}
                for r in res.get(str(t["id"]), [])]
        ev = ab.evaluate(t, rows) if t["status"] == "laeuft" else {}
        out.append({"id": t["id"], "schritt": t["step"], "land": t["country"], "element": t["element"],
                    "status": t["status"], "hypothese": t.get("hypothese"),
                    "varianten": [{**r, "quote": round(ab.rate(r["n"], r["k"]), 4)} for r in rows],
                    "sicherheit": ev.get("sicherheit"), "stand": ev.get("grund") or t.get("grund"),
                    "gewinner": t.get("gewinner")})
    return out


def auswerten(db, apply: bool = False, when: dt.datetime | None = None) -> list[dict]:
    """Laufende Tests prüfen: Gewinner (≥ 95 % und Mindestmenge) übernehmen, nach 21 Tagen stoppen."""
    tests = db.select("ab_tests", {"status": "eq.laeuft", "select": "*"}) or []
    res = ab.results(db) if tests else {}
    out = []
    for t in tests:
        rows = [{"variant": r["variant"], "n": int(r.get("n") or 0), "k": int(r.get("k") or 0)}
                for r in res.get(str(t["id"]), [])]
        ev = ab.evaluate(t, rows, when or now())
        out.append({"id": t["id"], "test": _label(t), **ev})
        if apply and ev["status"] in ("gewonnen", "gestoppt"):
            beenden(db, t["id"], ev["grund"][:ab.GRUND_MAX], ev["status"], ev.get("gewinner"),
                    {"varianten": rows, "sicherheit": ev["sicherheit"]})
    return out


def trichter(db, days: int = 30) -> dict:
    rows = ab.funnel(db, days)
    reg = ab.registry()
    st = []
    for s in reg["stationen"]:
        r = next((x for x in rows if x.get("station") == s["key"]), {"n": 0, "k": 0})
        n, k = int(r.get("n") or 0), int(r.get("k") or 0)
        st.append({"station": s["key"], "titel": s["titel"], "n": n, "k": k, "quote": round(ab.rate(n, k), 4),
                   "richtwert": s["richtwert"]})
    e = ab.engpass(st)
    return {"tage": days, "stationen": st, "engpass": e and e["station"]}


def vorschlag(db) -> dict:
    """Engpass zuerst: Schritte der Engpass-Station (dann die übrigen nach Abstand zum Richtwert), für die in einem
    Test-Land noch kein Test läuft."""
    from lib.fokus import test_scope
    tr = trichter(db)
    segs, countries = test_scope()
    running = {(t["step"], t["country"]) for t in db.select("ab_tests", {"status": "eq.laeuft", "select": "step,country"}) or []}
    order = sorted(tr["stationen"], key=lambda s: (s["station"] != tr["engpass"],
                                                    (s["quote"] / s["richtwert"]) if s["n"] >= ab.registry()["engpass_min_n"] else 9))
    frei = []
    for s in order:
        for st in ab.registry()["schritte"]:
            if st["station"] != s["station"] or st.get("pausiert"):
                continue
            for c in countries:
                if (st["key"], c) not in running:
                    frei.append({"schritt": st["key"], "land": c, "station": s["station"], "elemente": list(st["elemente"]),
                                 "engpass": s["station"] == tr["engpass"]})
    return {"engpass": tr["engpass"], "segmente": segs, "frei": frei[:12]}


# ------------------------------------------------------------------------------------------- Engpass-Protokoll
ENGPASS_PREFIX = "Engpass: "
ENGPASS_EVERY = dt.timedelta(hours=1)    # höchstens ein Eintrag je Stunde
ENGPASS_WINDOW = 8                       # docs/JARVIS.md: 6 der letzten 8 Läufe
ENGPASS_SAME = 6
ENGPASS_HOLD = dt.timedelta(hours=24)    # und seit mindestens 24 h
ENGPASS_LOOKBACK = 72                    # so viele Einträge (≈ 3 Tage) für „seit wann“
ENGPASS_GRUND = "Engpass seit 24 h"


def _station_of(d: dict) -> str | None:
    m = d.get("metrics") or {}
    if isinstance(m, dict) and m.get("station"):
        return str(m["station"])
    subj = str(d.get("subject") or "")
    if not subj.startswith(ENGPASS_PREFIX):
        return None
    return subj[len(ENGPASS_PREFIX):].strip() or None


def engpass_streak(entries: list[dict]) -> dict | None:
    """Anhaltender Engpass aus Protokoll-Einträgen (neueste zuerst): dieselbe Station in ≥ 6 der letzten 8, „seit“ =
    ältester Eintrag dieser Station, solange jedes 8er-Fenster zurück die Regel noch erfüllt. None ohne Mehrheit."""
    st = [(_station_of(e), ab._ts(e.get("created_at"))) for e in entries]
    if len(st) < ENGPASS_WINDOW:
        return None
    first = st[:ENGPASS_WINDOW]
    counts: dict[str, int] = {}
    for s, _ in first:
        if s:
            counts[s] = counts.get(s, 0) + 1
    station = max(counts, key=counts.get) if counts else None
    if not station or counts[station] < ENGPASS_SAME:
        return None
    since = None
    for i in range(0, len(st) - ENGPASS_WINDOW + 1):
        win = st[i:i + ENGPASS_WINDOW]
        if sum(1 for s, _ in win if s == station) < ENGPASS_SAME:
            break
        for s, ts in win:
            if s == station and ts and (since is None or ts < since):
                since = ts
    return {"station": station, "anzahl": counts[station], "seit": since}


def _running_for(db, station: str) -> list[dict]:
    steps = [s["key"] for s in ab.registry()["schritte"] if s.get("station") == station]
    if not steps:
        return []
    return db.select("ab_tests", {"status": "eq.laeuft", "step": f"in.({','.join(steps)})", "select": "id,step,country"}) or []


def _task_exists(db, titel: str, t: dt.datetime) -> bool:
    """Schon ein Engpass-Auftrag für diese Station: offen/laufend oder in den letzten 24 h angelegt."""
    rows = db.select("agent_tasks", {"grund": f"like.{ENGPASS_GRUND}*", "select": "id,status,grund,created_at"}) or []
    for r in rows:
        if titel not in str(r.get("grund") or ""):
            continue
        if r.get("status") in ("offen", "laeuft") or (ab._ts(r.get("created_at")) or t) >= t - ENGPASS_HOLD:
            return True
    return False


def engpass_log(db, t: dt.datetime | None = None, apply: bool = True, beauftragen=None) -> dict:
    """JARVIS-Plan W1-2: Engpass höchstens 1×/h nach decisions (Kurzfassung); hält dieselbe Station ≥ 6 der letzten 8
    Einträge und ≥ 24 h und läuft für sie kein Test (nur Test-Freigabe S2 US/UK/FR), genau ein Agenten-Auftrag
    „Test vorschlagen und anlegen“ (brain_routines.auftrag, gleiche Regeln wie checkBrainTask). Sendet nichts."""
    from lib.fokus import test_scope
    from lib.kurz import insert_decisions, kuerzen
    t = t or now()
    out: dict = {"protokoll": None, "anhaltend": None, "auftrag": None}
    params = {"subject": f"like.{ENGPASS_PREFIX}*", "type": "eq.note", "order": "created_at.desc",
              "limit": str(ENGPASS_LOOKBACK), "select": "id,subject,metrics,created_at"}
    entries = db.select("decisions", params) or []
    last = ab._ts(entries[0].get("created_at")) if entries else None
    if last and t - last < ENGPASS_EVERY:
        out["protokoll"] = "schon in dieser Stunde"
    else:
        tr = trichter(db)
        e = next((s for s in tr["stationen"] if s["station"] == tr["engpass"]), None)
        if not e:
            out["protokoll"] = "zu wenig Daten"
        else:
            titel = f"Engpass: {e['titel']}"
            grund = (f"{e['titel']} {ab._pct(e['quote'])} statt Richtwert {ab._pct(e['richtwert'])} bei n={e['n']} "
                     f"(30 Tage, Webagenturen US/UK/FR).")
            row = {"type": "note", "subject": f"{ENGPASS_PREFIX}{e['station']}", "reasoning": grund,
                   "metrics": {"station": e["station"], "quote": e["quote"], "richtwert": e["richtwert"],
                               "n": e["n"], "k": e["k"], "tage": tr["tage"]},
                   "status": "done", "kurz_titel": kuerzen(titel, 60), "kurz_grund": kuerzen(grund, ab.GRUND_MAX)}
            out["protokoll"] = e["station"]
            if apply:
                insert_decisions(db, row)
            entries = [{**row, "created_at": t.isoformat()}] + entries
    streak = engpass_streak(entries[:ENGPASS_LOOKBACK])
    if not streak or not streak["seit"] or t - streak["seit"] < ENGPASS_HOLD:
        return out
    station = streak["station"]
    st = ab.station(station) or {}
    titel = st.get("titel", station)
    out["anhaltend"] = {"station": station, "anzahl": streak["anzahl"], "seit": streak["seit"].isoformat()}
    segs, countries = test_scope()
    if "S2" not in segs or not countries:
        out["auftrag"] = "keine Test-Freigabe"
        return out
    if _running_for(db, station):
        out["auftrag"] = "Test läuft schon"
        return out
    if _task_exists(db, titel, t):
        out["auftrag"] = "Auftrag besteht schon"
        return out
    grund = f"{ENGPASS_GRUND}: {titel}"
    brief = (f"Anhaltender Engpass {titel} ({streak['anzahl']} von {ENGPASS_WINDOW} Läufen, seit ≥ 24 h). "
             f"Test vorschlagen und anlegen: python scripts/ab.py vorschlag, dann für einen freien Schritt dieser "
             f"Station ab.py anlegen … --starten (nur Webagenturen {'/'.join(countries)}, genau eine Änderung je Test, "
             f"Texte nach §7). Ergebnis kurz in den Gehirn-Chat.")
    if not apply:
        out["auftrag"] = {"grund": grund, "brief": brief}
        return out
    if beauftragen is None:
        import brain_routines
        beauftragen = lambda b, g: brain_routines.auftrag(db, "frage", b, g, t=t)  # noqa: E731
    try:
        out["auftrag"] = beauftragen(brief, grund)
    except ValueError as exc:  # TaskError: Agenten belegt, Stundenlimit …
        out["auftrag"] = f"abgelehnt: {exc}"
    return out


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    db = DB()
    cmd = argv[0]
    try:
        if cmd == "trichter":
            print(json.dumps(trichter(db, int(_opt(argv, "--tage") or 30)), ensure_ascii=False, indent=1))
        elif cmd == "liste":
            print(json.dumps(liste(db, "--alle" in argv), ensure_ascii=False, indent=1, default=str))
        elif cmd == "vorschlag":
            print(json.dumps(vorschlag(db), ensure_ascii=False, indent=1))
        elif cmd == "anlegen" and len(argv) >= 4:
            t = anlegen(db, argv[1], argv[2], argv[3], _opt(argv, "--b"), _opt(argv, "--hypothese") or "",
                        _opt(argv, "--a"), int(_opt(argv, "--min-n") or 0) or None)
            if "--starten" in argv:
                t = starten(db, t["id"])
            print(f"anlegen: {json.dumps({'id': t.get('id'), 'status': t.get('status')}, ensure_ascii=False)}")
        elif cmd == "starten" and len(argv) >= 2:
            t = starten(db, argv[1])
            print(f"starten: {t['id']} läuft")
        elif cmd == "beenden" and len(argv) >= 2:
            t = beenden(db, argv[1], _opt(argv, "--grund") or "")
            print(f"beenden: {t['id']} gestoppt")
        elif cmd == "auswerten":
            print(json.dumps(auswerten(db, "--apply" in argv), ensure_ascii=False, indent=1, default=str))
        elif cmd == "engpass-log":
            print(json.dumps(engpass_log(db, apply="--zeigen" not in argv), ensure_ascii=False, indent=1, default=str))
        else:
            print(__doc__)
            return 1
    except (AbError, ValueError) as exc:
        print(f"{cmd}: {exc}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
