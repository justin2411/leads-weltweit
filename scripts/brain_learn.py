"""Lernschleife und Wochen-Rückschau des Gehirns (Inhaber 04.10.2026: „Gehirn bestmöglich aufbauen, damit es wie
Claude Sachen optimiert und immer schlauer wird; Umsatz vergrößern“).

pruefen    (täglich, kpi-tag.yml nach dem KPI-Schnappschuss): misst jede fällige Entscheidung mit Erwartung
           (decisions.erwartung, pruefen_am ≤ jetzt, noch ohne ergebnis) nach – Live-Kennzahlen aus
           gehirn_score_teile (antwortquote, zustellrate, bounce_quote, lead_fehlerquote, gruen_platzh), sonst
           kpi_daily (metric, Land, Segment). Ergebnis bestaetigt | widerlegt | unklar + Messwert.
           Bestätigt -> Wissen „lehre-<thema>“ (typ gelernt, richtung wirkt, Vertrauen hoch, Beleg = Entscheidung),
           Gegenteil „fehler-<thema>“ verliert Vertrauen. Widerlegt -> passende „wirkt“-Einträge verlieren Vertrauen,
           Wissen „fehler-<thema>“ (typ fehlermuster). Unklar ändert kein Wissen.
rueckschau (montags früh, gehirn-rueckschau.yml): archiviert Wissen > 30 Tage ohne Bestätigung mit Vertrauen < 0,3
           (status archiviert, nie löschen; Notizen des Inhabers nie), findet Widersprüche (gleiches Thema, wirkt und
           wirkt_nicht), schreibt die 3 wichtigsten Lehren der Woche als Entscheidung (kurz_titel/kurz_grund) und in
           signalwerk.brain_rueckschau (eine Zeile je Woche, kein Repo-Commit).
faellig    zeigt fällige und bald fällige Erwartungen (Start jeder Gehirn-Sitzung).
lehren     zeigt Wissen mit hohem Vertrauen (≥ 0,7) – diese Lehren wendet die Sitzung an.

Pause: settings.brain_enabled = false -> nur anzeigen, nichts schreiben. Sendet nichts, löscht nichts, ändert keine
Regeln (Notbremse, Sperrliste, Freigabe, Prüfregeln, Länder bleiben unberührt).

  python scripts/brain_learn.py pruefen [--apply]
  python scripts/brain_learn.py rueckschau [--apply] [--force]
  python scripts/brain_learn.py faellig
  python scripts/brain_learn.py lehren
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import lernen as L  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
HOCH = 0.7
ARCHIV_TAGE, ARCHIV_MAX_V = 30, 0.3
LEHREN_JE_WOCHE = 3
MAX_JE_LAUF = 200


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def berlin_day(t: dt.datetime) -> dt.date:
    return t.astimezone(BERLIN).date()


def brain_enabled(db) -> bool:
    try:
        rows = db.select("settings", {"select": "brain_enabled", "id": "eq.1"}) or []
    except Exception:  # noqa: BLE001 - ohne Einstellungen gilt: an
        return True
    return not rows or rows[0].get("brain_enabled") is not False


def _countries(land: str) -> list[str]:
    if land and land != "ALL":
        return [land]
    from lib.fokus import test_scope
    return test_scope()[1] or ["US", "UK", "FR"]


# ------------------------------------------------------------------------------------------------ Messen
def messen(db, e: dict, day: dt.date) -> float | None:
    """Wert der Kennzahl am deutschen Tag `day` (kpi_daily: letzter Wert ≤ day, höchstens 3 Tage alt)."""
    k = e["kennzahl"]
    if k in L.LIVE:
        try:
            roh = (db.rpc("gehirn_score_teile", {"p_day": day.isoformat(), "p_segment": e.get("segment") or "S2",
                                                 "p_countries": _countries(e.get("land") or "ALL")}) or [None])[0]
        except Exception as exc:  # noqa: BLE001
            print(f"  Messung {k} fehlgeschlagen: {type(exc).__name__}")
            return None
        return L.live_wert(k, roh)
    rows = db.select("kpi_daily", {"select": "day,value", "metric": f"eq.{k}", "country": f"eq.{e.get('land') or 'ALL'}",
                                   "segment_id": f"eq.{e.get('segment') or 'S2'}", "day": f"lte.{day.isoformat()}",
                                   "order": "day.desc", "limit": "1"}) or []
    if not rows:
        return None
    if (day - dt.date.fromisoformat(str(rows[0]["day"])[:10])).days > 3:
        return None
    return L._num(rows[0].get("value"))


# ------------------------------------------------------------------------------------------------ Wissen
def _knowledge(db) -> list[dict]:
    return db.select("brain_knowledge", {"select": "id,slug,titel,markdown,quelle,typ,vertrauen,belege,"
                                         "zuletzt_bestaetigt,status,thema,richtung,created_at,updated_at"}) or []


def _beleg(d: dict, ergebnis: str, notiz: str, t: dt.datetime) -> dict:
    return {"decision_id": d["id"], "ergebnis": ergebnis, "notiz": notiz[:160], "am": t.isoformat()}


def _upsert_lehre(db, kb: list[dict], d: dict, thema: str, wirkt: bool, notiz: str, t: dt.datetime) -> dict:
    """Wissens-Eintrag lehre-/fehler-<thema> anlegen oder stärken (Markdown mit Datum ergänzt, alte Fassung bleibt)."""
    from brain_knowledge import add
    e = d.get("erwartung") or {}
    slug = f"{'lehre' if wirkt else 'fehler'}-{thema}"[:80].rstrip("-")
    cur = next((r for r in kb if r["slug"] == slug), None)
    satz = e.get("lehre") or d.get("kurz_titel") or d.get("subject") or thema
    titel = f"{'Wirkt' if wirkt else 'Wirkt nicht'}: {satz}"[:120]
    md = (f"**{'Bestätigt' if wirkt else 'Widerlegt'}** – {notiz}.\n\n- Erwartung: {e.get('kennzahl')} {e.get('richtung')}"
          f"{' ' + L.fmt(e.get('zielwert')) if e.get('zielwert') is not None else ''} ({e.get('land')}, {e.get('segment')})\n"
          f"- Beleg: Entscheidung #{d['id']} „{(d.get('kurz_titel') or d.get('subject') or '')[:80]}“")
    add(db, slug, titel if len(titel) >= 2 else "Lehre", md, "routine", anhaengen=bool(cur), now=t,
        typ="gelernt" if wirkt else "fehlermuster")
    alt = cur.get("vertrauen") if cur else None
    v = L.vertrauen_neu(alt, True) if cur else (L.V_START_WIRKT if wirkt else L.V_START_FEHLER)
    belege = ((cur or {}).get("belege") or []) + [_beleg(d, "bestaetigt" if wirkt else "widerlegt", notiz, t)]
    vals = {"vertrauen": v, "belege": belege[-20:], "status": "aktiv", "thema": thema,
            "richtung": "wirkt" if wirkt else "wirkt_nicht", "zuletzt_bestaetigt": t.isoformat()}
    db.update("brain_knowledge", {"slug": slug}, vals)
    row = {**(cur or {}), "slug": slug, **vals}
    if cur:
        cur.update(vals)
    else:
        kb.append(row)
    return row


def _schwaechen(db, kb: list[dict], d: dict, thema: str, gegen: str, notiz: str, t: dt.datetime) -> list[str]:
    """Vertrauen passender Einträge senken: gleiches Thema mit Aussage `gegen` oder in erwartung.wissen genannt."""
    namen = set((d.get("erwartung") or {}).get("wissen") or [])
    out = []
    for r in kb:
        if r.get("status", "aktiv") != "aktiv" or r.get("quelle") == "inhaber":
            continue
        if not ((r.get("thema") == thema and r.get("richtung") == gegen) or r["slug"] in namen):
            continue
        v = L.vertrauen_neu(r.get("vertrauen"), False)
        belege = (r.get("belege") or []) + [_beleg(d, "widerlegt" if gegen == "wirkt" else "bestaetigt", notiz, t)]
        db.update("brain_knowledge", {"slug": r["slug"]}, {"vertrauen": v, "belege": belege[-20:]})
        r["vertrauen"], r["belege"] = v, belege[-20:]
        out.append(r["slug"])
    return out


def _staerken_genannte(db, kb: list[dict], d: dict, notiz: str, t: dt.datetime) -> list[str]:
    """In erwartung.wissen genannte Einträge bei Bestätigung stärken."""
    namen = set((d.get("erwartung") or {}).get("wissen") or [])
    out = []
    for r in kb:
        if r["slug"] in namen and r.get("status", "aktiv") == "aktiv" and r.get("richtung") != "wirkt_nicht":
            v = L.vertrauen_neu(r.get("vertrauen"), True)
            belege = (r.get("belege") or []) + [_beleg(d, "bestaetigt", notiz, t)]
            db.update("brain_knowledge", {"slug": r["slug"]},
                      {"vertrauen": v, "belege": belege[-20:], "zuletzt_bestaetigt": t.isoformat()})
            r["vertrauen"] = v
            out.append(r["slug"])
    return out


# ------------------------------------------------------------------------------------------------ pruefen
def faellige(db, t: dt.datetime, bis: dt.datetime | None = None) -> list[dict]:
    return db.select("decisions", {"select": "id,type,subject,kurz_titel,created_at,erwartung,pruefen_am,ergebnis",
                                   "erwartung": "not.is.null", "ergebnis": "is.null",
                                   "pruefen_am": f"lte.{(bis or t).isoformat()}", "order": "pruefen_am.asc",
                                   "limit": str(MAX_JE_LAUF)}) or []


def pruefen(db, t: dt.datetime | None = None, apply: bool = False) -> dict:
    t = t or now()
    if apply and not brain_enabled(db):
        apply = False
        print("pruefen: Gehirn pausiert (settings.brain_enabled = false) – nur anzeigen")
    rows = faellige(db, t)
    kb = _knowledge(db) if apply else []
    res = {"faellig": len(rows), "bestaetigt": 0, "widerlegt": 0, "unklar": 0, "wissen": [], "angewandt": apply,
           "details": []}
    for d in rows:
        e = d.get("erwartung") or {}
        if isinstance(e, str):
            try:
                e = json.loads(e)
            except ValueError:
                e = {}
        try:
            e = L.normal(e, L._ts(d.get("created_at")))[0]
        except ValueError as exc:
            erg, wert, notiz, basis = "unklar", None, f"Erwartung ungültig: {exc}", None
        else:
            d["erwartung"] = e
            basis = L._num(e.get("basis"))
            if basis is None and e["richtung"] in ("steigt", "faellt") and e.get("zielwert") is None:
                created = L._ts(d.get("created_at")) or t
                basis = messen(db, e, berlin_day(created))
            wert = messen(db, e, berlin_day(min(t, L._ts(d.get("pruefen_am")) or t)))
            erg, notiz = L.urteil(e, basis, wert)
        res[erg] += 1
        info = {"id": d["id"], "titel": d.get("kurz_titel") or d.get("subject"), "ergebnis": erg, "messwert": wert,
                "basis": basis, "notiz": notiz}
        res["details"].append(info)
        if not apply:
            continue
        upd = {"ergebnis": erg, "messwert": wert, "gemessen_at": t.isoformat(), "ergebnis_notiz": notiz[:300]}
        if basis is not None and isinstance(d.get("erwartung"), dict) and "basis" not in d["erwartung"]:
            upd["erwartung"] = {**d["erwartung"], "basis": basis}
        db.update("decisions", {"id": d["id"]}, upd)
        if erg == "unklar":
            continue
        thema = L.thema_of(d)
        if erg == "bestaetigt":
            row = _upsert_lehre(db, kb, d, thema, True, notiz, t)
            info["wissen"] = [row["slug"]] + _staerken_genannte(db, kb, d, notiz, t) \
                + _schwaechen(db, kb, {**d, "erwartung": {**e, "wissen": []}}, thema, "wirkt_nicht", notiz, t)
        else:
            info["wissen"] = _schwaechen(db, kb, d, thema, "wirkt", notiz, t)
            info["wissen"].append(_upsert_lehre(db, kb, d, thema, False, notiz, t)["slug"])
        res["wissen"] += info["wissen"]
    return res


# ------------------------------------------------------------------------------------------------ rueckschau
def _woche(t: dt.datetime) -> dt.date:
    """Montag der zurückliegenden Woche (deutscher Kalender)."""
    d = berlin_day(t)
    return d - dt.timedelta(days=d.weekday() + 7)


def _gewicht(d: dict) -> float:
    """Wichtigkeit einer gemessenen Entscheidung: relative Änderung, widerlegt/bestätigt vor unklar."""
    e = d.get("erwartung") or {}
    b, w = L._num(e.get("basis")), L._num(d.get("messwert"))
    rel = abs(w - b) / abs(b) if b not in (None, 0) and w is not None else 0.5
    return min(rel, 10.0) + (1.0 if d.get("ergebnis") in ("bestaetigt", "widerlegt") else 0.0)


def lehren_der_woche(gemessen: list[dict], kb: list[dict]) -> list[dict]:
    out, seen = [], set()
    for d in sorted((x for x in gemessen if x.get("ergebnis") in ("bestaetigt", "widerlegt")), key=_gewicht, reverse=True):
        thema = L.thema_of(d)
        if thema in seen:
            continue
        seen.add(thema)
        wirkt = d["ergebnis"] == "bestaetigt"
        slug = f"{'lehre' if wirkt else 'fehler'}-{thema}"[:80].rstrip("-")
        k = next((r for r in kb if r["slug"] == slug), {})
        satz = (d.get("erwartung") or {}).get("lehre") or d.get("kurz_titel") or d.get("subject") or thema
        out.append({"titel": f"{'Wirkt' if wirkt else 'Wirkt nicht'}: {satz}"[:60],
                    "grund": (d.get("ergebnis_notiz") or "")[:160], "slug": slug, "decision_id": d["id"],
                    "vertrauen": k.get("vertrauen")})
        if len(out) >= LEHREN_JE_WOCHE:
            return out
    for r in sorted((r for r in kb if r.get("status", "aktiv") == "aktiv" and r.get("thema")
                     and float(r.get("vertrauen") or 0) >= HOCH and r["slug"] not in {o["slug"] for o in out}),
                    key=lambda r: -float(r.get("vertrauen") or 0)):
        if len(out) >= LEHREN_JE_WOCHE:
            break
        out.append({"titel": str(r.get("titel") or r["slug"])[:60], "grund": f"Vertrauen {float(r['vertrauen']):.2f}"
                    .replace(".", ","), "slug": r["slug"], "decision_id": None, "vertrauen": r.get("vertrauen")})
    return out


def rueckschau(db, t: dt.datetime | None = None, apply: bool = False, force: bool = False) -> dict:
    t = t or now()
    if apply and not brain_enabled(db):
        apply = False
        print("rueckschau: Gehirn pausiert (settings.brain_enabled = false) – nur anzeigen")
    woche = _woche(t)
    if apply and not force and db.select("brain_rueckschau", {"select": "woche", "woche": f"eq.{woche.isoformat()}"}):
        return {"woche": woche.isoformat(), "uebersprungen": "schon erledigt"}
    kb = _knowledge(db)
    archiv = [r["slug"] for r in kb if L.veraltet(r, t, ARCHIV_TAGE, ARCHIV_MAX_V)]
    for r in kb:
        if r["slug"] in archiv:
            r["status"] = "archiviert"
    wid = L.widersprueche(kb)
    seit = t - dt.timedelta(days=7)
    gemessen = db.select("decisions", {"select": "id,subject,kurz_titel,erwartung,ergebnis,messwert,ergebnis_notiz,"
                                       "gemessen_at", "ergebnis": "not.is.null",
                                       "gemessen_at": f"gte.{seit.isoformat()}", "order": "gemessen_at.desc"}) or []
    offen = len(db.select("decisions", {"select": "id", "erwartung": "not.is.null", "ergebnis": "is.null"}) or [])
    zahlen = {e: sum(1 for d in gemessen if d.get("ergebnis") == e) for e in L.ERGEBNISSE} | {"offen": offen}
    lehren = lehren_der_woche(gemessen, kb)
    kw = woche.isocalendar()[1]
    titel = f"Rückschau KW {kw}: {len(lehren)} Lehre{'n' if len(lehren) != 1 else ''}" if lehren \
        else f"Rückschau KW {kw}: noch keine Lehren"
    grund = (lehren[0]["titel"] if lehren else
             f"{zahlen['bestaetigt'] + zahlen['widerlegt']} gemessene Entscheidungen, {offen} Erwartungen offen.")
    if wid:
        grund = f"{grund} – {len(wid)} Widerspruch{'e' if len(wid) > 1 else ''} prüfen."
    res = {"woche": woche.isoformat(), "kw": kw, "lehren": lehren, "archiviert": archiv, "widersprueche": wid,
           "entscheidungen": zahlen, "titel": titel, "angewandt": apply}
    if not apply:
        return res
    for s in archiv:
        db.update("brain_knowledge", {"slug": s}, {"status": "archiviert"})
    from lib.kurz import insert_decisions
    reasoning = "Lehren der Woche:\n" + "\n".join(f"- {x['titel']} ({x['grund']})" for x in lehren) if lehren \
        else "Keine gemessene Entscheidung mit klarem Ergebnis in dieser Woche."
    if wid:
        reasoning += "\nWidersprüche: " + "; ".join(f"{w['thema']}: {', '.join(w['wirkt'])} ↔ {', '.join(w['wirkt_nicht'])}"
                                                   for w in wid)
    if archiv:
        reasoning += f"\nArchiviert (nicht gelöscht): {', '.join(archiv)}"
    dec = insert_decisions(db, {"type": "note", "subject": f"Rückschau: {titel}", "reasoning": reasoning,
                                "kurz_titel": titel, "kurz_grund": grund, "status": "done",
                                "metrics": {"rueckschau": {k: res[k] for k in ("woche", "entscheidungen")},
                                            "lehren": lehren, "widersprueche": wid, "archiviert": archiv}})
    did = (dec or [{}])[0].get("id")
    db.insert("brain_rueckschau", {"woche": woche.isoformat(), "at": t.isoformat(), "lehren": lehren,
                                   "archiviert": archiv, "widersprueche": wid, "entscheidungen": zahlen,
                                   "decision_id": did}, upsert_on="woche")
    res["decision_id"] = did
    return res


# ------------------------------------------------------------------------------------------------ Anzeige
def faellig_liste(db, t: dt.datetime | None = None) -> dict:
    t = t or now()
    rows = faellige(db, t, t + dt.timedelta(days=3))
    return {"jetzt": [r for r in rows if (L._ts(r.get("pruefen_am")) or t) <= t],
            "bald": [r for r in rows if (L._ts(r.get("pruefen_am")) or t) > t]}


def lehren_liste(db) -> list[dict]:
    rows = [r for r in _knowledge(db) if r.get("status", "aktiv") == "aktiv" and float(r.get("vertrauen") or 0) >= HOCH]
    return [{"slug": r["slug"], "titel": r.get("titel"), "vertrauen": r.get("vertrauen"), "richtung": r.get("richtung"),
             "belege": len(r.get("belege") or [])} for r in sorted(rows, key=lambda r: -float(r.get("vertrauen") or 0))]


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    cmd, apply = argv[0], "--apply" in argv
    if cmd == "pruefen":
        out = pruefen(DB(), apply=apply)
    elif cmd == "rueckschau":
        out = rueckschau(DB(), apply=apply, force="--force" in argv)
    elif cmd == "faellig":
        out = faellig_liste(DB())
    elif cmd == "lehren":
        out = lehren_liste(DB())
    else:
        print(__doc__)
        return 1
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
