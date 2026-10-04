#!/usr/bin/env python3
"""Dauerprüfung: Prüf-Agenten ohne Tokens (Inhaber 04.10.2026: „Qualitätsagenten bitte mehrere, auch die die
Kunden-Leads immer nochmal dauerhaft überprüfen – je länger die liegen, desto bessere Qualität, weil sie so oft geprüft
wurden. Effizient, nicht extrem viele unnötige Tokens, aber immer wieder prüfen.“)

Reines Python, kein LLM. Stündlich über .github/workflows/dauerpruefung.yml, Budget je Lauf in config/pruefung.yaml.

  python scripts/dauerpruefung.py run [--apply] [--leads N] [--kaeufer N] [--offline]
  python scripts/dauerpruefung.py leads [--apply] [--budget N] [--offline]
  python scripts/dauerpruefung.py kaeufer [--apply] [--budget N] [--offline]
  python scripts/dauerpruefung.py zusammenfassung [--tage 1]     # Ausreißer für die LLM-Qualitäts-Agenten

Lead-Prüfer: rollierende Nachprüfung lieferbarer Leads (status new). Zuerst fällige Nachprüfungen
(naechste_pruefung erreicht), dann noch nie geprüfte vollständige Leads – Märkte aktiver Kunden-Abos zuerst, dann
config/pruefung.yaml leads.maerkte (S2 US/UK/FR vorn). Jeder Lead läuft durch die unveränderte Drei-Stufen-Freigabe
(lib/release_gate.py inkl. Live-Nachprüfung höchstens 1×/Tag je Seite, robots.txt, MX, Dubletten, Sperrliste).
Bestanden: pruef_anzahl + 1, nächste Prüfung nach 1 → 3 → 7 → 14 → 30 Tagen, qualitaet_score steigt. Durchgefallen:
status 'held' + Grund in lead_checks (nichts gelöscht), Wert fällt. Proben-Vorrat (reserviert) prüft
sample_stock.py alle 20 h mit derselben Freigabe; auch diese Ergebnisse zählen in den Wert (release_gate.persist).

Käufer-Prüfer: mail-fähige Käufer (check_status ok). Dieselbe Käufer-Prüfung wie outreach.py check (check_values,
Sperrliste für Adresse und Domain) – besteht sie nicht mehr, wird der Käufer call_only (Telefon/Adresse vorhanden)
bzw. rejected; nie gelockert, nie ok gesetzt. Zusätzlich nur markiert (pruef_hinweis, Status bleibt): Bounce/Beschwerde
in der Historie, kein MX der Mail-Domain, Website-Domain löst nicht auf oder Startseite antwortet 404/410/5xx.

Sendet nichts, löscht nichts, schreibt keine Lead-Daten ins Repo (nur Zahlen in die Actions-Zusammenfassung).
Pause per Dashboard (owner_settings.werke_paused „dauerpruefung“). Speicher-Bremse „stopp“: nur fällige Nachprüfungen.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import socket
import sys
import uuid
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import quality as Q  # noqa: E402

WERK = "dauerpruefung"
ROOT = Path(__file__).resolve().parents[1]


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _pairs(items) -> list[tuple[str, str]]:
    out = []
    for x in items or []:
        seg, _, c = str(x).partition("/")
        if seg and c and (seg.strip(), c.strip().upper()) not in out:
            out.append((seg.strip(), c.strip().upper()))
    return out


def customer_markets(db) -> list[tuple[str, str]]:
    """(Zielgruppe, Land) aktiver Abos zahlender/echter Kunden – deren Leads zuerst."""
    try:
        from deliveries import deliverable_customer
        subs = db.select("subscriptions", {"status": "in.(active,trial)", "select": "customer_id,segment_id,filters"})
        ids = sorted({s["customer_id"] for s in subs if s.get("customer_id")})
        custs = {c["id"]: c for c in (db.select("customers", {"id": f"in.({','.join(ids)})",
                                                              "select": "id,status,stripe_customer_id,notes"}) if ids else [])}
    except Exception:  # noqa: BLE001 - ohne Abo-Daten gilt die Liste aus der Konfiguration
        return []
    out = []
    for s in subs:
        c = custs.get(s.get("customer_id"))
        country = ((s.get("filters") or {}).get("country") or "").upper()
        if c and deliverable_customer(c) and s.get("segment_id") and country and (s["segment_id"], country) not in out:
            out.append((s["segment_id"], country))
    return out


def brake(db) -> str:
    """Speicher-Bremse aus dem letzten Plan des Lead-Werks („aus“, „kompakt“, „stopp“)."""
    try:
        rows = db.select("werk_plan_log", {"select": "bremse", "werk": "eq.lead-werk", "order": "at.desc", "limit": "1"})
        return str((rows[0].get("bremse") if rows else None) or "aus")
    except Exception:  # noqa: BLE001
        return "aus"


# ------------------------------------------------------------------------------------------------ Lead-Prüfer
def due_leads(db, n: int, now: dt.datetime) -> list[dict]:
    if n <= 0:
        return []
    return db.select("leads", {"status": "eq.new", "naechste_pruefung": f"lte.{now.isoformat()}",
                               "order": "naechste_pruefung", "limit": str(n),
                               "select": "id,company_id,segment_id,country,qualitaet_score,pruef_anzahl"})


def fresh_leads(db, seg: str, country: str, n: int, rng: random.Random, tries: int = 6) -> list[dict]:
    """Noch nie geprüfte, vollständige Leads (zufälliger Einstieg in die ID-Reihenfolge, eine je Firma)."""
    from deliveries import contact_companies
    picked: dict[str, dict] = {}
    firms: set[str] = set()
    for _ in range(tries):
        if len(picked) >= n:
            break
        start = str(uuid.UUID(int=rng.getrandbits(128)))
        rows = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "status": "eq.new",
                                   "zuletzt_geprueft": "is.null", "id": f"gte.{start}", "order": "id",
                                   "limit": str(max(40, 3 * n)), "select": "id,company_id,segment_id,country"})
        if not rows:
            continue
        known = contact_companies(db, website_optional=(seg == "S2"),
                                  only=sorted({r["company_id"] for r in rows if r.get("company_id")}))
        for r in rows:
            cid = r.get("company_id")
            if cid in known and cid not in firms and r["id"] not in picked:
                picked[r["id"]] = r
                firms.add(cid)
                if len(picked) >= n:
                    break
    return list(picked.values())


def plan_leads(db, budget: int, cfg: dict, rng: random.Random, now: dt.datetime, log=print) -> tuple[list[dict], dict]:
    """Auswahl für einen Lauf: fällige zuerst (eine je Firma), Rest verteilt auf die Märkte in Reihenfolge."""
    info = {"faellig": 0, "neu": {}, "bremse": brake(db)}
    chosen: list[dict] = []
    firms: set[str] = set()
    for r in due_leads(db, budget * 2, now):
        if r.get("company_id") in firms:
            continue
        firms.add(r.get("company_id"))
        chosen.append(r)
        if len(chosen) >= budget:
            break
    info["faellig"] = len(chosen)
    rest = budget - len(chosen)
    if rest <= 0 or info["bremse"] == "stopp":
        if info["bremse"] == "stopp":
            log("Speicher-Bremse „stopp“: nur fällige Nachprüfungen")
        return chosen, info
    markets = customer_markets(db)
    heavy = set(markets) | set(_pairs(cfg.get("schwerpunkt") or []))
    for p in _pairs(cfg.get("maerkte")):
        if p not in markets:
            markets.append(p)
    weight = {m: int(cfg.get("schwerpunkt_gewicht") or 4) if m in heavy else 1 for m in markets}
    for i, (seg, country) in enumerate(markets):
        if rest <= 0:
            break
        # Kunden-Märkte und Schwerpunkt (S2 US/UK/FR) bekommen den größeren Anteil; was ein Markt nicht füllt, geht
        # an die nächsten
        left = sum(weight[m] for m in markets[i:])
        share = max(1, -(-rest * weight[(seg, country)] // left))
        got = [r for r in fresh_leads(db, seg, country, share, rng) if r.get("company_id") not in firms]
        for r in got:
            firms.add(r.get("company_id"))
        chosen += got
        info["neu"][f"{seg}/{country}"] = len(got)
        rest -= len(got)
    return chosen, info


def run_leads(db, budget: int, *, apply: bool, live: bool, rng: random.Random, cfg: dict | None = None,
              fetcher=None, log=print) -> dict:
    from lib import release_gate as G
    cfg = cfg if cfg is not None else (Q.config().get("leads") or {})
    now = _now()
    picked, info = plan_leads(db, budget, cfg, rng, now, log)
    res = {"geprueft": 0, "bestanden": 0, "gehalten": 0, "gruende": {}, **info}
    if not picked:
        log("Lead-Prüfer: nichts zu prüfen")
        return res
    vs = G.check(db, [r["id"] for r in picked], live=live, fetcher=fetcher)
    if apply:
        G.persist(db, vs, WERK, log=log)
    s = G.summary(vs)
    res.update({"geprueft": s["geprueft"], "bestanden": s["freigegeben"], "gehalten": s["geprueft"] - s["freigegeben"],
                "gruende": s["gruende"], "verdicts": vs})
    log(f"Lead-Prüfer: {s['geprueft']} geprüft ({info['faellig']} fällig), {s['freigegeben']} bestanden, "
        f"{res['gehalten']} gehalten{'' if apply else ' (Probelauf, nichts gespeichert)'} – {list(s['gruende'].items())[:5]}")
    if apply:
        from lib.run_stats import record
        rows = G.stats_rows(vs)
        for r in rows:
            r["extra"] = {**r.get("extra", {}), "art": "lead", "faellig": info["faellig"]}
        record(db, WERK, rows, now.isoformat(), log)
    return res


# ------------------------------------------------------------------------------------------------ Käufer-Prüfer
P_FIELDS = ("id,segment_id,company_name,legal_form,country,website,domain,email,source_url,size_note,phone,"
            "published_address,check_status,qualitaet_score,pruef_anzahl,created_at")


def due_prospects(db, n: int, now: dt.datetime) -> list[dict]:
    if n <= 0:
        return []
    return db.select("prospects", {"check_status": "eq.ok", "naechste_pruefung": f"lte.{now.isoformat()}",
                                   "order": "naechste_pruefung", "limit": str(n), "select": P_FIELDS})


def fresh_prospects(db, n: int, rng: random.Random, seg: str | None = None, country: str | None = None,
                    tries: int = 4) -> list[dict]:
    out: dict[str, dict] = {}
    for _ in range(tries):
        if len(out) >= n:
            break
        q = {"check_status": "eq.ok", "zuletzt_geprueft": "is.null", "id": f"gte.{uuid.UUID(int=rng.getrandbits(128))}",
             "order": "id", "limit": str(n - len(out)), "select": P_FIELDS}
        if seg:
            q["segment_id"] = f"eq.{seg}"
        if country:
            q["country"] = f"eq.{country}"
        for r in db.select("prospects", q):
            out.setdefault(r["id"], r)
    return list(out.values())[:n]


def plan_prospects(db, budget: int, cfg: dict, rng: random.Random, now: dt.datetime) -> tuple[list[dict], int]:
    chosen = {r["id"]: r for r in due_prospects(db, budget, now)}
    due = len(chosen)
    rest = budget - due
    markets = _pairs(cfg.get("maerkte"))
    for i, (seg, country) in enumerate(markets):
        if rest <= 0:
            break
        share = max(1, -(-rest // (len(markets) - i + 1)))  # +1: ein Anteil bleibt für alle übrigen Käufer
        for r in fresh_prospects(db, share, rng, seg, country):
            if r["id"] not in chosen:
                chosen[r["id"]] = r
                rest -= 1
    if rest > 0:
        for r in fresh_prospects(db, rest, rng):
            chosen.setdefault(r["id"], r)
    return list(chosen.values())[:budget], due


def suppressed_keys(db, rows: list[dict]) -> set[str]:
    from lib.rules import email_domain
    keys = set()
    for p in rows:
        e = (p.get("email") or "").lower()
        keys |= {e, email_domain(e) if "@" in e else "", (p.get("domain") or "").lower()}
    keys.discard("")
    out = set()
    ks = sorted(keys)
    for i in range(0, len(ks), 80):
        for r in db.select("suppression", {"value": f"in.({','.join(ks[i:i + 80])})", "select": "value"}):
            out.add((r.get("value") or "").lower())
    return out


def bounce_history(db) -> tuple[set[str], set[str]]:
    """(prospect_ids, E-Mail-Adressen) mit Bounce oder Spam-Beschwerde (Tabelle ist klein)."""
    ev = db.select_all("email_events", {"type": "in.(bounced,complained)", "select": "message_id"})
    mids = sorted({e["message_id"] for e in ev if e.get("message_id")})
    pids, mails = set(), set()
    for i in range(0, len(mids), 100):
        for m in db.select("messages", {"id": f"in.({','.join(mids[i:i + 100])})", "select": "prospect_id,to_email"}):
            if m.get("prospect_id"):
                pids.add(m["prospect_id"])
            if m.get("to_email"):
                mails.add(m["to_email"].lower())
    return pids, mails


def site_state(url: str, session=None) -> str | None:
    """'tot' (Domain löst nicht auf, 404/410/5xx, keine Verbindung), None = in Ordnung oder nicht prüfbar
    (robots.txt verbietet, Plattform, 401/403/429). Ein Abruf der Startseite, höflich (lib/fetch.polite_get)."""
    import requests
    from urllib.parse import urlparse

    from lib.fetch import FetchRefused, polite_get
    u = url if "://" in url else f"https://{url}"
    host = urlparse(u).hostname or ""
    if not host:
        return None
    try:
        socket.getaddrinfo(host, 443)
    except socket.gaierror:
        return "tot"
    except OSError:
        return None
    try:
        r = polite_get(u, last_fetched=None, session=session)
    except FetchRefused:
        return None
    except requests.RequestException:
        return "tot"
    if r.status_code in (404, 410) or r.status_code >= 500:
        return "tot"
    return None


def prospect_verdict(p: dict, ccfg: dict, suppressed: set[str], bounced: tuple[set[str], set[str]],
                     mx=None, site=None) -> dict:
    """{"id","result": ok|hinweis|abgelehnt,"hinweis","update"} – update nur bei abgelehnt (bestehende Prüflogik)."""
    from lib.rules import email_domain

    from outreach import check_values
    e = (p.get("email") or "").lower()
    dom = email_domain(e) if "@" in e else ""
    sup = bool({e, dom, (p.get("domain") or "").lower()} - {""} & suppressed)
    res, values = check_values(p, ccfg, sup)
    if not res.ok:
        if p.get("phone") or p.get("published_address"):
            values = {**values, "check_status": "call_only", "check_reason": ("nur Anruf/Brief – " + values["check_reason"])[:500]}
        return {"id": p["id"], "result": "abgelehnt", "hinweis": values["check_reason"][:300], "update": values}
    hints = []
    if p["id"] in bounced[0] or (e and e in bounced[1]):
        hints.append("bounce_historie")
    if mx is not None and dom and mx(dom) is False:
        hints.append("kein_mx")
    if site is not None and p.get("website") and site(p["website"]) == "tot":
        hints.append("website_nicht_erreichbar")
    return {"id": p["id"], "result": "hinweis" if hints else "ok", "hinweis": ",".join(hints) or None}


def run_kaeufer(db, budget: int, *, apply: bool, live: bool, rng: random.Random, cfg: dict | None = None,
                mx=None, site=None, log=print) -> dict:
    from lib.rules import load_countries
    cfg = cfg if cfg is not None else (Q.config().get("kaeufer") or {})
    now = _now()
    rows, due = plan_prospects(db, budget, cfg, rng, now)
    res = {"geprueft": 0, "bestanden": 0, "markiert": 0, "abgelehnt": 0, "faellig": due, "gruende": {}}
    if not rows:
        log("Käufer-Prüfer: nichts zu prüfen")
        return res
    ccfg = load_countries()
    sup = suppressed_keys(db, rows)
    bounced = bounce_history(db)
    if live:
        if mx is None:
            from lib.release_gate import mx_cached as mx
        if site is None:
            import requests
            session = requests.Session()
            seen: dict[str, str | None] = {}

            def site(url, _s=session, _seen=seen):  # höchstens ein Abruf je Seite und Lauf
                key = url.lower().rstrip("/")
                if key not in _seen:
                    _seen[key] = site_state(url, _s)
                return _seen[key]
    else:
        mx = site = None
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=8 if live else 1) as ex:
        out = list(ex.map(lambda p: prospect_verdict(p, ccfg, sup, bounced, mx, site), rows))
    reasons: Counter = Counter()
    groups: dict[tuple, Counter] = {}
    by_id = {p["id"]: p for p in rows}
    for v in out:
        p = by_id[v["id"]]
        g = groups.setdefault((p.get("segment_id"), p.get("country")), Counter())
        g["geprueft"] += 1
        g[v["result"]] += 1
        if v["result"] == "hinweis":
            for h in v["hinweis"].split(","):
                reasons[h] += 1
                g[f"r:{h}"] += 1
        elif v["result"] == "abgelehnt":
            key = (v["hinweis"] or "").split(";")[0][:60]
            reasons[key] += 1
            g[f"r:{key}"] += 1
    res.update({"geprueft": len(out), "bestanden": sum(v["result"] == "ok" for v in out),
                "markiert": sum(v["result"] == "hinweis" for v in out),
                "abgelehnt": sum(v["result"] == "abgelehnt" for v in out), "gruende": dict(reasons.most_common(10))})
    log(f"Käufer-Prüfer: {res['geprueft']} geprüft ({due} fällig), {res['bestanden']} ok, {res['markiert']} markiert, "
        f"{res['abgelehnt']} nicht mehr mail-fähig{'' if apply else ' (Probelauf, nichts gespeichert)'} – "
        f"{list(res['gruende'].items())[:5]}")
    if not apply:
        return res
    for v in out:
        if v["result"] == "abgelehnt":
            try:  # nur verschärfen: Bedingung check_status = ok, nie zurück auf ok
                db.update("prospects", {"id": v["id"], "check_status": "ok"}, v["update"])
            except Exception as exc:  # noqa: BLE001
                log(f"Käufer {v['id']} nicht aktualisiert: {type(exc).__name__}")
    Q.apply_prospects(db, [{"id": v["id"], "result": v["result"], "hinweis": v["hinweis"]} for v in out], log=log)
    from lib.run_stats import record
    stat_rows = []
    for (seg, c), g in sorted(groups.items(), key=lambda x: tuple(y or "" for y in x[0])):
        stat_rows.append({"segment_id": seg, "country": c, "candidates": g["geprueft"], "processed": g["geprueft"],
                          "green": g["ok"], "yellow": g["hinweis"], "red": g["abgelehnt"],
                          "reasons": {k[2:]: n for k, n in g.items() if k.startswith("r:")},
                          "extra": {"art": "kaeufer", "faellig": due}})
    record(db, WERK, stat_rows, now.isoformat(), log)
    return res


# ------------------------------------------------------------------------------------------------ Zusammenfassung
def summary_text(kpi: dict) -> str:
    """Tageszusammenfassung für die LLM-Qualitäts-Agenten: nur Summen und Ausreißer, keine einzelnen Leads."""
    today = {}
    tage = kpi.get("tage") or []
    last = max((t.get("tag") for t in tage), default=None)
    for t in tage:
        if t.get("tag") == last:
            a = today.setdefault(t.get("art") or "lead", Counter())
            for k in ("geprueft", "bestanden", "markiert", "gehalten"):
                a[k] += int(t.get(k) or 0)
    lines = [f"Dauerprüfung {last or '–'}:"]
    for art, a in sorted(today.items()):
        name = "Leads" if art == "lead" else "Käufer"
        rate = (a["geprueft"] - a["bestanden"]) / a["geprueft"] if a["geprueft"] else 0
        extra = f", {a['markiert']} markiert" if art == "kaeufer" else ""
        lines.append(f"- {name}: {a['geprueft']} geprüft, {a['bestanden']} bestanden{extra}, {a['gehalten']} gehalten "
                     f"({rate:.1%} Abweichung)")
    for k, name in (("leads", "Leads"), ("kaeufer", "Käufer")):
        rows = kpi.get(k) or []
        n = sum(int(r.get("geprueft") or 0) for r in rows)
        hi = sum(int(r.get("score_70") or 0) for r in rows)
        if n:
            lines.append(f"- Bestand {name}: {n} mit Wert, {hi} ab 70")
    out = kpi.get("ausreisser") or []
    if out:
        lines.append("Ausreißer (> 5 % Abweichung, 24 h):")
        for o in out[:10]:
            lines.append(f"- {o.get('art')} {o.get('segment_id')}/{o.get('country')}: "
                         f"{float(o.get('fehlerquote') or 0):.1%} von {o.get('geprueft')}")
    else:
        lines.append("Keine Ausreißer.")
    return "\n".join(lines)


def write_summary(res: dict) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    lines = ["### Dauerprüfung", "", "| Art | geprüft | bestanden | markiert | gehalten | fällig |", "|---|---|---|---|---|---|"]
    for art, r in res.items():
        lines.append(f"| {art} | {r.get('geprueft', 0)} | {r.get('bestanden', 0)} | {r.get('markiert', 0)} | "
                     f"{r.get('gehalten', r.get('abgelehnt', 0))} | {r.get('faellig', 0)} |")
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except OSError:
        pass


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["run", "leads", "kaeufer", "zusammenfassung"])
    ap.add_argument("--apply", action="store_true", help="Ergebnisse speichern (sonst Probelauf)")
    ap.add_argument("--budget", type=int, help="leads/kaeufer: Anzahl je Lauf")
    ap.add_argument("--leads", type=int, help="run: Lead-Budget")
    ap.add_argument("--kaeufer", type=int, help="run: Käufer-Budget")
    ap.add_argument("--offline", action="store_true", help="ohne Netzabruf (keine Live-Nachprüfung, kein MX)")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--tage", type=int, default=1)
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    if args.cmd == "zusammenfassung":
        kpi = db.rpc("pruef_kpi", {"p_days": args.tage}) or {}
        print(summary_text(kpi))
        return 0
    from lib.owner_settings import stop_if_paused
    if args.apply and stop_if_paused(db, WERK):
        return 0
    cfg = Q.config()
    rng = random.Random(args.seed)
    # Selbstoptimierung (scripts/selbstopt.py): bei hoher Fehlerquote mehr Budget (bis 2×) und kürzere Abstände (bis ½)
    from lib.selbstopt_state import pruef_faktoren
    budget_f, intervall_f = pruef_faktoren(db)
    Q.set_interval_factor(intervall_f)
    if budget_f > 1 or intervall_f < 1:
        print(f"Selbstoptimierung: Budget × {budget_f:g}, Prüfabstände × {intervall_f:g}")
    res = {}
    from lib.heartbeat import Heartbeat
    with Heartbeat(db if args.apply else None, WERK) as hb:
        if args.cmd in ("run", "leads"):
            lc = cfg.get("leads") or {}
            n = args.budget if args.cmd == "leads" and args.budget is not None else args.leads
            n = int(n if n is not None else int((lc.get("budget_je_lauf") or 200) * budget_f))
            r = run_leads(db, n, apply=args.apply, live=not args.offline and lc.get("live", True) is not False, rng=rng)
            r.pop("verdicts", None)
            res["Leads"] = r
            hb.update(processed=r["geprueft"], green=r["bestanden"])
        if args.cmd in ("run", "kaeufer"):
            kc = cfg.get("kaeufer") or {}
            n = args.budget if args.cmd == "kaeufer" and args.budget is not None else args.kaeufer
            n = int(n if n is not None else int((kc.get("budget_je_lauf") or 300) * budget_f))
            res["Käufer"] = run_kaeufer(db, n, apply=args.apply, live=not args.offline and kc.get("live", True) is not False,
                                        rng=rng)
    write_summary(res)
    print(json.dumps(res, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
