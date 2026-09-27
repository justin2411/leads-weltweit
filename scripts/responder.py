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

from lib.rules import brand, legal_name, normalize_domain  # noqa: E402

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
    ("out_of_office", r"\b(out of (the )?office|on (annual )?leave|away until|absent|congés?|automatic reply|"
                      r"auto(matic|mated)?[- ]?(reply|response)|(office|we) (will be|is|are) closed|closed until|"
                      r"(no|not have|limited) access to (my |our )?e-?mail|upon (my|our) return|when i return|"
                      r"return(ing)? (to the office )?on (monday|tuesday|wednesday|thursday|friday)|"
                      r"away from (the|my) (office|desk)|on (vacation|holiday)|currently (away|travelling|traveling)|"
                      r"réponse automatique|de retour le)\b"),
    ("buy", r"\b(price|pricing|cost|how much|subscribe|subscription|contract|invoice|call|meeting|demo|tarif|prix|"
            r"abonnement|rendez-vous|weekly|per week|every week|regular(ly)?|more leads|par semaine|chaque semaine)\b"),
    ("not_interested", r"\b(not interested|no thanks|no thank you|pas intéressé|non merci)\b"),
    ("sample", r"\b(yes|sure|please send|send (it|the sample|over)|interested|happy to (see|take a look)|oui|volontiers|"
               r"envoyez|would like to receive|glad to receive|(free )?sample request|souhaitons recevoir|heureux de recevoir|"
               r"merci d'envoyer|"
               r"demande d'échantillon)\b"),
]


AUTO_SUBJECT = re.compile(r"^(automatic reply|auto(matic)?[- ]?(reply|response)|out of (the )?office|abwesen|"
                          r"réponse automatique|absence|away:|auto:)", re.I)


def is_auto_reply(msg) -> bool:
    """Abwesenheitsnotizen und andere Autoresponder an den Kopfzeilen erkennen (RFC 3834 u. a.)."""
    auto = (msg.get("Auto-Submitted") or "").strip().lower()
    if auto and auto != "no":
        return True
    if any(msg.get(h) for h in ("X-Autoreply", "X-Autorespond", "X-Auto-Response-Suppress-Out")):
        return True
    if (msg.get("Precedence") or "").strip().lower() in ("auto_reply", "bulk", "junk"):
        return True
    return bool(AUTO_SUBJECT.match((msg.get("Subject") or "").strip()))


def classify(text: str) -> dict:
    body = text.strip()[:4000]
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            client = anthropic.Anthropic()
            resp = client.messages.create(
                model=os.environ.get("CLAUDE_MODEL") or "claude-sonnet-5",
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
            print(f"  Hinweis: Claude-Einordnung fehlgeschlagen ({exc.__class__.__name__}: {str(exc)[:200]}), nutze Regeln")
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
               attachments: list[tuple[str, bytes]] | None = None, blocks: dict[str, str] | None = None,
               requested: bool = False) -> str | None:
    from lib.html_email import render
    from lib.rules import render_footer
    company = brand()
    footer = render_footer(lang, sender_name=legal_name(), postal_address=os.environ.get("SENDER_POSTAL_ADDRESS", ""),
                           company=normalize_domain(to.split("@")[-1]), unsubscribe_url=None, requested=requested)
    full = text.rstrip() + "\n\n" + footer
    headers = {}
    if in_reply_to:
        headers = {"In-Reply-To": in_reply_to, "References": in_reply_to}
    # "Re:" nur bei echten Antworten (nie gefälscht)
    subj = subject if not in_reply_to or subject.lower().startswith(("re:", "aw:")) else f"Re: {subject}"
    payload = {"from": os.environ["MAIL_FROM"], "to": [to], "subject": subj,
               "text": full, "html": render(text, footer, lang, signer=signer(lang), blocks=blocks), "headers": headers,
               "reply_to": os.environ.get("REPLY_TO") or os.environ["MAIL_FROM"]}
    if attachments:
        payload["attachments"] = [{"filename": n, "content": base64.b64encode(b).decode()} for n, b in attachments]
    r = requests.post("https://api.resend.com/emails", timeout=30, json=payload,
                      headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
    if r.status_code >= 400:
        raise RuntimeError(f"Resend {r.status_code} {r.text}")
    return r.json().get("id")


def alert_address() -> str | None:
    """Adresse für Kaufinteresse aus config/versand.yaml (kaufinteresse_an), sonst OWNER_EMAIL."""
    cfg = ROOT / "config" / "versand.yaml"
    try:
        m = re.search(r"^kaufinteresse_an:\s*(\S+@\S+)", cfg.read_text(), re.M)
        if m:
            return m.group(1)
    except OSError:
        pass
    return os.environ.get("OWNER_EMAIL")


def notify_owner(subject: str, text: str) -> None:
    owner = alert_address()
    if not owner:
        print("  WARNUNG: OWNER_EMAIL fehlt – Meldung nur im Protokoll")
        return
    r = requests.post("https://api.resend.com/emails", timeout=30,
                      headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                      json={"from": os.environ["MAIL_FROM"], "to": [owner], "subject": subject, "text": text})
    r.raise_for_status()


def regional_sample(db, seg: str, country: str, region: str | None) -> tuple[list[tuple[str, bytes]], bool]:
    """10 Leads aus der Region des Käufers als CSV. (Dateien, regional?) – sonst Landes-Probe."""
    from deliveries import REQUIRE_CONTACT, _lang, contact_companies, enrich, to_csv
    from lib.regions import area_of, lead_matches
    area = area_of(region)
    known = contact_companies(db) if REQUIRE_CONTACT else None
    rows = db.select_all("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "status": "in.(new,sample)",
                               "select": "id,event_summary,event_date,source_name,source_url,source_date,urgency,"
                                         "urgency_reason,opener,signal_type,company_id,observation_ids,"
                                         "watch_companies(name,legal_form,city,region,address)",
                               "order": "event_date.desc,id"})
    picked, per = [], {}
    for l in rows:
        co = l["watch_companies"]
        if known is not None and l["company_id"] not in known:
            continue
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
    for l in picked:
        l["segment_id"] = seg
    enrich(db, picked, known)
    data = to_csv(picked, _lang(country), area)
    name = re.sub(r"[^A-Za-z0-9]+", "-", area or country).strip("-")
    from lib.leadreport import attachments
    return attachments(data, _lang(country), area, name="sample-leads"), True


def sample_files(seg: str, country: str) -> list[tuple[str, bytes]]:
    d = ROOT / "samples" / seg / country
    files = []
    for name in ("leads.csv",):
        p = d / name
        if p.exists():
            from lib.leadreport import attachments
            files += attachments(p.read_bytes(), "fr" if country == "FR" else "en", name=f"sample-{seg}-{country}")
    return files


def has_contacts(files: list[tuple[str, bytes]]) -> bool:
    """True, wenn jede Zeile der Probe Telefon und E-Mail hat (nur dann darf die Mail das behaupten)."""
    import csv
    import io
    if not files:
        return False
    data = next((b for n, b in files if n.endswith(".csv")), b"")
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig", "replace"))))
    return bool(rows) and all((r.get("phone") or "").strip() and (r.get("email") or "").strip() for r in rows)


def sample_text(lang: str, region: str | None, has_files: bool, regional: bool = True, preview: str = "",
                contacts: bool = False) -> str | None:
    """Mail mit der Probe, im Namen des Inhabers. Ziel: wiederkehrende Lieferung (Abo), keine Preise, keine Zusagen.
    preview: optionaler Absatz mit den ersten Einträgen (in HTML als Tabelle dargestellt)."""
    if not has_files:
        return None
    if not regional:
        region = None
    parts: list[str]
    if lang == "fr":
        parts = [
            "Bonjour,",
            "Merci pour votre demande. Vous trouverez en pièce jointe votre échantillon gratuit"
            + (f" pour {region}" if region else "") + " : un rapport de pistes en PDF, préparé exactement comme notre "
            "livraison hebdomadaire, et les mêmes pistes en tableau pour votre CRM.",
        ]
        if not regional:
            parts.append("Pour ce premier échantillon, nous n'avions pas encore dix événements récents dans votre zone. "
                         "Il contient donc aussi des pistes de zones voisines. La livraison régulière ne comprend que "
                         "les villes que vous choisissez.")
        if preview:
            parts.append(preview)
        parts += [
            ("Chaque piste indique l'entreprise avec son téléphone et son e-mail, un court profil, " if contacts else
             "Chaque piste indique l'entreprise et sa localisation, ")
            + "l'événement et sa date, le type de source et une phrase d'accroche pour le premier "
            "contact. Dans la livraison régulière, chaque piste comprend le téléphone et l'e-mail de l'entreprise et ne va "
            "qu'à une seule entreprise de votre secteur.",
            "Notre conseil : choisissez les deux ou trois pistes qui vous correspondent le mieux et contactez-les "
            "cette semaine, tant que l'événement est récent.",
            "Si l'échantillon vous est utile, je vous prépare volontiers une liste hebdomadaire adaptée à votre "
            "cabinet. Deux questions m'aideraient :\n"
            "1. Quelles villes ou quels départements devons-nous couvrir ?\n"
            "2. Combien de nouvelles pistes par semaine votre équipe peut-elle traiter ?",
            "Une courte réponse à cet e-mail suffit.",
            "Bien cordialement,\n" + signature(lang),
        ]
    else:
        parts = [
            "Hello,",
            "Thank you for your request. Attached is your free sample"
            + (f" for {region}" if region else "") + ": a lead report as a PDF, prepared exactly like our weekly "
            "delivery, and the same leads as a spreadsheet for your CRM.",
        ]
        if not regional:
            parts.append("For this first sample we did not yet have ten recent events in your area, so it also "
                         "includes leads from neighbouring areas. The regular delivery only covers the towns you choose.")
        if preview:
            parts.append(preview)
        parts += [
            ("Every lead shows the company with its phone number and email, a short profile, " if contacts else
             "Every lead shows the company and its location, ")
            + "the event and its date, the type of source and a suggested opening line for the "
            "first call. In the regular delivery, every lead includes the company's phone number and email and goes to "
            "only one firm in your field.",
            "Our suggestion: pick the two or three leads that fit your firm best and contact them this week, while "
            "the event is still recent.",
            "If the sample is useful, I would be glad to set up a weekly list tailored to your firm. Two short "
            "questions would help me prepare it:\n"
            "1. Which towns or counties should we cover?\n"
            "2. Roughly how many new leads per week can your team follow up?",
            "A short reply to this email is all it takes.",
            "Kind regards,\n" + signature(lang),
        ]
    return "\n\n".join(parts)


def sample_mail(lang: str, region: str | None, files: list[tuple[str, bytes]], regional: bool) -> tuple[str | None, dict]:
    """(Text, HTML-Blöcke) für die Probe-Mail: Text mit Vorschau-Absatz, HTML mit Vorschau-Tabelle."""
    from lib.html_email import preview_rows, sample_preview
    ptext, phtml = sample_preview(preview_rows(files), lang)
    body = sample_text(lang, region, bool(files), regional, ptext, contacts=has_contacts(files))
    return body, ({ptext: phtml} if ptext else {})


def sample_subject(lang: str, region: str | None) -> str:
    if lang == "fr":
        return f"Votre échantillon : 10 pistes{' pour ' + region if region else ''}"
    return f"Your sample: 10 leads{' for ' + region if region else ''}"


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
        if is_auto_reply(msg):
            c = {"intent": "out_of_office", "faq": ["none"], "needs_owner": False,
                 "summary_de": "Automatische Antwort (Kopfzeilen)", "by": "headers"}
        else:
            c = classify(text)
        action = decide(c)
        # Probe schon verschickt? Dann ist ein weiteres "Ja" Kaufinteresse (wöchentliche Lieferung), keine zweite Probe.
        if action in ("sample", "sample_owner"):
            ids = [x["id"] for x in db.select("messages", {"prospect_id": f"eq.{p['id']}", "select": "id"})]
            if ids and db.select("email_events", {"message_id": f"in.({','.join(ids)})", "type": "eq.sample_requested",
                                                  "select": "id"}):
                action = "owner"
                c["intent"] = "buy"
                c["summary_de"] = "Will nach der Probe weitermachen (wöchentliche Lieferung): " + c.get("summary_de", "")
        print(f"{p['company_name']:<35} {c['intent']:<14} -> {action:<12} ({c['by']}) {c['summary_de']}")
        if not args.apply:
            continue

        event_type = {"buy": "reply_positive", "sample": "sample_requested", "not_interested": "reply_negative",
                      "unsubscribe": "reply_negative", "out_of_office": "auto_reply"}.get(c["intent"], "reply")
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
            body, blocks = sample_mail(lang, area_of(p.get("region")), files, regional)
            if body:
                send_reply(sender, subject, body, mid, lang, files, blocks, requested=True)
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
                         f"Bitte selbst antworten (Antworten in deinem Postfach)."
                         + (" Ich habe nur eine kurze Eingangsbestätigung geschickt." if c["intent"] in ("buy", "question")
                            else " Ich habe nicht geantwortet."))
            if c["intent"] not in ("buy", "question"):
                handled["owner"] += 1
                continue  # unklar: nur den Inhaber informieren, keine Zusage an den Absender
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
