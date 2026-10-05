"""Strategie-Seite pflegen (/dashboard/strategie, Inhaber 05.10.2026: „strategie zusammenfassung … regelmäßig geupdatet“).

Das Repo ist öffentlich – Inhalte (Strategie-Sätze, Meilensteine, Rückblick) stehen nur in der Datenbank:
brain_knowledge 'strategie-zusammenfassung', signalwerk.strategy_milestones, signalwerk.strategy_rueckblick.
Nach jeder Änderung wird der Zwischenspeicher neu gerechnet (rpc strategie_refresh), damit die Seite sofort stimmt.
Nichts wird gelöscht (alte Zusammenfassung bleibt als Version in brain_knowledge_versions).

  python scripts/strategie.py zusammenfassung get
  python scripts/strategie.py zusammenfassung set "<Satz>" --stufe 1 "<Kernsatz 1>" "<Kernsatz 2>" "<Kernsatz 3>" [… bis 5] [--quelle routine|inhaber|agent|chat]
  python scripts/strategie.py meilenstein list
  python scripts/strategie.py meilenstein set <key> [--status geplant|erreicht|verfehlt] [--titel "…"] [--grund "…"] [--ziel JJJJ-MM-TT] [--kennzahl antwort|probe_mail|kunden:N] [--sort N]
  python scripts/strategie.py rueckblick add "<Titel ≤ 60>" [--grund "<1 Satz ≤ 160>"] [--art schritt|meilenstein|quelle|versand|premium|lehre] [--zahl N] [--tag JJJJ-MM-TT]
  python scripts/strategie.py auto       # messbare Meilensteine setzen + Zwischenspeicher neu (auch im Wachhund)

Exit 2 = Eingabe ungültig. Titel ≤ 60, Gründe/Sätze ≤ 160 Zeichen (Inhaber 04.10.2026: „wenig text überall“).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

import brain_knowledge  # noqa: E402

SLUG = "strategie-zusammenfassung"
TITEL_MAX, GRUND_MAX = 60, 160
STATUS = ("geplant", "erreicht", "verfehlt")
ARTEN = ("schritt", "meilenstein", "quelle", "versand", "premium", "lehre")
KEY = re.compile(r"^[a-z0-9][a-z0-9_-]{1,59}$")
KENNZAHL = re.compile(r"^(antwort|probe_mail|kunden:[0-9]{1,5})$")
BERLIN = ZoneInfo("Europe/Berlin")


class InputError(ValueError):
    pass


def _text(v: str | None, n: int, name: str, leer_ok: bool = False) -> str | None:
    s = " ".join(str(v or "").split())
    if not s:
        if leer_ok:
            return None
        raise InputError(f"{name}: fehlt")
    if len(s) > n:
        raise InputError(f"{name}: höchstens {n} Zeichen (ist {len(s)})")
    return s


def _datum(v: str | None) -> str | None:
    if v is None:
        return None
    try:
        return dt.date.fromisoformat(v).isoformat()
    except ValueError as exc:
        raise InputError("Datum: JJJJ-MM-TT") from exc


def zusammenfassung_md(satz: str, saetze: list[str], stufe: int | None) -> str:
    """Format, das die Seite liest (app/lib/strategie.ts zusammenfassung): „Satz: …“, „Stufe: n“, 3–5 Punkte."""
    satz = _text(satz, GRUND_MAX, "Satz")
    xs = [_text(s, GRUND_MAX, "Kernsatz") for s in saetze]
    if not 3 <= len(xs) <= 5:
        raise InputError("Kernsätze: 3–5")
    if stufe is not None and stufe not in (1, 2, 3, 4):
        raise InputError("Stufe: 1–4")
    kopf = [f"Satz: {satz}"] + ([f"Stufe: {stufe}"] if stufe else [])
    return "\n".join(kopf + [f"- {x}" for x in xs])


def refresh(db) -> None:
    try:
        db.rpc("strategie_refresh", {})
    except Exception as exc:  # noqa: BLE001 - Zwischenspeicher darf nie eine Pflege-Änderung kippen
        print(f"Strategie-Zwischenspeicher nicht aufgefrischt: {type(exc).__name__}: {str(exc)[:160]}")


def set_zusammenfassung(db, satz: str, saetze: list[str], stufe: int | None = None, quelle: str = "routine") -> dict:
    md = zusammenfassung_md(satz, saetze, stufe)
    titel = _text(satz, TITEL_MAX, "Titel") if len(" ".join(satz.split())) <= TITEL_MAX else " ".join(satz.split())[:TITEL_MAX - 1].rstrip() + "…"
    res = brain_knowledge.add(db, SLUG, titel, md, quelle, typ="notiz")
    refresh(db)
    return res


def get_zusammenfassung(db) -> dict | None:
    return brain_knowledge.get(db, SLUG)


def set_meilenstein(db, key: str, *, status: str | None = None, titel: str | None = None, grund: str | None = None,
                    ziel: str | None = None, kennzahl: str | None = None, sort: int | None = None, von: str = "gehirn",
                    now: dt.datetime | None = None) -> dict:
    key = str(key or "").strip().lower()
    if not KEY.match(key):
        raise InputError("key: a-z, 0-9, _ und -, 2–60 Zeichen")
    vals: dict = {"updated_by": von, "updated_at": (now or dt.datetime.now(dt.timezone.utc)).isoformat()}
    if status is not None:
        if status not in STATUS:
            raise InputError(f"Status: {', '.join(STATUS)}")
        vals["status"] = status
        if status == "erreicht":
            vals["erreicht_am"] = vals["updated_at"]
    if titel is not None:
        vals["titel"] = _text(titel, TITEL_MAX, "Titel")
    if grund is not None:
        vals["grund"] = _text(grund, GRUND_MAX, "Grund", leer_ok=True)
    if ziel is not None:
        vals["ziel_datum"] = _datum(ziel)
    if kennzahl is not None:
        if kennzahl and not KENNZAHL.match(kennzahl):
            raise InputError("Kennzahl: antwort | probe_mail | kunden:N")
        vals["kennzahl"] = kennzahl or None
    if sort is not None:
        vals["sort"] = int(sort)
    cur = (db.select("strategy_milestones", {"key": f"eq.{key}", "select": "key,status,erreicht_am"}) or [None])[0]
    if cur:
        if cur.get("status") == "erreicht" and vals.get("status") == "erreicht":
            vals.pop("erreicht_am", None)  # erster Zeitpunkt bleibt
        db.update("strategy_milestones", {"key": key}, vals)
        neu = False
    else:
        if "titel" not in vals:
            raise InputError("Titel: für einen neuen Meilenstein nötig")
        db.insert("strategy_milestones", {"key": key, **vals})
        neu = True
    refresh(db)
    return {"key": key, "neu": neu, **{k: v for k, v in vals.items() if k not in ("updated_at", "updated_by")}}


def list_meilensteine(db) -> list[dict]:
    return db.select("strategy_milestones", {"select": "key,titel,ziel_datum,status,erreicht_am,kennzahl,sort", "order": "sort.asc"}) or []


def add_rueckblick(db, titel: str, grund: str | None = None, art: str = "schritt", zahl: float | None = None,
                   tag: str | None = None, von: str = "gehirn", now: dt.datetime | None = None) -> dict:
    if art not in ARTEN:
        raise InputError(f"Art: {', '.join(ARTEN)}")
    row = {"titel": _text(titel, TITEL_MAX, "Titel"), "grund": _text(grund, GRUND_MAX, "Grund", leer_ok=True), "art": art,
           "zahl": zahl, "tag": _datum(tag) or (now or dt.datetime.now(dt.timezone.utc)).astimezone(BERLIN).date().isoformat(),
           "created_by": von}
    db.insert("strategy_rueckblick", row)
    refresh(db)
    return row


def _opt(args: list[str], name: str) -> str | None:
    if name in args:
        i = args.index(name)
        if i + 1 < len(args):
            v = args[i + 1]
            del args[i:i + 2]
            return v
    return None


def main(argv: list[str]) -> int:
    if len(argv) < 2 and argv[:1] != ["auto"]:
        print(__doc__)
        return 1
    from lib.db import DB
    args = list(argv)
    try:
        bereich, cmd = args[0], (args[1] if len(args) > 1 else "")
        rest = args[2:]
        if bereich == "auto":
            db = DB()
            print(f"auto: {json.dumps(db.rpc('strategie_auto', {}))} Meilenstein(e) neu erreicht")
            refresh(db)
            return 0
        if bereich == "zusammenfassung" and cmd == "get":
            row = get_zusammenfassung(DB())
            print(row["markdown"] if row else "keine Zusammenfassung")
            return 0 if row else 2
        if bereich == "zusammenfassung" and cmd == "set" and rest:
            quelle = _opt(rest, "--quelle") or "routine"
            st = _opt(rest, "--stufe")
            res = set_zusammenfassung(DB(), rest[0], rest[1:], int(st) if st else None, quelle)
            print(f"zusammenfassung: {json.dumps(res, ensure_ascii=False)}")
            return 0
        if bereich == "meilenstein" and cmd == "list":
            print(json.dumps(list_meilensteine(DB()), ensure_ascii=False, indent=1))
            return 0
        if bereich == "meilenstein" and cmd == "set" and rest:
            o = {k: _opt(rest, f"--{k}") for k in ("status", "titel", "grund", "ziel", "kennzahl", "sort")}
            res = set_meilenstein(DB(), rest[0], status=o["status"], titel=o["titel"], grund=o["grund"], ziel=o["ziel"],
                                  kennzahl=o["kennzahl"], sort=int(o["sort"]) if o["sort"] else None)
            print(f"meilenstein: {json.dumps(res, ensure_ascii=False)}")
            return 0
        if bereich == "rueckblick" and cmd == "add" and rest:
            o = {k: _opt(rest, f"--{k}") for k in ("grund", "art", "zahl", "tag")}
            res = add_rueckblick(DB(), rest[0], o["grund"], o["art"] or "schritt", float(o["zahl"]) if o["zahl"] else None, o["tag"])
            print(f"rueckblick: {json.dumps(res, ensure_ascii=False)}")
            return 0
    except (InputError, brain_knowledge.InputError, ValueError) as exc:
        print(f"{' '.join(argv[:2])}: {exc}")
        return 2
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
