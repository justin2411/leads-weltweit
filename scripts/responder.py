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

from lib.rules import FREEMAIL_DOMAINS, brand, legal_name, normalize_domain, postal_address, suppress  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
INTENTS = ["buy", "sample", "question", "not_interested", "unsubscribe", "out_of_office", "other"]
FAQ_KEYS = ["sources", "frequency", "regions", "data_privacy", "format", "how_it_works", "none"]

FAQ = {
    "en": {
        "sources": "All leads come from public records (company registers, official notices) and companies' own "
                   "websites and careers pages. Every lead lists its source and the date we checked it.",
        "frequency": "New leads are detected daily; subscribers receive a weekly list for their country and signals.",
        "regions": "We currently cover the UK, the US and France, each country-wide. If you only work in certain "
                   "areas, you can narrow the weekly list down after signing up.",
        "data_privacy": "Leads contain company data: name, address, website, the central phone number and email, the "
                        "event and its source, plus the owner or director named in the public register or the "
                        "company's legal notice. No private contact details and no other employees.",
        "format": "You receive a spreadsheet (CSV/Excel) and a clear overview page; each lead has the company, "
                  "the event, the date, the source, an urgency rating and a suggested opening line.",
        "how_it_works": "We monitor public sources for events that create a reason to talk: new registrations, "
                        "long-open vacancies, several roles at once, new locations. You get only those companies.",
    },
    "fr": {
        "sources": "Toutes les pistes proviennent de sources publiques (registres, annonces officielles) et des sites "
                   "des entreprises. Chaque piste indique sa source et la date de vérification.",
        "frequency": "Les pistes sont détectées chaque jour ; les abonnés reçoivent une liste hebdomadaire.",
        "regions": "Nous couvrons actuellement la France, le Royaume-Uni et les États-Unis, chaque pays en entier. "
                   "Après l'inscription, vous pouvez limiter la liste à vos régions.",
        "data_privacy": "Des données d'entreprise : nom, adresse, site, téléphone et e-mail de l'entreprise, événement "
                        "et source, ainsi que le dirigeant inscrit au registre public ou dans les mentions légales. "
                        "Aucune coordonnée privée, aucun autre salarié.",
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


def subject_optout(subject: str | None) -> bool:
    """Abmeldung über den Betreff, z. B. List-Unsubscribe per mailto (Betreff „unsubscribe“, oft ohne Text und
    ohne In-Reply-To)."""
    from inbox import subject_is_optout
    return subject_is_optout(subject)


SYSTEM_LOCAL = re.compile(r"^(mailer-daemon|postmaster|no[-_.]?reply|do[-_.]?not[-_.]?reply|bounces?|"
                          r"dmarc\S*|abuse|notifications?)(\+.*)?$", re.I)
DMARC_SUBJECT = re.compile(r"^(report domain:|dmarc|\[?dmarc|aggregate report)", re.I)


def own_addresses() -> set[str]:
    """Eigene Adressen und Domains (Absender, Antwort-Postfach, Inhaber) – deren Mails sind keine Anfragen."""
    out = set()
    for var in ("MAIL_FROM", "REPLY_TO", "IMAP_USER", "SMTP_USER", "OWNER_EMAIL"):
        addr = parseaddr(os.environ.get(var) or "")[1].lower()
        if "@" in addr:
            out.add(addr)
            dom = addr.split("@")[-1]
            if var in ("MAIL_FROM", "REPLY_TO") and dom not in FREEMAIL_DOMAINS:
                out.add("@" + dom)  # eigene Domain; nie eine Freemail-Domain (sonst fiele jeder Gmail-Absender weg)
    alert = alert_address()
    if alert:
        out.add(alert.lower())
    return out


def is_system_mail(sender: str, msg) -> bool:
    """Mailer-Daemon, noreply, DMARC-Berichte, Newsletter/Listen – keine Meldung an den Inhaber."""
    local = sender.split("@")[0]
    if SYSTEM_LOCAL.match(local) or "dmarc" in sender:
        return True
    if msg.get_content_type() == "multipart/report" or DMARC_SUBJECT.match((msg.get("Subject") or "").strip()):
        return True
    return bool(msg.get("List-Id") or msg.get("List-Unsubscribe"))


def is_recent(msg, hours: int = 48, now: dt.datetime | None = None) -> bool:
    """Nur frische Mails unbekannter Absender melden (kein Schwall alter Mails beim ersten Lauf)."""
    from email.utils import parsedate_to_datetime
    try:
        when = parsedate_to_datetime(msg.get("Date"))
    except (TypeError, ValueError, IndexError):
        return True
    if when is None:
        return True
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    return (now or dt.datetime.now(dt.timezone.utc)) - when <= dt.timedelta(hours=hours)


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


def classify(text: str, subject: str = "") -> dict:
    body = text.strip()[:4000]
    if os.environ.get("ANTHROPIC_API_KEY"):
        prompt_text = (f"Subject: {subject.strip()}\n\n{body}" if subject.strip() else body)
        try:
            import anthropic
            client = anthropic.Anthropic()
            resp = client.messages.create(
                model=os.environ.get("CLAUDE_MODEL") or "claude-sonnet-5",
                max_tokens=1024,
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": CLASSIFY_SCHEMA}},
                messages=[{"role": "user", "content": CLASSIFY_PROMPT.format(text=prompt_text)}],
            )
            if resp.stop_reason != "refusal":
                out = next((b.text for b in resp.content if b.type == "text"), "")
                data = json.loads(out)
                data["by"] = "claude"
                return data
        except Exception as exc:  # noqa: BLE001 - Fallback auf Regeln
            print(f"  Hinweis: Claude-Einordnung fehlgeschlagen ({exc.__class__.__name__}: {str(exc)[:200]}), nutze Regeln")
    if subject_optout(subject):
        return {"intent": "unsubscribe", "faq": ["none"], "needs_owner": False,
                "summary_de": "Abmeldung (Betreff)", "by": "rules"}
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


def reply_content(company: str, subject: str, text: str, in_reply_to: str | None, lang: str,
                  attachments: list[tuple[str, bytes]] | None = None, blocks: dict[str, str] | None = None,
                  requested: bool = False) -> dict:
    """Inhalt einer Antwort-Mail ohne Absender/Empfänger: Betreff, Text, HTML, Kopfzeilen, Anhänge (Base64).
    company: Domain des Empfängers für die Fußzeile (Proben-Vorrat: Platzhalter, die App setzt sie beim Versand)."""
    from lib.html_email import render
    from lib.rules import render_footer
    footer = render_footer(lang, sender_name=legal_name(), postal_address=postal_address(),
                           company=company, unsubscribe_url=None, requested=requested)
    full = text.rstrip() + "\n\n" + footer
    headers = {}
    if in_reply_to:
        headers = {"In-Reply-To": in_reply_to, "References": in_reply_to}
    # "Re:" nur bei echten Antworten (nie gefälscht)
    subj = subject if not in_reply_to or subject.lower().startswith(("re:", "aw:")) else f"Re: {subject}"
    out = {"subject": subj, "text": full, "html": render(text, footer, lang, signer=signer(lang), blocks=blocks),
           "headers": headers}
    if attachments:
        out["attachments"] = [{"filename": n, "content": base64.b64encode(b).decode()} for n, b in attachments]
    return out


def resend_post(payload: dict, idempotency_key: str | None = None) -> str | None:
    """Mail über Resend (nur Empfänger mit Einwilligung). idempotency_key: dieselbe Probe-Anfrage nie doppelt."""
    h = {"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"}
    if idempotency_key:
        h["Idempotency-Key"] = idempotency_key
    r = requests.post("https://api.resend.com/emails", timeout=30, json=payload, headers=h)
    if r.status_code >= 400:
        raise RuntimeError(f"Resend {r.status_code} {r.text}")
    return r.json().get("id")


def send_reply(to: str, subject: str, text: str, in_reply_to: str | None, lang: str,
               attachments: list[tuple[str, bytes]] | None = None, blocks: dict[str, str] | None = None,
               requested: bool = False, idempotency_key: str | None = None) -> str | None:
    content = reply_content(normalize_domain(to.split("@")[-1]), subject, text, in_reply_to, lang, attachments,
                            blocks, requested)
    payload = {"from": os.environ["MAIL_FROM"], "to": [to], **content,
               "reply_to": os.environ.get("REPLY_TO") or os.environ["MAIL_FROM"]}
    return resend_post(payload, idempotency_key)


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


def sample_delay_text(lang: str) -> str:
    """Eingangsbestätigung, wenn noch keine 10 vollständigen Leads bereitliegen (keine Zusage zu Zeit oder Menge)."""
    if lang == "fr":
        return ("Bonjour,\n\nMerci pour votre réponse. Je prépare votre échantillon de 10 pistes vérifiées "
                "et je vous l'envoie personnellement dès qu'il est prêt.\n\n"
                f"Bien cordialement,\n{signature(lang)}")
    return ("Hello,\n\nThank you for your reply. I am putting together your sample of 10 verified leads "
            "and will send it to you personally as soon as it is ready.\n\n"
            f"Best regards,\n{signature(lang)}")


def _sic_lookup(db, rows: list[dict]):
    """SIC-Code je Lead (erste Beobachtung), nur bei Bedarf geladen (Wunsch „Fuhrpark oder Lager“)."""
    ids = sorted({(l.get("observation_ids") or [None])[0] for l in rows} - {None})
    sic = {}
    for i in range(0, len(ids), 100):
        for o in db.select("observations", {"id": f"in.({','.join(ids[i:i + 100])})", "select": "id,details"}):
            if (o.get("details") or {}).get("sic"):
                sic[o["id"]] = str(o["details"]["sic"])
    return lambda l: sic.get((l.get("observation_ids") or [None])[0])


def _firm_key(co: dict | None) -> str:
    """Normalisierter Firmenname: dieselbe Firma zählt nur einmal, auch wenn sie doppelt gespeichert ist."""
    import re as _re
    return "name:" + _re.sub(r"[^a-z0-9]", "", ((co or {}).get("name") or "").lower())


SAMPLE_POOL = 3000  # Kandidaten je Probe (vollständige Leads sind darunter reichlich)


def _newest(db, params: dict, n: int, page: int = 1000) -> list[dict]:
    """Höchstens n Zeilen in der Reihenfolge von params["order"], seitenweise."""
    out: list[dict] = []
    while len(out) < n:
        want = min(page, n - len(out))
        rows = db.select("leads", {**params, "limit": str(want), "offset": str(len(out))})
        out += rows
        if len(rows) < want:
            break
    return out


def best_first(rows: list[dict]) -> list[dict]:
    """Aktuell beste Leads zuerst (Inhaber 03.10.2026): höchste Dringlichkeit, dann frischestes Ereignis."""
    from lib.leadreport import URG
    rows = sorted(rows, key=lambda l: str(l.get("id") or ""))
    rows.sort(key=lambda l: l.get("event_date") or "", reverse=True)
    rows.sort(key=lambda l: URG.get(l.get("urgency") or "", 3))
    return rows


def regional_sample(db, seg: str, country: str, region: str | None,
                    wish: list[str] | None = None, mark: bool = True, picked_out: list | None = None,
                    exclude_companies: set[str] | None = None, gate_context: str = "probe"
                    ) -> tuple[list[tuple[str, bytes]], bool]:
    """10 vollständige Leads aus dem ganzen Land (Inhaber 27.09.2026). (Dateien, True) – sonst ([], False).

    wish: Signal-Schlüssel aus dem Probe-Formular (lib/wishes.py). Passende vollständige Leads kommen zuerst,
    aufgefüllt mit anderen vollständigen Leads der Branche; nie unvollständige.
    picked_out: bekommt die 10 gewählten Leads (Proben-Vorrat reserviert sie selbst, mark=False).
    exclude_companies: Firmen, die schon in einer vorbereiteten Probe stehen (eine Firma nie in zwei Proben)."""
    from deliveries import REQUIRE_CONTACT, _lang, contact_companies, enrich, to_csv
    from lib.regions import area_of, lead_matches
    from lib.wishes import prefer
    area = None  # Leads aus dem ganzen Land (Inhaber 27.09.2026), keine Regionsauswahl mehr
    # Exklusiv (Inhaber 01.10.2026: „jeder lead geht nur an einen käufer“): jede Probe bekommt frische Leads (status new),
    # die danach als sample markiert und nie wieder ausgegeben werden – weder in einer anderen Probe noch in einer Lieferung.
    # Nur die neuesten Kandidaten laden (Index segment_id, country, status, event_date): alle 200.000 S2/US-Leads
    # seitenweise zu lesen lief in einen Statement-Timeout, Probe-Anfragen blieben unbeantwortet (Audit 02.10.2026)
    params = {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "status": "eq.new",
              "select": "id,event_summary,event_date,source_name,source_url,source_date,urgency,"
                        "urgency_reason,opener,signal_type,company_id,observation_ids,"
                        "watch_companies(name,legal_form,city,region,address,website,website_checked_at)",
              "order": "event_date.desc,id"}
    rows = best_first(_newest(db, params, SAMPLE_POOL))
    if exclude_companies:
        rows = [r for r in rows if r.get("company_id") not in exclude_companies]
    if wish:
        from lib.wishes import signal_types
        types = signal_types(wish)
        if types:  # seltene Wunsch-Signale stehen evtl. nicht unter den neuesten Leads: gezielt nachladen
            have = {r["id"] for r in rows}
            extra = _newest(db, {**params, "signal_type": f"in.({','.join(types)})"}, SAMPLE_POOL // 2)
            rows = [r for r in best_first(extra) if r["id"] not in have
                    and r.get("company_id") not in (exclude_companies or ())] + rows
        rows = prefer(rows, wish, _sic_lookup(db, rows) if "fleet_warehouse" in wish else None)
    # Vollständigkeit nur blockweise für die nächsten Kandidaten prüfen (bei 90.000+ Leads war die Prüfung aller
    # Firmen zu langsam; Test 01.10.2026)
    known = {} if REQUIRE_CONTACT else None
    checked = 0
    picked, per = [], {}
    for n, l in enumerate(rows):
        co = l["watch_companies"]
        if known is not None and n >= checked:
            block = sorted({r["company_id"] for r in rows[n:n + 300]})
            known.update(contact_companies(db, website_optional=(seg == "S2"), only=block))
            checked = n + 300
        if known is not None and l["company_id"] not in known:
            continue
        name = _firm_key(co)
        if per.get(l["company_id"], 0) >= 1 or name in per:
            continue
        per[l["company_id"]] = per.get(l["company_id"], 0) + 1
        per[name] = 1  # gleiche Firma unter zwei Datensätzen nur einmal (genau 10 verschiedene Firmen)
        picked.append(l)
        if len(picked) >= 10:
            # „ohne Website“ vor dem Versand mit der aktuellen Suche nachprüfen (Inhaber 02.10.2026, 202main.coffee);
            # wer doch eine Website hat, fliegt raus und wird durch den nächsten Lead ersetzt
            from lib import release_gate
            from lib.site_recheck import drop_with_site
            new = [x for x in picked if not x.get("_rechecked")]
            bad = drop_with_site(db, new)
            for x in picked:
                x["_rechecked"] = True
            # Drei-Stufen-Freigabe je Lead (Inhaber 03.10.2026): nur freigegebene Leads kommen in die Probe
            ok, _ = release_gate.release(db, [x for x in new if x["id"] not in bad], context=gate_context,
                                         country=country)
            bad |= {x["id"] for x in new} - {x["id"] for x in ok}
            if not bad:
                break
            picked = [x for x in picked if x["id"] not in bad]
    if len(picked) < 10 and area:
        # nicht genug vollständige Leads aus der Region: vollständige Leads aus dem ganzen Land
        return _country_sample(db, seg, country, rows, known, mark)
    if len(picked) < 10:
        return [], False  # nie unvollständige Leads verschicken; Inhaber wird benachrichtigt
    for l in picked:
        l["segment_id"] = seg
        l.pop("_rechecked", None)
    enrich(db, picked, known)
    if mark:
        mark_sampled(db, picked)
    if picked_out is not None:
        picked_out.extend(picked)
    data = to_csv(picked, _lang(country), area)
    name = re.sub(r"[^A-Za-z0-9]+", "-", area or country).strip("-")
    from lib.leadreport import attachments
    return attachments(data, _lang(country), area, name="sample-leads", sample=True, **sample_extras(db, seg, country)), True


def mark_sampled(db, picked: list[dict]) -> None:
    """Probe-Leads sind vergeben: status sample, damit sie an keinen anderen Käufer gehen."""
    for l in picked:
        if l.get("id"):
            db.update("leads", {"id": l["id"]}, {"status": "sample"})


def sample_extras(db, seg: str, country: str) -> dict:
    """Für das Proben-PDF: Pakete (settings.pricing), Link zur Zahlungsseite, Zielgruppe und Land."""
    base = (os.environ.get("APP_BASE_URL") or os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").rstrip("/")
    plans = ((db.select("settings", {"select": "pricing"}) or [{}])[0].get("pricing")) or None
    page = db.select("landing_pages", {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "status": "eq.live", "select": "slug"})
    return {"plans": plans, "cta_url": f"{base}/{page[0]['slug']}/start" if page else None, "segment": seg, "country": country}


def _country_sample(db, seg: str, country: str, rows: list[dict], known,
                    mark: bool = True) -> tuple[list[tuple[str, bytes]], bool]:
    from deliveries import _lang, enrich, to_csv
    picked, per = [], {}
    for l in rows:
        name = _firm_key(l.get("watch_companies"))
        if known is not None and l["company_id"] not in known or per.get(l["company_id"], 0) >= 1 or name in per:
            continue
        per[l["company_id"]] = 1
        per[name] = 1
        picked.append({**l, "segment_id": seg})
        if len(picked) >= 10:
            break
    if len(picked) < 10:
        return [], False
    enrich(db, picked, known)
    if mark:
        mark_sampled(db, picked)
    from lib.leadreport import attachments
    return attachments(to_csv(picked, _lang(country)), _lang(country), None, name="sample-leads", sample=True,
                       **sample_extras(db, seg, country)), False


def sample_files(seg: str, country: str) -> list[tuple[str, bytes]]:
    d = ROOT / "samples" / seg / country
    files = []
    for name in ("leads.csv",):
        p = d / name
        if p.exists():
            from lib.leadreport import attachments
            files += attachments(p.read_bytes(), "fr" if country == "FR" else "en", name=f"sample-{seg}-{country}", sample=True)
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


BROCHURES = Path(__file__).resolve().parent / "assets" / "brochure"
BOOKING_SLUG = {("S2", "FR"): "agences-web"}  # übrige aus lib.playbook.SLUG
SHORT_NEED = {"S2": ("a reason to talk to a web agency", "une bonne raison de parler à une agence web")}


def booking_url(segment: str | None, country: str | None) -> str | None:
    """Buchungsseite /{land}/{branche}/start (dort Pakete und Checkout), nur für Länder mit eigener Seite."""
    from lib.playbook import SLUG
    cc = (country or "").upper()
    if not segment or cc not in ("US", "UK", "FR"):
        return None
    slug = BOOKING_SLUG.get((segment, cc)) or SLUG.get(segment)
    if not slug:
        return None
    base = (os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").rstrip("/")
    return f"{base}/{cc.lower()}/{slug}/start"


def brochure(segment: str | None, country: str | None) -> tuple[str, bytes] | None:
    """Erklär-PDF „wie wir helfen“ zur Probe (Inhaber 02.10.2026), falls für Branche und Land vorhanden."""
    f = BROCHURES / f"{segment}-{(country or '').upper()}.pdf"
    if not segment or not f.exists():
        return None
    cc = (country or "").upper()
    title = "Comment-ca-marche" if cc == "FR" else "How-It-Works"
    return f"{title}-{cc}.pdf", f.read_bytes()


def sample_text(lang: str, region: str | None, has_files: bool, regional: bool = True, preview: str = "",
                contacts: bool = False, segment: str | None = None, url: str | None = None) -> str | None:
    """Mail mit der Probe, im Namen des Inhabers (Inhaber 02.10.2026). Ziel: Abo über die Buchungsseite.
    Keine Preise im Text (stehen im PDF und auf der Seite), keine Zusagen, landesweit, keine Regionen."""
    if not has_files:
        return None
    need_en, need_fr = SHORT_NEED.get(segment or "", ("a reason to buy from you right now",
                                                      "une bonne raison de faire appel à vous"))
    if lang == "fr":
        parts = [
            "Bonjour,",
            "Voici vos 10 pistes gratuites de toute la France, en court briefing PDF et en tableau pour votre CRM.",
            f"Chaque piste est une entreprise locale avec {need_fr}, avec téléphone, e-mail, la personne à demander "
            "et une phrase d'accroche.",
            "Mon conseil : commencez par les pistes en priorité haute et utilisez la phrase d'accroche pour la "
            "première minute de l'appel.",
            "Si elles vous conviennent, vous recevez de nouvelles pistes comme celles-ci chaque lundi.",
        ]
        parts.append(f"Choisissez votre formule : {url}" if url else
                     "Répondez simplement à cet e-mail et nous mettons tout en place.")
        if url:
            parts.append("Une question ? Répondez simplement à cet e-mail.")
        parts.append("Bien cordialement,\n" + signature(lang))
    else:
        area = region or "the country"
        parts = [
            "Hello,",
            f"Here are your 10 free leads from across {area}, as a short PDF briefing and a spreadsheet for your CRM.",
            f"Each one is a local business with {need_en}, with phone, email, who to ask for and an opening line.",
            "My tip: start with the leads marked high priority and use the opening line for the first minute of the call.",
            "If they work for you, you get fresh leads like these every Monday.",
        ]
        parts.append(f"Choose your plan: {url}" if url else "Just reply to this email and we will set it up.")
        if url:
            parts.append("Any questions? Just reply to this email.")
        parts.append("Best regards,\n" + signature(lang))
    return "\n\n".join(parts)


def sample_mail(lang: str, region: str | None, files: list[tuple[str, bytes]], regional: bool,
                segment: str | None = None, country: str | None = None) -> tuple[str | None, dict]:
    """(Text, HTML-Blöcke) für die Probe-Mail. Hängt die Erklär-PDF an (falls vorhanden) und macht aus der
    Zeile „Choose your plan: …“ im HTML einen Button zur Buchungsseite."""
    from drafts import LAND
    url = booking_url(segment, country)
    area = LAND.get((country or "").upper()) if lang != "fr" else None
    text = sample_text(lang, area, bool(files), regional, contacts=has_contacts(files), segment=segment, url=url)
    blocks = {}
    if text and files is not None:
        b = brochure(segment, country)
        if b and all(n != b[0] for n, _ in files):
            files.append(b)
    if text and url:
        from lib.html_email import plan_button
        line = next(p for p in text.split("\n\n") if url in p)
        blocks[line] = plan_button(url, lang)
    return text, blocks


def sample_subject(lang: str, region: str | None, country: str | None = None) -> str:
    """Landesweit (Inhaber 27.09.2026): „Your 10 free leads from across the US“."""
    from drafts import LAND
    if lang == "fr":
        return "Vos 10 pistes gratuites de toute la France" if (country or "").upper() == "FR" else "Vos 10 pistes gratuites"
    land = LAND.get((country or "").upper())
    return f"Your 10 free leads from across {land}" if land else "Your 10 free leads"


def hold_text(lang: str) -> str:
    """Kurze Eingangsbestätigung bei Kaufinteresse/Fragen – ohne Zeitversprechen, ohne Zusagen."""
    if lang == "fr":
        return ("Bonjour,\n\nMerci pour votre message. Je reviens vers vous personnellement avec les détails.\n\n"
                f"Bien cordialement,\n{signature(lang)}")
    return ("Hello,\n\nThank you for your message. I will get back to you personally with the details.\n\n"
            f"Best regards,\n{signature(lang)}")


def skipped(sender: str, subject: str, why: str) -> str:
    """Übersprungene Mail im Protokoll sichtbar machen (Absender, Betreff, Grund)."""
    print(f"{sender:<35} übersprungen: {why} ({subject[:60]})")
    return "ignore"


def handle_unknown(db, msg, mid: str, sender: str, text: str, apply: bool, own: set[str]) -> str:
    """Mail von jemandem, den wir nicht angeschrieben haben: Abmeldung sperren, sonst einmal den Inhaber informieren."""
    from inbox import is_bounce
    subject = msg.get("Subject") or ""
    if sender in own or "@" + sender.split("@")[-1] in own:
        return skipped(sender, subject, "eigene Adresse")
    if is_bounce(msg):
        return skipped(sender, subject, "Unzustellbar-Meldung (inbox.py)")
    if is_system_mail(sender, msg):
        return skipped(sender, subject, "Systemmail/Newsletter/DMARC")
    key = f"unknown:{mid}"
    if db.select("email_events", {"dedupe_key": f"eq.{key}", "select": "id"}):
        return "done"
    if subject_optout(subject):
        print(f"{sender:<35} Abmeldung per Betreff (unbekannter Absender) -> suppress")
        if apply:
            try:
                suppress(db, sender, "reply_optout", "responder-subject")
                db.insert("email_events", {"message_id": None, "type": "unsubscribed", "dedupe_key": key,
                                           "note": f"Abmeldung per Betreff von {sender}: {subject[:150]}"})
            except Exception as exc:  # noqa: BLE001 - nächster Lauf versucht es erneut
                print(f"  FEHLER Sperre {sender}: {exc}")
                return "error"
        return "suppress"
    if is_auto_reply(msg):
        return skipped(sender, subject, "automatische Antwort")
    if not is_recent(msg):
        return skipped(sender, subject, "älter als 48 h, NICHT gemeldet")
    print(f"{sender:<35} unbekannter Absender -> owner ({subject[:60]})")
    if apply:
        try:
            notify_owner(f"[Leads] Mail von unbekanntem Absender: {subject[:80] or sender}",
                         f"Im Antwort-Postfach liegt eine Mail von {sender}, der nicht zu einem angeschriebenen Käufer "
                         f"gehört. Ich habe nicht geantwortet.\n\nBetreff: {subject}\n\n{text[:3000]}")
            db.insert("email_events", {"message_id": None, "type": "reply", "dedupe_key": key,
                                       "note": f"Unbekannter Absender {sender}: {subject[:150]}",
                                       "payload": {"unknown_sender": sender}})
        except Exception as exc:  # noqa: BLE001
            print(f"  FEHLER Meldung an den Inhaber ({sender}): {exc}")
            return "error"
    return "owner"


_PAUSED: dict[int, bool] = {}


def auto_replies_paused(db) -> bool:
    """Antwort-Assistent im Dashboard pausiert? (einmal je Lauf und Datenbank gelesen)"""
    if id(db) not in _PAUSED:
        from lib.owner_settings import paused
        _PAUSED[id(db)] = bool(paused(db, "antworten"))
    return _PAUSED[id(db)]


def handle_message(db, msg: EmailMessage, mid: str, apply: bool, own: set[str] | None = None) -> str:
    """Eine Mail aus dem Postfach einordnen und (mit apply) handeln. Rückgabe: Aktion bzw. done/ignore/error.

    Das Ereignis mit dedupe_key wird erst nach den Aktionen gespeichert: scheitert der Versand, bleibt die Mail
    offen und der nächste Lauf versucht es erneut. Ging die Antwort an den Absender schon raus, wird das Ereignis
    trotzdem gespeichert (keine doppelte Antwort)."""
    own = own_addresses() if own is None else own
    dedupe = f"reply:{mid}"
    if db.select("email_events", {"dedupe_key": f"eq.{dedupe}", "select": "id"}):
        return "done"
    sender = parseaddr(msg.get("From") or "")[1].lower()
    if "@" not in sender:
        return "ignore"
    dom = sender.split("@")[-1]
    text = _text(msg)
    # Nur Antworten von Firmen, die wir angeschrieben haben
    pros = db.select("prospects", {"domain": f"eq.{normalize_domain(dom)}", "select": "id,company_name,segment_id,country,region"})
    sent = []
    if pros:
        p = pros[0]
        sent = db.select("messages", {"prospect_id": f"eq.{p['id']}", "status": "eq.sent", "order": "sent_at.desc",
                                      "limit": "1", "select": "id,subject,language,experiment_id"})
    if not sent:
        return handle_unknown(db, msg, mid, sender, text, apply, own)
    m = sent[0]
    lang = m.get("language") or "en"
    if subject_optout(msg.get("Subject")):
        c = {"intent": "unsubscribe", "faq": ["none"], "needs_owner": False,
             "summary_de": "Abmeldung (Betreff)", "by": "subject"}
    elif is_auto_reply(msg):
        c = {"intent": "out_of_office", "faq": ["none"], "needs_owner": False,
             "summary_de": "Automatische Antwort (Kopfzeilen)", "by": "headers"}
    else:
        c = classify(text, msg.get("Subject") or "")
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
    if action != "suppress" and auto_replies_paused(db):
        # Schalter im Dashboard (Inhaber 03.10.2026): automatische Antworten pausiert. Abmeldungen werden IMMER
        # gesperrt (oben: action "suppress"); diese Mail bleibt offen und wird nach dem Einschalten bearbeitet.
        print("  Antwort-Assistent pausiert durch Inhaber – keine automatische Antwort, Mail bleibt offen")
        return "paused"
    if not apply:
        return action

    event_type = {"buy": "reply_positive", "sample": "sample_requested", "not_interested": "reply_negative",
                  "unsubscribe": "reply_negative", "out_of_office": "auto_reply"}.get(c["intent"], "reply")
    files = body = blocks = None
    if action in ("sample", "sample_owner"):
        files, _ = regional_sample(db, p["segment_id"], p["country"], p.get("region"))
        body, blocks = sample_mail(lang, None, files, True, p["segment_id"], p["country"])  # ganzes Land
        if not body and event_type == "sample_requested":
            # Probe nicht lieferbar: nicht als "Probe gesendet" zählen, sonst fragt followups.py nach einer
            # Probe, die nie ankam.
            event_type = "reply_positive"
    state = {"replied": False}

    def perform() -> None:
        subject = msg.get("Subject") or m["subject"]

        def reply(*a, **kw):
            send_reply(*a, **kw)
            state["replied"] = True

        if action == "suppress":
            for addr in {sender}:
                suppress(db, addr, "reply_optout", "responder")
        elif action in ("sample", "sample_owner"):
            if body:
                reply(sender, subject, body, mid, lang, files, blocks, requested=True)
                if event_type != "sample_requested":
                    db.insert("email_events", {"message_id": m["id"], "type": "sample_requested",
                                               "note": "Probe automatisch gesendet"})
            else:
                reply(sender, subject, sample_delay_text(lang), mid, lang)
            if action == "sample_owner" or not body:
                notify_owner(f"[Leads] Bitte ansehen: {p['company_name']}",
                             f"{p['company_name']} ({p['segment_id']}/{p['country']}) hat geantwortet.\n\n"
                             f"Einordnung: {c['summary_de']}\nProbe gesendet: {'ja' if body else 'nein (keine Datei)'}\n\n"
                             f"Antwort von {sender}:\n\n{text[:3000]}")
        elif action == "faq":
            keys = [k for k in c["faq"] if k in FAQ[lang if lang in FAQ else 'en']]
            answers = "\n\n".join(FAQ[lang if lang in FAQ else "en"][k] for k in keys)
            if lang == "fr":
                faq_body = (f"Bonjour,\n\nMerci pour votre "
                            f"question.\n\n{answers}\n\nSouhaitez-vous recevoir l'échantillon gratuit de 10 pistes "
                            f"actuelles ? Il suffit de répondre « oui ».\n\nBien cordialement,\n{signature(lang)}")
            else:
                faq_body = (f"Hello,\n\nThank you for your question."
                            f"\n\n{answers}\n\nWould you like me to send you the free sample of 10 current leads? "
                            f"A simple \"yes\" is enough.\n\nBest regards,\n{signature(lang)}")
            reply(sender, subject, faq_body, mid, lang)
        elif action == "owner":
            notify_owner(f"[Leads] Interessent: {p['company_name']} – {c['summary_de'][:80]}",
                         f"{p['company_name']} ({p['segment_id']}/{p['country']}, {p.get('region') or ''}) "
                         f"hat geantwortet.\n\nEinordnung: {c['intent']} – {c['summary_de']}\n\n"
                         f"Antwort von {sender}:\n\n{text[:3000]}\n\n"
                         f"Bitte selbst antworten (Antworten in deinem Postfach)."
                         + (" Ich habe nur eine kurze Eingangsbestätigung geschickt." if c["intent"] in ("buy", "question")
                            else " Ich habe nicht geantwortet."))
            if c["intent"] not in ("buy", "question"):
                return  # unklar: nur den Inhaber informieren, keine Zusage an den Absender
            hold = hold_text(lang)
            reply(sender, subject, hold, mid, lang)

    note = f"{c['summary_de']} | Aktion: {action}"
    try:
        perform()
    except Exception as exc:  # noqa: BLE001 - nicht abbrechen, nächste Mail bearbeiten
        print(f"  FEHLER bei {p['company_name']} ({action}): {exc.__class__.__name__}: {str(exc)[:300]}")
        if not state["replied"]:
            return "error"  # nichts beim Absender angekommen: kein Ereignis, nächster Lauf versucht es erneut
        note += f" | Fehler nach der Antwort: {exc.__class__.__name__}"
    db.insert("email_events", {"message_id": m["id"], "type": event_type, "dedupe_key": dedupe, "note": note,
                               "payload": {"intent": c["intent"], "faq": c.get("faq"), "by": c["by"]}})
    return action


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
    handled = {"owner": 0, "sample": 0, "faq": 0, "suppress": 0, "ignore": 0, "error": 0, "paused": 0}
    own = own_addresses()
    for num in data[0].split():
        _, fetched = imap.fetch(num, "(BODY.PEEK[])")
        msg: EmailMessage = email.message_from_bytes(fetched[0][1], policy=policy.default)
        mid = (msg.get("Message-ID") or f"imap-{num.decode()}").strip()
        try:
            action = handle_message(db, msg, mid, args.apply, own)
        except Exception as exc:  # noqa: BLE001 - eine kaputte Mail darf den Lauf nicht beenden
            print(f"FEHLER {mid}: {exc.__class__.__name__}: {str(exc)[:300]}")
            action = "error"
        if action in ("done",):
            continue
        key = "sample" if action == "sample_owner" else action
        handled[key if key in handled else "owner"] += 1
    imap.logout()
    print(f"\n{handled}" + ("" if args.apply else "\nProbelauf – mit --apply handeln."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
