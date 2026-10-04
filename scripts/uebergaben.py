"""Firma: feste Übergaben zwischen den Bereichen und der tägliche Geschäftsbericht (Inhaber 04.10.2026: „gib
verschiedene bereiche wie in einem unternehmen … damit sie gut zusammenarbeiten, bau daraus ein unternehmen was geld
verdient“).

Bereiche und Leitung stehen in signalwerk.departments (Migration 20261005070000), die Zahlen liefert eine einzige
lesende Abfrage signalwerk.firma_lage(Segment, Länder) für die Fokus-Tests (config/fokus.yaml `tests`, heute S2 ×
US/UK/FR). Reines Python + SQL, keine Tokens: dieses Skript legt nur Aufträge in agent_tasks an; tätig werden die
LLM-Agenten über die vorhandene JARVIS-Runde (:08/:23/:38/:53, docs/AGENTEN.md).

Regeln (Bereich → Bereich, Schlüssel = kein Doppelauftrag):
  fehlerquote   Qualität → Produktion     Dauerprüfung meldet Ausreißer (> 5 %) in einem Fokus-Land   (je Art/Land/Tag)
  null_antworten Vertrieb → Marketing     ≥ 30 Erstmails (3–17 Tage alt), 0 Antworten in einem Land     (je Land/Woche)
  kaufinteresse Vertrieb → Kundenservice  Antwort „buy“ offen, Inhaber hat noch nicht gehandelt         (je Antwort)
                                          + Push aufs Handy, falls der Antwort-Assistent noch keinen Alarm schickte
  vorrat_leer   Produktion → Strategie    Lead-Linie eines Fokus-Lands „Vorrat leer“ oder 0 fertige Proben (je Linie/Tag)
  spam          Recht → Qualität          Spam-Beschwerde (Zustell-Agent sucht die Ursache)            (je Ereignis)

Jede Übergabe steht in signalwerk.handoffs (schluessel eindeutig). Ein Auftrag geht nur an einen freien Agenten A1–A8,
und nur wenn danach noch einer frei bleibt (für den Inhaber); höchstens 3 neue Aufträge je Lauf, höchstens ein offener
Auftrag je Fach-Agent. Sonst bleibt die Übergabe „wartet“ und der nächste Lauf (Wachhund, alle 30 min) holt sie nach.
Ändert nie Versand, Länder, Sperrliste, Notbremse, Prüfregeln oder Freigabe; sendet keine Mails; löscht nichts.

  python scripts/uebergaben.py pruefen            # nur anzeigen
  python scripts/uebergaben.py pruefen --apply    # Übergaben anlegen, Aufträge vergeben, Push bei Kaufinteresse
  python scripts/uebergaben.py bericht            # Geschäftsbericht (Titel + 5 Zeilen)
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

BERLIN = ZoneInfo("Europe/Berlin")
AGENT_COUNT = 8           # A1–A8 (app/lib/agents.ts AGENT_COUNT)
KEEP_FREE = 1             # mindestens ein Agent bleibt für den Inhaber frei
MAX_NEW = 3               # neue Aufträge je Lauf
WAIT_MAX = dt.timedelta(hours=48)   # länger wartende Übergaben verfallen (bleiben sichtbar, kein Auftrag mehr)
BY = "Übergabe"           # agent_tasks.created_by
OPEN = ("offen", "laeuft")
FEHLER_MAX = 0.05         # wie Dauerprüfung „Ausreißer“
NULL_MIN = 30             # Erstmails ohne jede Antwort, ab denen Marketing testen soll
TITEL_MAX, GRUND_MAX, BRIEF_MAX = 60, 160, 1000

GRENZEN = "Grenzen: Versand, Länder, Sperrliste, Notbremse, Prüfregeln und Freigabe bleiben unverändert; nichts löschen."


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _cut(text: str, n: int) -> str:
    t = " ".join(str(text or "").split())
    return t if len(t) <= n else t[: n - 1].rstrip() + "…"


def _int(x) -> int:
    try:
        return int(float(x or 0))
    except (TypeError, ValueError):
        return 0


def _lane_countries(lanes: list[dict]) -> dict[str, set[str]]:
    return {str(x.get("id")): {c.strip().upper() for c in str(x.get("country") or "").split(",") if c.strip()}
            for x in lanes if x.get("id")}


def load_lanes() -> list[dict]:
    try:
        return json.loads((ROOT / "app" / "lib" / "werk-linien.json").read_text(encoding="utf-8")).get("lanes") or []
    except (OSError, ValueError):
        return []


def _h(regel, von, an, schluessel, titel, grund, market=None, task=None, push=None) -> dict:
    return {"regel": regel, "von": von, "an": an, "schluessel": _cut(schluessel, 120), "titel": _cut(titel, TITEL_MAX),
            "grund": _cut(grund, GRUND_MAX), "market": market, "task": task, "push": push}


def _task(kind: str, brief: str, rolle: str | None = None, market: str | None = None) -> dict:
    return {"kind": kind, "rolle": rolle, "market": market, "brief": _cut(f"{brief} {GRENZEN}", BRIEF_MAX)}


def regeln(lage: dict, countries: list[str], t: dt.datetime, lanes: list[dict] | None = None,
           segment: str = "S2") -> list[dict]:
    """Übergaben aus der Lage (firma_lage). Reine Funktion; Schlüssel machen jede Übergabe einmalig."""
    lage = lage or {}
    day = t.astimezone(BERLIN).date()
    tag, woche = day.isoformat(), day.strftime("%G-W%V")
    focus = [c.upper() for c in countries]
    out: list[dict] = []

    # Qualität → Produktion: Ausreißer der Dauerprüfung
    for a in lage.get("ausreisser") or []:
        land, art = str(a.get("country") or "").upper(), str(a.get("art") or "lead")
        q = float(a.get("fehlerquote") or 0)
        if land not in focus or str(a.get("segment_id") or segment) != segment or q <= FEHLER_MAX:
            continue
        was = "Käufer" if art == "kaeufer" else "Leads"
        out.append(_h("fehlerquote", "qualitaet", "produktion", f"fehlerquote:{art}:{land}:{tag}",
                      f"{was} {land}: Fehlerquote {q * 100:.1f} %",
                      f"Dauerprüfung: {_int(a.get('geprueft'))} geprüft, {q * 100:.1f} % abweichend – Quelle verbessern.",
                      land, _task("quelle", f"Übergabe Qualität → Produktion: {was} {land} ({segment}) haben {q * 100:.1f} % "
                                  f"Fehler in der Dauerprüfung. Quelle/Feld mit den meisten Abweichungen finden "
                                  f"(lead_checks, pruef_stats_daily) und in der Quelle beheben.", "quellen", land)))

    # Vertrieb → Marketing: Land ohne Antworten
    for land, x in sorted((lage.get("laender") or {}).items()):
        land = land.upper()
        n, r = _int((x or {}).get("erstmails")), _int((x or {}).get("antworten"))
        if land not in focus or n < NULL_MIN or r > 0:
            continue
        out.append(_h("null_antworten", "vertrieb", "marketing", f"null_antworten:{land}:{woche}",
                      f"{land}: 0 Antworten auf {n} Erstmails",
                      f"{n} Erstmails in 14 Tagen ohne Antwort – Betreff oder Einstieg testen.",
                      land, _task("gehirn", f"Übergabe Vertrieb → Marketing: {n} Erstmails ({segment} {land}, 3–17 Tage alt) "
                                  f"ohne eine Antwort. Test-Agent: genau einen A/B-Test für Betreff oder Einstieg in "
                                  f"{land} vorschlagen und anlegen (ab.py, eine Sache je Test, nur {segment} × "
                                  f"{'/'.join(focus)}).", "test", land)))

    # Vertrieb → Kundenservice: Kaufinteresse (+ Push, wenn noch kein Alarm)
    for h in lage.get("heiss") or []:
        rid = str(h.get("id") or "")
        if not rid:
            continue
        firma, land = _cut(h.get("firma") or "Firma", 40), str(h.get("land") or "").upper() or None
        out.append(_h("kaufinteresse", "vertrieb", "kundenservice", f"kauf:{rid}", f"Kaufinteresse: {firma}",
                      "Antwort mit Kaufinteresse wartet – Probe und Antwort im Cockpit vorbereiten.", land,
                      _task("frage", f"Übergabe Vertrieb → Kundenservice: Kaufinteresse von {firma} ({land or '–'}), "
                            f"Antwort {rid}. Passende Probe aus dem Vorrat und einen Antwort-Entwurf im Antworten-Cockpit "
                            f"vorbereiten (inbound_replies.draft_text). Nicht selbst senden, keine Preise – der Inhaber "
                            f"entscheidet.", None, land),
                      None if h.get("alarm") else {"title": f"Kaufinteresse: {firma}", "body": "Antwort wartet im Cockpit",
                                                   "url": f"/dashboard/antworten/{rid}", "kind": "buy"}))

    # Produktion → Strategie: Vorrat leer
    lc = _lane_countries(lanes if lanes is not None else load_lanes())
    for lane in lage.get("leer") or []:
        cs = sorted(lc.get(str(lane), set()) & set(focus))
        if not cs:
            continue
        out.append(_h("vorrat_leer", "produktion", "strategie", f"vorrat_leer:{lane}:{tag}",
                      f"Vorrat leer: Linie {lane}",
                      f"Lead-Werk findet keine Kandidaten mehr ({'/'.join(cs)}) – neue kostenlose Quelle suchen.",
                      cs[0] if len(cs) == 1 else None,
                      _task("quelle", f"Übergabe Produktion → Strategie (Scout): Lead-Linie {lane} ({'/'.join(cs)}) meldet "
                            f"„Vorrat leer“. Nach Scout-Regeln (docs/QUELLEN-SCOUT.md) eine neue kostenlose, erlaubte "
                            f"Quelle für {segment} in {'/'.join(cs)} testen (≥ 10 grüne Leads) und ins Lead-Werk einbauen.",
                            None, cs[0] if len(cs) == 1 else None)))
    for land, n in sorted((lage.get("vorrat_land") or {}).items()):
        if land.upper() in focus and _int(n) == 0:
            out.append(_h("vorrat_leer", "produktion", "strategie", f"proben_leer:{land.upper()}:{tag}",
                          f"Keine fertige Probe in {land.upper()}",
                          "Proben-Vorrat leer – Lead-Nachschub und Proben-Bau prüfen.", land.upper(),
                          _task("quelle", f"Übergabe Produktion → Strategie: 0 fertige Proben ({segment} {land.upper()}). "
                                f"Ursache finden (Proben-Vorrat-Lauf, freigegebene Leads im Land) und Nachschub sichern.",
                                None, land.upper())))

    # Recht → Qualität: Spam-Beschwerde (Recht ändert nie Regeln, der Zustell-Agent sucht die Ursache)
    for s in lage.get("spam_neu") or []:
        sid = str(s.get("id") or "")
        if sid:
            out.append(_h("spam", "recht", "qualitaet", f"spam:{sid}", "Spam-Beschwerde eingegangen",
                          "Beschwerde gesperrt, Notbremse greift – Ursache je Postfach und Text suchen.", None,
                          _task("pruefen", f"Übergabe Recht → Qualität: Spam-Beschwerde (email_events {sid}). Zustell-Agent: "
                                f"Postfach, Text und Zielgruppe der betroffenen Mail prüfen, Ursache in 1 Satz nennen und "
                                f"1 Maßnahme innerhalb der Limits vorschlagen.", "zustellung")))
    return out


def _ts(x) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(str(x).replace("Z", "+00:00")) if x else None
    except ValueError:
        return None


def agenten_pausiert(db) -> bool:
    """Schalter des Inhabers (owner_settings.werke_paused.agenten) nur lesen – pausiert = keine neuen Aufträge."""
    try:
        rows = db.select("owner_settings", {"select": "key,value", "key": "eq.werke_paused"}) or []
    except Exception:  # noqa: BLE001
        return False
    v = rows[0].get("value") if rows else None
    return isinstance(v, dict) and bool(v.get("agenten"))


def vergeben(db, t: dt.datetime, specs: dict[str, dict], paused: bool = False) -> list[dict]:
    """Wartende Übergaben (≤ 48 h) an freie Agenten geben. Höchstens MAX_NEW, einer bleibt frei, ein offener je Rolle.
    specs = Auftrag je Schlüssel aus der aktuellen Lage: gilt eine ältere Übergabe nicht mehr, bekommt sie keinen
    Auftrag (bleibt sichtbar, verfällt nach 48 h)."""
    if paused:
        return []
    wait = db.select("handoffs", {"status": "eq.wartet", "select": "id,regel,an,market,titel,grund,schluessel,created_at",
                                  "order": "created_at.asc", "limit": "50"}) or []
    wait = [w for w in wait if (_ts(w.get("created_at")) or t) >= t - WAIT_MAX]
    if not wait:
        return []
    open_rows = db.select("agent_tasks", {"status": f"in.({','.join(OPEN)})", "select": "agent,rolle"}) or []
    busy = {int(r["agent"]) for r in open_rows if str(r.get("agent", "")).isdigit()}
    busy_roles = {r.get("rolle") for r in open_rows if r.get("rolle")}
    free = [n for n in range(1, AGENT_COUNT + 1) if n not in busy]
    done = []
    for w in wait:
        if len(done) >= MAX_NEW or len(free) <= KEEP_FREE:
            break
        spec = specs.get(str(w.get("schluessel")))
        if not spec:
            continue
        if spec.get("rolle") and spec["rolle"] in busy_roles:
            continue
        n = free.pop(0)
        row = {"agent": n, "status": "offen", "kind": spec["kind"], "market": spec.get("market"), "brief": spec["brief"],
               "grund": _cut(w.get("grund"), GRUND_MAX), "created_by": BY}
        if spec.get("rolle"):
            row["rolle"] = spec["rolle"]
            busy_roles.add(spec["rolle"])
        task = (db.insert("agent_tasks", row) or [{}])[0]
        db.update("handoffs", {"id": w["id"]}, {"status": "beauftragt", "task_id": task.get("id")})
        done.append({"an": f"A{n}", "titel": w.get("titel"), "regel": w.get("regel")})
    return done


def pruefen(db, t: dt.datetime, apply: bool, lage: dict | None = None, countries: list[str] | None = None,
            segment: str | None = None, lanes: list[dict] | None = None, notify=None) -> dict:
    if countries is None or segment is None:
        from lib.fokus import test_scope
        segs, cs = test_scope()
        segment, countries = segment or (segs[0] if segs else "S2"), countries or cs
    if lage is None:
        lage = db.rpc("firma_lage", {"p_segment": segment, "p_countries": countries}) or {}
    items = regeln(lage, countries, t, lanes, segment)
    specs = {i["schluessel"]: i["task"] for i in items if i.get("task")}
    out = {"regeln": [{k: i[k] for k in ("regel", "von", "an", "titel", "schluessel")} for i in items], "neu": [],
           "auftraege": [], "push": []}
    if not apply:
        return out
    for i in items:
        row = {k: i[k] for k in ("regel", "von", "an", "schluessel", "titel", "grund", "market")}
        row["status"] = "wartet" if i.get("task") else "gemeldet"
        res = db.insert("handoffs", row, upsert_on="schluessel", ignore_duplicates=True) or []
        if not res:
            continue  # gab es schon – kein Doppelauftrag, kein zweiter Push
        out["neu"].append(i["titel"])
        if i.get("push"):
            p = i["push"]
            if notify is None:
                from lib.push import notify as _n
                notify = _n
            ok = False
            try:
                ok = bool(notify(p["title"], p["body"], p["url"], p["kind"]))
            except Exception as exc:  # noqa: BLE001 - Push ist zweitrangig, die Übergabe steht
                print(f"  Hinweis: Push fehlgeschlagen ({type(exc).__name__})")
            if ok:
                db.update("handoffs", {"id": res[0]["id"]}, {"push_at": t.isoformat()})
                out["push"].append(p["title"])
    out["auftraege"] = vergeben(db, t, specs, agenten_pausiert(db))
    return out


# ------------------------------------------------------------------------------------------- Geschäftsbericht
def _geld(x) -> str:
    v = float(x or 0)
    return f"{v:,.0f}".replace(",", ".")


def bericht(lage: dict) -> dict:
    """Geschäftsbericht: Titel (≤ 60) + 5 Zeilen mit je einer Zahl, entlang Mail → Antwort → Probe → Kunde → Umsatz."""
    lage = lage or {}
    zeilen = [
        f"Mails 24 h: {_int(lage.get('mails_24h'))}",
        f"Antworten 7 T: {_int(lage.get('antworten_7d'))}",
        f"Proben 7 T: {_int(lage.get('proben_7d'))}",
        f"Kunden: {_int(lage.get('kunden'))}",
        f"Umsatz/Monat: {_geld(lage.get('mrr'))}",
    ]
    return {"titel": _cut(f"Geschäft heute: {_geld(lage.get('mrr'))} Umsatz/Monat", TITEL_MAX), "zeilen": zeilen}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    db = DB()
    t = now()
    if argv[0] == "pruefen":
        res = pruefen(db, t, "--apply" in argv)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0
    if argv[0] == "bericht":
        from lib.fokus import test_scope
        segs, cs = test_scope()
        b = bericht(db.rpc("firma_lage", {"p_segment": segs[0] if segs else "S2", "p_countries": cs}) or {})
        print("\n".join([b["titel"], *b["zeilen"]]))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
