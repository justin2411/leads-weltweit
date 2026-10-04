"""Wissen des Gehirns als Markdown (Inhaber 04.10.2026: „alles was er dort lernt soll in mds gepackt werden und wenn ich
mit jarvis chatte und ich das gehirn auswähle soll er das alles wissen“).

Das Repo ist öffentlich – Erkenntnisse mit Zahlen und Strategie gehören NICHT ins Repo, sondern in die Tabelle
signalwerk.brain_knowledge (Markdown je Notiz, eindeutiger slug; jede Änderung legt die alte Fassung in
brain_knowledge_versions ab, nichts wird gelöscht). Angezeigt auf /dashboard/gehirn#wissen (gerendert, „.md
herunterladen“); der Gehirn-Modus im JARVIS-Chat lädt alle Notizen (neueste zuerst, gekürzt) in seinen Kontext.

  python scripts/brain_knowledge.py add <slug> "<Titel>" datei.md [--quelle routine|chat|agent|inhaber] [--routine <id>] [--anhaengen] [--typ notiz|gelernt|fehlermuster]
                                       # anlegen oder ersetzen (alte Fassung bleibt als Version); --anhaengen hängt mit
                                       # Datums-Überschrift an; Datei „-“ = Standardeingabe
  python scripts/brain_knowledge.py list                  # alle Notizen (slug, Titel, Quelle, Stand, Zeichen)
  python scripts/brain_knowledge.py get <slug>            # Markdown einer Notiz

Exit 2 = Eingabe ungültig (slug a-z/0-9/-, 2–80; Titel 2–120; Text 1–60.000 Zeichen).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,79}$")
QUELLEN = ("routine", "chat", "agent", "inhaber")
TYPEN = ("notiz", "gelernt", "fehlermuster")       # gelernt/fehlermuster schreibt das Meta-Review (brain_meta.py)
MAX_MD = 60000
BERLIN = ZoneInfo("Europe/Berlin")


class InputError(ValueError):
    pass


def slugify(text: str) -> str:
    """„Ziele & Grenzen“ → „ziele-grenzen“ (gleich app/lib/jarvis-llm.ts slugify)."""
    s = str(text or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:80].rstrip("-")
    return s if len(s) >= 2 else f"notiz-{s or 'x'}"


def check(slug: str, titel: str, markdown: str, quelle: str) -> tuple[str, str, str, str]:
    slug = str(slug or "").strip().lower()
    if not SLUG.match(slug):
        raise InputError("slug: a-z, 0-9, Bindestrich, 2–80 Zeichen")
    titel = " ".join(str(titel or "").split())
    if not 2 <= len(titel) <= 120:
        raise InputError("Titel: 2–120 Zeichen")
    md = str(markdown or "").replace("\r\n", "\n").strip()
    if not 1 <= len(md) <= MAX_MD:
        raise InputError(f"Text: 1–{MAX_MD} Zeichen (ist {len(md)})")
    if quelle not in QUELLEN:
        raise InputError(f"Quelle: {', '.join(QUELLEN)}")
    return slug, titel, md, quelle


def add(db, slug: str, titel: str, markdown: str, quelle: str = "agent", routine_id: str | None = None,
        anhaengen: bool = False, now: dt.datetime | None = None, typ: str | None = None) -> dict:
    """Notiz anlegen oder ersetzen; mit anhaengen: unter „## <Datum>“ an die bestehende Notiz anhängen (neueste oben)."""
    slug, titel, md, quelle = check(slug, titel, markdown, quelle)
    cur = (db.select("brain_knowledge", {"slug": f"eq.{slug}", "select": "id,markdown"}) or [None])[0]
    if cur and anhaengen:
        stamp = (now or dt.datetime.now(dt.timezone.utc)).astimezone(BERLIN).strftime("%d.%m.%Y %H:%M")
        md = f"## {stamp}\n\n{md}\n\n{cur.get('markdown') or ''}".strip()
        if len(md) > MAX_MD:  # älteste Teile fallen hinten weg – die volle alte Fassung bleibt als Version
            md = md[:MAX_MD - 20].rstrip() + "\n\n… (gekürzt)"
    vals = {"titel": titel, "markdown": md, "quelle": quelle}
    if routine_id:
        vals["routine_id"] = routine_id
    if typ:
        if typ not in TYPEN:
            raise InputError(f"Typ: {', '.join(TYPEN)}")
        vals["typ"] = typ
    if cur:
        db.update("brain_knowledge", {"id": cur["id"]}, vals)
        return {"slug": slug, "neu": False, "zeichen": len(md)}
    db.insert("brain_knowledge", {"slug": slug, **vals})
    return {"slug": slug, "neu": True, "zeichen": len(md)}


def liste(db) -> list[dict]:
    rows = db.select("brain_knowledge", {"select": "slug,titel,quelle,updated_at,markdown", "order": "updated_at.desc"}) or []
    return [{"slug": r["slug"], "titel": r["titel"], "quelle": r.get("quelle"), "stand": r.get("updated_at"),
             "zeichen": len(r.get("markdown") or "")} for r in rows]


def get(db, slug: str) -> dict | None:
    return (db.select("brain_knowledge", {"slug": f"eq.{slug}", "select": "slug,titel,quelle,updated_at,markdown"}) or [None])[0]


def _read(path: str) -> str:
    return sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")


def _opt(args: list[str], name: str) -> str | None:
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    cmd, args = argv[0], argv[1:]
    try:
        if cmd == "add" and len(args) >= 3:
            res = add(DB(), args[0], args[1], _read(args[2]), _opt(args, "--quelle") or "agent", _opt(args, "--routine"),
                      "--anhaengen" in args, typ=_opt(args, "--typ"))
            print(f"add: {json.dumps(res, ensure_ascii=False)}")
            return 0
        if cmd == "list":
            print(json.dumps(liste(DB()), ensure_ascii=False, indent=1))
            return 0
        if cmd == "get" and len(args) == 1:
            row = get(DB(), args[0])
            if not row:
                print(f"get: {args[0]} unbekannt")
                return 2
            print(f"# {row['titel']}\n\n{row['markdown']}")
            return 0
    except InputError as exc:
        print(f"{cmd}: {exc}")
        return 2
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
