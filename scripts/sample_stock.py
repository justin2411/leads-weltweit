#!/usr/bin/env python3
"""Proben-Vorrat: fertige, geprüfte Proben für den Sofortversand nach dem Klick (Inhaber 03.10.2026).

„es soll direkt nach dem button klick die probe rausgehen auch immer mit den aktuell besten leads“ und
„es sollen proben in der hinterhand sein ca. 50 proben immer die bereits fertig und geprüft sind und wirklich durch
alle sicherheitsmechanismen und qualitätsprüfer gegangen sind“.

Ablauf (stündlich über .github/workflows/proben-vorrat.yml, zusätzlich vom Wachhund nachgestartet):
  1. Verfall: Proben älter als max_alter_stunden (config/proben.yaml) verwerfen, ihre Leads freigeben
     (expire_sample_stock); Dateien verworfener Proben aus dem Storage löschen.
  2. Je öffentlich live geschalteter Landingpage bis zum Ziel auffüllen (Fokus-Seiten aus config/fokus.yaml mehr).
     Jede Probe entsteht über responder.regional_sample – dieselbe Auswahl und dieselben Prüfungen wie jede andere
     Probe: nur vollständige Firmen (Telefon, E-Mail, Adresse, Ansprechperson, Website außer S2), keine Firma mit
     widersprüchlichen Daten (Qualitätsprüfung blocking), „ohne Website“ frisch nachgeprüft, nur Leads mit Status new
     (exklusiv, nie zuvor ausgegeben), genau 10 verschiedene Firmen (leadreport.SAMPLE_SIZE, complete_only).
  3. Die fertige Mail (Betreff, Text, HTML, PDF + CSV + Erklär-PDF) – exakt wie web_samples.py sie sendet – liegt
     als JSON im privaten Storage-Bucket „sample-stock“; die 10 Leads werden atomar reserviert (add_sample_stock).

Die App (app/app/api/sample-request/route.ts) nimmt nach dem Klick per claim_sample_stock eine passende Probe,
setzt die Empfänger-Domain in die Fußzeile ein und sendet über Resend. Der Inhaber-Testmodus verbraucht nie Vorrat.

  python scripts/sample_stock.py status              # Bestand je Zielgruppe/Land
  python scripts/sample_stock.py run                 # Probelauf: zeigt, was gebaut würde
  python scripts/sample_stock.py run --apply         # verwerfen + auffüllen
  python scripts/sample_stock.py test-send --apply   # Inhaber-Test: eine fertige Probe an OWNER_EMAIL (ohne Verbrauch)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
BUCKET = "sample-stock"
# Platzhalter für die Domain des Empfängers in der Pflichtfußzeile („… we will not contact {company} again“);
# die App bzw. send_stock() ersetzt ihn beim Versand.
PLACEHOLDER = "__EMPFAENGER_DOMAIN__"
URG_POINTS = {"high": 3, "medium": 2, "low": 1}
WISH_FILE = ROOT / "app" / "content" / "sample-wishes.ts"
# Kein Verfall nach Alter für Webagenturen (Inhaber 03.10.2026: „proben sollen nicht entfallen wenn sie zu alt sind …
# bei webagencys ist das kein thema“). Sicherheit: die Freigabe aller 10 Leads wird alle RECHECK_HOURS erneuert,
# claim_sample_stock gibt nur Proben mit Freigabe < 26 h heraus.
NO_EXPIRY = ("S2",)
NO_EXPIRY_DAYS = 3650
RECHECK_HOURS = 20


# ---------------------------------------------------------------------------- Einstellungen
def settings(path: Path = ROOT / "config" / "proben.yaml") -> dict:
    out = {"fokus_je_seite": 5, "andere_je_seite": 3, "max_alter_stunden": 48, "laufzeit_minuten": 40}
    try:
        for k, v in re.findall(r"^([a-z_]+):\s*(\d+)\s*$", path.read_text(encoding="utf-8"), re.M):
            out[k] = int(v)
    except OSError:
        pass
    return out


def targets(pages: list[dict], cfg: dict, focus: list[tuple[str, str]],
            overrides: dict | None = None) -> dict[tuple[str, str], int]:
    """Soll-Bestand je (Segment, Land) der Live-Seiten; Fokus-Tests zuerst. `overrides` = Soll aus dem Dashboard
    ({"S2/US": 20}, Inhaber 03.10.2026), sonst config/proben.yaml."""
    from lib.owner_settings import sample_target
    out: dict[tuple[str, str], int] = {}
    from lib.laender import pair_producing
    for p in sorted(pages, key=lambda p: ((p["segment_id"], p["country"]) not in focus, p["segment_id"], p["country"])):
        key = (p["segment_id"], p["country"])
        if not pair_producing(*key, pairs=focus):  # ruhende Märkte nicht befüllen (Inhaber 05.10.2026), Vorrat bleibt
            continue
        default = cfg["fokus_je_seite"] if key in focus else cfg["andere_je_seite"]
        out[key] = sample_target(default, overrides or {}, *key)
    return out


def premium_targets(pages: list[dict], cfg: dict, overrides: dict | None = None) -> dict[tuple[str, str], int]:
    """Premium-Soll je (Segment, Land) der Live-Seiten: so viele fertige Proben mit 10/10 Premium-Leads (Inhaber
    05.10.2026). `overrides` = Regler ({"S2/US": 10}), sonst config/proben.yaml premium_<land> bzw. premium_andere."""
    from lib.owner_settings import premium_target
    out: dict[tuple[str, str], int] = {}
    for p in pages:
        key = (p["segment_id"], p["country"])
        default = cfg.get(f"premium_{p['country'].lower()}", cfg.get("premium_andere", 0))
        out[key] = premium_target(default, overrides or {}, *key)
    return out


def is_premium_sample(row: dict) -> bool:
    """Premium-Probe = alle 10 Leads heute Premium (premium_n, beim Bauen und bei jedem Lauf neu gezählt)."""
    return int(row.get("premium_n") or 0) >= 10


def wish_keys(slug: str, text: str | None = None) -> list[str]:
    """Wunsch-Schlüssel des Formulars für diese Seite (gleiche Quelle wie das Formular: sample-wishes.ts)."""
    if text is None:
        try:
            text = WISH_FILE.read_text(encoding="utf-8")
        except OSError:
            return []
    seg = slug.split("/")[-1]
    m = re.search(rf'^\s*"?{re.escape(seg)}"?:\s*\[(.*?)^\s*\],', text, re.M | re.S)
    return re.findall(r'key:\s*"([a-z_0-9]+)"', m.group(1)) if m else []


def plan(have: int, target: int, keys: list[str]) -> list[list[str]]:
    """Welche Proben fehlen: die erste ohne Wunsch (beste Leads allgemein), danach je ein Wunsch-Schlüssel im
    Wechsel, damit auch Anfragen mit Wunsch („ohne Website“, „kaputte Website“ …) sofort passend bedient werden."""
    cycle = [[]] + [[k] for k in keys]
    return [cycle[i % len(cycle)] for i in range(have, target)]


# ---------------------------------------------------------------------------- Storage (privater Bucket)
def _storage(db) -> tuple[str, dict]:
    base = db.base[: -len("/rest/v1")] + "/storage/v1"
    h = {k: v for k, v in db.s.headers.items() if k in ("apikey", "Authorization")}
    return base, h


def upload(db, path: str, data: bytes) -> None:
    base, h = _storage(db)
    r = requests.post(f"{base}/object/{BUCKET}/{path}", data=data, timeout=60,
                      headers={**h, "Content-Type": "application/json", "x-upsert": "true"})
    if r.status_code >= 400:
        raise RuntimeError(f"Storage-Upload {r.status_code}: {r.text[:200]}")


def download(db, path: str) -> bytes:
    base, h = _storage(db)
    r = requests.get(f"{base}/object/{BUCKET}/{path}", headers=h, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"Storage-Download {r.status_code}: {r.text[:200]}")
    return r.content


def remove(db, paths: list[str]) -> None:
    if not paths:
        return
    base, h = _storage(db)
    r = requests.delete(f"{base}/object/{BUCKET}", json={"prefixes": paths}, headers=h, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"Storage-Löschen {r.status_code}: {r.text[:200]}")


# ---------------------------------------------------------------------------- Bauen
def score(leads: list[dict], today: dt.date | None = None) -> float:
    """Dringlichkeit (hoch 3, mittel 2, niedrig 1) je Lead, abzüglich Alter der Ereignisse (frischer = besser)."""
    today = today or dt.date.today()
    ages = []
    for l in leads:
        try:
            ages.append((today - dt.date.fromisoformat(str(l.get("event_date"))[:10])).days)
        except ValueError:
            ages.append(60)
    pts = sum(URG_POINTS.get(l.get("urgency") or "", 0) for l in leads)
    return round(pts * 10 - (sum(ages) / len(ages) if ages else 0) * 0.1, 2)


def wish_match(db, seg: str, leads: list[dict]) -> dict[str, int]:
    """Je Wunsch-Schlüssel: wie viele der 10 Leads passen (für die Auswahl nach dem Klick)."""
    from lib.wishes import KEYS, matches
    sic_of = None
    if seg == "S4":  # „Fuhrpark oder Lager“ braucht den SIC-Code
        from responder import _sic_lookup
        sic_of = _sic_lookup(db, leads)
    out = {}
    for k in sorted(KEYS):
        n = sum(matches(k, l, sic_of(l) if sic_of and k == "fleet_warehouse" else None) for l in leads)
        if n:
            out[k] = n
    return out


def probe_ab(abx, seg: str, country: str, unit: str) -> dict:
    """A/B „Probe-Mail“ (scripts/lib/ab.py): Variante je fertiger Probe (der Empfänger ist beim Bauen noch unbekannt).
    Gezählt wird beim Versand (App, sample_stock → ab_events), Ziel = Klick zur Tarifseite (?ab=…)."""
    out: dict = {"marks": {}}
    for el in ("tipp", "schluss"):
        v, mark = abx.value("probe_mail", el, seg, country, unit)
        if isinstance(v, str) and v:
            out[el] = v
        out["marks"].update(mark)
    return out


def build_payload(seg: str, country: str, files: list[tuple[str, bytes]], abx=None,
                  feedback_token: str | None = None) -> dict | None:
    """Fertige Probe-Mail ohne Empfänger – gleiche Funktionen und Inhalte wie web_samples.py.
    feedback_token: freiwilliger Bewertungs-Link (Feedback-Werk, lib/feedback.py) vor dem Gruß."""
    import uuid
    from responder import reply_content, sample_mail, sample_subject
    lang = "fr" if country == "FR" else "en"
    ab = probe_ab(abx, seg, country, uuid.uuid4().hex) if abx is not None else None
    body, blocks = sample_mail(lang, None, files, True, seg, country, ab=ab)
    if not body:
        return None
    from lib import feedback
    body, blocks = feedback.add_to_mail(body, lang, feedback_token, blocks)
    content = reply_content(PLACEHOLDER, sample_subject(lang, None, country), body, None, lang, files, blocks,
                            requested=True)
    return {"version": 1, "placeholder": PLACEHOLDER, "lang": lang, **content,
            **({"ab": ab["marks"]} if ab and ab["marks"] else {})}


def build_one(db, seg: str, country: str, wish: list[str], exclude: set[str], hours: int, apply: bool,
              log=print, premium_only: bool | None = None) -> dict | None:
    """Eine Probe bauen, hochladen und ihre 10 Leads reservieren. None, wenn keine 10 vollständigen Leads.
    premium_only: Premium-Probe – nur Leads, die heute Premium sind; gibt es keine 10, keine Probe (nichts aufgefüllt)."""
    from lib.leadreport import SAMPLE_SIZE
    from responder import regional_sample
    if premium_only is None:  # Nur Premium (Inhaber 05.10.2026, config/pipeline.yaml): jede Probe 10/10 Premium
        from lib.premium import only_premium
        premium_only = only_premium(db)
    picked: list[dict] = []
    files, _ = regional_sample(db, seg, country, None, wish=wish or None, mark=False, picked_out=picked,
                               exclude_companies=exclude, gate_context="vorrat",
                               premium_only=premium_only)
    if files and not any(n.endswith(".pdf") for n, _ in files):
        # ohne Lead-Report (PDF) keine fertige Probe – die Mail verspricht ihn (Leads bleiben frei)
        raise RuntimeError("PDF-Report nicht erstellt")
    ids = [l["id"] for l in picked]
    cos = [l["company_id"] for l in picked]
    if not files or len(set(ids)) != SAMPLE_SIZE or len(set(cos)) != SAMPLE_SIZE:
        return None
    from lib import premium
    if premium_only and premium.count(picked) != SAMPLE_SIZE:
        return None  # Sicherheitsnetz: eine Premium-Probe hat genau 10 Premium-Leads (nichts reserviert)
    from lib import ab as ablib
    from lib import feedback
    fb = feedback.create_link(db, "probe", ids, country, seg) if apply else None
    payload = build_payload(seg, country, files, ablib.Ctx(db), feedback_token=fb)
    if not payload:
        return None
    dates = sorted(str(l.get("event_date") or "")[:10] for l in picked if l.get("event_date"))
    prem = premium.count(picked)  # Inhaber 05.10.2026: nur Premium – Standard füllt nur auf (Übergang)
    row = {"premium_n": prem, "segment_id": seg, "country": country, "lang": payload["lang"], "wish": wish,
           "wish_match": wish_match(db, seg, picked), "signal_types": sorted({l.get("signal_type") or "" for l in picked} - {""}),
           "lead_ids": ids, "company_ids": cos, "score": score(picked),
           "newest_event": dates[-1] if dates else None, "oldest_event": dates[0] if dates else None,
           "subject": payload["subject"],
           "expires_at": (dt.datetime.now(dt.timezone.utc)
                          + (dt.timedelta(days=NO_EXPIRY_DAYS) if seg in NO_EXPIRY else dt.timedelta(hours=hours))).isoformat()}
    if not apply:
        log(f"  würde bauen: {seg}/{country} Wunsch {','.join(wish) or '-'} Score {row['score']} Premium {prem}/10")
        exclude.update(cos)
        return row
    path = f"{seg}/{country}/{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:8]}.json"
    upload(db, path, json.dumps(payload).encode())
    try:
        row["id"] = db.rpc("add_sample_stock", {"p": {**row, "storage_path": path}})
    except Exception:
        remove(db, [path])  # Leads inzwischen anderweitig vergeben: Datei wieder weg, nichts reserviert
        raise
    # alle 10 Leads haben eben die Drei-Stufen-Freigabe bestanden (regional_sample): Zeitpunkt an der Probe merken
    db.rpc("mark_sample_stock_checked", {"p_stock": row["id"]})
    exclude.update(cos)
    log(f"  gebaut{' Premium' if premium_only else ''}: {seg}/{country} Wunsch {','.join(wish) or '-'} Score {row['score']} Premium {prem}/10 ({path})")
    return row


def stock_rows(db, statuses: str = "ready") -> list[dict]:
    return db.select_all("sample_stock", {"status": f"in.({statuses})", "order": "built_at.desc",
                                          "select": "id,segment_id,country,status,wish,wish_match,company_ids,score,"
                                                    "built_at,expires_at,storage_path,files_removed_at,sent_at,"
                                                    "lead_ids,gate_checked_at,premium_n"})


def verify_stock(db, apply: bool, log=print, max_hours: int = RECHECK_HOURS, fetcher=None) -> dict:
    """Fertige Proben erneut durch die Drei-Stufen-Freigabe (alle max_hours, live nachgeprüft). Besteht ein Lead
    nicht, wird die Probe verworfen (Leads frei, durchgefallene auf 'held') und im selben Lauf neu gebaut."""
    from lib import release_gate as G
    now = dt.datetime.now(dt.timezone.utc)
    res = {"geprueft": 0, "bestanden": 0, "verworfen": 0, "verdicts": []}
    for r in stock_rows(db, "ready"):
        at = r.get("gate_checked_at")
        if at and now - dt.datetime.fromisoformat(str(at).replace("Z", "+00:00")) < dt.timedelta(hours=max_hours):
            continue
        vs = G.check(db, r["lead_ids"] or [], country=r["country"], allowed_status=("reserved",), own_stock=r["id"],
                     fetcher=fetcher)
        res["geprueft"] += 1
        res["verdicts"] += vs
        bad = [v for v in vs if not v.ok]
        if len(vs) != 10:
            bad = bad or [G.Verdict("", False, 3, ["s3:probe_nicht_10_leads"])]
        if not apply:
            log(f"  Probe {r['id']} {r['segment_id']}/{r['country']}: {'besteht' if not bad else 'fällt durch'}"
                + (f" ({'; '.join(', '.join(v.reasons[:2]) for v in bad[:3])})" if bad else ""))
            continue
        if bad:
            note = "Freigabe nicht bestanden: " + "; ".join(sorted({x for v in bad for x in v.reasons[:2]}))[:250]
            if db.rpc("discard_sample_stock", {"p_stock": r["id"], "p_note": note}):
                for v in vs:  # Leads sind jetzt wieder frei: durchgefallene auf 'held'
                    v.status = "new" if v.status == "reserved" else v.status
                G.persist(db, vs, "vorrat", log=log)
                res["verworfen"] += 1
                log(f"  Probe {r['segment_id']}/{r['country']} verworfen: {note}")
        else:
            G.persist(db, vs, "vorrat", log=log)
            db.rpc("mark_sample_stock_checked", {"p_stock": r["id"]})
            res["bestanden"] += 1
    if apply and res["verdicts"]:
        from lib.run_stats import record
        record(db, "freigabe", [{**x, "extra": {**x["extra"], "kontext": "vorrat-nachpruefung"}}
                                for x in G.stats_rows(res["verdicts"])], None, log)
    return res


def refresh_premium_n(db, apply: bool, log=print, today: dt.date | None = None) -> dict:
    """premium_n aller fertigen Proben neu zählen (Stufe heute, lib/premium.tier_now): trägt fehlende Werte nach
    (Proben von vor der Premium-Bewertung) und stuft Proben herab, deren Ereignisse älter als 14 Tage wurden.
    Ändert nur die Zahl – keine Probe wird verworfen, kein Lead freigegeben."""
    from lib import premium
    rows = stock_rows(db, "ready")
    ids = sorted({i for r in rows for i in (r.get("lead_ids") or [])})
    leads: dict[str, dict] = {}
    for i in range(0, len(ids), 150):
        part = ids[i:i + 150]
        for l in db.select("leads", {"id": f"in.({','.join(part)})", "select": "id,premium,event_date"}) or []:
            leads[l["id"]] = l
    res = {"nachgetragen": 0, "geaendert": 0}
    for r in rows:
        got = [leads[i] for i in (r.get("lead_ids") or []) if i in leads]
        if len(got) != len(r.get("lead_ids") or []):
            continue  # Leads nicht lesbar: alten Wert lassen
        n = premium.count(got, today)
        old = r.get("premium_n")
        if old is not None and int(old) == n:
            continue
        res["nachgetragen" if old is None else "geaendert"] += 1
        r["premium_n"] = n
        if apply:
            db.update("sample_stock", {"id": r["id"]}, {"premium_n": n})
    if res["nachgetragen"] or res["geaendert"]:
        log(f"Premium-Zahl fertiger Proben: {res['nachgetragen']} nachgetragen, {res['geaendert']} aktualisiert")
    return res


def drop_off_pool(db, apply: bool, log=print) -> int:
    """Speicher (pool_routes) gesetzt oder geändert: fertige Proben, deren Leads nicht alle im Speicher ihrer
    Zielgruppe+Land liegen, verwerfen (Leads wieder frei) – sie werden im selben Lauf aus dem Speicher neu gebaut."""
    from lib.pools import members, routes
    known = routes(db)
    if not known:
        return 0
    n = 0
    for r in stock_rows(db, "ready"):
        pid = known.get((r["segment_id"], r["country"]))
        ids = r.get("lead_ids") or []
        if not pid or (ids and members(db, pid, ids) == set(ids)):
            continue
        if not apply:
            log(f"  würde verwerfen: Probe {r['segment_id']}/{r['country']} (nicht aus dem Speicher)")
            n += 1
        elif db.rpc("discard_sample_stock", {"p_stock": r["id"], "p_note": "Speicher geändert"}):
            log(f"  Probe {r['segment_id']}/{r['country']} verworfen: nicht aus dem gesetzten Speicher")
            n += 1
    return n


def cleanup_files(db, log=print) -> int:
    """Dateien verworfener Proben sofort, gesendeter nach 30 Tagen aus dem Storage löschen."""
    old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()
    rows = [r for r in stock_rows(db, "expired,failed,sent") if not r.get("files_removed_at")
            and (r["status"] != "sent" or (r.get("sent_at") or "") < old)]
    for i in range(0, len(rows), 100):
        part = rows[i:i + 100]
        remove(db, [r["storage_path"] for r in part])
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        for r in part:
            db.update("sample_stock", {"id": r["id"]}, {"files_removed_at": now})
    if rows:
        log(f"{len(rows)} Dateien alter Proben gelöscht")
    return len(rows)


def live_pages(db) -> list[dict]:
    """Öffentlich live geschaltete Landingpages (wie pageIsPublic: Seite live und Rechtstexte fertig)."""
    st = (db.select("settings", {"select": "legal_ready"}) or [{}])[0]
    if not st.get("legal_ready"):
        return []
    return db.select("landing_pages", {"status": "eq.live", "select": "segment_id,country,slug"})


def run(db, apply: bool, log=print) -> dict:
    from lib.fokus import focus_pairs
    from lib.owner_settings import ack, load as load_owner_settings, max_age_hours, paused as owner_paused
    owner = load_owner_settings(db)
    if apply and owner_paused(db, "proben-vorrat", owner):
        log(f"proben-vorrat: pausiert durch Inhaber (seit {owner_paused(db, 'proben-vorrat', owner)}) – baut und prüft nichts")
        return {"built": 0, "missing": {}, "summary": {}, "paused": True}
    if apply:  # Quittung fürs Dashboard: Soll und Verfall gelesen und angewandt
        ack(db, "proben-vorrat", ["sample_targets", "sample_premium_targets", "sample_max_age_hours"], owner)
    cfg = settings()
    cfg["max_alter_stunden"] = max_age_hours(cfg["max_alter_stunden"], owner["sample_max_age_hours"])
    t0 = time.monotonic()
    if apply:
        n = db.rpc("expire_sample_stock", {"p_hours": cfg["max_alter_stunden"]})  # S2 ausgenommen (in der Funktion)
        if n:
            log(f"{n} Proben verfallen (älter als {cfg['max_alter_stunden']} h, ohne {', '.join(NO_EXPIRY)}) – Leads freigegeben")
        cleanup_files(db, log)
    if drop_off_pool(db, apply, log):
        log("Proben außerhalb des gesetzten Speichers verworfen")
    v = verify_stock(db, apply, log)
    if v["geprueft"]:
        log(f"Freigabe fertiger Proben: {v['geprueft']} geprüft, {v['bestanden']} bestanden, {v['verworfen']} verworfen")
    refresh_premium_n(db, apply, log)
    pages = live_pages(db)
    slug_of = {}
    for p in pages:  # Wunsch-Schlüssel stehen unter dem englischen Seitennamen (FR-Seiten: gleiche Branche)
        if p["country"] != "FR" or p["segment_id"] not in slug_of:
            slug_of[p["segment_id"]] = p["slug"]
    want = targets(pages, cfg, focus_pairs(), owner["sample_targets"])
    want_prem = premium_targets(pages, cfg, owner.get("sample_premium_targets"))
    # Premium-Proben gehören zum Vorrat („davon Premium“); ist das Premium-Soll größer, wächst der Vorrat mit
    want = {k: max(t, want_prem.get(k, 0)) for k, t in want.items()}
    from lib.premium import only_premium
    nur_premium = only_premium(db)
    if nur_premium:  # Nur Premium (Inhaber 05.10.2026): jede Probe im Vorrat ist eine Premium-Probe
        want_prem = dict(want)
    ready = stock_rows(db, "ready,claimed")
    have = {k: sum(r["segment_id"] == k[0] and r["country"] == k[1] and r["status"] == "ready" for r in ready)
            for k in want}
    have_prem = {k: sum(r["segment_id"] == k[0] and r["country"] == k[1] and r["status"] == "ready"
                        and is_premium_sample(r) for r in ready) for k in want}
    built, missing, prem_built, prem_samples = {}, {}, {}, {}
    for (seg, cc), target in want.items():
        exclude = {c for r in ready if r["segment_id"] == seg and r["country"] == cc for c in (r["company_ids"] or [])}
        prem_open = True  # keine 10 freien Premium-Leads mehr -> in diesem Lauf normale Proben
        for wish in plan(have[(seg, cc)], target, wish_keys(slug_of.get(seg, ""))):
            if (time.monotonic() - t0) / 60 > cfg["laufzeit_minuten"]:
                log("Laufzeit erreicht – Rest im nächsten Lauf")
                missing[(seg, cc)] = missing.get((seg, cc), 0) + 1
                continue
            row = None
            if prem_open and have_prem[(seg, cc)] + prem_samples.get((seg, cc), 0) < want_prem.get((seg, cc), 0):
                try:
                    row = build_one(db, seg, cc, [], exclude, cfg["max_alter_stunden"], apply, log, premium_only=True)
                except Exception as exc:  # noqa: BLE001
                    log(f"  FEHLER Premium {seg}/{cc}: {type(exc).__name__}: {str(exc)[:200]}")
                if row is None:
                    prem_open = False
                    log(f"  {seg}/{cc}: keine 10 freien Premium-Leads"
                        + (" – keine Probe (nur Premium)" if nur_premium else " – normale Probe"))
                else:
                    prem_samples[(seg, cc)] = prem_samples.get((seg, cc), 0) + 1
            if row is None and nur_premium:
                # Nur Premium: nie eine normale Probe bauen, nie mit Standard auffüllen
                missing[(seg, cc)] = target - have[(seg, cc)] - built.get((seg, cc), 0)
                break
            try:
                row = row or build_one(db, seg, cc, wish, exclude, cfg["max_alter_stunden"], apply, log)
            except Exception as exc:  # noqa: BLE001 – eine Zielgruppe darf die anderen nicht aufhalten
                log(f"  FEHLER {seg}/{cc}: {type(exc).__name__}: {str(exc)[:200]}")
                row = None
            if row is None:
                log(f"  {seg}/{cc}: keine weiteren 10 vollständigen Leads – Rest folgt, sobald es mehr gibt")
                missing[(seg, cc)] = target - have[(seg, cc)] - built.get((seg, cc), 0)
                break
            built[(seg, cc)] = built.get((seg, cc), 0) + 1
            prem_built[(seg, cc)] = prem_built.get((seg, cc), 0) + int(row.get("premium_n") or 0)
    need = {k: max(0, want_prem.get(k, 0) - have_prem[k] - prem_samples.get(k, 0)) for k in want}
    swapped = swap_for_premium(db, list(want), apply, log,
                               time_left=lambda: (time.monotonic() - t0) / 60 <= cfg["laufzeit_minuten"],
                               hours=cfg["max_alter_stunden"], need=need)
    summary = {f"{s}/{c}": {"soll": t, "vorher": have[(s, c)], "neu": built.get((s, c), 0),
                            "premium_soll": want_prem.get((s, c), 0),
                            "premium_bereit": have_prem[(s, c)] + prem_samples.get((s, c), 0)
                            + swapped.get(f"{s}/{c}", 0),
                            "premium_neu": prem_samples.get((s, c), 0),
                            "premium_leads_neu": prem_built.get((s, c), 0),
                            "premium_getauscht": swapped.get(f"{s}/{c}", 0)} for (s, c), t in want.items()}
    short = premium_short(summary, built)
    if short:
        log("Premium-Vorrat zu klein (mit Standard-Leads aufgefüllt): " + ", ".join(short))
    log(json.dumps(summary, ensure_ascii=False))
    if apply:  # Zähler je Lauf fürs Dashboard „Werke“
        from lib.run_stats import record, rows_from_stock_summary
        record(db, "proben-vorrat", rows_from_stock_summary(summary), None, log)
    return {"built": sum(built.values()), "missing": missing, "summary": summary, "premium_zu_klein": short}


# Premium-Austausch (Gehirn 05.10.2026, begrenzt durch das Premium-Soll seit Inhaber 05.10.2026): S2-Proben verfallen
# nie nach Alter – ist der Vorrat voll, entstehen Premium-Proben nur, indem eine normale Probe ersetzt wird. Erst eine
# neue Premium-Probe bauen (volle Drei-Stufen-Freigabe, 10/10 Premium), dann die schwächste normale Probe verwerfen
# (Leads wieder frei, nichts gelöscht). Nur bis zum Premium-Soll je Seite (`need`) – vorher ersetzte der Austausch
# jede normale Probe und verbrauchte freie Premium-Leads, die Lieferungen und Mail-Tests (Beleg-Einstieg) brauchen.
PREMIUM_SWAP_PER_RUN = 8


def premium_supply(db) -> dict[tuple[str, str], int]:
    """Freie frische Premium-Firmen je Zielgruppe × Land (signalwerk.premium_status)."""
    try:
        rows = db.rpc("premium_status", {}) or []
    except Exception:  # noqa: BLE001 – ohne Zahlen kein Austausch
        return {}
    return {(r["segment_id"], r["country"]): int(r.get("premium_frei") or 0) for r in rows}


def swap_for_premium(db, pairs, apply: bool, log=print, time_left=lambda: True, hours: int = 48,
                     limit: int = PREMIUM_SWAP_PER_RUN, need: dict | None = None) -> dict[str, int]:
    """Normale Proben durch Premium-Proben ersetzen, bis je Seite das Premium-Soll erreicht ist (`need` = fehlende
    Premium-Proben je (Segment, Land)). Ersetzt wird zuerst die Probe ohne Wunsch mit den wenigsten Premium-Leads."""
    need = {tuple(k): int(v) for k, v in (need or {}).items() if int(v) > 0}
    if not need:
        return {}
    supply = premium_supply(db)
    ready = stock_rows(db, "ready")
    out: dict[str, int] = {}
    left = limit
    # größter Premium-Nachschub zuerst: das knappe Bau-Budget je Lauf geht dorthin, wo Premium-Proben möglich sind
    for seg, cc in sorted(pairs, key=lambda p: -supply.get(tuple(p), 0)):
        todo = need.get((seg, cc), 0)
        if left <= 0 or todo <= 0 or supply.get((seg, cc), 0) < 10:
            continue
        mine = [r for r in ready if r["segment_id"] == seg and r["country"] == cc]
        old = sorted((r for r in mine if not is_premium_sample(r)),
                     key=lambda r: (bool(r.get("wish")), int(r.get("premium_n") or 0), str(r.get("built_at") or "")))
        exclude = {c for r in mine for c in (r.get("company_ids") or [])}
        for r in old:
            if left <= 0 or todo <= 0 or not time_left():
                break
            try:
                row = build_one(db, seg, cc, [], exclude, hours, apply, log, premium_only=True)
            except Exception as exc:  # noqa: BLE001
                log(f"  Austausch {seg}/{cc}: {type(exc).__name__}: {str(exc)[:200]}")
                break
            if row is None:
                log(f"  Austausch {seg}/{cc}: keine 10 freien Premium-Leads mehr")
                break
            left -= 1
            todo -= 1
            if apply:
                db.rpc("discard_sample_stock", {"p_stock": r["id"], "p_note": "ersetzt durch Premium-Probe (10/10)"})
            out[f"{seg}/{cc}"] = out.get(f"{seg}/{cc}", 0) + 1
            log(f"  Austausch {seg}/{cc}: normale Probe ({int(r.get('premium_n') or 0)}/10) ersetzt durch Premium-Probe")
    return out


def premium_short(summary: dict, built: dict) -> list[str]:
    """Zielgruppe/Land, deren neue Proben nicht nur aus Premium-Leads bestehen (je Probe 10 Premium nötig)."""
    out = []
    for (seg, cc), n in built.items():
        got = (summary.get(f"{seg}/{cc}") or {}).get("premium_leads_neu", 0)
        if n and got < n * 10:
            out.append(f"{seg}/{cc} {got}/{n * 10}")
    return out


def inventory(db) -> dict[str, int]:
    """Bestand fertiger Proben je Zielgruppe/Land (für Tagescheck und Bericht)."""
    out: dict[str, int] = {}
    for r in stock_rows(db, "ready"):
        k = f"{r['segment_id']}/{r['country']}"
        out[k] = out.get(k, 0) + 1
    return out


# ---------------------------------------------------------------------------- Versand aus dem Vorrat
def personalize(payload: dict, email: str) -> dict:
    """Empfänger-Domain in die Fußzeile (wie send_reply: normalize_domain der Adresse)."""
    from lib.rules import normalize_domain
    dom = normalize_domain(email.split("@")[-1])
    ph = payload.get("placeholder") or PLACEHOLDER
    return {k: (v.replace(ph, dom) if isinstance(v, str) and k in ("text", "html") else v)
            for k, v in payload.items() if k not in ("version", "placeholder", "lang")}


def send_stock(db, request: dict, email: str, wish: list[str], log=print) -> str | None:
    """Fertige Probe aus dem Vorrat an den Anfragenden. Rückgabe: 'sent', 'none' (kein Vorrat) oder 'error'.
    Die Anfrage muss vorher gesperrt sein (lock_sample_request)."""
    got = db.rpc("claim_sample_stock", {"p_segment": request["segment_id"], "p_country": request["country"],
                                         "p_wish": wish or [], "p_request": request["id"]}) or []
    if not got:
        return "none"
    s = got[0]
    try:
        payload = personalize(json.loads(download(db, s["storage_path"])), email)
    except Exception as exc:  # noqa: BLE001 – Datei fehlt: sicher nicht gesendet, Probe nicht wieder vergeben
        db.rpc("finish_sample_stock", {"p_stock": s["id"], "p_ok": False, "p_release": False,
                                       "p_note": f"Datei: {str(exc)[:150]}"})
        log(f"  Vorrat-Datei fehlt: {exc}")
        return "error"
    from responder import resend_post
    mail = {"from": os.environ["MAIL_FROM"], "to": [email], **payload,
            "reply_to": os.environ.get("REPLY_TO") or os.environ["MAIL_FROM"]}
    try:
        rid = resend_post(mail, idempotency_key=f"sample-{request['id']}")
    except RuntimeError as exc:  # Resend hat abgelehnt: sicher nicht gesendet -> Probe wieder bereit
        db.rpc("finish_sample_stock", {"p_stock": s["id"], "p_ok": False, "p_release": True, "p_note": str(exc)[:200]})
        log(f"  Resend lehnte ab: {exc}")
        return "error"
    except requests.RequestException as exc:  # unklar, ob gesendet -> Leads vorsichtshalber vergeben
        db.rpc("finish_sample_stock", {"p_stock": s["id"], "p_ok": False, "p_release": False, "p_note": str(exc)[:200]})
        log(f"  Versand unklar: {exc}")
        return "error"
    db.rpc("finish_sample_stock", {"p_stock": s["id"], "p_ok": True, "p_resend_id": rid,
                                   "p_note": "über web_samples.py"})
    return "sent"


def test_send(db, apply: bool, seg: str | None, cc: str | None, log=print) -> int:
    """Inhaber-Test: eine fertige Probe an OWNER_EMAIL schicken, OHNE sie zu verbrauchen (nichts wird reserviert,
    vergeben oder als gesendet markiert). Misst die Zeit für Abruf + Versand – dasselbe, was die App nach dem Klick tut."""
    owner = os.environ.get("OWNER_EMAIL")
    rows = [r for r in stock_rows(db, "ready") if (not seg or r["segment_id"] == seg) and (not cc or r["country"] == cc)]
    if not rows:
        log("Kein fertiger Vorrat für den Test")
        return 1
    r = rows[0]
    t0 = time.monotonic()
    payload = personalize(json.loads(download(db, r["storage_path"])), owner or "owner@example.com")
    t1 = time.monotonic()
    log(f"Probe {r['segment_id']}/{r['country']} geladen in {(t1 - t0) * 1000:.0f} ms, "
        f"{len(payload.get('attachments') or [])} Anhänge, Betreff: {payload['subject']}")
    if not (apply and owner and os.environ.get("RESEND_API_KEY") and os.environ.get("MAIL_FROM")):
        log("Probelauf – keine Mail (mit --apply und OWNER_EMAIL/RESEND_API_KEY/MAIL_FROM senden)")
        return 0
    from responder import resend_post
    rid = resend_post({"from": os.environ["MAIL_FROM"], "to": [owner], **payload,
                       "subject": "[TEST Vorrat] " + payload["subject"]})
    t2 = time.monotonic()
    log(f"Test-Mail an den Inhaber gesendet (Resend {rid}) – Abruf {(t1 - t0) * 1000:.0f} ms, "
        f"Versand {(t2 - t1) * 1000:.0f} ms, gesamt {(t2 - t0) * 1000:.0f} ms. Vorrat unverändert.")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("befehl", choices=["status", "run", "test-send"])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--segment")
    ap.add_argument("--country")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    if args.befehl == "status":
        inv = inventory(db)
        for k in sorted(inv):
            print(f"{k:<8} {inv[k]}")
        print(f"gesamt   {sum(inv.values())}")
        return 0
    if args.befehl == "test-send":
        return test_send(db, args.apply, args.segment, args.country)
    if args.apply:
        from lib.heartbeat import Heartbeat
        with Heartbeat(db, "proben-vorrat", "run") as hb:
            res = run(db, args.apply)
            hb.update(processed=len(res.get("summary") or {}), green=res["built"])
    else:
        res = run(db, args.apply)
    print(f"\n{res['built']} Proben gebaut" + ("" if args.apply else " (Probelauf)"))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        inv = inventory(db) if args.apply else {}
        lines = ["### Proben-Vorrat", "", "| Zielgruppe/Land | Soll | vorher | neu | jetzt |", "|---|---|---|---|---|"]
        for k, v in res["summary"].items():
            lines.append(f"| {k} | {v['soll']} | {v['vorher']} | {v['neu']} | {inv.get(k, '-')} |")
        Path(summary).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
