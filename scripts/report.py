#!/usr/bin/env python3
"""Morgenbericht an den Inhaber (Mail an OWNER_EMAIL): echte Zahlen, auch schlechte.

  python scripts/report.py            # nur anzeigen
  python scripts/report.py --send     # per Resend an OWNER_EMAIL

Inhalt: Versand gestern und gesamt, Zustellung, Bounces, Beschwerden, Antworten, angeforderte Proben,
Kaufinteresse/Aufträge, Vorrat an geprüften Empfängern, Tabelle je Experiment, Einschätzung und Empfehlungen.
Öffnungsraten werden bewusst nicht gemessen (keine Tracking-Pixel, CLAUDE.md Abschnitt 2).
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.db import DB  # noqa: E402
from lib.deliverability import BOUNCE_STOP, MIN_SAMPLE, warmup_cap  # noqa: E402
from lib.stats import delivered, distinct_replies  # noqa: E402

SEG = {"S1": "Personalvermittler", "S2": "Webagenturen", "S3": "IT-Dienstleister", "S4": "Versicherungsmakler",
       "S5": "Buchhaltung", "S9": "Finanzberater"}


def pct(a: int, b: int) -> str:
    return f"{100 * a / b:.1f} %" if b else "–"


def collect(db: DB) -> dict:
    now = dt.datetime.now(dt.timezone.utc)
    since = (now - dt.timedelta(hours=24)).isoformat()
    stats = db.select("experiment_stats", {"select": "*"})
    msgs_24 = db.select("messages", {"status": "eq.sent", "sent_at": f"gte.{since}", "select": "id"})
    ev_24 = db.select("email_events", {"created_at": f"gte.{since}",
                                       "select": "id,type,note,message_id,dedupe_key,messages(to_email)"})
    first = db.select("messages", {"status": "eq.sent", "select": "sent_at", "order": "sent_at.asc", "limit": "1"})
    first_day = dt.date.fromisoformat(first[0]["sent_at"][:10]) if first else None
    approved = db.select("messages", {"status": "eq.approved", "select": "id"})
    blocked_24 = db.select("messages", {"status": "eq.blocked", "updated_at": f"gte.{since}", "select": "blocked_reason"})
    prospects_ok = db.select("prospects", {"check_status": "eq.ok", "select": "id"})
    customers = db.select("customers", {"select": "status"})
    return {"stats": stats, "sent_24": len(msgs_24), "ev_24": ev_24, "first_day": first_day,
            "cap_today": warmup_cap(first_day, dt.date.today()), "approved": len(approved),
            "blocked_24": blocked_24, "prospects_ok": len(prospects_ok), "customers": customers}


def build(d: dict) -> tuple[str, str]:
    # SMTP-Versand kennt kein 'delivered'-Ereignis: zugestellt = gesendet - Bounces (lib.stats.delivered)
    st = [{**s, "delivered": delivered(s)} for s in d["stats"]]
    tot = {k: sum(int(s.get(k) or 0) for s in st) for k in
           ("sent", "delivered", "bounced", "complained", "replies", "positive", "samples", "customers")}
    # je eingehender Mail nur ein Ereignis (inbox.py 'reply' + responder.py genauer Typ zur selben Mail)
    ev = distinct_replies(d["ev_24"])
    count = lambda t: sum(1 for e in ev if e["type"] == t)  # noqa: E731
    replies_24 = sum(1 for e in ev if e["type"] in ("reply", "reply_positive", "reply_negative", "sample_requested",
                                                     "unsubscribed"))
    buy_24 = [e for e in ev if e["type"] == "reply_positive"]
    samples_24 = count("sample_requested")
    active_customers = sum(1 for c in d["customers"] if c["status"] == "active")
    days_left = (d["approved"] // max(d["cap_today"], 1)) if d["cap_today"] else 0

    lines = []
    lines.append(f"Guten Morgen Justin,\n\nhier der Stand von NextGen Profit ({dt.date.today():%d.%m.%Y}).\n")
    lines.append("DAS WICHTIGSTE")
    lines.append(f"- Gesendet in den letzten 24 h: {d['sent_24']} (heutige Grenze der Aufwärmphase: {d['cap_today']})")
    lines.append(f"- Antworten (24 h): {replies_24}  |  Proben angefordert (24 h): {samples_24}  |  "
                 f"Kaufinteresse (24 h): {len(buy_24)}")
    lines.append(f"- Aufträge / zahlende Kunden: {active_customers}")
    estimated = any(int(s.get("sent") or 0) > int(s.get("delivered") or 0) for s in d["stats"])  # Postfach ohne Ereignisse
    lines.append(f"- Gesamt: {tot['sent']} gesendet, {tot['delivered']} zugestellt ({pct(tot['delivered'], tot['sent'])}"
                 + ("; über das Postfach gesendet: gesendet minus Bounces" if estimated else "") + "), "
                 f"{tot['bounced']} Bounces ({pct(tot['bounced'], tot['sent'])}), {tot['complained']} Spam-Beschwerden")
    lines.append(f"- Antwortrate gesamt: {pct(tot['replies'], tot['delivered'])}  |  positiv: {pct(tot['positive'] + tot['samples'], tot['delivered'])}")
    lines.append("- Öffnungsrate: wird bewusst nicht gemessen (kein Tracking-Pixel – schützt Zustellbarkeit und ist "
                 "rechtlich sauberer). Aussagekräftiger sind Antworten und Proben.")
    lines.append("")
    if buy_24:
        lines.append("KAUFINTERESSE – BITTE SELBST ANTWORTEN")
        for e in buy_24:
            lines.append(f"- {(e.get('messages') or {}).get('to_email', '?')}: {e.get('note') or ''}")
        lines.append("")
    lines.append("JE ZIELGRUPPE UND LAND")
    lines.append(f"{'Experiment':<28}{'gesendet':>9}{'zugest.':>9}{'Antw.':>7}{'positiv':>9}{'Proben':>8}{'Kunden':>8}")
    for s in sorted(st, key=lambda x: (-(x.get("sent") or 0), x["segment_id"], x["country"])):
        if not s.get("sent"):
            continue
        name = f"{SEG.get(s['segment_id'], s['segment_id'])} {s['country']}"
        lines.append(f"{name:<28}{s['sent']:>9}{s['delivered']:>9}{s['replies']:>7}{s['positive']:>9}{s['samples']:>8}{s['customers']:>8}")
    if not any(s.get("sent") for s in st):
        lines.append("(noch nichts gesendet)")
    lines.append("")

    # Einschätzung nach den festen Regeln (CLAUDE.md 5.7) + Hinweise
    tips = []
    for s in st:
        dlv = int(s.get("delivered") or 0)
        pos = int(s.get("positive") or 0) + int(s.get("samples") or 0)
        name = f"{SEG.get(s['segment_id'], s['segment_id'])} {s['country']}"
        if dlv >= 50 and pos / dlv < 0.02:
            tips.append(f"{name}: {pos} positive bei {dlv} zugestellten (unter 2 %) – Empfehlung: stoppen.")
        elif dlv >= 50 and pos / dlv > 0.05:
            tips.append(f"{name}: {pct(pos, dlv)} positiv – Empfehlung: ausbauen.")
        elif dlv >= 50 and not int(s.get("samples") or 0):
            tips.append(f"{name}: Antworten, aber keine Proben – Empfehlung: Betreff und Einstieg ändern.")
    if tot["sent"] >= 20 and tot["bounced"] / max(tot["sent"], 1) > 0.02:
        tips.append(f"Bounce-Quote über 2 %: Adressprüfung verschärfen, sonst greift die Notbremse "
                    f"(über {BOUNCE_STOP * 100:.0f} %, bewertet ab {MIN_SAMPLE} gesendeten Mails).")
    if tot["complained"]:
        tips.append("Es gibt eine Spam-Beschwerde: Versand ist gestoppt, bis du entscheidest.")
    if days_left < 3:
        tips.append(f"Vorrat an freigegebenen Mails reicht nur noch für ca. {days_left} Tag(e) – ich suche weitere Käufer.")
    if d["blocked_24"]:
        tips.append(f"{len(d['blocked_24'])} Mails wurden vor dem Versand blockiert (Sperrliste, Regeln oder kein Mailserver).")
    if not tips:
        tips.append("Noch zu wenig Daten für belastbare Aussagen (erst ab ca. 50 zugestellten Mails je Zielgruppe).")
    lines.append("MEINE EINSCHÄTZUNG")
    lines += [f"- {t}" for t in tips]
    lines.append("")
    lines.append("VORRAT")
    lines.append(f"- Freigegebene Mails in der Warteschlange: {d['approved']}  |  geprüfte Käufer gesamt: {d['prospects_ok']}")
    lines.append("")
    lines.append("Stoppen: in GitHub die Variable SENDEN_AKTIV auf 'nein' setzen oder mir 'Stopp' schreiben.")
    text = "\n".join(lines)
    subject = (f"NextGen Profit – {d['sent_24']} gesendet, {replies_24} Antworten, {samples_24} Proben"
               + (f", {len(buy_24)} KAUFINTERESSE" if buy_24 else ""))
    return subject, text


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--send", action="store_true")
    args = ap.parse_args(argv)
    subject, text = build(collect(DB()))
    print(subject + "\n\n" + text)
    if args.send:
        body_html = f"<pre style=\"font:14px/1.5 Menlo,Consolas,monospace\">{html.escape(text)}</pre>"
        r = requests.post("https://api.resend.com/emails", timeout=30,
                          headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                          json={"from": os.environ["MAIL_FROM"], "to": [os.environ["OWNER_EMAIL"]],
                                "subject": subject, "text": text, "html": body_html})
        r.raise_for_status()
        print("Bericht gesendet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
