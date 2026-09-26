#!/usr/bin/env python3
"""Signalwerk Outreach: prüfen, Entwürfe prüfen, freigegebene Mails senden.

Beispiele:
  python scripts/outreach.py check --email info@acme.co.uk --country UK --legal-form Ltd \
      --website acme.co.uk --source-url https://acme.co.uk/contact --size-note "12 staff"
  python scripts/outreach.py check --db                 # alle ungeprüften prospects
  python scripts/outreach.py lint --subject "..." --body-file draft.txt
  python scripts/outreach.py lint --db                  # alle Entwürfe (status draft)
  python scripts/outreach.py send                       # Probelauf: zeigt nur, was gesendet würde
  python scripts/outreach.py send --live --owner-ok "Freigabe per Chat 2026-10-01"

Versand-Regeln (CLAUDE.md Abschnitt 2 und 6):
  - nur status = approved (vom Inhaber im Dashboard freigegeben)
  - live nur mit --owner-ok (ausdrückliche Freigabe dieses Laufs) ODER Dauerfreigabe des Experiments
    mit mind. 30 fehlerfrei gesendeten Mails ohne Beschwerde
  - vor jedem Versand erneut: Land, Sperrliste, Schreibregeln
  - Tageslimit je Land aus countries.yaml
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.rules import (  # noqa: E402
    check_prospect, country_rules, lint_draft, load_countries, render_footer,
)

RESEND_URL = "https://api.resend.com/emails"


def cmd_check(args) -> int:
    cfg = load_countries()
    if not args.db:
        res = check_prospect(email=args.email, country=args.country, website=args.website,
                             legal_form=args.legal_form, source_url=args.source_url,
                             size_note=args.size_note, cfg=cfg)
        print(res.summary())
        return 0 if res.ok else 1

    from lib.db import DB
    db = DB()
    rows = db.select("prospects", {"check_status": "eq.unchecked", "limit": str(args.limit)})
    bad = 0
    for p in rows:
        suppressed = bool(p.get("email")) and db.is_suppressed(p["email"])
        suppressed = suppressed or bool(db.select("suppression", {"kind": "eq.domain", "value": f"eq.{p['domain']}"}))
        res = check_prospect(email=p.get("email"), country=p["country"], website=p.get("website"),
                             legal_form=p.get("legal_form"), source_url=p.get("source_url"),
                             size_note=p.get("size_note"), suppressed=suppressed, cfg=cfg)
        db.update("prospects", {"id": p["id"]}, {
            "check_status": "ok" if res.ok else "rejected",
            "check_reason": res.summary(),
            "email_is_generic": None if not p.get("email") else p["email"].split("@")[0].lower()
            in {x.lower() for x in cfg.get("generic_local_parts", [])},
            "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        })
        bad += 0 if res.ok else 1
        print(f"{p['company_name']:<40} {p['country']}  {res.summary()}")
    print(f"\n{len(rows)} geprüft, {bad} abgelehnt")
    return 0


def cmd_lint(args) -> int:
    if not args.db:
        body = Path(args.body_file).read_text(encoding="utf-8") if args.body_file else args.body
        res = lint_draft(args.subject, body, args.language)
        print(res.summary())
        return 0 if res.ok else 1

    from lib.db import DB
    db = DB()
    rows = db.select("messages", {"status": "eq.draft", "limit": str(args.limit)})
    for m in rows:
        res = lint_draft(m["subject"], m["body"], m.get("language") or "en")
        db.update("messages", {"id": m["id"]}, {"check_errors": res.errors})
        print(f"{m['to_email']:<40} {res.summary()}")
    return 0


def _auto_send_allowed(db, experiment: dict) -> tuple[bool, str]:
    if not experiment.get("auto_send_approved"):
        return False, "keine Dauerfreigabe"
    stats = db.select("experiment_stats", {"experiment_id": f"eq.{experiment['id']}"})
    s = stats[0] if stats else {}
    if s.get("complained", 0) > 0:
        return False, "Spam-Beschwerde vorhanden"
    if s.get("sent", 0) - s.get("bounced", 0) < 30:
        return False, f"erst {s.get('sent', 0)} gesendet, {s.get('bounced', 0)} Bounces (mind. 30 fehlerfrei nötig)"
    return True, "Dauerfreigabe"


def unsubscribe_target(token: str) -> str | None:
    """Link zur Abmeldung, oder None = Abmeldung per Antwort (UNSUBSCRIBE_MODE=reply, Standard)."""
    if os.environ.get("UNSUBSCRIBE_MODE", "reply") == "link":
        return f"{os.environ['APP_BASE_URL'].rstrip('/')}/api/unsubscribe?t={token}"
    return None


def unsubscribe_headers(unsub_url: str | None) -> dict:
    if unsub_url:
        return {"List-Unsubscribe": f"<{unsub_url}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
    reply_to = os.environ.get("REPLY_TO") or os.environ["MAIL_FROM"]
    addr = reply_to.split("<")[-1].strip(">").strip()
    return {"List-Unsubscribe": f"<mailto:{addr}?subject=unsubscribe>"}


def deliver(to: str, subject: str, text: str, unsub_url: str | None) -> dict:
    """Sendet eine reine Textmail. MAIL_TRANSPORT=smtp (z. B. Zoho) oder resend.

    Rückgabe: Felder für messages (resend_id bzw. smtp_message_id).
    """
    headers = unsubscribe_headers(unsub_url)
    reply_to = os.environ.get("REPLY_TO")
    if os.environ.get("MAIL_TRANSPORT", "smtp") == "resend":
        import requests
        r = requests.post(RESEND_URL, timeout=30, headers={
            "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
        }, json={"from": os.environ["MAIL_FROM"], "to": [to], "subject": subject, "text": text, "headers": headers,
                 **({"reply_to": reply_to} if reply_to else {})})
        if r.status_code >= 400:
            raise RuntimeError(f"Resend {r.status_code} {r.text}")
        return {"resend_id": r.json().get("id")}

    import smtplib
    from email.message import EmailMessage
    from email.utils import formatdate, make_msgid

    sender = os.environ["MAIL_FROM"]
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Date"] = formatdate(localtime=False)
    msg["Message-ID"] = make_msgid(domain=sender.rsplit("@", 1)[-1].strip(">"))
    for k, v in headers.items():
        msg[k] = v
    msg.set_content(text)  # nur Text: kein Öffnungs-Tracking
    port = int(os.environ.get("SMTP_PORT", "465"))
    cls = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
    with cls(os.environ["SMTP_HOST"], port, timeout=30) as smtp:
        if port != 465:
            smtp.starttls()
        smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(msg)
    return {"smtp_message_id": msg["Message-ID"]}


def cmd_send(args) -> int:
    from lib.db import DB

    cfg = load_countries()
    db = DB()
    live = args.live
    if live:
        transport = os.environ.get("MAIL_TRANSPORT", "smtp")
        needed = ["MAIL_FROM", "SENDER_NAME", "SENDER_POSTAL_ADDRESS"]
        needed += ["APP_BASE_URL"] if os.environ.get("UNSUBSCRIBE_MODE", "reply") == "link" else ["REPLY_TO"]
        needed += ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] if transport == "smtp" else ["RESEND_API_KEY"]
        for var in needed:
            if not os.environ.get(var):
                raise SystemExit(f"{var} fehlt")

    from lib.deliverability import domain_accepts_mail, emergency_stop, interleave, warmup_cap

    # Notbremse über die letzten 30 Tage, über alle Experimente
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()
    recent = db.select("messages", {"status": "eq.sent", "sent_at": f"gte.{since}", "select": "id"})
    ev = db.select("email_events", {"created_at": f"gte.{since}", "type": "in.(bounced,complained)",
                                    "select": "message_id,type"})
    stop = emergency_stop(len(recent), len({e["message_id"] for e in ev if e["type"] == "bounced"}),
                          len({e["message_id"] for e in ev if e["type"] == "complained"}))
    if stop:
        print(f"NOTBREMSE: {stop}")
        return 2

    first = db.select("messages", {"status": "eq.sent", "select": "sent_at", "order": "sent_at.asc", "limit": "1"})
    first_day = dt.date.fromisoformat(first[0]["sent_at"][:10]) if first else None
    cap = warmup_cap(first_day, dt.date.today())

    today = dt.date.today().isoformat()
    sent_today: dict[str, int] = {}
    for row in db.select("messages", {"status": "eq.sent", "sent_at": f"gte.{today}",
                                      "select": "id,prospects(country)"}):
        c = row["prospects"]["country"]
        sent_today[c] = sent_today.get(c, 0) + 1

    rows = interleave(db.select("messages", {"status": "eq.approved", "order": "approved_at.asc",
                                             "limit": str(args.limit), "select": "*,prospects(*),experiments(*)"}))
    already = sum(sent_today.values())
    print(f"Aufwärmphase: heute max. {cap} Mails insgesamt, bereits gesendet: {already}")
    n_sent = 0
    for m in rows:
        p, e = m["prospects"], m["experiments"]
        country = p["country"]
        rules = country_rules(cfg, country)
        problems = []
        if not rules.get("allowed"):
            problems.append(f"Land {country} nicht erlaubt")
        if db.is_suppressed(m["to_email"]):
            problems.append("gesperrt")
        lint = lint_draft(m["subject"], m["body"], m.get("language") or "en")
        problems += lint.errors
        if problems:
            print(f"BLOCKIERT {m['to_email']}: {'; '.join(problems)}")
            if live:
                db.update("messages", {"id": m["id"]}, {"status": "blocked", "blocked_reason": "; ".join(problems)})
            continue

        if sum(sent_today.values()) >= cap:
            print(f"Tagesgrenze der Aufwärmphase ({cap}) erreicht, Rest folgt an den nächsten Tagen")
            break
        if not domain_accepts_mail(m["to_email"].split("@")[-1]):
            print(f"BLOCKIERT {m['to_email']}: Domain nimmt keine Mails an")
            if live:
                db.update("messages", {"id": m["id"]}, {"status": "blocked", "blocked_reason": "kein MX-Eintrag"})
            continue
        limit = int(rules.get("daily_limit", cfg["defaults"]["daily_limit"]))
        if sent_today.get(country, 0) >= limit:
            print(f"Tageslimit {country} ({limit}) erreicht, Rest morgen")
            continue

        if live and not args.owner_ok:
            ok, why = _auto_send_allowed(db, e)
            if not ok:
                print(f"NICHT GESENDET {m['to_email']}: keine Freigabe für diesen Lauf ({why})")
                continue

        unsub = unsubscribe_target(m["unsubscribe_token"])
        footer = render_footer(m.get("language") or "en",
                               sender_name=os.environ.get("SENDER_NAME", "Signalwerk"),
                               postal_address=os.environ.get("SENDER_POSTAL_ADDRESS", "<Postanschrift>"),
                               company=p["company_name"], unsubscribe_url=unsub)
        text = m["body"].rstrip() + "\n\n" + footer
        if not live:
            print(f"PROBELAUF würde senden an {m['to_email']} ({country}, Experiment {e['segment_id']}/{e['variant']}): {m['subject']}")
            sent_today[country] = sent_today.get(country, 0) + 1
            n_sent += 1
            continue

        try:
            provider_fields = deliver(m["to_email"], m["subject"], text, unsub)
        except Exception as exc:  # noqa: BLE001 - Versandfehler melden, nicht abbrechen
            print(f"FEHLER Versand {m['to_email']}: {exc}")
            continue
        db.update("messages", {"id": m["id"]}, {
            "status": "sent", "sent_at": dt.datetime.now(dt.timezone.utc).isoformat(), **provider_fields,
        })
        db.insert("email_events", {"message_id": m["id"], "resend_id": provider_fields.get("resend_id"), "type": "sent",
                                   "note": f"Freigabe: {args.owner_ok or 'Dauerfreigabe'}"})
        if not e.get("started_on"):
            db.update("experiments", {"id": e["id"]}, {"started_on": today, "status": "running"})
        db.update("experiments", {"id": e["id"]}, {"last_sent_on": today})
        sent_today[country] = sent_today.get(country, 0) + 1
        n_sent += 1
        print(f"GESENDET {m['to_email']}")
        if args.pause:
            import random
            import time
            time.sleep(args.pause * random.uniform(0.6, 1.4))  # nicht im Takt senden
    print(f"\n{'gesendet' if live else 'Probelauf, würde senden'}: {n_sent}")
    return 0


def cmd_test(args) -> int:
    """Testmail an den Inhaber: echter Entwurf + echte Fußzeile, Betreff mit [TEST]. Speichert nichts."""
    from drafts import build
    example = {"S1": ("Northpoint Recruitment Ltd", "engineering and manufacturing", "Stockport, Greater Manchester"),
               "S2": ("Brooklyn Pixel Studio LLC", "restaurant websites", "Brooklyn, NY"),
               "S9": ("Northbridge Financial Planning Ltd", "workplace pensions and employee benefits",
                      "Altrincham, Greater Manchester")}
    name, spec, region = example[args.segment]
    p = {"segment_id": args.segment, "country": args.country, "company_name": name,
         "specialization": spec, "region": region}
    subject, body, lang = build(p, os.environ.get("SENDER_NAME", "Signalwerk"))
    lint = lint_draft(subject, body, lang)
    footer = render_footer(lang, sender_name=os.environ.get("SENDER_NAME", "Signalwerk"),
                           postal_address=os.environ.get("SENDER_POSTAL_ADDRESS", ""), company=name,
                           unsubscribe_url=unsubscribe_target("test"))
    text = body.rstrip() + "\n\n" + footer
    print(f"Prüfung: {lint.summary()}\n\nBetreff: [TEST] {subject}\n\n{text}\n")
    out = deliver(args.to, f"[TEST] {subject}", text, unsubscribe_target("test"))
    print(f"gesendet an {args.to}: {out}")
    return 0


RESEND_EVENT_MAP = {"delivered": "delivered", "bounced": "bounced", "complained": "complained",
                    "delivery_delayed": "delivery_delayed", "failed": "failed"}


def cmd_sync(args) -> int:
    """Holt den Zustellstatus gesendeter Mails von Resend (Ersatz für den Webhook, solange Vercel fehlt)."""
    import requests
    from lib.db import DB

    db = DB()
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.days)).isoformat()
    rows = db.select("messages", {"status": "eq.sent", "resend_id": "not.is.null", "sent_at": f"gte.{since}",
                                  "select": "id,to_email,resend_id"})
    counts: dict[str, int] = {}
    for m in rows:
        r = requests.get(f"{RESEND_URL}/{m['resend_id']}", timeout=30,
                         headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
        if r.status_code >= 400:
            print(f"FEHLER {m['to_email']}: {r.status_code} {r.text}")
            continue
        last = r.json().get("last_event")
        typ = RESEND_EVENT_MAP.get(last or "")
        if not typ:
            continue
        counts[typ] = counts.get(typ, 0) + 1
        db.insert("email_events", {"message_id": m["id"], "resend_id": m["resend_id"], "type": typ,
                                   "dedupe_key": f"resend:{m['resend_id']}:{typ}", "note": "Resend-Status (sync)"},
                  upsert_on="dedupe_key", ignore_duplicates=True)
        if typ in ("bounced", "complained"):
            db.rpc("suppress_email", {"p_email": m["to_email"], "p_reason": "bounce" if typ == "bounced" else "complaint",
                                      "p_source": "resend-sync"})
            print(f"GESPERRT {m['to_email']} ({typ})")
    print(f"{len(rows)} Mails geprüft: {counts or 'keine neuen Ereignisse'}")
    return 0


REPLY_KINDS = {"neutral": "reply", "positive": "reply_positive", "negative": "reply_negative",
               "sample": "sample_requested", "optout": "reply_negative"}


def cmd_reply(args) -> int:
    """Antwort erfassen. --kind optout sperrt Adresse und Domain dauerhaft."""
    from lib.db import DB

    db = DB()
    email = args.email.strip().lower()
    msgs = db.select("messages", {"status": "eq.sent", "select": "id,to_email,resend_id", "order": "sent_at.desc",
                                  "or": f"(to_email.eq.{email},to_email.like.*@{email.split('@')[-1]})", "limit": "1"})
    if not msgs:
        print(f"Hinweis: keine gesendete Mail an {email} gefunden; Ereignis ohne Zuordnung")
    note = ("Abmeldung per Antwort. " if args.kind == "optout" else "") + (args.note or "")
    db.insert("email_events", {"message_id": msgs[0]["id"] if msgs else None, "type": REPLY_KINDS[args.kind],
                               "note": note.strip()})
    if args.kind in ("sample", "positive"):
        db.insert("email_events", {"message_id": msgs[0]["id"] if msgs else None, "type": "reply",
                                   "note": "Antwort (automatisch mit erfasst)"})
    if args.kind == "optout":
        for addr in {email, *(m["to_email"] for m in msgs)}:
            db.rpc("suppress_email", {"p_email": addr, "p_reason": "reply_optout", "p_source": "reply"})
        print(f"GESPERRT {email} und Domain")
    print("erfasst")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="Käufer prüfen")
    c.add_argument("--db", action="store_true", help="alle ungeprüften prospects in der Datenbank prüfen")
    c.add_argument("--email"); c.add_argument("--country"); c.add_argument("--website")
    c.add_argument("--legal-form"); c.add_argument("--source-url"); c.add_argument("--size-note")
    c.add_argument("--limit", type=int, default=500)
    c.set_defaults(func=cmd_check)

    l = sub.add_parser("lint", help="Entwurf gegen Schreibregeln prüfen")
    l.add_argument("--db", action="store_true"); l.add_argument("--subject", default="")
    l.add_argument("--body", default=""); l.add_argument("--body-file"); l.add_argument("--language", default="en")
    l.add_argument("--limit", type=int, default=500)
    l.set_defaults(func=cmd_lint)

    s = sub.add_parser("send", help="freigegebene Mails senden (Standard: Probelauf)")
    s.add_argument("--live", action="store_true", help="wirklich senden")
    s.add_argument("--owner-ok", help="Wortlaut/Datum der Freigabe des Inhabers für diesen Lauf")
    s.add_argument("--limit", type=int, default=200)
    s.add_argument("--pause", type=float, default=0, help="Sekunden zwischen zwei Mails (mit Zufall)")
    s.set_defaults(func=cmd_send)

    t = sub.add_parser("test", help="Testmail an den Inhaber (nicht an Käufer)")
    t.add_argument("--to", required=True)
    t.add_argument("--segment", default="S1", choices=["S1", "S2", "S9"])
    t.add_argument("--country", default="UK")
    t.set_defaults(func=cmd_test)

    y = sub.add_parser("sync", help="Zustellstatus von Resend holen, Bounces/Beschwerden sperren")
    y.add_argument("--days", type=int, default=30)
    y.set_defaults(func=cmd_sync)

    r = sub.add_parser("reply", help="Antwort erfassen")
    r.add_argument("--email", required=True)
    r.add_argument("--kind", required=True, choices=sorted(REPLY_KINDS))
    r.add_argument("--note")
    r.set_defaults(func=cmd_reply)

    args = ap.parse_args(argv)
    if args.cmd == "check" and not args.db and not (args.email and args.country):
        ap.error("check braucht --db oder --email und --country")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
