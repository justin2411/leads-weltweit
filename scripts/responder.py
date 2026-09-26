#!/usr/bin/env python3
"""Antwort-Assistent: liest Antworten auf unsere Mails, antwortet in klaren Fällen selbst und
meldet sich beim Inhaber nur, wenn jemand kaufen will oder eine Frage nur er beantworten kann.

  python scripts/responder.py            # Probelauf: zeigt Einordnung und geplante Aktion
  python scripts/responder.py --apply    # handelt (Antworten senden, Sperren, Meldung an Inhaber)

Einordnung je Antwort (Claude, Fallback: Schlüsselwörter):
  kauf / preis / termin  -> Meldung an den Inhaber + kurze Zwischenantwort (keine Preise, keine Zusagen)
  probe / ja             -> Probe (CSV + gestaltete Übersicht) automatisch senden
  frage                  -> Antwort nur aus festen Textbausteinen (FAQ); passt keiner -> Inhaber
  nein / abmelden        -> dauerhafte Sperre, keine weitere Mail
  abwesend               -> ignorieren
Automatische Antworten erfinden nichts: keine Preise, Garantien, Referenzen oder Zusagen.

Umgebung: IMAP_HOST, IMAP_USER, IMAP_PASSWORD (Postfach aus REPLY_TO), OWNER_EMAIL,
  ANTHROPIC_API_KEY (optional), RESEND_API_KEY, MAIL_FROM, REPLY_TO, SENDER_*, SUPABASE_*
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import email
import imaplib
import json
import os
import re
import sys
from email import policy
from email.message import EmailMessage
from email.utils import parseaddr
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.rules import brand, normalize_domain  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
INTENTS = ["buy", "sample", "question", "not_interested", "unsubscribe", "out_of_office", "other"]
FAQ_KEYS = ["sources", "frequency", "regions", "data_privacy", "format", "how_it_works", "none"]

FAQ = {
    "en": {
        "sources": "All leads come from public records (company registers, official notices) and companies' own "
                   "websites and careers pages. Every lead lists its source and the date we checked it.",
        "frequency": "New leads are detected daily; subscribers receive a weekly list for their region and signals.",
        "regions": "We currently cover the UK, the US (New York metro first) and France, and can focus on the "
                   "towns or counties you work in.",
        "data_privacy": "Leads contain company data only: company name, location, website, the event and its source. "
                        "No personal contact details of employees.",
        "format": "You receive a spreadsheet (CSV/Excel) and a clear overview page; each lead has the company, "
                  "the event, the date, the source, an urgency rating and a suggested opening line.",
        "how_it_works": "We monitor public sources for events that create a reason to talk: new registrations, "
                        "long-open vacancies, several roles at once, new locations. You get only those companies.",
    },
    "fr": {
        "sources": "Toutes les pistes proviennent de sources publiques (registres, annonces officielles) et des sites "
                   "des entreprises. Chaque piste indique sa source et la date de vérification.",
        "frequency": "Les pistes sont détectées chaque jour ; les abonnés reçoivent une liste hebdomadaire.",
        "regions": "Nous couvrons actuellement la France, le Royaume-Uni et les États-Unis, avec un ciblage par ville.",
        "data_privacy": "Uniquement des données d'entreprise : nom, localisation, site, événement et source. "
                        "Aucune coordonnée personnelle.",
        "format": "Un tableur (CSV/Excel) et une page de synthèse ; chaque piste comprend l'entreprise, l'événement, "
                  "la date, la source, un niveau d'urgence et une phrase d'accroche.",
        "how_it_works": "Nous surveillons des sources publiques et repérons les moments propices : créations, postes "
                        "ouverts depuis longtemps, recrutements multiples, nouveaux sites.",
    },
}

CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": INTENTS},
        "faq": {"type": "array", "items": {"type": "string", "enum": FAQ_KEYS}},
        "needs_owner": {"type": "boolean"},
        "summary_de": {"type": "string"},
    },
    "required": ["intent", "faq", "needs_owner", "summary_de"],
    "additionalProperties": False,
}

CLASSIFY_PROMPT = """You classify a reply to a short B2B cold email. We offered a free sample of 10 "trigger leads"
(companies with a current reason to buy, from public sources) to a service firm.

Return JSON:
- intent: "buy" (wants to subscribe/buy, asks for price, contract, call or meeting), "sample" (yes / send the sample /
  interested), "question" (asks something before deciding), "not_interested", "unsubscribe" (asks not to be contacted),
  "out_of_office" (auto-reply), or "other".
- faq: which of these topics the questions are about: sources, frequency, regions, data_privacy, format, how_it_works;
  ["none"] if a question is about anything else (prices, terms, custom work, references, legal).
- needs_owner: true if a human must answer (buying, pricing, meetings, complaints, legal questions, anything not fully
  covered by the listed topics), else false.
- summary_de: one short German sentence summarising the reply.

Reply text:
<<<
{text}
>>>"""

KEYWORDS = [
    ("unsubscribe", r"\b(unsubscribe|remove (me|us)|stop (emailing|contacting)|do not (contact|email)|opt[- ]?out|"
                    r"désinscri\w*|ne plus (me|nous) contacter)\b"),
    ("out_of_office", r"\b(out of (the )?office|on (annual )?leave|away until|absent|congés?|automatic reply)\b"),
    ("buy", r"\b(price|pricing|cost|how much|subscribe|subscription|contract|invoice|call|meeting|demo|tarif|prix|"
            r"abonnement|rendez-vous)\b"),
    ("not_interested", r"\b(not interested|no thanks|no thank you|pas intéressé|non merci)\b"),
    ("sample", r"\b(yes|sure|please send|send (it|the sample|over)|interested|happy to (see|take a look)|oui|volontiers|"
               r"envoyez|would like to receive|free sample request|souhaitons recevoir|merci d'envoyer|"
               r"demande d'échantillon)\b"),
]


def classify(text: str) -> dict:
    body = text.strip()[:4000]
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            client = anthropic.Anthropic()
            resp = client.messages.create(
                model=os.environ.get("CLAUDE_MODEL", "claude-opus-5"),
                max_tokens=1024,
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": CLASSIFY_SCHEMA}},
                messages=[{"role": "user", "content": CLASSIFY_PROMPT.format(text=body)}],
            )
            if resp.stop_reason != "refusal":
                out = next((b.text for b in resp.content if b.type == "text"), "")
                data = json.loads(out)
                data["by"] = "claude"
                return data
        except Exception as exc:  # noqa: BLE001 - Fallback auf Regeln
            print(f"  Hinweis: Claude-Einordnung fehlgeschlagen ({exc.__class__.__name__}), nutze Regeln")
    low = body.lower()
    for intent, pat in KEYWORDS:
        if re.search(pat, low):
            return {"intent": intent, "faq": ["none"], "needs_owner": intent in ("buy", "other"),
                    "summary_de": f"Regel-Einordnung: {intent}", "by": "rules"}
    return {"intent": "other", "faq": ["none"], "needs_owner": True, "summary_de": "unklar", "by": "rules"}


def decide(c: dict) -> str:
    """Aktion aus der Einordnung. Im Zweifel: Inhaber."""
    intent = c["intent"]
    if intent in ("unsubscribe", "not_interested"):
        return "suppress"
    if intent == "out_of_office":
        return "ignore"
    if intent == "buy" or c.get("needs_owner") and intent != "sample":
        return "owner"
    if intent == "sample":
        return "sample_owner" if c.get("needs_owner") else "sample"
    if intent == "question":
        keys = [k for k in c.get("faq", []) if k in FAQ["en"]]
        return "faq" if keys and "none" not in c.get("faq", []) else "owner"
    return "owner"


def _text(msg: EmailMessage) -> str:
    part = msg.get_body(preferencelist=("plain", "html"))
    try:
        t = part.get_content() if part else ""
    except (LookupError, KeyError):
        return ""
    if part is not None and part.get_content_type() == "text/html":
        t = re.sub(r"<[^>]+>", " ", t)
    # zitierten Verlauf abschneiden
    t = re.split(r"\n>|\nOn .{5,80} wrote:|\nLe .{5,80} a écrit|\n-{2,}\s*Original Message", t)[0]
    return t.strip()


def signature(lang: str) -> str:
    from drafts import signature as sig
    return sig(lang)


def send_reply(to: str, subject: str, text: str, in_reply_to: str | None, lang: str,
               attachments: list[tuple[str, bytes]] | None = None) -> str | None:
    from lib.html_email import render
    from lib.rules import render_footer
    company = brand()
    footer = render_footer(lang, sender_name=company, postal_address=os.environ.get("SENDER_POSTAL_ADDRESS", ""),
                           company=normalize_domain(to.split("@")[-1]), unsubscribe_url=None)
    full = text.rstrip() + "\n\n" + footer
    headers = {}
    if in_reply_to:
        headers = {"In-Reply-To": in_reply_to, "References": in_reply_to}
    payload = {"from": os.environ["MAIL_FROM"], "to": [to],
               "subject": subject if subject.lower().startswith(("re:", "aw:")) else f"Re: {subject}",
               "text": full, "html": render(text, footer, lang), "headers": headers,
               "reply_to": os.environ.get("REPLY_TO") or os.environ["MAIL_FROM"]}
    if attachments:
        payload["attachments"] = [{"filename": n, "content": base64.b64encode(b).decode()} for n, b in attachments]
    r = requests.post("https://api.resend.com/emails", timeout=30, json=payload,
                      headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
    if r.status_code >= 400:
        raise RuntimeError(f"Resend {r.status_code} {r.text}")
    return r.json().get("id")


def notify_owner(subject: str, text: str) -> None:
    owner = os.environ.get("OWNER_EMAIL")
    if not owner:
        print("  WARNUNG: OWNER_EMAIL fehlt – Meldung nur im Protokoll")
        return
    r = requests.post("https://api.resend.com/emails", timeout=30,
                      headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                      json={"from": os.environ["MAIL_FROM"], "to": [owner], "subject": subject, "text": text})
    r.raise_for_status()


def sample_files(seg: str, country: str) -> list[tuple[str, bytes]]:
    d = ROOT / "samples" / seg / country
    files = []
    for name in ("leads.csv",):
        p = d / name
        if p.exists():
            files.append((f"signalwerk-sample-{seg}-{country}.csv", p.read_bytes()))
    return files


def sample_text(lang: str, region: str | None, has_files: bool) -> str | None:
    """Antwort mit der Probe: klar gegliedert, keine Preise, keine Zusagen."""
    if not has_files:
        return None
    if lang == "fr":
        return (
            "Bonjour,\n\n"
            "Merci pour votre retour. Comme convenu, vous trouverez ci-joint votre échantillon gratuit de 10 pistes"
            + (f" pour {region}" if region else "") + ".\n\n"
            "Contenu du fichier :\n"
            "- l'entreprise et sa localisation\n"
            "- l'événement (création, postes ouverts, nouveau site) avec sa date\n"
            "- la source officielle, pour vérifier chaque piste\n"
            "- un niveau d'urgence et une phrase d'accroche\n\n"
            "Si ces pistes vous sont utiles, je peux vous proposer une liste hebdomadaire ciblée sur vos villes et "
            "votre spécialité. Il suffit de répondre à ce message.\n\n"
            "Je serais heureux d'avoir votre avis sur l'échantillon.\n\n"
            "Bien cordialement,\n" + signature(lang))
    return (
        "Hello,\n\n"
        "Thank you for getting back to me. As promised, please find attached your free sample of 10 leads"
        + (f" for {region}" if region else "") + ".\n\n"
        "What the file contains:\n"
        "- the company and its location\n"
        "- the event (new registration, long-open roles, new site) and its date\n"
        "- the official source, so every lead can be checked\n"
        "- an urgency rating and a suggested opening line\n\n"
        "If the leads are useful, I can set up a weekly list focused on your towns and specialism. "
        "Simply reply to this email.\n\n"
        "I would value your feedback on the sample.\n\n"
        "Best regards,\n" + signature(lang))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()

    imap = imaplib.IMAP4_SSL(os.environ["IMAP_HOST"])
    imap.login(os.environ["IMAP_USER"], os.environ["IMAP_PASSWORD"])
    imap.select("INBOX", readonly=True)
    since = (dt.date.today() - dt.timedelta(days=args.days)).strftime("%d-%b-%Y")
    _, data = imap.search(None, "SINCE", since)
    handled = {"owner": 0, "sample": 0, "faq": 0, "suppress": 0, "ignore": 0}
    for num in data[0].split():
        _, fetched = imap.fetch(num, "(BODY.PEEK[])")
        msg: EmailMessage = email.message_from_bytes(fetched[0][1], policy=policy.default)
        mid = (msg.get("Message-ID") or f"imap-{num.decode()}").strip()
        dedupe = f"reply:{mid}"
        if db.select("email_events", {"dedupe_key": f"eq.{dedupe}", "select": "id"}):
            continue
        sender = parseaddr(msg.get("From") or "")[1].lower()
        dom = sender.split("@")[-1]
        # Nur Antworten von Firmen, die wir angeschrieben haben
        pros = db.select("prospects", {"domain": f"eq.{normalize_domain(dom)}", "select": "id,company_name,segment_id,country,region"})
        if not pros:
            continue
        p = pros[0]
        sent = db.select("messages", {"prospect_id": f"eq.{p['id']}", "status": "eq.sent", "order": "sent_at.desc",
                                      "limit": "1", "select": "id,subject,language,experiment_id"})
        if not sent:
            continue
        m = sent[0]
        lang = m.get("language") or "en"
        text = _text(msg)
        c = classify(text)
        action = decide(c)
        print(f"{p['company_name']:<35} {c['intent']:<14} -> {action:<12} ({c['by']}) {c['summary_de']}")
        if not args.apply:
            continue

        event_type = {"buy": "reply_positive", "sample": "sample_requested", "not_interested": "reply_negative",
                      "unsubscribe": "reply_negative"}.get(c["intent"], "reply")
        db.insert("email_events", {"message_id": m["id"], "type": event_type, "dedupe_key": dedupe,
                                   "note": f"{c['summary_de']} | Aktion: {action}",
                                   "payload": {"intent": c["intent"], "faq": c.get("faq"), "by": c["by"]}})
        subject = msg.get("Subject") or m["subject"]
        if action == "suppress":
            for addr in {sender}:
                db.rpc("suppress_email", {"p_email": addr, "p_reason": "reply_optout", "p_source": "responder"})
        elif action in ("sample", "sample_owner"):
            files = sample_files(p["segment_id"], p["country"])
            body = sample_text(lang, p.get("region"), bool(files))
            if body:
                send_reply(sender, subject, body, mid, lang, files)
                if event_type != "sample_requested":
                    db.insert("email_events", {"message_id": m["id"], "type": "sample_requested",
                                               "note": "Probe automatisch gesendet"})
            if action == "sample_owner" or not body:
                notify_owner(f"[Leads] Bitte ansehen: {p['company_name']}",
                             f"{p['company_name']} ({p['segment_id']}/{p['country']}) hat geantwortet.\n\n"
                             f"Einordnung: {c['summary_de']}\nProbe gesendet: {'ja' if body else 'nein (keine Datei)'}\n\n"
                             f"Antwort von {sender}:\n\n{text[:3000]}")
        elif action == "faq":
            keys = [k for k in c["faq"] if k in FAQ[lang if lang in FAQ else 'en']]
            answers = "\n\n".join(FAQ[lang if lang in FAQ else "en"][k] for k in keys)
            if lang == "fr":
                body = (f"Bonjour,\n\nMerci pour votre question.\n\n{answers}\n\nSouhaitez-vous recevoir "
                        f"l'échantillon gratuit de 10 pistes pour votre région ?\n\nBien cordialement,\n{signature(lang)}")
            else:
                body = (f"Hello,\n\nThanks for your question.\n\n{answers}\n\nWould you like me to send the free "
                        f"sample of 10 leads for your area?\n\nBest regards,\n{signature(lang)}")
            send_reply(sender, subject, body, mid, lang)
        elif action == "owner":
            notify_owner(f"[Leads] Interessent: {p['company_name']} – {c['summary_de'][:80]}",
                         f"{p['company_name']} ({p['segment_id']}/{p['country']}, {p.get('region') or ''}) "
                         f"hat geantwortet.\n\nEinordnung: {c['intent']} – {c['summary_de']}\n\n"
                         f"Antwort von {sender}:\n\n{text[:3000]}\n\n"
                         f"Bitte selbst antworten (Antworten in deinem Postfach). Ich habe nur eine kurze "
                         f"Eingangsbestätigung geschickt.")
            hold = ("Bonjour,\n\nMerci pour votre message. Je reviens vers vous personnellement dans la journée.\n\n"
                    f"Bien cordialement,\n{signature(lang)}") if lang == "fr" else (
                    "Hello,\n\nThanks for your message. I will get back to you personally today.\n\n"
                    f"Best regards,\n{signature(lang)}")
            send_reply(sender, subject, hold, mid, lang)
        handled[action if action in handled else "owner"] += 1
    imap.logout()
    print(f"\n{handled}" + ("" if args.apply else "\nProbelauf – mit --apply handeln."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
