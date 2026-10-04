"""Prüffälle des Gehirns (docs/GEHIRN-AUFBAU.md Baustein 4): misst, ob Regeln und Gehirn noch richtig entscheiden.

regeln    wendet die festen Regeln (scripts/lib/gehirn_regeln.py) auf alle Fälle aus tests/fixtures/gehirn_faelle.json
          an -> Punktzahl. Täglich im Wachhund (einmal je Tag); fällt sie, ist eine Regel kaputt oder gelockert.
vorlegen  druckt die Fälle ohne Lösung (für die Gehirn-Sitzung: jede Situation mit genau einer Handlung beantworten).
bewerten  liest die Antworten einer Sitzung ({fall_id: handlung}, JSON-Datei) und vergleicht mit richtig/verboten.

Mit --apply wird die Punktzahl in signalwerk.brain_evals gespeichert (quelle regeln | sitzung). Die Punktzahl darf
nach einer Änderung nicht sinken: Exit-Code 2, wenn sie unter der letzten derselben Quelle liegt oder eine verbotene
Handlung gewählt wurde. Pause (settings.brain_enabled = false): nur anzeigen. Sendet nichts, löscht nichts.

  python scripts/brain_eval.py regeln [--apply] [--einmal-taeglich]
  python scripts/brain_eval.py vorlegen
  python scripts/brain_eval.py bewerten antworten.json [--apply] [--anlass "Betreff-Regel geändert"]
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib import gehirn_regeln as G  # noqa: E402

FAELLE = ROOT / "tests" / "fixtures" / "gehirn_faelle.json"
BERLIN = ZoneInfo("Europe/Berlin")


def faelle(path: Path = FAELLE) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["faelle"]


def regeln(fs: list[dict] | None = None) -> dict:
    fs = fs if fs is not None else faelle()
    antworten = {}
    for f in fs:
        try:
            antworten[f["id"]] = G.entscheide(f)
        except Exception as exc:  # noqa: BLE001 - ein kaputter Fall zählt als falsch, der Rest läuft weiter
            print(f"  {f['id']}: {type(exc).__name__}: {exc}")
    return G.bewerte(fs, antworten)


def vorlegen(fs: list[dict] | None = None) -> list[dict]:
    return [{"id": f["id"], "titel": f["titel"], "situation": f["situation"]} for f in (fs or faelle())]


def letzte(db, quelle: str) -> float | None:
    rows = db.select("brain_evals", {"select": "score", "quelle": f"eq.{quelle}", "order": "created_at.desc",
                                     "limit": "1"}) or []
    return float(rows[0]["score"]) if rows else None


def heute_schon(db, quelle: str, t: dt.datetime) -> bool:
    start = dt.datetime.combine(t.astimezone(BERLIN).date(), dt.time(), BERLIN).astimezone(dt.timezone.utc)
    return bool(db.select("brain_evals", {"select": "id", "quelle": f"eq.{quelle}",
                                          "created_at": f"gte.{start.isoformat()}", "limit": "1"}))


def speichern(db, res: dict, quelle: str, anlass: str | None = None) -> dict:
    vorher = letzte(db, quelle)
    db.insert("brain_evals", {"quelle": quelle, "anlass": (anlass or None) and anlass[:160], "faelle": res["faelle"],
                              "richtig": res["richtig"], "verboten": res["verboten"], "score": res["score"],
                              "details": [d for d in res["details"] if not d["ok"]]})
    return {"vorher": vorher, "gesunken": vorher is not None and res["score"] < vorher}


def _brain_enabled(db) -> bool:
    from brain_learn import brain_enabled
    return brain_enabled(db)


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    cmd, apply = argv[0], "--apply" in argv
    anlass = argv[argv.index("--anlass") + 1] if "--anlass" in argv and argv.index("--anlass") + 1 < len(argv) else None
    if cmd == "vorlegen":
        print(json.dumps(vorlegen(), ensure_ascii=False, indent=1))
        return 0
    if cmd == "regeln":
        res, quelle = regeln(), "regeln"
    elif cmd == "bewerten" and len(argv) > 1 and not argv[1].startswith("--"):
        antworten = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        res, quelle = G.bewerte(faelle(), {str(k): str(v) for k, v in antworten.items()}), "sitzung"
    else:
        print(__doc__)
        return 1
    falsch = [d for d in res["details"] if not d["ok"]]
    print(f"{quelle}: {res['richtig']}/{res['faelle']} richtig, Punktzahl {res['score']}, verboten {res['verboten']}")
    for d in falsch:
        print(f"  falsch: {d['id']} -> {d['antwort']} (richtig {d['richtig']}){' VERBOTEN' if d['verboten'] else ''}")
    rc = 2 if res["verboten"] else 0
    if apply:
        from lib.db import DB
        db = DB()
        if not _brain_enabled(db):
            print("Gehirn pausiert (settings.brain_enabled = false) – nichts gespeichert")
        elif "--einmal-taeglich" in argv and heute_schon(db, quelle, dt.datetime.now(dt.timezone.utc)):
            print("heute schon gespeichert")
        else:
            info = speichern(db, res, quelle, anlass)
            if info["gesunken"]:
                print(f"Punktzahl gesunken: {info['vorher']} -> {res['score']}")
                rc = 2
    return rc


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
