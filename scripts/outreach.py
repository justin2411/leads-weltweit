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


def deliver(to: str, subject: str, text: str, unsub_url: str) -> dict:
    """Sendet eine reine Textmail. MAIL_TRANSPORT=smtp (z. B. Zoho) oder resend.

    Rückgabe: Felder für messages (resend_id bzw. smtp_message_id).
    """
    headers = {"List-Unsubscribe": f"<{unsub_url}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
    if os.environ.get("MAIL_TRANSPORT", "smtp") == "resend":
        import requests
        r = requests.post(RESEND_URL, timeout=30, headers={
            "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
        }, json={"from": os.environ["MAIL_FROM"], "to": [to], "subject": subject, "text": text, "headers": headers})
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
        needed = ["MAIL_FROM", "SENDER_NAME", "SENDER_POSTAL_ADDRESS", "APP_BASE_URL"]
        needed += ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] if transport == "smtp" else ["RESEND_API_KEY"]
        for var in needed:
            if not os.environ.get(var):
                raise SystemExit(f"{var} fehlt")

    today = dt.date.today().isoformat()
    sent_today: dict[str, int] = {}
    for row in db.select("messages", {"status": "eq.sent", "sent_at": f"gte.{today}",
                                      "select": "id,prospects(country)"}):
        c = row["prospects"]["country"]
        sent_today[c] = sent_today.get(c, 0) + 1

    rows = db.select("messages", {"status": "eq.approved", "order": "approved_at.asc", "limit": str(args.limit),
                                  "select": "*,prospects(*),experiments(*)"})
    base = os.environ.get("APP_BASE_URL", "https://example.invalid").rstrip("/")
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

        limit = int(rules.get("daily_limit", cfg["defaults"]["daily_limit"]))
        if sent_today.get(country, 0) >= limit:
            print(f"Tageslimit {country} ({limit}) erreicht, Rest morgen")
            continue

        if live and not args.owner_ok:
            ok, why = _auto_send_allowed(db, e)
            if not ok:
                print(f"NICHT GESENDET {m['to_email']}: keine Freigabe für diesen Lauf ({why})")
                continue

        unsub = f"{base}/api/unsubscribe?t={m['unsubscribe_token']}"
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
    print(f"\n{'gesendet' if live else 'Probelauf, würde senden'}: {n_sent}")
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
    s.set_defaults(func=cmd_send)

    args = ap.parse_args(argv)
    if args.cmd == "check" and not args.db and not (args.email and args.country):
        ap.error("check braucht --db oder --email und --country")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
