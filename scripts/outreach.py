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
import base64
import datetime as dt
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.rules import (  # noqa: E402
    brand, check_prospect, legal_name, postal_address, country_rules, lint_draft, load_countries, render_footer, suppress,
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


def total_limit() -> int | None:
    """Gesamtgrenze der ersten Welle (config/versand.yaml gesamtgrenze, Inhaber 26.09.2026: 1000 Mails)."""
    from lib.deliverability import _cfg
    raw = _cfg("gesamtgrenze")
    return int(raw) if raw and raw.isdigit() else None


# Funktionsadressen, die nicht für Geschäftsanfragen da sind (Audit 02.10.2026: privacy@, support@ in US-Entwürfen)
ROLE_BLOCK = {"privacy", "gdpr", "dpo", "dataprotection", "legal", "compliance", "abuse", "security", "postmaster",
              "hostmaster", "noreply", "no-reply", "donotreply", "do-not-reply", "support", "help", "helpdesk",
              "billing", "invoices", "invoice", "accounts", "payments", "careers", "jobs", "hr", "recruiting",
              "press", "media", "unsubscribe", "bounce", "bounces", "mailer-daemon"}


def role_address(email: str) -> bool:
    return (email or "").split("@")[0].lower() in ROLE_BLOCK


FOLLOWUP_MAX_DAYS = 11  # Nachfassmail spätestens 11 Tage nach der Erstmail (geplant: nach 4 Tagen)


def followup_block_reason(db, m: dict) -> str | None:
    """Nachfassmails beim Versand erneut prüfen: seit dem Anlegen kann eine Antwort, Probe-Anfrage oder ein Bounce
    eingegangen sein. Grund zum Blockieren oder None."""
    from followups import NEGATIVE
    kind = m.get("kind") or "initial"
    if kind == "initial":
        return None
    parent_id = m.get("parent_id")
    if not parent_id:
        rows = db.select("messages", {"prospect_id": f"eq.{m['prospect_id']}", "experiment_id": f"eq.{m['experiment_id']}",
                                      "kind": "eq.initial", "select": "id"})
        parent_id = rows[0]["id"] if rows else None
    evs = db.select("email_events", {"message_id": f"eq.{parent_id}", "select": "type,created_at"}) if parent_id else []
    if kind == "followup":
        hit = sorted({e["type"] for e in evs if e["type"] in NEGATIVE})
        if hit:
            return f"Nachfassmail überholt: Ereignis {', '.join(hit)} zur Erstmail"
        if db.select("sample_requests", {"email": f"eq.{m['to_email'].lower()}", "status": "in.(new,sent)",
                                         "select": "id"}):
            return "Nachfassmail überholt: Probe über die Landingpage angefordert"
        # Nachfassen nur zeitnah: eine Woche nach dem geplanten Tag (4 Tage nach der Erstmail) wirkt sie wie Spam
        sent = db.select("messages", {"id": f"eq.{parent_id}", "select": "sent_at"}) if parent_id else []
        sent_at = (sent[0].get("sent_at") if sent else None) or ""
        if sent_at and sent_at[:10] < (dt.date.today() - dt.timedelta(days=FOLLOWUP_MAX_DAYS)).isoformat():
            return f"Nachfassmail zu spät: Erstmail vom {sent_at[:10]} (mehr als {FOLLOWUP_MAX_DAYS} Tage)"
        return None
    # sample_followup: nur, solange nach der Probe nichts mehr kam (gleiche Regel wie followups.py)
    sample_at = min((e["created_at"] for e in evs if e["type"] == "sample_requested"), default=None)
    later = sorted({e["type"] for e in evs if sample_at and e["created_at"] > sample_at
                    and e["type"] in ("reply", "reply_positive", "reply_negative", "unsubscribed", "complained",
                                      "bounced")})
    if later:
        return f"Nachfrage zur Probe überholt: Ereignis {', '.join(later)} nach der Probe"
    return None


def unsubscribe_target(token: str) -> str | None:
    """Link zur Abmeldung, oder None = Abmeldung per Antwort (UNSUBSCRIBE_MODE=reply, Standard)."""
    if os.environ.get("UNSUBSCRIBE_MODE", "reply") == "link":
        return f"{os.environ['APP_BASE_URL'].rstrip('/')}/api/unsubscribe?t={token}"
    return None


LANDING_LINE = {"en": "How it works in under a minute, and your free sample with one click: {url}",
                "fr": "Comment ça marche en une minute, et votre échantillon gratuit en un clic : {url}"}


def landing_link(db, cache: dict, segment_id: str, country: str, token: str) -> str | None:
    """Persönlicher Link zur Landingpage (/<land>/<segment>?r=<token>), nur wenn die Seite live ist."""
    base = (os.environ.get("APP_BASE_URL") or os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").rstrip("/")
    if not base or not token:
        return None
    key = (segment_id, country)
    if key not in cache:
        rows = db.select("landing_pages", {"segment_id": f"eq.{segment_id}", "country": f"eq.{country}",
                                           "status": "eq.live", "select": "slug"})
        cache[key] = rows[0]["slug"] if rows else None
    return f"{base}/{cache[key]}?r={token}" if cache[key] else None


def unsubscribe_headers(unsub_url: str | None) -> dict:
    if unsub_url:
        return {"List-Unsubscribe": f"<{unsub_url}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
    reply_to = os.environ.get("REPLY_TO") or os.environ["MAIL_FROM"]
    addr = reply_to.split("<")[-1].strip(">").strip()
    return {"List-Unsubscribe": f"<mailto:{addr}?subject=unsubscribe>"}


def _country_area(country: str) -> str | None:
    """Landesweit statt regional (Inhaber 27.09.2026): 'the UK', 'toute la France' für den Probe-Knopf."""
    from drafts import LAND
    if (country or "").upper() == "FR":
        return "toute la France"
    return LAND.get((country or "").upper())


def html_version(body: str, footer: str, lang: str, company: str | None = None,
                 region: str | None = None, url: str | None = None, segment: str | None = None,
                 plan: bool = False) -> str | None:
    """Gestaltete HTML-Alternative (ohne Bilder/Tracking). EMAIL_HTML=0 schaltet sie ab.
    segment S2: kleine Ablauf-Grafik unter der Signatur (Inhaber 02.10.2026).
    plan: url ist die Buchungsseite (Nachfrage nach der Probe) -> Knopf „Choose your plan“."""
    if os.environ.get("EMAIL_HTML", "1") == "0":
        return None
    from lib.html_email import cta_button, page_button, plan_button, process_strip, render
    extra = process_strip(lang) if segment == "S2" else ""
    if url:  # Knopf zur persönlichen Landingpage; die Textzeile mit dem nackten Link entfällt im HTML
        body = "\n\n".join(p for p in re.split(r"\n\s*\n", body) if url not in p)
        return render(body, footer, lang, plan_button(url, lang) if plan else page_button(url, lang), extra=extra)
    cta = cta_button(company, region, lang) if company else ""
    return render(body, footer, lang, cta, extra=extra)


def _plan_url(body: str) -> str | None:
    """Link zur Buchungsseite aus der Textfassung der Nachfrage nach der Probe."""
    m = re.search(r"https?://\S+/start\b", body)
    return m.group(0) if m else None


def deliver(to: str, subject: str, text: str, unsub_url: str | None, html: str | None = None,
            mailbox: dict | None = None, attachments: list[tuple[str, bytes]] | None = None) -> dict:
    """Sendet eine reine Textmail. MAIL_TRANSPORT=smtp (z. B. Strato) oder resend.
    mailbox: eines der Postfächer aus lib.mailboxes (Standard: Postfach 1 aus SMTP_*/MAIL_FROM).

    Rückgabe: Felder für messages (resend_id bzw. smtp_message_id, sent_from).
    """
    headers = unsubscribe_headers(unsub_url)
    reply_to = os.environ.get("REPLY_TO")
    if os.environ.get("MAIL_TRANSPORT", "smtp") == "resend":
        import requests
        r = requests.post(RESEND_URL, timeout=30, headers={
            "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
        }, json={"from": os.environ["MAIL_FROM"], "to": [to], "subject": subject, "text": text, "headers": headers,
                 **({"html": html} if html else {}),
                 **({"attachments": [{"filename": n, "content": base64.b64encode(b).decode()}
                                     for n, b in attachments]} if attachments else {}),
                 **({"reply_to": reply_to} if reply_to else {})})
        if r.status_code >= 400:
            raise RuntimeError(f"Resend {r.status_code} {r.text}")
        return {"resend_id": r.json().get("id")}

    import smtplib
    from email.message import EmailMessage
    from email.utils import formatdate, make_msgid

    sender = mailbox["from"] if mailbox else os.environ["MAIL_FROM"]
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
    msg.set_content(text)  # Text-Version immer dabei; HTML ohne Bilder, kein Öffnungs-Tracking
    if html:
        msg.add_alternative(html, subtype="html")
    for name, data in attachments or []:
        msg.add_attachment(data, maintype="application", subtype="pdf" if name.endswith(".pdf") else "octet-stream",
                           filename=name)
    if mailbox:
        host, port, user, password = mailbox["host"], mailbox["port"], mailbox["user"], mailbox["password"]
    else:
        host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT") or "465")
        user, password = os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"]
    cls = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
    with cls(host, port, timeout=30) as smtp:
        if port != 465:
            smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(msg)
    return {"smtp_message_id": msg["Message-ID"], **({"sent_from": mailbox["from"]} if mailbox else {})}


def brochure(segment, country):
    from responder import brochure as _b
    return _b(segment, country)


def cmd_send(args) -> int:
    from lib.db import DB

    cfg = load_countries()
    db = DB()
    live = args.live
    # Hauptschalter im Dashboard (Inhaber 03.10.2026): „Pause“ hält alle Kaltmails und Nachfassmails sofort an;
    # weiter geht es nur, wenn der Inhaber im Dashboard wieder auf „Läuft“ stellt.
    from lib.owner_settings import ack, country_limit, load as load_owner_settings
    owner = load_owner_settings(db)
    ack(db, "versand", ["send_paused", "send_countries_off", "send_country_limits"], owner)
    if owner["send_paused"]:
        print("PAUSE: Versand im Dashboard angehalten (Inhaber) – nichts gesendet")
        return 0
    if live:
        transport = os.environ.get("MAIL_TRANSPORT", "smtp")
        if transport == "resend":
            raise SystemExit("Kaltmails über Resend sind verboten (Resend-Bedingungen, Inhaber 26.09.2026) – "
                             "MAIL_TRANSPORT=smtp mit eigenem Postfach verwenden")
        needed = ["MAIL_FROM", "SENDER_NAME"]  # Anschrift fest in lib.rules (03.10.2026)
        needed += ["APP_BASE_URL"] if os.environ.get("UNSUBSCRIBE_MODE", "reply") == "link" else ["REPLY_TO"]
        needed += ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] if transport == "smtp" else ["RESEND_API_KEY"]
        for var in needed:
            if not os.environ.get(var):
                raise SystemExit(f"{var} fehlt")

    from lib.deliverability import count_bounces, domain_accepts_mail, emergency_stop, interleave, window_start

    # Notbremse über die letzten 30 Tage, über alle Experimente; je Adresse gezählt (Inhaber 03.10.2026)
    since = window_start(dt.datetime.now(dt.timezone.utc)).isoformat()
    recent = db.select("messages", {"status": "eq.sent", "sent_at": f"gte.{since}", "select": "id"})
    ev = db.select("email_events", {"created_at": f"gte.{since}", "type": "in.(bounced,complained)",
                                    "select": "message_id,type,payload,messages(to_email)"})
    for e in ev:
        e["to_email"] = (e.get("messages") or {}).get("to_email")
    bounced, complained = count_bounces(ev)
    stop = emergency_stop(len(recent), bounced, complained)
    if stop:
        print(f"NOTBREMSE: {stop}")
        return 2

    # Postfächer (lib/mailboxes.py): jedes mit eigener Tagesmenge, zusammen die Tagesgrenze
    from lib.mailboxes import box_cap, box_of, mailboxes, pick
    boxes = mailboxes() or [{"n": 1, "from": os.environ.get("MAIL_FROM", "")}]
    firsts: dict[int, dt.date] = {}
    for row in db.select_all("messages", {"status": "eq.sent", "select": "sent_at,sent_from", "order": "sent_at.asc"}):
        firsts.setdefault(box_of(row.get("sent_from"), boxes), dt.date.fromisoformat(row["sent_at"][:10]))
    caps = {b["n"]: box_cap(b, firsts.get(b["n"]), dt.date.today()) for b in boxes}
    cap = sum(caps.values())

    # Dashboard (Inhaber 03.10.2026): Mails pro Tag je Land (nie über countries.yaml daily_limit), Länder aus
    owner_limits, owner_off = owner["send_country_limits"], owner["send_countries_off"]
    if owner_limits:
        print("Tageslimit je Land (Dashboard): " + ", ".join(f"{k} {v}" for k, v in sorted(owner_limits.items())))
    if owner_off:
        print("Im Dashboard ausgeschaltet: " + ", ".join(sorted(owner_off)))

    today = dt.date.today().isoformat()
    sent_today: dict[str, int] = {}
    sent_box: dict[int, int] = {}
    pages: dict = {}  # (segment, land) -> slug der Live-Seite
    for row in db.select("messages", {"status": "eq.sent", "sent_at": f"gte.{today}",
                                      "select": "id,sent_from,prospects(country)"}):
        c = row["prospects"]["country"]
        sent_today[c] = sent_today.get(c, 0) + 1
        k = box_of(row.get("sent_from"), boxes)
        sent_box[k] = sent_box.get(k, 0) + 1

    sel = "*,prospects(*),experiments(*)"
    # Nachfassmails zuerst: ihr Zeitpunkt (4 Tage nach der Erstmail, 3 Tage nach der Probe) zählt, sonst warten sie
    # hinter dem Rückstau neuer Erstmails.
    # Fokus-Tests zuerst (config/fokus.yaml), innerhalb Fokus und Rest jeweils abwechselnd je Experiment
    from lib.fokus import focus_only, focus_pairs
    pairs = set(focus_pairs())
    # Nur Fokus: schon in der Abfrage auf die Fokus-Experimente einschränken. Sonst füllen ältere Entwürfe ruhender
    # Branchen das Limit und Fokus-Entwürfe (z. B. S2/FR, später freigegeben) kommen nie an die Reihe (03.10.2026).
    only: dict = {}
    exp_ids: list[str] = []
    if focus_only() and pairs:
        exp_ids = [x["id"] for x in db.select_all("experiments", {"select": "id,segment_id,country"})
                   if (x.get("segment_id"), x.get("country")) in pairs]
        only = {"experiment_id": "in.(" + ",".join(exp_ids) + ")"} if exp_ids else {"experiment_id": "is.null"}
    later = db.select("messages", {"status": "eq.approved", "kind": "neq.initial", "order": "approved_at.asc",
                                   "limit": str(args.limit), "select": sel, **only})
    if only and exp_ids:
        # je Fokus-Experiment eigener Anteil, damit interleave() alle Länder mischen kann (US/UK/FR gleichrangig)
        per = max(50, args.limit // len(exp_ids))
        initial = [m for x in exp_ids for m in db.select("messages", {
            "status": "eq.approved", "kind": "eq.initial", "experiment_id": f"eq.{x}",
            "order": "approved_at.asc", "limit": str(per), "select": sel})]
    else:
        initial = db.select("messages", {"status": "eq.approved", "kind": "eq.initial",
                                         "order": "approved_at.asc", "limit": str(args.limit), "select": sel, **only})
    in_focus = lambda m: ((m.get("experiments") or {}).get("segment_id"), (m.get("prospects") or {}).get("country")) in pairs
    if focus_only():
        # Andere Branchen ruhen (Inhaber 02.10.2026): ihre Entwürfe bleiben freigegeben liegen, nichts wird gesendet
        skipped = len([m for m in later + initial if not in_focus(m)])
        later, initial = [m for m in later if in_focus(m)], [m for m in initial if in_focus(m)]
        if skipped:
            print(f"Nur Fokus-Tests ({', '.join(f'{a}/{b}' for a, b in sorted(pairs))}): {skipped} andere Entwürfe ruhen")
    rows = later + interleave([m for m in initial if in_focus(m)]) + interleave([m for m in initial if not in_focus(m)])
    already = sum(sent_today.values())
    print(f"Aufwärmphase: heute max. {cap} Mails insgesamt, bereits gesendet: {already}")
    if len(boxes) > 1:
        print("Postfächer: " + ", ".join(f"{b['n']}: {sent_box.get(b['n'], 0)}/{caps[b['n']]}" for b in boxes))
    limit_total = total_limit()
    initial_total = len(db.select_all("messages", {"status": "eq.sent", "kind": "eq.initial", "select": "id"}))
    if limit_total is not None:
        print(f"Gesamtgrenze Erstmails: {initial_total} von {limit_total} gesendet")
    n_sent = 0
    from lib import freshness
    fetcher = None
    for m in rows:
        p, e = m["prospects"], m["experiments"]
        country = p["country"]
        rules = country_rules(cfg, country)
        problems = []
        if not rules.get("allowed"):
            problems.append(f"Land {country} nicht erlaubt")
        if db.is_suppressed(m["to_email"]):
            problems.append("gesperrt")
        if role_address(m["to_email"]):
            problems.append("Funktionsadresse ohne Vertriebsbezug (z. B. privacy@, support@)")
        kind = m.get("kind") or "initial"
        lint = lint_draft(m["subject"], m["body"], m.get("language") or "en",
                          **({} if kind == "initial" else {"min_words": 30, "max_words": 120, "require_sample": False}))
        problems += lint.errors
        stale = followup_block_reason(db, m)
        if stale:
            problems.append(stale)
        if problems:
            print(f"BLOCKIERT {m['to_email']}: {'; '.join(problems)}")
            if live:
                db.update("messages", {"id": m["id"]}, {"status": "blocked", "blocked_reason": "; ".join(problems)})
            continue

        if sum(sent_today.values()) >= cap:
            print(f"Tagesgrenze der Aufwärmphase ({cap}) erreicht, Rest folgt an den nächsten Tagen")
            break
        if kind == "initial" and limit_total is not None and initial_total >= limit_total:
            # Nachfassmails zählen nicht gegen die Grenze und laufen weiter
            print(f"Gesamtgrenze erreicht ({initial_total}/{limit_total} Erstmails): keine weiteren Erstmails")
            continue
        if not domain_accepts_mail(m["to_email"].split("@")[-1]):
            print(f"BLOCKIERT {m['to_email']}: Domain nimmt keine Mails an")
            if live:
                db.update("messages", {"id": m["id"]}, {"status": "blocked", "blocked_reason": "kein MX-Eintrag"})
            continue
        limit = country_limit(int(rules.get("daily_limit", cfg["defaults"]["daily_limit"])), owner_limits, country, owner_off)
        if sent_today.get(country, 0) >= limit:
            print(f"Tageslimit {country} ({limit}) erreicht, Rest morgen")
            continue
        if kind == "initial" and freshness.needs_rescan(p) and not live:
            print(f"Frischeprüfung im echten Lauf: {m['to_email']} (Website wird dann einmal abgerufen)")
        elif kind == "initial" and freshness.needs_rescan(p):
            # Adresse muss heute noch auf der eigenen Website stehen (Inhaber 03.10.2026: Bounce-Quote senken).
            # Nur im echten Lauf abrufen: der Probelauf davor im selben Workflow würde die Seite sonst zweimal holen.
            if fetcher is None:
                from enrich import Fetcher
                fetcher = Fetcher()
            found, url = freshness.confirm_on_website(m["to_email"], p.get("website") or "", fetcher)
            if not found:
                print(f"BLOCKIERT {m['to_email']}: Adresse steht nicht (mehr) auf der Website")
                if live:
                    db.update("messages", {"id": m["id"]}, {"status": "blocked",
                              "blocked_reason": "Frischeprüfung: Adresse nicht (mehr) auf der Website"})
                continue
            if live:
                db.update("prospects", {"id": p["id"]}, {"source_url": url,
                          "checked_at": dt.datetime.now(dt.timezone.utc).isoformat()})

        if live and not args.owner_ok:
            ok, why = _auto_send_allowed(db, e)
            if not ok:
                print(f"NICHT GESENDET {m['to_email']}: keine Freigabe für diesen Lauf ({why})")
                continue

        unsub = unsubscribe_target(m["unsubscribe_token"])
        footer = render_footer(m.get("language") or "en",
                               sender_name=legal_name(),
                               postal_address=postal_address(),
                               company=p["company_name"], unsubscribe_url=unsub)
        body = m["body"].rstrip()
        # Nachfassmail: derselbe Knopf zur Landingpage wie die Erstmail (Inhaber 02.10.2026, Schritt 3)
        link = (landing_link(db, pages, e["segment_id"], country, m["unsubscribe_token"])
                if kind in ("initial", "followup") else None)
        plan_url = _plan_url(body) if kind == "sample_followup" else None
        # Nachfrage nach der Probe: Erklär-PDF „How it works“ im Anhang (Inhaber 02.10.2026)
        files = [b] if kind == "sample_followup" and (b := brochure(e["segment_id"], country)) else None
        if link:
            lang = m.get("language") if m.get("language") in LANDING_LINE else "en"
            body += "\n\n" + LANDING_LINE[lang].format(url=link)
        text = body + "\n\n" + footer
        box = pick(boxes, caps, sent_box)
        if box is None:
            print(f"Alle Postfächer haben ihre Tagesmenge erreicht ({cap}), Rest folgt an den nächsten Tagen")
            break
        if not live:
            print(f"PROBELAUF würde senden an {m['to_email']} ({country}, Experiment {e['segment_id']}/{e['variant']}, "
                  f"Postfach {box['n']}): {m['subject']}")
            sent_box[box["n"]] = sent_box.get(box["n"], 0) + 1
            sent_today[country] = sent_today.get(country, 0) + 1
            initial_total += kind == "initial"
            n_sent += 1
            continue

        try:
            provider_fields = deliver(m["to_email"], m["subject"], text, unsub,
                                      html_version(body, footer, m.get("language") or "en",
                                                   p["company_name"] if kind != "sample_followup" else None,
                                                   _country_area(country), link or plan_url,
                                                   segment=e["segment_id"] if kind == "initial" else None,
                                                   plan=bool(plan_url)),
                                      mailbox=box if box.get("user") else None, attachments=files)
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
        sent_box[box["n"]] = sent_box.get(box["n"], 0) + 1
        initial_total += kind == "initial"
        n_sent += 1
        print(f"GESENDET {m['to_email']}" + (f" (Postfach {box['n']})" if len(boxes) > 1 else ""))
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
    if getattr(args, "art", "kaltmail") == "probe":
        return _test_sample(args, region)
    if getattr(args, "art", "") in ("nachfass", "probe-nachfass"):
        return _test_followup(args, name)
    p = {"segment_id": args.segment, "country": args.country, "company_name": name,
         "specialization": spec, "region": region}
    ex = None
    if args.segment in ("S2", "S9") and args.country == "US":
        ex = {"company": "Myrtle Avenue Soap Company LLC", "event": "registered", "date": "24 September 2026",
              "source": "NY Department of State"}
    subject, body, lang = build(p, example=ex)
    lint = lint_draft(subject, body, lang)
    footer = render_footer(lang, sender_name=legal_name(),
                           postal_address=postal_address(), company=name,
                           unsubscribe_url=unsubscribe_target("test"))
    from lib.db import DB
    link = landing_link(DB(), {}, args.segment, args.country, "test")
    if link:
        body = body.rstrip() + "\n\n" + LANDING_LINE[lang if lang in LANDING_LINE else "en"].format(url=link)
    text = body.rstrip() + "\n\n" + footer
    print(f"Prüfung: {lint.summary()}\n\nBetreff: [TEST] {subject}\n\n{text}\n")
    out = deliver(args.to, f"[TEST] {subject}", text, unsubscribe_target("test"),
                  html_version(body, footer, lang, name, _country_area(args.country), link, segment=args.segment))
    print(f"gesendet an {args.to}: {out}")
    return 0


def _test_followup(args, name: str) -> int:
    """Nachfassmail (4 Tage ohne Antwort) bzw. Nachfrage 3 Tage nach der Probe, wie Käufer sie bekommen."""
    from drafts import build
    from followups import followup_text, sample_followup_text
    from responder import booking_url
    p = {"segment_id": args.segment, "country": args.country, "company_name": name}
    subject, _, lang = build({**p, "specialization": "", "region": ""})
    link = plan_url = None
    if args.art == "nachfass":
        body, _ = followup_text(p, lang)
        from lib.db import DB
        link = landing_link(DB(), {}, args.segment, args.country, "test")
        if link:
            body = body.rstrip() + "\n\n" + LANDING_LINE[lang if lang in LANDING_LINE else "en"].format(url=link)
    else:
        plan_url = booking_url(args.segment, args.country)
        body = sample_followup_text(p, lang, plan_url)
    lint = lint_draft(subject, body, lang, min_words=30, max_words=120, require_sample=False)
    footer = render_footer(lang, sender_name=legal_name(),
                           postal_address=postal_address(), company=name,
                           unsubscribe_url=unsubscribe_target("test"))
    text = body.rstrip() + "\n\n" + footer
    print(f"Prüfung: {lint.summary()}\n\nBetreff: [TEST] {subject}\n\n{text}\n")
    files = [b] if args.art == "probe-nachfass" and (b := brochure(args.segment, args.country)) else None
    out = deliver(args.to, f"[TEST] {subject}", text, unsubscribe_target("test"),
                  html_version(body, footer, lang, name if args.art == "nachfass" else None,
                               _country_area(args.country), link or plan_url, plan=bool(plan_url)),
                  attachments=files)
    print(f"gesendet an {args.to}: {out}")
    return 0


def _test_sample(args, region: str) -> int:
    """Probe-Mail wie sie ein Interessent bekommt (echte Leads aus der Datenbank, CSV im Anhang), Betreff mit [TEST]."""
    from lib.db import DB
    from lib.regions import area_of
    from responder import regional_sample, sample_mail, sample_subject, send_reply
    lang = "fr" if args.country == "FR" else "en"
    files, regional = regional_sample(DB(), args.segment, args.country, region, mark=False)  # Test: Leads nicht verbrauchen
    area = None  # Leads aus dem ganzen Land
    body, blocks = sample_mail(lang, area, files, regional, args.segment, args.country)
    if not body:
        print("Keine Probe-Datei vorhanden")
        return 1
    print(body)
    out = send_reply(args.to, "[TEST] " + sample_subject(lang, area, args.country), body, None, lang, files, blocks=blocks, requested=True)
    print(f"gesendet an {args.to}: {out} ({'regional' if regional else 'Landes-Probe'}, {len(files)} Datei(en))")
    return 0


RESEND_EVENT_MAP = {"delivered": "delivered", "bounced": "bounced", "complained": "complained",
                    "delivery_delayed": "delivery_delayed", "failed": "failed"}


def cmd_sync(args) -> int:
    """Holt den Zustellstatus gesendeter Mails von Resend (Ersatz für den Webhook, solange Vercel fehlt)."""
    import requests
    from lib.db import DB

    if not os.environ.get("RESEND_API_KEY"):
        # Versand läuft über das eigene Postfach (SMTP); Bounces kommen dann per inbox.py, Resend-Altfälle per Webhook.
        print("Kein RESEND_API_KEY – Abgleich mit Resend übersprungen")
        return 0
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
            suppress(db, m["to_email"], "bounce" if typ == "bounced" else "complaint", "resend-sync")
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
            suppress(db, addr, "reply_optout", "reply")
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
    s.add_argument("--limit", type=int, default=400)
    s.add_argument("--pause", type=float, default=0, help="Sekunden zwischen zwei Mails (mit Zufall)")
    s.set_defaults(func=cmd_send)

    t = sub.add_parser("test", help="Testmail an den Inhaber (nicht an Käufer)")
    t.add_argument("--to", required=True)
    t.add_argument("--segment", default="S1", choices=["S1", "S2", "S9"])
    t.add_argument("--country", default="UK")
    t.add_argument("--art", default="kaltmail", choices=["kaltmail", "probe", "nachfass", "probe-nachfass"],
                   help="kaltmail = Erstkontakt, probe = Mail mit den 10 Probe-Leads, nachfass = 4 Tage ohne Antwort, "
                        "probe-nachfass = 3 Tage nach der Probe")
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
