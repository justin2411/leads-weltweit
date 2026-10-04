#!/usr/bin/env python3
"""Das Gehirn: tägliche Schleife nach BRAIN.md Abschnitt 3.

  python scripts/brain.py            # Probelauf: zeigt Kennzahlen und geplante Entscheidungen, schreibt nichts
  python scripts/brain.py --apply    # Entscheidungen protokollieren und im Rahmen der Handlungsrechte handeln

Handlungsrechte (BRAIN.md 6): Stufe 1 immer (Seiten/Varianten als 'review' anlegen, Leads taggen, Vorschläge);
Stufe 2 nur mit settings.auto_publish_pages (Seiten live schalten, Gewinner festlegen). Segmente stoppen oder
ausbauen schlägt das Gehirn nur vor ('proposed') – das entscheidet der Inhaber. Nie: Preise, Zahlungs-/Rechtslogik,
Länderregeln, Sperrliste, Kosten.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "app" / "content" / "pages"
MAX_DECISIONS = 3
MIN_VIEWS = 300
LANG = {"UK": "en", "US": "en", "IE": "en", "FR": "fr"}


from lib.stats import delivered  # noqa: E402
from lib.kurz import insert_decisions  # noqa: E402


def content_for(segment: str) -> tuple[str, dict] | None:
    for f in sorted(CONTENT.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        if data.get("segment_id") == segment:
            return f.stem, data
    return None


def rate(n: int, d: int) -> float:
    return n / d if d else 0.0


def safety_checks(sent_24: int, bounced_24: int, complaints_24: int, last_webhooks: list[dict]) -> list[str]:
    """Abschaltgründe nach BRAIN.md 7 (reine Funktion)."""
    out = []
    if complaints_24:
        out.append(f"{complaints_24} Spam-Beschwerde(n) in 24 h")
    if sent_24 >= 20 and rate(bounced_24, sent_24) > 0.05:
        out.append(f"Bounce-Rate heute {bounced_24}/{sent_24} = {rate(bounced_24, sent_24):.1%} über 5 %")
    if len(last_webhooks) >= 3 and all(w["status"] == "rejected" for w in last_webhooks[:3]):
        out.append("Stripe-Webhook dreimal hintereinander fehlgeschlagen")
    return out


def page_decisions(stats: list[dict]) -> list[dict]:
    """Varianten-Regeln nach BRAIN.md 5.1 (reine Funktion). Gibt Vorschläge zurück."""
    out = []
    by_page: dict[str, list[dict]] = {}
    for s in stats:
        if s["variant_status"] == "live" and s["page_status"] == "live":
            by_page.setdefault(s["page_id"], []).append(s)
    for pid, vs in by_page.items():
        slug = vs[0]["slug"]
        if any(int(v["views"]) < MIN_VIEWS for v in vs):
            out.append({"type": "note", "subject": f"{slug}: zu wenig Daten",
                        "reasoning": f"Unter {MIN_VIEWS} Aufrufen je Variante wird nicht entschieden.",
                        "metrics": {v["variant_key"]: int(v["views"]) for v in vs}, "kind": "info"})
            continue
        if len(vs) == 1:
            v = vs[0]
            r = rate(int(v["sample_requests"]), int(v["views"]))
            if r < 0.02:
                out.append({"type": "page_variant", "subject": f"{slug}: neue Variante nötig",
                            "reasoning": f"{v['views']} Aufrufe, Probe-Quote {r:.1%} unter 2 %. Nur ein Element ändern "
                                         "(Überschrift ODER Signale ODER Handlungsaufforderung) – Text schreibt Claude in der Sitzung.",
                            "metrics": {"views": v["views"], "sample_requests": v["sample_requests"]}, "kind": "variant",
                            "page_id": pid})
            continue
        ranked = sorted(vs, key=lambda v: rate(int(v["sample_requests"]), int(v["views"])), reverse=True)
        best, rest = ranked[0], ranked[1:]
        rb = rate(int(best["sample_requests"]), int(best["views"]))
        if all(rb >= 1.3 * rate(int(v["sample_requests"]), int(v["views"])) for v in rest) and rb > 0:
            out.append({"type": "page_winner", "subject": f"{slug}: Variante {best['variant_key']} gewinnt",
                        "reasoning": f"Probe-Quote {rb:.1%}, mindestens 30 % relativ besser als "
                                     + ", ".join(f"{v['variant_key']} {rate(int(v['sample_requests']), int(v['views'])):.1%}" for v in rest),
                        "metrics": {v["variant_key"]: {"views": v["views"], "requests": v["sample_requests"]} for v in vs},
                        "kind": "winner", "winner": best["variant_id"], "losers": [v["variant_id"] for v in rest]})
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    now = dt.datetime.now(dt.timezone.utc)
    since24 = (now - dt.timedelta(hours=24)).isoformat()
    week = (now - dt.timedelta(days=7)).isoformat()
    log: list[dict] = []

    def decide(type_: str, subject: str, reasoning: str, metrics: dict | None = None, action: str | None = None,
               status: str = "done") -> None:
        print(f"[{type_}/{status}] {subject} – {reasoning}")
        log.append({"type": type_, "subject": subject, "reasoning": reasoning, "metrics": metrics or {},
                    "action": action, "status": status})

    # 1. Not-Aus
    st = (db.select("settings", {"id": "eq.1"}) or [{}])[0]
    enabled = bool(st.get("brain_enabled", True))

    # 2. Beobachten
    stats = db.select("experiment_stats", {"select": "*"})
    pstats = db.select("page_stats", {"select": "*"})
    sent_24 = len(db.select_all("messages", {"status": "eq.sent", "sent_at": f"gte.{since24}", "select": "id"}))
    ev_24 = db.select_all("email_events", {"created_at": f"gte.{since24}", "type": "in.(bounced,complained)", "select": "type"})
    bounced_24 = sum(1 for e in ev_24 if e["type"] == "bounced")
    complaints_24 = sum(1 for e in ev_24 if e["type"] == "complained")
    subs = db.select("subscriptions", {"select": "status"})
    requests_24 = db.select("sample_requests", {"created_at": f"gte.{since24}", "select": "id"})
    metrics = {"gesendet_24h": sent_24, "bounces_24h": bounced_24, "beschwerden_24h": complaints_24,
               "aktive_abos": sum(1 for s in subs if s["status"] == "active"),
               "probe_anfragen_24h": len(requests_24),
               "seitenaufrufe": sum(int(p["views"]) for p in pstats)}

    # 3. Sicherheit
    webhooks = db.select("decisions", {"type": "eq.webhook", "order": "created_at.desc", "limit": "3", "select": "status"})
    reasons = safety_checks(sent_24, bounced_24, complaints_24, webhooks)
    if reasons and enabled:
        decide("safety", "Gehirn abgeschaltet", "; ".join(reasons), metrics, "settings.brain_enabled = false")
        enabled = False
        if args.apply:
            db.update("settings", {"id": 1}, {"brain_enabled": False, "updated_by": "brain (Abschaltregel)"})
            _notify_owner("Signalwerk: Gehirn hat sich abgeschaltet", "Grund: " + "; ".join(reasons))

    if enabled:
        n = 0
        segs = {s["id"]: s for s in db.select("segments", {"select": "id,status"})}
        pages = db.select("landing_pages", {"select": "id,slug,segment_id,country,status,created_at"})
        have = {(p["segment_id"], p["country"]) for p in pages}

        # 5.1 Seite stilllegen, wenn das Segment gestoppt ist (Offline nehmen ist immer erlaubt)
        for p in pages:
            if segs.get(p["segment_id"], {}).get("status") == "killed" and p["status"] != "retired" and n < MAX_DECISIONS:
                decide("page_retire", f"{p['slug']} stillgelegt", f"Segment {p['segment_id']} steht auf killed")
                n += 1
                if args.apply:
                    db.update("landing_pages", {"id": p["id"]}, {"status": "retired"})

        # 5.1 Neue Seite (als 'review'), wenn Segment im Test, Probe vorhanden und noch keine Seite
        created_week = sum(1 for p in pages if p["created_at"] >= week)
        exps = db.select("experiments", {"select": "segment_id,country"})
        for e in exps:
            if n >= MAX_DECISIONS or created_week >= int(st.get("max_new_pages_per_week", 3)):
                break
            key = (e["segment_id"], e["country"])
            if key in have or segs.get(e["segment_id"], {}).get("status") not in ("testing", "winner"):
                continue
            c = content_for(e["segment_id"])
            lang = LANG.get(e["country"], "en")
            if not c or lang not in c[1]:
                continue
            samples = db.select("leads", {"segment_id": f"eq.{e['segment_id']}", "country": f"eq.{e['country']}",
                                          "status": "eq.sample", "order": "event_date.desc", "limit": "10",
                                          "select": "event_summary,event_date,source_name,watch_companies(name,city)"})
            if len(samples) < 10:
                continue
            slug = f"{e['country'].lower()}/{c[0]}"
            text = c[1][lang]
            example = [{"company": s["watch_companies"]["name"], "location": s["watch_companies"].get("city"),
                        "event": s["event_summary"][:160], "date": s.get("event_date"), "source": s["source_name"]}
                       for s in samples[:5]]
            decide("page_new", f"Seite {slug} angelegt (review)",
                   f"Segment {e['segment_id']} im Test, {len(samples)} echte Probe-Leads, noch keine Seite",
                   {"proben": len(samples)}, "landing_pages + Variante A als review")
            n += 1
            created_week += 1
            have.add(key)
            if args.apply:
                page = db.insert("landing_pages", {"slug": slug, "segment_id": e["segment_id"], "country": e["country"],
                                                   "language": lang, "status": "review", "created_by": "brain"})[0]
                db.insert("page_variants", {"page_id": page["id"], "variant_key": "A", "headline": text["headline"],
                                            "subheadline": text.get("subheadline"), "signals": text.get("signals", []),
                                            "sample_leads": example, "cta_label": text["cta_label"],
                                            "faq": text.get("faq", []), "status": "review", "traffic_share": 100})

        # 5.1 Varianten und Gewinner
        for d in page_decisions(pstats):
            if d["kind"] == "info":
                decide(d["type"], d["subject"], d["reasoning"], d["metrics"])
                continue
            if n >= MAX_DECISIONS:
                break
            n += 1
            if d["kind"] == "winner" and st.get("auto_publish_pages"):
                decide(d["type"], d["subject"], d["reasoning"], d["metrics"], "Verlierer retired, Gewinner 100 %")
                if args.apply:
                    for lid in d["losers"]:
                        db.update("page_variants", {"id": lid}, {"status": "retired", "traffic_share": 0})
                    db.update("page_variants", {"id": d["winner"]}, {"traffic_share": 100})
            else:
                decide(d["type"], d["subject"], d["reasoning"], d["metrics"], status="proposed")

        # Stufe 2: Seiten im Review selbst live schalten (nur mit Freigabe + Rechtstexten; DB-Trigger prüft zusätzlich)
        if st.get("auto_publish_pages") and st.get("legal_ready"):
            for p in pages:
                if p["status"] == "review" and n < MAX_DECISIONS:
                    decide("page_new", f"{p['slug']} live geschaltet", "auto_publish_pages = true, Rechtstexte freigegeben")
                    n += 1
                    if args.apply:
                        db.update("page_variants", {"page_id": p["id"], "status": "review"}, {"status": "live"})
                        db.update("landing_pages", {"id": p["id"]}, {"status": "live", "published_at": now.isoformat()})

        # 5.2 Segmente: nur Vorschläge (Probe-Anfragen und Käufe über Seiten zählen als positiv)
        page_pos = {}
        for p in pstats:
            k = (p["segment_id"], p["country"])
            page_pos[k] = page_pos.get(k, 0) + int(p["sample_requests"]) + int(p["purchases"])
        for s in stats:
            if n >= MAX_DECISIONS:
                break
            dlv = delivered(s)  # SMTP: gesendet - Bounces (keine 'delivered'-Ereignisse)
            pos = int(s.get("positive") or 0) + int(s.get("samples") or 0) + page_pos.get((s["segment_id"], s["country"]), 0)
            if dlv < 50 or s.get("decision"):
                continue
            r = rate(pos, dlv)
            if r < 0.02:
                verdict = "stoppen (unter 2 % positiv)"
            elif r > 0.05 or int(s.get("customers") or 0):
                verdict = "ausbauen (über 5 % positiv oder Kunde)"
            elif not int(s.get("samples") or 0):
                verdict = "neue Botschaft testen (2–5 %, keine Proben)"
            else:
                continue
            decide("segment", f"{s['segment_id']}/{s['country']}: {verdict}", f"{pos} positiv bei {dlv} zugestellten ({r:.1%})",
                   {"delivered": dlv, "positive": pos}, status="proposed")
            n += 1

        # 6. Leads taggen
        if args.apply:
            import match
            match.main(["--apply"])

        # 6b. Probe-Anfragen von Landingpages beantworten (Einwilligung liegt vor -> Resend erlaubt)
        for r in db.select("sample_requests", {"status": "eq.new", "order": "created_at", "limit": "20"}):
            decide("note", f"Probe an {r['company_name']} ({r['segment_id']}/{r['country']})",
                   "Anfrage über Landingpage mit Einwilligung", {"region": r.get("region")}, "Probe per Mail")
            if args.apply:
                _send_sample(db, r)

    # 7. Tagesnotiz
    decide("daily_note", f"Tagesnotiz {now:%d.%m.%Y}", "Gehirn " + ("aktiv" if enabled else "AUS – nur beobachten"), metrics)
    if args.apply:
        insert_decisions(db, log)
    else:
        print("\nProbelauf – mit --apply übernehmen.")
    return 0


def _send_sample(db, r: dict) -> None:
    """10 Leads aus dem ganzen Land als CSV an den Anfragenden (eigener Betreff, kein gefälschtes 'Re:')."""
    from responder import regional_sample, sample_mail, sample_subject, send_reply
    from lib.wishes import parse, with_note
    if db.rpc("is_suppressed", {"p_email": r["email"]}):
        db.update("sample_requests", {"id": r["id"]}, {"status": "rejected", "note": with_note(r.get("note"), "gesperrt")})
        return
    lang = "fr" if r.get("country") == "FR" else "en"
    # Wunsch aus dem Probe-Formular ("Welche Leads?") bevorzugen
    files, regional = regional_sample(db, r["segment_id"], r["country"], r.get("region"), wish=parse(r.get("note"))[0])
    area = None  # landesweit statt regional (Inhaber 27.09.2026)
    body, blocks = sample_mail(lang, area, files, regional, r["segment_id"], r["country"])
    if not body or not (os.environ.get("RESEND_API_KEY") and os.environ.get("MAIL_FROM")):
        return
    # gleiche gestaltete Mail wie der Antwort-Assistent (Text + HTML, Pflichtfußzeile), eigener Betreff ohne "Re:"
    send_reply(r["email"], sample_subject(lang, None, r["country"]), body, None, lang, files, blocks, requested=True)
    db.update("sample_requests", {"id": r["id"]}, {"status": "sent", "sent_at": dt.datetime.now(dt.timezone.utc).isoformat()})


def _notify_owner(subject: str, text: str) -> None:
    """Meldung an den Inhaber (Resend an die eigene Adresse, keine Kaltakquise)."""
    import requests
    owner = os.environ.get("OWNER_EMAIL")
    if not (owner and os.environ.get("RESEND_API_KEY") and os.environ.get("MAIL_FROM")):
        print("Hinweis: keine Meldung per Mail (OWNER_EMAIL/RESEND_API_KEY/MAIL_FROM fehlen)")
        return
    requests.post("https://api.resend.com/emails", timeout=30,
                  headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                  json={"from": os.environ["MAIL_FROM"], "to": [owner], "subject": subject, "text": text})


if __name__ == "__main__":
    sys.exit(main())
