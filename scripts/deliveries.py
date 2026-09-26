#!/usr/bin/env python3
"""Wöchentliche Lead-Lieferung an zahlende Kunden (CLAUDE.md Abschnitt 8: montags 07:00).

  python scripts/deliveries.py add-customer --company "Acme Recruitment Ltd" --country UK \
      --email ops@acme.co.uk --segment S1 --areas "Greater Manchester" --price 199 --max-per-week 30
  python scripts/deliveries.py prepare          # Lieferungen der Woche vorbereiten (+ Vorschau an Inhaber)
  python scripts/deliveries.py approve --subscription <id>   # erste Lieferung eines Kunden freigeben
  python scripts/deliveries.py send             # freigegebene Lieferungen versenden

Regeln:
- Preise legt nur der Inhaber fest (--price ist Pflicht, kommt von ihm).
- Die erste Lieferung jedes Kunden gibt der Inhaber frei; danach laufen Lieferungen automatisch.
- Jeder Lead geht an ein Abo höchstens einmal; nur Leads aus den gebuchten Regionen, nur Firmendaten.
"""
from __future__ import annotations

import argparse
import base64
import csv
import datetime as dt
import io
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.rules import brand  # noqa: E402

FRESH_DAYS = 14          # nur Leads, die höchstens so alt sind
DEFAULT_MAX = 30         # Leads pro Woche, falls im Abo nichts steht
CSV_HEADER = ["company", "legal_form", "location", "event", "event_date", "source", "source_url", "checked_on",
              "urgency", "urgency_reason", "opener"]


def week_start(today: dt.date | None = None) -> dt.date:
    today = today or dt.date.today()
    return today - dt.timedelta(days=today.weekday())


def select_leads(leads: list[dict], sub: dict, already: set[str], details: dict[str, dict],
                 match=None) -> list[dict]:
    """Passende, noch nicht gelieferte Leads für ein Abo, höchstens max_per_week, max. 3 je Firma."""
    if match is None:
        from lib.regions import lead_matches as match
    f = sub.get("filters") or {}
    country = f.get("country")
    areas = f.get("areas") or []
    types = set(f.get("signal_types") or [])
    cap = int(f.get("max_per_week") or DEFAULT_MAX)
    picked, per = [], {}
    for l in leads:
        if l["id"] in already or l["segment_id"] != sub["segment_id"] or l["country"] != country:
            continue
        if types and l["signal_type"] not in types:
            continue
        co = l.get("watch_companies") or {}
        if areas and not any(match(country, a, co, details.get(l["id"])) for a in areas):
            continue
        if per.get(l["company_id"], 0) >= 3:
            continue
        per[l["company_id"]] = per.get(l["company_id"], 0) + 1
        picked.append(l)
        if len(picked) >= cap:
            break
    return picked


def to_csv(leads: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_HEADER)
    for l in leads:
        co = l.get("watch_companies") or {}
        w.writerow([co.get("name", ""), co.get("legal_form") or "",
                    ", ".join(x for x in (co.get("city"), co.get("region")) if x),
                    l["event_summary"], l.get("event_date") or "", l["source_name"], l.get("source_url") or "",
                    l["source_date"], l["urgency"], l["urgency_reason"], l["opener"]])
    return buf.getvalue().encode("utf-8")


def delivery_text(lang: str, n: int, period: dt.date, areas: list[str]) -> tuple[str, str]:
    from drafts import signature
    where = ", ".join(areas)
    if lang == "fr":
        subject = f"Vos nouvelles pistes – semaine du {period:%d/%m/%Y}"
        body = (f"Bonjour,\n\nVous trouverez ci-joint vos {n} nouvelles pistes de la semaine"
                + (f" pour {where}" if where else "") + ".\n\n"
                "Chaque ligne indique l'événement, sa date, la source officielle et une phrase d'accroche. "
                "Si vous souhaitez ajuster les villes ou les types de signaux, répondez simplement à ce message.\n\n"
                "Bien cordialement,\n" + signature(lang))
        if n == 0:
            body = ("Bonjour,\n\nCette semaine, nous n'avons trouvé aucune nouvelle piste correspondant à vos critères"
                    + (f" pour {where}" if where else "") + ". Nous préférons ne rien envoyer plutôt que des pistes "
                    "hors de votre zone. Les prochaines arriveront avec la livraison de la semaine prochaine.\n\n"
                    "Bien cordialement,\n" + signature(lang))
        return subject, body
    subject = f"Your new leads – week of {period:%d %B %Y}"
    body = (f"Hello,\n\nPlease find attached your {n} new leads for this week"
            + (f" in {where}" if where else "") + ".\n\n"
            "Each row shows the event, its date, the official source and a suggested opening line. "
            "If you would like to adjust the towns or signal types, simply reply to this email.\n\n"
            "Best regards,\n" + signature(lang))
    if n == 0:
        body = ("Hello,\n\nThis week we found no new leads matching your criteria"
                + (f" in {where}" if where else "") + ". We would rather send nothing than leads outside your area; "
                "new ones will follow with next week's delivery.\n\nBest regards,\n" + signature(lang))
    return subject, body


def _resend(to: list[str], subject: str, text: str, html: str | None = None,
            attachments: list[tuple[str, bytes]] | None = None) -> str | None:
    import requests
    payload = {"from": os.environ["MAIL_FROM"], "to": to, "subject": subject, "text": text}
    if html:
        payload["html"] = html
    if os.environ.get("REPLY_TO"):
        payload["reply_to"] = os.environ["REPLY_TO"]
    if attachments:
        payload["attachments"] = [{"filename": n, "content": base64.b64encode(b).decode()} for n, b in attachments]
    r = requests.post("https://api.resend.com/emails", timeout=30, json=payload,
                      headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
    if r.status_code >= 400:
        raise RuntimeError(f"Resend {r.status_code} {r.text}")
    return r.json().get("id")


def _lang(country: str) -> str:
    return "fr" if country == "FR" else "en"


def _load_leads(db, since: dt.date) -> tuple[list[dict], dict[str, dict]]:
    leads = db.select_all("leads", {"created_at": f"gte.{since.isoformat()}", "status": "neq.expired",
                                    "select": "id,segment_id,country,signal_type,event_summary,event_date,source_name,"
                                              "source_url,source_date,urgency,urgency_reason,opener,company_id,"
                                              "observation_ids,watch_companies(name,legal_form,city,region,address)",
                                    "order": "event_date.desc,id"})
    details = {}
    us_obs = {l["observation_ids"][0]: l["id"] for l in leads if l["country"] == "US" and l.get("observation_ids")}
    ids = list(us_obs)
    for i in range(0, len(ids), 100):
        for o in db.select("observations", {"id": f"in.({','.join(ids[i:i + 100])})", "select": "id,details"}):
            details[us_obs[o["id"]]] = o.get("details") or {}
    return leads, details


def cmd_add_customer(args) -> int:
    from lib.db import DB
    db = DB()
    areas = [a.strip() for a in (args.areas or "").split(";") if a.strip()]
    cust = db.insert("customers", {"company_name": args.company, "country": args.country,
                                   "billing_email": args.email, "status": args.status,
                                   "prospect_id": args.prospect, "notes": args.notes})[0]
    filters = {"country": args.country, "areas": areas, "max_per_week": args.max_per_week}
    if args.signal_types:
        filters["signal_types"] = [s.strip() for s in args.signal_types.split(",")]
    sub = db.insert("subscriptions", {"customer_id": cust["id"], "segment_id": args.segment, "filters": filters,
                                      "price_eur_month": args.price})[0]
    print(f"Kunde {cust['id']} angelegt, Abo {sub['id']} ({args.segment}, {args.country}, {areas})")
    print("Die erste Lieferung wird vorbereitet und dem Inhaber zur Freigabe geschickt.")
    return 0


def cmd_prepare(args) -> int:
    from lib.db import DB
    db = DB()
    period = week_start()
    subs = db.select("subscriptions", {"status": "eq.active",
                                       "select": "*,customers(company_name,country,billing_email,status)"})
    subs = [s for s in subs if s["customers"]["status"] in ("trial", "active")]
    if not subs:
        print("Keine aktiven Abos – nichts zu liefern.")
        return 0
    leads, details = _load_leads(db, dt.date.today() - dt.timedelta(days=FRESH_DAYS))
    previews = []
    for s in subs:
        if db.select("deliveries", {"subscription_id": f"eq.{s['id']}", "period_start": f"eq.{period}",
                                    "select": "id"}):
            print(f"= {s['customers']['company_name']}: Lieferung für {period} existiert schon")
            continue
        already = set()
        for d in db.select_all("deliveries", {"subscription_id": f"eq.{s['id']}", "select": "lead_ids"}):
            already.update(d["lead_ids"] or [])
        picked = select_leads(leads, s, already, details)
        first = not s["first_delivery_approved"]
        status = "prepared" if first else "approved"
        db.insert("deliveries", {"subscription_id": s["id"], "period_start": period.isoformat(),
                                 "lead_ids": [l["id"] for l in picked], "status": status,
                                 "approved_at": None if first else dt.datetime.now(dt.timezone.utc).isoformat(),
                                 "note": "erste Lieferung – wartet auf Freigabe des Inhabers" if first else None})
        print(f"+ {s['customers']['company_name']}: {len(picked)} Leads ({'wartet auf Freigabe' if first else 'freigegeben'})")
        if first:
            previews.append((s, picked))
    if previews and args.notify:
        _notify_first(previews)
    return 0


def _notify_first(previews: list[tuple[dict, list[dict]]]) -> None:
    from responder import alert_address
    owner = os.environ.get("OWNER_EMAIL") or alert_address()
    if not owner:
        print("WARNUNG: OWNER_EMAIL fehlt – Vorschau nur im Protokoll")
        return
    lines, files = ["Erste Lieferung neuer Kunden – bitte prüfen und freigeben.\n"], []
    for s, picked in previews:
        c = s["customers"]
        lines.append(f"- {c['company_name']} ({c['country']}, {s['segment_id']}, {', '.join(s['filters'].get('areas') or [])}): "
                     f"{len(picked)} Leads an {c['billing_email']}")
        lines.append(f"  Freigabe: GitHub → Actions → kundenlieferung → Run workflow, Befehl 'approve', Abo {s['id']}")
        files.append((re.sub(r"[^A-Za-z0-9]+", "-", c["company_name"]).strip("-") + ".csv", to_csv(picked)))
    lines.append("\nOder im Chat mit Claude: „Lieferung für <Firma> freigeben“.")
    _resend([owner], f"Freigabe: erste Lieferung für {len(previews)} Kunden", "\n".join(lines), attachments=files)
    print(f"Vorschau an {owner} geschickt")


def cmd_approve(args) -> int:
    from lib.db import DB
    db = DB()
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    db.update("subscriptions", {"id": args.subscription}, {"first_delivery_approved": True, "updated_at": now})
    rows = db.update("deliveries", {"subscription_id": args.subscription, "status": "prepared"},
                     {"status": "approved", "approved_at": now, "note": f"freigegeben: {args.freigabe}"})
    print(f"Abo {args.subscription}: {len(rows)} Lieferung(en) freigegeben; künftige Lieferungen laufen automatisch")
    return 0


def cmd_send(args) -> int:
    from lib.db import DB
    from lib.html_email import render
    db = DB()
    todo = db.select("deliveries", {"status": "eq.approved", "select": "*,subscriptions(segment_id,filters,status,"
                                                                       "customers(company_name,country,billing_email,status))"})
    for d in todo:
        s = d["subscriptions"]
        c = s["customers"]
        if s["status"] != "active" or c["status"] not in ("trial", "active"):
            print(f"- {c['company_name']}: Abo nicht aktiv, übersprungen")
            continue
        ids = d["lead_ids"] or []
        leads = []
        for i in range(0, len(ids), 100):
            leads += db.select("leads", {"id": f"in.({','.join(ids[i:i + 100])})",
                                         "select": "id,event_summary,event_date,source_name,source_url,source_date,"
                                                   "urgency,urgency_reason,opener,watch_companies(name,legal_form,city,region)"})
        lang = _lang(c["country"])
        period = dt.date.fromisoformat(d["period_start"])
        subject, body = delivery_text(lang, len(leads), period, s["filters"].get("areas") or [])
        footer = f"{brand()} · {os.environ.get('SENDER_POSTAL_ADDRESS', '')}".strip(" ·")
        files = [(f"leads-{period.isoformat()}.csv", to_csv(leads))] if leads else None
        if not args.live:
            print(f"[Probelauf] {c['company_name']} <{c['billing_email']}>: {len(leads)} Leads, Betreff „{subject}“")
            continue
        _resend([c["billing_email"]], subject, body + "\n\n" + footer, render(body, footer, lang), files)
        db.update("deliveries", {"id": d["id"]}, {"status": "sent", "sent_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        print(f"✓ {c['company_name']}: {len(leads)} Leads gesendet")
    if not todo:
        print("Keine freigegebenen Lieferungen.")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add-customer")
    a.add_argument("--company", required=True)
    a.add_argument("--country", required=True, choices=["UK", "US", "FR", "IE", "NL", "SE", "BE", "DE", "AT", "CH"])
    a.add_argument("--email", required=True, help="Lieferadresse des Kunden")
    a.add_argument("--segment", required=True)
    a.add_argument("--areas", default="", help="Regionen, mit ; getrennt (z. B. 'Greater Manchester;West Yorkshire')")
    a.add_argument("--signal-types", default="", help="optional, mit Komma getrennt")
    a.add_argument("--max-per-week", type=int, default=DEFAULT_MAX)
    a.add_argument("--price", type=float, required=True, help="Monatspreis – nur vom Inhaber")
    a.add_argument("--status", default="active", choices=["trial", "active"])
    a.add_argument("--prospect")
    a.add_argument("--notes")
    a.set_defaults(fn=cmd_add_customer)
    p = sub.add_parser("prepare")
    p.add_argument("--no-notify", dest="notify", action="store_false")
    p.set_defaults(fn=cmd_prepare)
    ap_ = sub.add_parser("approve")
    ap_.add_argument("--subscription", required=True)
    ap_.add_argument("--freigabe", default="Inhaber")
    ap_.set_defaults(fn=cmd_approve)
    s = sub.add_parser("send")
    s.add_argument("--live", action="store_true")
    s.set_defaults(fn=cmd_send)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
