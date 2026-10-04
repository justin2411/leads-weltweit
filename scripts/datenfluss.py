"""Datenfluss und Lernschleife (JARVIS-Plan Gruppe C3 + C4).

stillstand – Alarm „Datenfluss steht still“: je Station der Kette (neue Leads, neue mail-fähige Käufer, Proben gebaut,
             Mails gesendet, Antworten gelesen) letzter Zuwachs und übliches Intervall aus 7 Tagen
             (signalwerk.datenfluss_stand: 168 h ÷ Stunden mit Zuwachs). Kein Zuwachs seit > 3× Intervall = gelb,
             > 6× Intervall und ≥ 6 h = rot. Vom Inhaber pausierte oder abgeschaltete Stationen melden nie (Lead-Suche,
             Käufersuche, Proben-Vorrat, Versand); ohne Zuwachs in 7 Tagen gibt es keine Basis und keinen Alarm (nie aus
             fehlenden Zahlen warnen). Mit --apply höchstens 1× je 6 h je Station: Vorschlag in decisions (JARVIS-Karte
             „Vorschläge“, Haken = Auftrag zum Prüfen) und ein kurzes Update im Gehirn-Chat. Fließt die Station wieder,
             verschwindet ihr offener Vorschlag (status done, nichts gelöscht).
wirkung    – Lernschleife Auftrag → Wirkung: 72 h nach einem fertigen Auftrag der Art leads/kaeufer/quelle die Kennzahl
             aus kpi_daily vorher (bis 3 Tage vor dem Auftrag) und nachher (bis 3 Tage nach Abschluss) je Tag
             vergleichen; Ergebnis in agent_tasks.wirkung (+ numbers.wirkung) und als Wissensnotiz „auftrag-wirkung“
             (brain_knowledge, angehängt, mit Bilanz je Auftragsart) – so sieht das Gehirn, welche Aufträge wirken.

Sendet nie Mails, ändert keine Sperrliste, Prüfregeln oder Kosten.

  python scripts/datenfluss.py stillstand [--apply]
  python scripts/datenfluss.py wirkung [--apply]
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

BERLIN = ZoneInfo("Europe/Berlin")
HOURS = 168                    # Basis: 7 Tage
FACTOR_GELB, FACTOR_ROT = 3, 6
MIN_LIMIT_H = 2.0              # nie früher als nach 2 h alarmieren (Wachhund-Takt 30 min)
ROT_MIN_H = 6.0
DEDUP = dt.timedelta(hours=6)
PREFIX = "Vorschlag: Datenfluss steht still: "

STATIONS = {  # Schlüssel aus datenfluss_stand -> Name, Schalter
    "leads": "Neue Leads",
    "kaeufer": "Neue Käufer",
    "proben": "Proben gebaut",
    "mails": "Mails gesendet",
    "antworten": "Antworten gelesen",
}

WAIT = dt.timedelta(hours=72)
GIVE_UP = dt.timedelta(days=8)  # danach ohne Vergleichsdaten abschließen
METRICS = {"leads": ["leads_neu"], "kaeufer": ["kaeufer_neu"], "quelle": ["leads_neu", "kaeufer_neu"]}
KIND_NAME = {"leads": "Leads", "kaeufer": "Käufer", "quelle": "Quelle"}
WINDOW_DAYS = 3
EVERY = dt.timedelta(hours=1)
KNOW_SLUG, KNOW_TITLE = "auftrag-wirkung", "Wirkung von Aufträgen (72 h)"


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


def _h(x: float) -> str:
    return f"{x:.0f} h" if x >= 1.5 else f"{x * 60:.0f} min"


def cfg(name: str, key: str) -> str | None:
    try:
        m = re.search(rf"^{key}:\s*(\S+)", (ROOT / "config" / name).read_text(), re.M)
        return m.group(1).strip('"') if m else None
    except OSError:
        return None


def switched_off(settings: dict | None, rows: dict) -> dict[str, str]:
    """Stationen, die gewollt stillstehen (Datei-Schalter oder Pause im Dashboard) -> Grund."""
    s = settings or {}
    paused = s.get("werke_paused") if isinstance(s.get("werke_paused"), dict) else {}
    off: dict[str, str] = {}
    if cfg("pipeline.yaml", "lead_suche") != "true":
        off["leads"] = "Lead-Suche aus (config/pipeline.yaml)"
    elif paused.get("lead-werk"):
        off["leads"] = "Lead-Werk pausiert"
    if cfg("pipeline.yaml", "kunden_suche") != "true":
        off["kaeufer"] = "Käufersuche aus (config/pipeline.yaml)"
    elif paused.get("kunden-werk"):
        off["kaeufer"] = "Kunden-Werk pausiert"
    if paused.get("proben-vorrat"):
        off["proben"] = "Proben-Vorrat pausiert"
    elif (rows.get("proben") or {}).get("extra"):
        off["proben"] = "Vorrat da – kein Bau nötig"
    if cfg("versand.yaml", "aktiv") != "true":
        off["mails"] = "Versand aus (config/versand.yaml)"
    elif s.get("send_paused"):
        off["mails"] = "Versand pausiert"
    if "mails" in off or not (rows.get("mails") or {}).get("active_hours"):
        off["antworten"] = "keine Mails – keine Antworten zu erwarten"
    return off


def judge(rows: list[dict], t: dt.datetime, off: dict[str, str] | None = None) -> list[dict]:
    """Je Station: stufe 'ok' | 'gelb' | 'rot' | 'aus' | 'keine_basis' mit still_h, intervall_h, grenze_h."""
    off = off or {}
    out = []
    for r in rows:
        key = r.get("station")
        if key not in STATIONS:
            continue
        active = int(r.get("active_hours") or 0)
        last = _ts(r.get("last_at"))
        still = (t - last).total_seconds() / 3600 if last else None
        res = {"station": key, "name": STATIONS[key], "still_h": round(still, 1) if still is not None else None,
               "aktive_stunden": active}
        if key in off:
            out.append({**res, "stufe": "aus", "grund": off[key]})
            continue
        if active <= 0 or still is None:
            out.append({**res, "stufe": "keine_basis", "grund": "kein Zuwachs in 7 Tagen – keine Basis"})
            continue
        interval = HOURS / active
        limit = max(FACTOR_GELB * interval, MIN_LIMIT_H)
        res.update(intervall_h=round(interval, 1), grenze_h=round(limit, 1))
        if still <= limit:
            res["stufe"] = "ok"
        elif still >= max(FACTOR_ROT * interval, 2 * MIN_LIMIT_H) and still >= ROT_MIN_H:
            res["stufe"] = "rot"
        else:
            res["stufe"] = "gelb"
        out.append(res)
    return out


def texts(a: dict) -> dict:
    """Kurztexte (Titel ≤ 60, Grund ≤ 160 Zeichen) und Gehirn-Update (≤ 3 Zeilen, ≤ 400 Zeichen)."""
    still, every = _h(a["still_h"]), _h(a["intervall_h"])
    titel = f"{'Rot' if a['stufe'] == 'rot' else 'Gelb'}: {a['name']} steht seit {still} still"[:60]
    grund = f"Kein Zuwachs seit {still}, üblich etwa alle {every}. Ursache prüfen: Läufe, Quelle, Schalter."[:160]
    update = (f"Aufgefallen: {a['name']} seit {still} ohne Zuwachs (üblich alle {every}).\n"
              f"Nächster Schritt: Ursache prüfen (Läufe, Quellen, Schalter) und beheben.")
    return {"titel": titel, "grund": grund, "update": update}


def stillstand(db, t: dt.datetime | None = None, apply: bool = False, settings: dict | None = None,
               chat=None) -> list[dict]:
    """Stand je Station; mit apply: Vorschlag + Gehirn-Update (1× je 6 h je Station), erledigte Vorschläge schließen."""
    t = t or now()
    rows = db.rpc("datenfluss_stand", {}) or []
    if settings is None:
        try:
            from lib.owner_settings import load
            settings = load(db)
        except Exception:  # noqa: BLE001 - ohne Einstellungen gelten nur die Datei-Schalter
            settings = {}
    res = judge(rows, t, switched_off(settings, {r.get("station"): r for r in rows}))
    if not apply:
        return res
    from lib.kurz import insert_decisions
    for a in res:
        subj = PREFIX + a["name"]
        mine = db.select("decisions", {"subject": f"eq.{subj}", "select": "id,status,created_at",
                                       "order": "created_at.desc", "limit": "20"}) or []
        open_ids = [m["id"] for m in mine if m.get("status") == "proposed"]
        if a["stufe"] not in ("gelb", "rot"):
            for i in open_ids:  # Station fließt wieder (oder ist gewollt aus): Hinweis von selbst erledigt
                db.update("decisions", {"id": i, "status": "proposed"}, {"status": "done"})
            a["aktion"] = "geschlossen" if open_ids else None
            continue
        if any((_ts(m.get("created_at")) or t) > t - DEDUP for m in mine):
            a["aktion"] = "schon gemeldet (6 h)"
            continue
        for i in open_ids:  # ältere Meldung derselben Station ersetzen, nie doppelt zeigen
            db.update("decisions", {"id": i, "status": "proposed"}, {"status": "done"})
        tx = texts(a)
        insert_decisions(db, {"type": "safety", "subject": subj, "status": "proposed",
                              "reasoning": tx["grund"], "kurz_titel": tx["titel"], "kurz_grund": tx["grund"],
                              "metrics": {"station": a["station"], "stufe": a["stufe"], "still_h": a["still_h"],
                                          "intervall_h": a["intervall_h"], "grenze_h": a["grenze_h"]}})
        a["aktion"] = "gemeldet"
        try:
            if chat is None:
                import jarvis_chat
                jarvis_chat.gehirn_update(db, tx["update"], [{"label": "JARVIS", "url": "/dashboard/jarvis"}])
            else:
                chat(tx["update"])
        except Exception as exc:  # noqa: BLE001 - der Chat darf den Alarm nie verhindern
            a["chat"] = f"{type(exc).__name__}: {str(exc)[:120]}"
    return res


# ------------------------------------------------------------------------------------------------- Lernschleife
def _day(x: dt.datetime) -> dt.date:
    return x.astimezone(BERLIN).date()


def _countries(market) -> list[str]:
    return [c.strip().upper() for c in str(market or "").split(",") if re.fullmatch(r"\s*[A-Za-z]{2}\s*", c)]


def measure(task: dict, kpi: list[dict]) -> dict:
    """Vorher/Nachher je Kennzahl aus kpi_daily-Zeilen (Tageswerte je Land werden je Tag summiert).
    Rückgabe: {'kennzahlen': {metric: {vorher, nachher, tage_vorher, tage_nachher, delta_pct}}, 'bewertung': …}."""
    start = _ts(task.get("started_at")) or _ts(task.get("created_at"))
    end = _ts(task.get("finished_at"))
    d0, d1 = _day(start), _day(end)
    before = {d0 - dt.timedelta(days=i) for i in range(1, WINDOW_DAYS + 1)}
    after = {d1 + dt.timedelta(days=i) for i in range(1, WINDOW_DAYS + 1)}
    countries = set(_countries(task.get("market")))
    out: dict = {"kennzahlen": {}, "laender": sorted(countries) or "alle"}
    verdicts = []
    for metric in METRICS.get(task.get("kind"), []):
        per_day: dict[dt.date, float] = {}
        for r in kpi:
            if r.get("metric") != metric or r.get("value") is None or r.get("country") == "ALL":
                continue
            if countries and r.get("country") not in countries:
                continue
            day = dt.date.fromisoformat(str(r["day"])[:10])
            per_day[day] = per_day.get(day, 0.0) + float(r["value"])
        b = [v for d, v in per_day.items() if d in before]
        a = [v for d, v in per_day.items() if d in after]
        m = {"tage_vorher": len(b), "tage_nachher": len(a),
             "vorher": round(sum(b) / len(b), 1) if b else None, "nachher": round(sum(a) / len(a), 1) if a else None}
        if b and a:
            m["delta_pct"] = round((m["nachher"] - m["vorher"]) / m["vorher"] * 100, 1) if m["vorher"] else None
            if m["vorher"] == 0:
                verdicts.append("wirkt" if m["nachher"] > 0 else "neutral")
            else:
                verdicts.append("wirkt" if m["delta_pct"] >= 10 else "sinkt" if m["delta_pct"] <= -10 else "neutral")
        out["kennzahlen"][metric] = m
    out["bewertung"] = ("keine Vergleichsdaten" if not verdicts else "wirkt" if "wirkt" in verdicts
                        else "sinkt" if all(v == "sinkt" for v in verdicts) else "neutral")
    return out


def ready(m: dict, t: dt.datetime, finished: dt.datetime) -> bool:
    """Genug Daten (je Kennzahl ≥ 1 Tag vorher und ≥ 2 Tage nachher) oder zu lange gewartet."""
    if t - finished >= GIVE_UP:
        return True
    ks = m["kennzahlen"].values()
    return bool(ks) and all(k["tage_vorher"] >= 1 and k["tage_nachher"] >= 2 for k in ks)


def line(task: dict, m: dict) -> str:
    parts = []
    for metric, k in m["kennzahlen"].items():
        if k["vorher"] is None or k["nachher"] is None:
            parts.append(f"{metric}: keine Vergleichsdaten")
            continue
        d = f" ({k['delta_pct']:+.0f} %)" if k.get("delta_pct") is not None else ""
        parts.append(f"{metric}/Tag {k['vorher']:g} → {k['nachher']:g}{d}")
    land = ",".join(m["laender"]) if isinstance(m["laender"], list) else "alle Länder"
    brief = re.sub(r"\s+", " ", str(task.get("brief") or ""))[:80]
    return f"- **{KIND_NAME.get(task.get('kind'), task.get('kind'))}** A{task.get('agent')} ({land}): " \
           f"{m['bewertung']} · {' · '.join(parts)} · „{brief}“"


def bilanz(rows: list[dict]) -> str:
    """Bilanz je Auftragsart über alle bewerteten Aufträge: wirkt / gesamt mit Vergleichsdaten."""
    acc: dict[str, list[int]] = {}
    for r in rows:
        w = (r.get("wirkung") or {}).get("bewertung")
        if not w or w == "keine Vergleichsdaten":
            continue
        a = acc.setdefault(r.get("kind"), [0, 0])
        a[0] += w == "wirkt"
        a[1] += 1
    if not acc:
        return "Bilanz: noch keine Aufträge mit Vergleichsdaten."
    return "Bilanz: " + " · ".join(f"{KIND_NAME.get(k, k)} {w}/{n} wirkt" for k, (w, n) in sorted(acc.items()))


def wirkung(db, t: dt.datetime | None = None, apply: bool = False) -> list[dict]:
    """Fertige Aufträge (leads/kaeufer/quelle) ≥ 72 h nach Abschluss bewerten; mit apply speichern + Wissensnotiz."""
    t = t or now()
    last = db.select("agent_tasks", {"wirkung_at": f"gte.{(t - EVERY).isoformat()}", "select": "id", "limit": "1"})
    if apply and last:  # höchstens 1×/h schreiben (Wachhund läuft 4×/h)
        return []
    tasks = db.select("agent_tasks", {"status": "eq.fertig", "kind": f"in.({','.join(METRICS)})",
                                      "wirkung_at": "is.null", "finished_at": f"lte.{(t - WAIT).isoformat()}",
                                      "select": "id,agent,kind,market,brief,numbers,created_at,started_at,finished_at",
                                      "order": "finished_at.asc", "limit": "50"}) or []
    done = []
    for task in tasks:
        end = _ts(task.get("finished_at"))
        start = _ts(task.get("started_at")) or _ts(task.get("created_at"))
        if not end or not start:
            continue
        lo = _day(start) - dt.timedelta(days=WINDOW_DAYS)
        hi = _day(end) + dt.timedelta(days=WINDOW_DAYS)
        kpi = db.select("kpi_daily", {"metric": f"in.({','.join(METRICS[task['kind']])})",
                                      "day": f"gte.{lo.isoformat()}", "select": "day,country,metric,value",
                                      "order": "day.asc", "limit": "5000"}) or []
        kpi = [r for r in kpi if str(r.get("day"))[:10] <= hi.isoformat()]
        m = measure(task, kpi)
        if not ready(m, t, end):
            continue
        m["gemessen_am"] = t.isoformat()
        done.append({"task": task, "wirkung": m, "zeile": line(task, m)})
        if apply:
            nums = task.get("numbers") if isinstance(task.get("numbers"), dict) else {}
            db.update("agent_tasks", {"id": task["id"]},
                      {"wirkung": m, "wirkung_at": t.isoformat(), "numbers": {**nums, "wirkung": m["bewertung"]}})
    if apply and done:
        import brain_knowledge
        rated = db.select("agent_tasks", {"wirkung_at": "not.is.null", "select": "kind,wirkung", "limit": "2000"}) or []
        md = "\n".join([d["zeile"] for d in done] + ["", bilanz(rated),
                        "", "_Vorher = Ø je Tag bis 3 Tage vor dem Auftrag, nachher = Ø bis 3 Tage nach Abschluss "
                        "(kpi_daily). Wirkt = ≥ +10 %._"])
        brain_knowledge.add(db, KNOW_SLUG, KNOW_TITLE, md, quelle="routine", anhaengen=True, now=t)
    return [{"id": d["task"]["id"], "art": d["task"].get("kind"), "bewertung": d["wirkung"]["bewertung"],
             "zeile": d["zeile"]} for d in done]


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("stillstand", "wirkung"):
        print(__doc__)
        return 1
    from lib.db import DB
    db = DB()
    apply = "--apply" in argv
    if argv[0] == "stillstand":
        res = stillstand(db, apply=apply)
        for a in res:
            extra = f"still {a['still_h']} h, Grenze {a.get('grenze_h')} h" if a.get("grenze_h") else a.get("grund", "")
            print(f"{a['stufe']:<11} {a['name']:<18} {extra}" + (f" · {a['aktion']}" if a.get("aktion") else ""))
    else:
        print(json.dumps(wirkung(db, apply=apply), ensure_ascii=False, indent=1, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
