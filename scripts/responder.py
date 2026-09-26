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

CLASSIFY_PROMPT = """You classify a reply to a short B2B cold email from NextGen Profit. Business context: we sell
"trigger leads" (companies with a current reason to buy, e.g. new registrations or long-open vacancies, from public
sources) to service firms as a recurring weekly subscription. The cold email offered a free sample of 10 leads; the
goal is to turn interested firms into recurring subscribers.

Return JSON:
- intent: "buy" (wants regular/weekly leads, a subscription or more leads, asks for price, contract, call or meeting,
  or answers our questions about towns and weekly volume), "sample" (yes / send the sample /
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
            r"abonnement|rendez-vous|weekly|per week|every week|regular(ly)?|more leads|par semaine|chaque semaine)\b"),
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


def owner_name() -> str:
    return os.environ.get("SENDER_NAME") or "Justin Koch"


def assistant_title(lang: str) -> str:
    return (f"Assistant de {owner_name()}" if lang == "fr" else f"Assistant to {owner_name()}")


def signature(lang: str) -> str:
    """Antworten gehen im Namen des Inhabers raus (Entscheidung Inhaber 26.09.2026) – gleiche Signatur wie die Erstmail."""
    from drafts import signature as sig
    return sig(lang)


def signer(lang: str) -> None:
    return None  # Standard-Signatur des Inhabers


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
               "text": full, "html": render(text, footer, lang, signer=signer(lang)), "headers": headers,
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


def regional_sample(db, seg: str, country: str, region: str | None) -> tuple[list[tuple[str, bytes]], bool]:
    """10 Leads aus der Region des Käufers als CSV. (Dateien, regional?) – sonst Landes-Probe."""
    import csv
    import io
    from lib.regions import area_of, lead_matches
    area = area_of(region)
    rows = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "status": "in.(new,sample)",
                               "select": "id,event_summary,event_date,source_name,source_url,source_date,urgency,"
                                         "urgency_reason,opener,signal_type,company_id,observation_ids,"
                                         "watch_companies(name,legal_form,city,region,address)",
                               "order": "event_date.desc", "limit": "3000"})
    picked, per = [], {}
    for l in rows:
        co = l["watch_companies"]
        details = None
        if country == "US" and l.get("observation_ids"):
            obs = db.select("observations", {"id": f"eq.{l['observation_ids'][0]}", "select": "details"})
            details = obs[0]["details"] if obs else None
        if not lead_matches(country, area, co, details) or per.get(l["company_id"], 0) >= 3:
            continue
        per[l["company_id"]] = per.get(l["company_id"], 0) + 1
        picked.append(l)
        if len(picked) >= 10:
            break
    if len(picked) < 10:
        return sample_files(seg, country), False
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["company", "legal_form", "location", "event", "event_date", "source", "source_url", "checked_on",
                "urgency", "urgency_reason", "opener"])
    for l in picked:
        co = l["watch_companies"]
        w.writerow([co["name"], co.get("legal_form") or "", ", ".join(x for x in (co.get("city"), area) if x),
                    l["event_summary"], l.get("event_date") or "", l["source_name"], l.get("source_url") or "",
                    l["source_date"], l["urgency"], l["urgency_reason"], l["opener"]])
    name = re.sub(r"[^A-Za-z0-9]+", "-", area or country).strip("-")
    return [(f"sample-10-leads-{name}.csv", buf.getvalue().encode("utf-8"))], True


def sample_files(seg: str, country: str) -> list[tuple[str, bytes]]:
    d = ROOT / "samples" / seg / country
    files = []
    for name in ("leads.csv",):
        p = d / name
        if p.exists():
            files.append((f"signalwerk-sample-{seg}-{country}.csv", p.read_bytes()))
    return files


def sample_text(lang: str, region: str | None, has_files: bool, regional: bool = True) -> str | None:
    """Antwort mit der Probe, im Namen des Inhabers. Ziel: wiederkehrende Lieferung (Abo), keine Preise."""
    if not has_files:
        return None
    if not regional:
        region = None
    o = owner_name()
    first = o.split(" ")[0]
    if lang == "fr":
        return (
            "Bonjour,\n\n"
            "Merci pour votre intérêt : comme promis, vous trouverez "
            "ci-joint votre échantillon gratuit de 10 pistes" + (f" pour {region}" if region else "") + ".\n\n"
            + ("" if regional else "Pour ce premier échantillon, nous avons utilisé des pistes récentes de notre base "
               "élargie ; la livraison régulière est filtrée sur vos villes.\n\n")
            + "Chaque ligne contient :\n"
            "- l'entreprise et sa localisation\n"
            "- l'événement (création, postes ouverts, nouveau site) et sa date\n"
            "- la source officielle, pour vérifier chaque piste\n"
            "- un niveau d'urgence et une phrase d'accroche\n\n"
            "Le service régulier livre chaque semaine de nouvelles pistes de ce type, filtrées sur vos villes et votre "
            "spécialité. Pour vous préparer une proposition adaptée, pourriez-vous m'indiquer :\n"
            "1. quelles villes ou départements vous intéressent,\n"
            "2. combien de nouvelles pistes par semaine vous pourriez traiter ?\n\n"
            "Je vous prépare ensuite une proposition adaptée.\n\n"
            "Bien cordialement,\n" + signature(lang))
    return (
        "Hello,\n\n"
        "Thank you for your interest – as promised, please find attached "
        "your free sample of 10 leads" + (f" for {region}" if region else "") + ".\n\n"
        + ("" if regional else "For this first sample we used current leads from our wider dataset; the regular "
           "delivery is filtered to the towns you work in.\n\n")
        + "Each row contains:\n"
        "- the company and its location\n"
        "- the event (new registration, long-open roles, new site) and its date\n"
        "- the official source, so every lead can be checked\n"
        "- an urgency rating and a suggested opening line\n\n"
        "The regular service delivers new leads like these every week, filtered to your towns and specialism. "
        "So that I can prepare a suitable proposal, could you let me know:\n"
        "1. which towns or counties matter most to you, and\n"
        "2. roughly how many new leads per week your team could follow up?\n\n"
        "I will then put together a proposal that fits.\n\n"
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
            files, regional = regional_sample(db, p["segment_id"], p["country"], p.get("region"))
            from lib.regions import area_of
            body = sample_text(lang, area_of(p.get("region")), bool(files), regional)
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
                body = (f"Bonjour,\n\nMerci pour votre "
                        f"question.\n\n{answers}\n\nSouhaitez-vous recevoir l'échantillon gratuit de 10 pistes pour "
                        f"votre région ? Il suffit de répondre « oui ».\n\nBien cordialement,\n{signature(lang)}")
            else:
                body = (f"Hello,\n\nThank you for your question."
                        f"\n\n{answers}\n\nWould you like me to send you the free sample of 10 leads for your area? "
                        f"A simple \"yes\" is enough.\n\nBest regards,\n{signature(lang)}")
            send_reply(sender, subject, body, mid, lang)
        elif action == "owner":
            notify_owner(f"[Leads] Interessent: {p['company_name']} – {c['summary_de'][:80]}",
                         f"{p['company_name']} ({p['segment_id']}/{p['country']}, {p.get('region') or ''}) "
                         f"hat geantwortet.\n\nEinordnung: {c['intent']} – {c['summary_de']}\n\n"
                         f"Antwort von {sender}:\n\n{text[:3000]}\n\n"
                         f"Bitte selbst antworten (Antworten in deinem Postfach). Ich habe nur eine kurze "
                         f"Eingangsbestätigung geschickt.")
            first = owner_name().split(" ")[0]
            hold = ("Bonjour,\n\nMerci pour votre message. Je reviens vers vous personnellement dans la journée "
                    "avec les détails.\n\n"
                    f"Bien cordialement,\n{signature(lang)}") if lang == "fr" else (
                    "Hello,\n\nThank you for your message. I will get back to you personally today with the details.\n\n"
                    f"Best regards,\n{signature(lang)}")
            send_reply(sender, subject, hold, mid, lang)
        handled[action if action in handled else "owner"] += 1
    imap.logout()
    print(f"\n{handled}" + ("" if args.apply else "\nProbelauf – mit --apply handeln."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
