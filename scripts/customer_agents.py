#!/usr/bin/env python3
"""Kunden-Agenten: persönlicher KI-Ansprechpartner je Abo ab Pro (Bauplan docs/KUNDEN-AGENTEN.md).

  python scripts/customer_agents.py ensure [--welcome] [--dry-run]   # Agenten für passende Abos anlegen/pausieren
  python scripts/customer_agents.py welcome <agent_id> [--dry-run]   # Begrüßung mit 4 einfachen Fragen senden
  python scripts/customer_agents.py inbox [--days 14] [--dry-run]    # Kundenmails zuordnen, Aufträge anlegen
  python scripts/customer_agents.py reply <agent_id> <datei> [--dry-run]   # Antwort prüfen, Signatur, senden
  python scripts/customer_agents.py profile <agent_id> '<json>' [--dry-run]  # Profil mergen, Lieferfilter ableiten
  python scripts/customer_agents.py checkin [--dry-run]              # Nachfrage nach der 2. und 4. Lieferung

Regeln (CLAUDE.md, Bauplan): Agent immer als KI erkennbar (Signatur + Hinweis in der ersten Mail), sehr einfache
Sprache (40–120 Wörter), nie Preise/Beträge/Rabatte/Verträge/Garantien. Preis-, Vertrags-, Kündigungs- und
Beschwerdefragen gehen an den Inhaber (Mail + Push wie Kaufinteresse). Mails nur an zahlende Kunden über Resend
(Einwilligung liegt vor), höchstens 1 eigene Mail pro Woche, `mail_opt_out` und Sperrliste immer beachten.
Lieferungen laufen unabhängig davon weiter; Drei-Stufen-Freigabe und „jeder Lead einmal pro Abo“ bleiben.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

PERSONAS = Path(__file__).resolve().parents[1] / "app" / "lib" / "personas.json"  # einzige Quelle (App + Skripte)
PRO_WEEKLY = 40                 # Pro = bis 40 Leads/Woche (Inhaber 04.10.2026); individuell ab dieser Menge bekommt auch einen Agenten
TASK_AGENT = 9                  # agent_tasks.agent für alle Kunden-Aufträge (wie KUNDE_TASK_AGENT in der App; A1–A8 bleiben dem Inhaber)
TASK_BY = "Kunden-Agent"
MIN_WORDS, MAX_WORDS = 40, 120
MAX_SENTENCE_WORDS = 25
OWN_MAIL_GAP = dt.timedelta(days=7)    # höchstens 1 eigene Mail pro Woche zusätzlich zur Lieferung
CHECKIN_AFTER = (2, 4)                 # Nachfrage nach der 2. und 4. gesendeten Lieferung
CHECKIN_DELAY = dt.timedelta(days=3)   # erst wenn der Kunde mit den Leads arbeiten konnte
WELCOME_GRACE = dt.timedelta(minutes=5)  # Willkommensmail der App (kündigt die Fragen an) kommt zuerst; die Fragen
                                         # sendet ensure --welcome (antworten.yml alle 10 min) -> binnen ~15–30 min
PROFILE_KEYS = ("zielgruppe", "leistungen", "ziele", "signale", "branchen", "groesse", "regionen", "notizen")
LIST_KEYS = ("signale", "branchen", "regionen")
KPI_KEYS = ("rueckmeldungen", "gute_leads", "abschluesse")

_now = lambda: dt.datetime.now(dt.timezone.utc)  # noqa: E731


# ---------------------------------------------------------------------------------------------------------------
# Identität

def load_personas() -> dict:
    """Einzige Persona-Quelle: app/lib/personas.json (auch von der App gelesen)."""
    return json.loads(PERSONAS.read_text(encoding="utf-8"))


def lang_for(country: str | None) -> str:
    """Sprache des Kunden: Frankreich Französisch, sonst Englisch (wie langFor in der App)."""
    return "fr" if (country or "").strip().upper() == "FR" else "en"


def fnv1a32(s: str) -> int:
    """FNV-1a 32 Bit über die UTF-8-Bytes (gleiche Rechnung wie fnv1a32 in app/lib/customer-agents.ts)."""
    h = 0x811C9DC5
    for b in str(s).encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def full_name(p: dict) -> str:
    return f"{(p or {}).get('first_name') or ''} {(p or {}).get('last_name') or ''}".strip()


def _norm_name(s: str) -> str:
    return " ".join(str(s or "").split()).lower()


def pick_persona(seed: str, lang: str, taken: set[str] | None = None, data: dict | None = None) -> dict:
    """Deterministische Identität aus der Abo-ID – dieselbe Regel wie pickPersona in der App (Regel: _doc in
    app/lib/personas.json, gemeinsame Fälle tests/fixtures/persona_cases.json). Ein schon vergebener Name wird
    übersprungen, solange noch einer frei ist (je Kunde ein anderer Name)."""
    data = data or load_personas()
    lang = lang if lang in ("en", "fr") and lang in data else "en"
    P = data[lang]
    V = len(P["first_names"])
    N = V * len(P["last_names"])
    h = fnv1a32(str(seed).strip().lower())
    used = {_norm_name(x) for x in (taken or set())}

    def at(i: int) -> tuple[dict, str]:
        return P["first_names"][i % V], P["last_names"][i // V]

    f, last = at(h % N)
    for k in range(N):
        cf, cl = at((h + k) % N)
        if _norm_name(f"{cf['name']} {cl}") not in used:
            f, last = cf, cl
            break
    g = f["g"]
    return {"first_name": f["name"], "last_name": last, "role": P["role"][g], "lang": lang,
            "bio": P["bios"][(h >> 8) % len(P["bios"])], "tone": P["tone"], "gender": g}


def _gender(persona: dict) -> str:
    return "m" if (persona or {}).get("gender") == "m" else "f"  # wie signature() in der App: ohne Angabe „f“


def signature_text(persona: dict, lang: str | None = None, data: dict | None = None) -> str:
    """„AI account manager at NextGen Profit“ – der KI-Hinweis steht in jeder Mail (EU-KI-Verordnung Art. 50)."""
    data = data or load_personas()
    lang = lang or persona.get("lang") or "en"
    P = data.get(lang) if lang in ("en", "fr") else None
    return (P or data["en"])["signature"][_gender(persona)]


def ai_note(persona: dict, owner: str, data: dict | None = None) -> str:
    data = data or load_personas()
    lang = persona.get("lang") if persona.get("lang") in ("en", "fr") else "en"
    return data[lang]["ai_note"][_gender(persona)].format(owner=owner)


CLOSING = {"en": "Best regards,", "fr": "Bien cordialement,"}
CLOSING_LINE = re.compile(r"^\s*(best( regards)?|kind regards|regards|thanks|cheers|bien (cordialement|à vous)|"
                          r"cordialement|merci)[,!.]?\s*$", re.I)


def with_signature(body: str, persona: dict, data: dict | None = None) -> str:
    """Text + Gruß + Name + KI-Signatur. Ein vom Schreiber mitgelieferter Gruß am Ende wird ersetzt."""
    lines = body.strip().splitlines()
    # Gruß in den letzten Zeilen (ggf. mit Namen darunter) abschneiden – die Signatur kommt immer von hier
    cut = next((i for i in range(len(lines) - 1, max(len(lines) - 4, 0) - 1, -1) if CLOSING_LINE.match(lines[i])), None)
    if cut is not None and cut > 0:
        lines = lines[:cut]
    while lines and not lines[-1].strip():
        lines.pop()
    lang = persona.get("lang") or "en"
    return ("\n".join(lines).strip() + f"\n\n{CLOSING.get(lang, CLOSING['en'])}\n{full_name(persona)}\n"
            + signature_text(persona, lang, data))


def display_from(mail_from: str, persona: dict) -> str:
    """Absendername „Emma Clarke (AI) | NextGen Profit <adresse>“ – Adresse bleibt die bestehende Absenderadresse."""
    from email.utils import parseaddr
    from lib.rules import brand
    addr = parseaddr(mail_from or "")[1] or mail_from
    tag = "IA" if persona.get("lang") == "fr" else "AI"
    name = re.sub(r'["\\<>\r\n]', "", f"{full_name(persona)} ({tag}) | {brand()}")
    return f'"{name}" <{addr}>'


# ---------------------------------------------------------------------------------------------------------------
# Paket-Regel

def weekly(sub: dict) -> int:
    f = sub.get("filters") or {}
    try:
        return int(f.get("max_per_week") or 0)
    except (TypeError, ValueError):
        return 0


def eligible(sub: dict, customer: dict | None = None) -> bool:
    """Agent ab Pro: Paket `pro`, oder `custom`/ohne Paket mit mindestens 40 Leads/Woche; nie `starter`.
    Nur aktive Abos zahlender Kunden (kein Stripe-Testkauf)."""
    from deliveries import deliverable_customer
    customer = customer if customer is not None else (sub.get("customers") or {})
    if sub.get("status") != "active" or not deliverable_customer(customer):
        return False
    pkg = (sub.get("package") or "").strip().lower()
    if pkg == "pro":
        return True
    if pkg in ("", "custom"):
        return weekly(sub) >= PRO_WEEKLY
    return False


# ---------------------------------------------------------------------------------------------------------------
# Textprüfung (wie lintAnswer in app/lib/antworten.ts, zusätzlich Rabatte/Verträge)

_PERIOD = (r"(/\s*(mo|mon|month|mth|yr|year|mois|an|monat|jahr)\b|(per|a|an|each|every|pro|par|im|je|al)\s+"
           r"(month|year|monat|jahr|mois|an|année|annee|mes)\b|monthly|yearly|annually|mensuel|monatlich|jährlich)")
BANNED = [
    (re.compile(r"[$€£¥¢₹₩₽฿₠-⃏]"), "Währungszeichen"),
    (re.compile(r"\d[\d.,\s]*\s?(eur|euros?|usd|dollars?|bucks|gbp|pounds?|quid|chf|sek|nok|dkk|cad|aud|inr|cents?)\b",
                re.I), "Betrag"),
    (re.compile(r"\b(eur|usd|gbp|chf|sek|nok|dkk|cad|aud|inr)\s?\d", re.I), "Betrag"),
    (re.compile(r"\d[\d.,]*\s*" + _PERIOD, re.I), "Betrag pro Zeitraum"),
    (re.compile(r"preis", re.I), "„Preis“"),
    (re.compile(r"\bpric(e|es|ed|ing|ey)\b", re.I), "„price“"),
    (re.compile(r"\bprix\b", re.I), "„prix“"),
    (re.compile(r"\btarif", re.I), "„Tarif“"),
    (re.compile(r"guarant", re.I), "„guarantee“"),
    (re.compile(r"garanti", re.I), "„Garantie“"),
    (re.compile(r"\b(discount|rabatt|remise|réduction|reduction|coupon|free month|mois gratuit)", re.I), "Rabatt"),
    (re.compile(r"\b(contract|contrat|vertrag)", re.I), "Vertrag"),
]
BANNED_COMPACT = [(re.compile(p), w) for p, w in (("preis", "„Preis“"), ("price|pricing", "„price“"), ("prix", "„prix“"),
                                                  ("guarant", "„guarantee“"), ("garanti", "„Garantie“"))]
_LOOKALIKE = str.maketrans({"а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p",
                            "с": "c", "т": "t", "у": "y", "х": "x", "і": "i", "ї": "i", "ј": "j", "ѕ": "s", "ԁ": "d",
                            "ɡ": "g", "α": "a", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t",
                            "υ": "u", "χ": "x"})


def _lint_copy(text: str) -> str:
    t = unicodedata.normalize("NFKD", text)
    t = "".join(c for c in t if not unicodedata.category(c).startswith("M"))
    t = unicodedata.normalize("NFKC", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Cf")
    return t.translate(_LOOKALIKE)


def lint(text: str) -> list[str]:
    """Verbotene Inhalte: Preise, Beträge, Währungen, Rabatte, Verträge, Garantien (auch getarnt)."""
    raw = str(text or "")
    t = _lint_copy(raw)
    compact = re.sub(r"[\W_]+", "", t.lower())
    errs: list[str] = []
    for rx, what in BANNED:
        if (rx.search(t) or rx.search(raw)) and f"kein {what}" not in errs:
            errs.append(f"kein {what}")
    for rx, what in BANNED_COMPACT:
        if rx.search(compact) and f"kein {what}" not in errs:
            errs.append(f"kein {what}")
    return errs


def words(text: str) -> int:
    return len(re.findall(r"[^\W_]+(?:['’-][^\W_]+)*", text or ""))


def check_text(text: str) -> list[str]:
    """Schreibregeln der Kunden-Agenten: 40–120 Wörter, kurze Sätze, nichts Verbotenes."""
    errs = []
    if not (text or "").strip():
        return ["Text fehlt"]
    n = words(text)
    if n < MIN_WORDS or n > MAX_WORDS:
        errs.append(f"{n} Wörter – erlaubt {MIN_WORDS}–{MAX_WORDS}")
    long = [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if words(s) > MAX_SENTENCE_WORDS]
    if long:
        errs.append(f"Satz zu lang (höchstens {MAX_SENTENCE_WORDS} Wörter): „{long[0].strip()[:60]}…“")
    return errs + lint(text)


# ---------------------------------------------------------------------------------------------------------------
# Mails (Texte)

def owner_first() -> str:
    from responder import owner_name
    return owner_name().split()[0]


def welcome_text(persona: dict, owner: str | None = None) -> tuple[str, str]:
    """Begrüßung: Vorstellung, KI-Hinweis, 4 einfache Fragen (Bauplan „Was der Agent tut“ 1)."""
    owner = owner or owner_first()
    first, lang = persona["first_name"], persona.get("lang") or "en"
    note = ai_note(persona, owner)
    if lang == "fr":
        return (f"{first}, votre interlocuteur chez NextGen Profit" if _gender(persona) == "m"
                else f"{first}, votre interlocutrice chez NextGen Profit",
                f"Bonjour,\n\nJe m'appelle {full_name(persona)}. Je m'occupe de vos pistes chez NextGen Profit. {note}\n\n"
                "Quatre petites questions pour bien choisir vos pistes :\n"
                "1. Quels clients cherchez-vous (secteur, taille) ?\n"
                "2. Que leur vendez-vous ?\n"
                "3. Quel est votre objectif pour les 3 prochains mois (par exemple, nombre de nouveaux clients) ?\n"
                "4. Quels signaux comptent le plus pour vous (par exemple, pas de site web, entreprise récente) ?\n\n"
                "Répondez simplement à cet e-mail. Quelques mots suffisent.")
    return (f"{first}, your account manager at NextGen Profit",
            f"Hello,\n\nI am {full_name(persona)}. I look after your leads at NextGen Profit. {note}\n\n"
            "Four short questions, so I can pick the right leads for you:\n"
            "1. Which customers are you looking for (industry, size)?\n"
            "2. What do you sell to them?\n"
            "3. What is your goal for the next 3 months (for example, number of new customers)?\n"
            "4. Which signals matter most to you (for example, no website, new company)?\n\n"
            "Just reply to this email. A few words are enough.")


def checkin_text(persona: dict, n: int) -> tuple[str, str]:
    """Kurze Nachfrage nach der 2./4. Lieferung: passt es, gab es einen Abschluss? Ohne Druck."""
    if (persona.get("lang") or "en") == "fr":
        return ("Vos pistes vous conviennent-elles ?",
                f"Bonjour,\n\nVous avez reçu votre livraison numéro {n}. J'aimerais savoir si les pistes vous conviennent. "
                "Un simple « oui », « non » ou « en partie » suffit.\n\n"
                "Et si une piste est devenue un client, dites-le-moi aussi. "
                "Cela m'aide à mieux choisir vos pistes la semaine prochaine.")
    return ("Do your leads fit?",
            f"Hello,\n\nYou have now had delivery number {n}. I would like to know if the leads fit what you need. "
            "A short \"yes\", \"no\" or \"partly\" is enough.\n\n"
            "And if one of the leads became a customer, please tell me too. "
            "It helps me pick better leads for you next week.")


def agent_footer(lang: str) -> str:
    from lib.rules import brand, postal_address
    hint = ("Vous préférez ne plus recevoir de messages de votre interlocuteur ? Répondez « stop messages ». "
            "Vos pistes hebdomadaires continuent." if lang == "fr" else
            "Prefer no messages from your account manager? Reply \"stop messages\". Your weekly leads continue.")
    return f"{brand()} · {postal_address()}".strip(" ·") + "\n" + hint


# ---------------------------------------------------------------------------------------------------------------
# Kundenmails einordnen

SENSITIVE = [
    ("kuendigung", re.compile(r"\b(cancel\w*|terminat\w*|résili\w*|annul\w*|kündig\w*|stop (my|the|our) (plan|subscription))",
                              re.I)),
    ("beschwerde", re.compile(r"\b(complain\w*|disappoint\w*|unhappy|not happy|useless|waste of|terrible|scam|lawyer|"
                              r"réclamation|déçu\w*|mécontent\w*|plainte|arnaque|avocat|beschwer\w*|enttäuscht|"
                              r"unzufrieden|anwalt)", re.I)),
    ("vertrag", re.compile(r"\b(contract\w*|contrat\w*|vertrag\w*|subscription|abonnement|upgrade|downgrade|"
                           r"notice period|préavis|kündigungsfrist|terms and conditions|cgv)", re.I)),
    ("preis", re.compile(r"\b(price\w*|pricing|cost\w*|invoice\w*|billing|bill|refund\w*|discount\w*|cheaper|"
                         r"payment\w*|prix|tarif\w*|factur\w*|rembours\w*|remise|réduction|paiement|preis\w*|kosten|"
                         r"rechnung\w*|rabatt\w*|erstatt\w*|zahlung\w*)", re.I)),
]
TOPIC_DE = {"preis": "Preis/Rechnung", "vertrag": "Vertrag/Abo", "kuendigung": "Kündigung", "beschwerde": "Beschwerde"}
AGENT_OPTOUT = re.compile(r"\b(stop messages?|no more (messages|emails)|plus de messages|ne plus (m'|nous )?écrire|"
                          r"keine (nachrichten|mails) mehr)\b", re.I)


def sensitive_topic(text: str) -> str | None:
    """Thema, das nur der Inhaber beantwortet (Preis, Vertrag, Kündigung, Beschwerde) – sonst None."""
    for topic, rx in SENSITIVE:
        if rx.search(text or ""):
            return topic
    return None


def wants_no_agent_mail(text: str) -> bool:
    from inbox import is_optout_text
    return bool(AGENT_OPTOUT.search(text or "")) or is_optout_text(text or "")


def norm_email(e: str | None) -> str:
    from email.utils import parseaddr
    return (parseaddr(e or "")[1] or (e or "")).strip().lower()


def match_customer(sender: str, customers: list[dict]) -> dict | None:
    """Kunde zu einer Absenderadresse (customers.billing_email, Groß-/Kleinschreibung egal)."""
    s = norm_email(sender)
    if "@" not in s:
        return None
    return next((c for c in customers if norm_email(c.get("billing_email")) == s), None)


def agent_for_customer(customer_id: str, agents: list[dict]) -> dict | None:
    """Aktiver Agent des Kunden (bei mehreren Abos der zuletzt angelegte nicht pausierte, sonst irgendeiner)."""
    mine = [a for a in agents if a.get("customer_id") == customer_id]
    live = [a for a in mine if a.get("status") != "pausiert"]
    pool = live or mine
    return sorted(pool, key=lambda a: str(a.get("created_at") or ""))[-1] if pool else None


def agent_for_sender(db, sender: str) -> dict | None:
    """Für responder.py: Gehört der Absender zu einem Kunden mit aktivem Agenten? Fehler (Tabelle fehlt noch) = None."""
    try:
        cust = match_customer(sender, db.select_all("customers", {"select": "id,billing_email"}))
        if not cust:
            return None
        agents = db.select("customer_agents", {"customer_id": f"eq.{cust['id']}", "status": "neq.pausiert",
                                               "select": "id,customer_id,status,created_at"})
        return agent_for_customer(cust["id"], agents or [])
    except Exception:  # noqa: BLE001 - ohne Kunden-Agenten bleibt alles wie bisher
        return None


# ---------------------------------------------------------------------------------------------------------------
# Profil -> Lieferfilter

SIGNAL_ALIASES = {"no_https": "security", "website_broken": "broken", "website_not_mobile": "not_mobile",
                  "outdated_website": "website_outdated", "new_company": "new_incorporation"}
SIGNAL_LABEL = {
    "en": {"no_website": "companies without a website", "website_outdated": "companies with an old website",
           "not_mobile": "websites that do not work well on phones", "security": "websites without a secure connection",
           "broken": "broken websites", "new_incorporation": "new companies", "new_director": "new companies",
           "job_open_30d": "companies with open jobs", "jobs_3plus": "companies hiring several people",
           "growth": "growing companies", "expansion": "companies that are expanding", "new_location": "new locations",
           "finance_roles": "companies hiring for finance", "fleet_warehouse": "new transport and warehouse firms"},
    "fr": {"no_website": "les entreprises sans site web", "website_outdated": "les entreprises au site vieillissant",
           "not_mobile": "les sites peu lisibles sur mobile", "security": "les sites sans connexion sécurisée",
           "broken": "les sites en panne", "new_incorporation": "les nouvelles entreprises",
           "new_director": "les nouvelles entreprises", "job_open_30d": "les entreprises qui recrutent",
           "jobs_3plus": "les entreprises qui recrutent plusieurs personnes", "growth": "les entreprises en croissance",
           "expansion": "les entreprises qui s'agrandissent", "new_location": "les nouveaux sites",
           "finance_roles": "les entreprises qui recrutent en finance",
           "fleet_warehouse": "les nouvelles entreprises de transport et d'entrepôt"},
}


def _as_list(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        v = re.split(r"[,;\n]", v)
    return [str(x).strip() for x in v if str(x).strip()]


def normalize_signals(v) -> list[str]:
    from lib.wishes import KEYS
    out = []
    for s in _as_list(v):
        k = SIGNAL_ALIASES.get(s.lower().replace(" ", "_"), s.lower().replace(" ", "_"))
        if k in KEYS and k not in out:
            out.append(k)
    return out[:5]


def merge_profile(old: dict | None, patch: dict) -> dict:
    """Profil-Felder ersetzen (je Schlüssel), null entfernt ein Feld; unbekannte Schlüssel werden ignoriert."""
    out = dict(old or {})
    for k in PROFILE_KEYS:
        if k not in patch:
            continue
        v = patch[k]
        if v is None or v == "" or v == []:
            out.pop(k, None)
        elif k in LIST_KEYS:
            out[k] = [x[:80] for x in _as_list(v)][:10]
        else:
            out[k] = str(v).strip()[:500]
    return out


def merge_kpis(old: dict | None, patch: dict | None) -> dict:
    out = dict(old or {})
    for k, v in (patch or {}).items():
        if k in KPI_KEYS and isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0:
            out[k] = int(v)
    return out


def known_areas(country: str) -> set[str]:
    from lib import regions
    return set({"UK": regions.UK, "US": regions.US, "FR": regions.FR}.get((country or "").upper(), {}))


def filters_from_profile(profile: dict, filters: dict | None, country: str) -> dict:
    """Lieferfilter aus dem Profil – nur innerhalb des gebuchten Landes und Pakets: Land und Menge bleiben,
    Signale/Branchen/Größe werden Prioritäten (`filters.agent`), Regionen nur bekannte Gebiete des Landes (`areas`)."""
    out = dict(filters or {})
    old_agent = dict(out.get("agent") or {})
    prefs = {"signals": normalize_signals(profile.get("signale")),
             "industries": [x.lower()[:40] for x in _as_list(profile.get("branchen"))][:10],
             "size": str(profile.get("groesse") or "").strip()[:40],
             "regions": [r for r in _as_list(profile.get("regionen")) if r in known_areas(country)][:3]}
    prefs = {k: v for k, v in prefs.items() if v}
    if prefs.get("regions"):
        out["areas"] = prefs["regions"]
    elif old_agent.get("regions") and list(out.get("areas") or []) == list(old_agent["regions"]):
        out["areas"] = []  # Wunsch-Regionen des Kunden zurückgenommen; vom Inhaber/Formular gesetzte bleiben
    if prefs:
        out["agent"] = prefs
    else:
        out.pop("agent", None)
    if country:
        out["country"] = out.get("country") or country
    return out


def lead_priority(lead: dict, prefs: dict | None, tag: dict | None = None) -> int:
    """Rang für die Auswahl: passendes Signal +2, passende Branche +1 (sortiert stabil, schließt nichts aus)."""
    if not prefs:
        return 0
    from lib.wishes import matches
    score = 0
    sig = prefs.get("signals") or []
    if sig and any(matches(k, lead) for k in sig):
        score += 2
    ind = prefs.get("industries") or []
    if ind:
        co = lead.get("watch_companies") or {}
        hay = " ".join(str(x or "") for x in ((tag or {}).get("industry"), lead.get("_industry"),
                                               lead.get("event_summary"), co.get("name"))).lower()
        if any(i in hay for i in ind):
            score += 1
    return score


def delivery_note(agent: dict | None, leads: list[dict]) -> str:
    """Kurze persönliche Notiz des Agenten für die Liefermail (einfache Sprache, ohne Preise)."""
    if not agent or agent.get("status") == "pausiert" or agent.get("mail_opt_out"):
        return ""
    p = agent.get("persona") or {}
    if not p.get("first_name"):
        return ""
    lang = p.get("lang") or "en"
    head = f"{full_name(p)} ({signature_text(p, lang)})"
    prefs = filters_from_profile(agent.get("profile") or {}, {}, "").get("agent") or {}
    sig = prefs.get("signals") or []
    hits = sum(1 for l in leads if lead_priority(l, {"signals": sig}) > 0) if sig else 0
    if sig and hits:
        what = SIGNAL_LABEL[lang].get(sig[0], "")
        if lang == "fr":
            return (f"Un mot de {head} : cette semaine, j'ai mis en avant {what}, comme vous me l'avez "
                    "demandé. Est-ce que cela vous convient ? Répondez simplement à cet e-mail.")
        return (f"A note from {head}: this week I put {what} first, as you asked. "
                "Does this fit? Just reply to this email.")
    if agent.get("profile"):
        if lang == "fr":
            return (f"Un mot de {head} : j'ai choisi ces pistes selon ce que vous m'avez dit sur vos clients. "
                    "Dites-moi ce qui vous convient le mieux en répondant à cet e-mail.")
        return (f"A note from {head}: I picked these leads based on what you told me about your customers. "
                "Tell me what works best for you by replying to this email.")
    if lang == "fr":
        return (f"Un mot de {head} : j'apprends encore ce dont vous avez besoin. Répondez à cet e-mail et "
                "dites-moi quels clients vous cherchez. Je choisirai vos pistes en fonction.")
    return (f"A note from {head}: I am still learning what you need. Reply to this email and tell me which "
            "customers you are looking for. I will pick your leads for that.")


# ---------------------------------------------------------------------------------------------------------------
# Check-in

def checkin_due(sent_deliveries: list[dict], kpis: dict | None, last_own_at: str | None,
                now: dt.datetime | None = None) -> int | None:
    """Welche Nachfrage (2 oder 4) jetzt fällig ist – None, wenn keine. Fällig, wenn die n-te Lieferung gesendet ist,
    seitdem CHECKIN_DELAY vergangen ist, die Nachfrage noch nicht lief und die letzte eigene Mail ≥ 7 Tage her ist."""
    now = now or _now()
    done = set((kpis or {}).get("checkins") or [])
    sent = sorted(str(d.get("sent_at") or "") for d in sent_deliveries if d.get("sent_at"))
    if last_own_at and _ts(last_own_at) > now - OWN_MAIL_GAP:
        return None
    for n in sorted(CHECKIN_AFTER, reverse=True):
        if len(sent) >= n and n not in done:
            if max(done, default=0) > n:
                return None
            return n if _ts(sent[-1]) <= now - CHECKIN_DELAY else None
    return None


def _ts(s: str) -> dt.datetime:
    t = dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def recent_failure(messages: list[dict], now: dt.datetime | None = None) -> bool:
    """Eigene Mail in den letzten 24 h gescheitert? Dann keine neue Nachfrage (sonst alle 10 min ein Versuch)."""
    now = now or _now()
    return any(m.get("direction") == "out" and m.get("status") == "fehler" and not m.get("in_reply_to")
               and m.get("created_at") and _ts(m["created_at"]) > now - dt.timedelta(hours=24) for m in messages)


def last_own_mail(messages: list[dict]) -> str | None:
    """Zeitpunkt der letzten eigenen Mail (gesendet, keine Antwort auf den Kunden)."""
    own = [m["created_at"] for m in messages if m.get("direction") == "out" and m.get("status") == "gesendet"
           and not m.get("in_reply_to") and m.get("created_at")]
    return max(own) if own else None


# ---------------------------------------------------------------------------------------------------------------
# Datenbank-Abläufe

AGENT_COLS = ("id,customer_id,subscription_id,status,paused_by,persona,profile,kpis,mail_opt_out,last_contact_at,"
              "created_at")
PAUSED_BY_OWNER = "inhaber"      # vom Inhaber im Dashboard pausiert: ensure aktiviert nie wieder (nur der Inhaber)
PAUSED_BY_SUB = "abo"            # Kündigung/Downgrade/Starter/Test: ensure aktiviert wieder, sobald das Abo passt
SUB_COLS = ("id,customer_id,segment_id,filters,package,status,"
            "customers(company_name,country,billing_email,status,stripe_customer_id,notes)")


def _agent(db, agent_id: str) -> dict:
    rows = db.select("customer_agents", {"id": f"eq.{agent_id}", "select": AGENT_COLS})
    if not rows:
        raise SystemExit(f"Agent {agent_id} nicht gefunden")
    return rows[0]


def _customer(db, customer_id: str) -> dict:
    rows = db.select("customers", {"id": f"eq.{customer_id}", "select": "id,company_name,country,billing_email,status"})
    if not rows:
        raise SystemExit(f"Kunde {customer_id} nicht gefunden")
    return rows[0]


def _messages(db, agent_id: str) -> list[dict]:
    rows = db.select("customer_agent_messages", {"agent_id": f"eq.{agent_id}", "order": "created_at.asc",
                                                 "select": "id,created_at,direction,channel,subject,body,status,"
                                                           "message_id,in_reply_to"})
    return sorted(rows or [], key=lambda m: str(m.get("created_at") or ""))


def _suppressed(db, email: str) -> bool:
    try:
        return bool(db.is_suppressed(email)) or bool(db.is_suppressed(email.split("@")[-1]))
    except Exception:  # noqa: BLE001 - im Zweifel nicht senden
        return True


def send_agent_mail(db, agent: dict, customer: dict, subject: str, body: str, *, in_reply_to: str | None = None,
                    references: str | None = None, dry: bool = False) -> str:
    """Eine Mail des Agenten an den Kunden (Resend, wie die Liefermails). Rückgabe: gesendet, dry, opt_out,
    gesperrt, fehler. Speichert jede gesendete oder gescheiterte Mail im Verlauf."""
    import os
    persona = agent.get("persona") or {}
    lang = persona.get("lang") or lang_for(customer.get("country"))
    to = norm_email(customer.get("billing_email"))
    if agent.get("mail_opt_out"):
        print(f"- {customer.get('company_name')}: Kunde möchte keine Mails des Agenten (mail_opt_out) – nicht gesendet")
        return "opt_out"
    if not to or _suppressed(db, to):
        print(f"- {customer.get('company_name')}: Adresse gesperrt oder fehlt – nicht gesendet")
        return "gesperrt"
    text = with_signature(body, persona)
    footer = agent_footer(lang)
    if dry:
        print(f"[Probelauf] an {to} – Betreff „{subject}“\n\n{text}\n\n{footer}\n")
        return "dry"
    from deliveries import _resend
    from lib.html_email import render
    in_reply_to = re.sub(r"[\r\n]+", " ", in_reply_to).strip()[:500] if in_reply_to else None
    references = re.sub(r"[\r\n]+", " ", references).strip()[:2000] if references else None
    headers = {"In-Reply-To": in_reply_to, "References": references or in_reply_to} if in_reply_to else None
    row = {"agent_id": agent["id"], "direction": "out", "channel": "mail", "subject": subject[:300],
           "body": text[:8000], "in_reply_to": in_reply_to}
    try:
        rid = _resend([to], subject, text + "\n\n" + footer,
                      render(text, footer, lang, signer=(full_name(persona), signature_text(persona, lang))),
                      headers=headers, sender=display_from(os.environ["MAIL_FROM"], persona))
    except Exception as exc:  # noqa: BLE001
        db.insert("customer_agent_messages", {**row, "status": "fehler"})
        print(f"FEHLER Mail an {customer.get('company_name')}: {exc.__class__.__name__}: {str(exc)[:200]}")
        return "fehler"
    try:  # Mail ist raus: ein Speicherfehler darf den Lauf nicht abbrechen (Folgeschritte merken sich den Versand)
        db.insert("customer_agent_messages", {**row, "status": "gesendet", "message_id": rid})
        db.update("customer_agents", {"id": agent["id"]}, {"last_contact_at": _now().isoformat()})
    except Exception as exc:  # noqa: BLE001
        print(f"WARNUNG: gesendete Mail nicht im Verlauf gespeichert ({exc.__class__.__name__}: {str(exc)[:200]})")
    print(f"✓ {customer.get('company_name')}: Mail „{subject}“ gesendet")
    return "gesendet"


def ensure(db, *, welcome: bool = False, dry: bool = False, now: dt.datetime | None = None) -> dict:
    """Agenten für alle passenden Abos anlegen (idempotent, ein Agent je Abo), unpassende pausieren, pausierte
    passende wieder aktivieren. Mit welcome: Begrüßung an Agenten ohne bisherige Mail."""
    now = now or _now()
    data = load_personas()
    subs = db.select_all("subscriptions", {"select": SUB_COLS})
    agents = db.select_all("customer_agents", {"select": AGENT_COLS})
    by_sub = {a["subscription_id"]: a for a in agents}
    taken = {full_name(a.get("persona") or {}) for a in agents}
    out = {"neu": 0, "pausiert": 0, "aktiviert": 0, "begruesst": 0}
    fresh: set[str] = set()
    eligible_subs: set[str] = set()
    for s in sorted(subs, key=lambda s: str(s["id"])):
        c = s.get("customers") or {}
        ok, a = eligible(s, c), by_sub.get(s["id"])
        name = c.get("company_name") or s["id"]
        if ok:
            eligible_subs.add(s["id"])
        if ok and not a:
            persona = pick_persona(s["id"], lang_for((s.get("filters") or {}).get("country") or c.get("country")),
                                   taken, data)
            taken.add(full_name(persona))
            print(f"+ {name}: neuer Agent {full_name(persona)} ({persona['lang']}, {persona['gender']})")
            out["neu"] += 1
            if not dry:
                row = db.insert("customer_agents", {"customer_id": s["customer_id"], "subscription_id": s["id"],
                                                    "status": "onboarding", "persona": persona},
                                upsert_on="subscription_id", ignore_duplicates=True)
                if row:
                    by_sub[s["id"]] = row[0]
                    fresh.add(row[0]["id"])
        elif ok and a and a.get("status") == "pausiert" and a.get("paused_by") != PAUSED_BY_OWNER:
            status = "aktiv" if a.get("profile") else "onboarding"
            print(f"~ {name}: Agent {full_name(a.get('persona') or {})} wieder {status}")
            out["aktiviert"] += 1
            a["status"], a["paused_by"] = status, None
            if not dry:
                db.update("customer_agents", {"id": a["id"]}, {"status": status, "paused_by": None})
        elif not ok and a and a.get("status") != "pausiert":
            print(f"- {name}: Agent {full_name(a.get('persona') or {})} pausiert (Abo gekündigt/Starter/Test)")
            out["pausiert"] += 1
            a["status"], a["paused_by"] = "pausiert", PAUSED_BY_SUB  # nie ein gekündigtes/Starter-Abo im selben Lauf begrüßen
            if not dry:
                db.update("customer_agents", {"id": a["id"]}, {"status": "pausiert", "paused_by": PAUSED_BY_SUB})
    if welcome:
        for sid, a in by_sub.items():
            if sid not in eligible_subs:
                continue  # nur aktive Abos ab Pro (Abo gekündigt, Starter, Test oder gelöscht: keine Begrüßung)
            if a.get("status", "onboarding") != "onboarding" or a.get("mail_opt_out"):
                continue
            created = a.get("created_at")
            if a["id"] not in fresh and created and _ts(created) > now - WELCOME_GRACE:
                continue  # gerade vom Stripe-Webhook angelegt: erst die Willkommensmail der App, dann die Fragen
            if any(m.get("direction") == "out" for m in _messages(db, a["id"])):
                continue
            if send_welcome(db, a, dry=dry) in ("gesendet", "dry"):
                out["begruesst"] += 1
    print(f"Kunden-Agenten: {out}")
    return out


def send_welcome(db, agent: dict, dry: bool = False) -> str:
    customer = _customer(db, agent["customer_id"])
    subject, body = welcome_text(agent.get("persona") or {})
    errs = lint(body)
    if errs:  # Schutz gegen kaputte Textbausteine
        raise SystemExit(f"Begrüßung verletzt Schreibregeln: {errs}")
    return send_agent_mail(db, agent, customer, subject, body, dry=dry)


def task_brief(agent: dict, customer: dict, subject: str, topic: str | None) -> str:
    """Auftragstext (agent_tasks kind „kunde“): gleiches Format wie noteBrief in app/lib/customer-agents.ts –
    „Kunden-Agent <uuid> · <Name> (<Firma>) · …“, Leerraum zusammengefasst, höchstens 1000 Zeichen."""
    p = agent.get("persona") or {}
    country = customer.get("country")
    head = (f"Kunden-Agent {agent['id']} · {full_name(p) or '?'} ({customer.get('company_name') or '?'}"
            f"{', ' + country if country else ''}) · Kundenmail: ")
    rest = (f"{subject[:120] or '(ohne Betreff)'} – Verlauf lesen, Profil mit customer_agents.py profile aktualisieren, "
            "Antwort mit customer_agents.py reply senden.")
    if topic:
        rest += (f" Thema {TOPIC_DE[topic]}: Inhaber ist informiert – nur freundlich bestätigen, dass er sich meldet, "
                 "nichts zusagen.")
    return re.sub(r"\s+", " ", head + rest)[:1000]


def inbox(db, *, days: int = 14, dry: bool = False) -> dict:
    """Kundenmails aus inbound_replies (responder.py liest alle Postfächer) den Kunden-Agenten zuordnen."""
    since = (_now() - dt.timedelta(days=days)).isoformat()
    customers = db.select_all("customers", {"select": "id,company_name,country,billing_email,status"})
    agents = db.select_all("customer_agents", {"select": AGENT_COLS})
    rows = db.select_all("inbound_replies", {"processed_at": f"gte.{since}", "order": "processed_at.asc",
                                             "select": "id,imap_message_id,from_email,subject,body_text,received_at,"
                                                       "status,alert_sent_at,auto_action"})
    out = {"neu": 0, "inhaber": 0, "opt_out": 0}
    todo = []
    for r in rows:
        c = match_customer(r.get("from_email") or "", customers)
        a = agent_for_customer(c["id"], agents) if c else None
        if a and a.get("status") != "pausiert" and r.get("imap_message_id"):
            todo.append((r, c, a))
    have = set()
    ids = [r["imap_message_id"] for r, _, _ in todo]
    for i in range(0, len(ids), 50):
        part = ",".join('"' + x.replace('"', '') + '"' for x in ids[i:i + 50])
        have |= {m["message_id"] for m in db.select("customer_agent_messages",
                                                    {"message_id": f"in.({part})", "select": "message_id"})}
    for r, c, a in todo:
        mid = r["imap_message_id"]
        if mid in have:
            continue
        have.add(mid)
        body = (r.get("body_text") or "").strip() or "(leer)"
        subject = r.get("subject") or ""
        optout = wants_no_agent_mail(body) or wants_no_agent_mail(subject)
        topic = None if optout else sensitive_topic(subject + "\n" + body)
        p = a.get("persona") or {}
        print(f"{c['company_name']:<35} -> {full_name(p)}: „{subject[:60]}“"
              + (" [keine Agenten-Mails mehr]" if optout else f" [Inhaber: {TOPIC_DE[topic]}]" if topic else ""))
        out["neu"] += 1
        if dry:
            continue
        db.insert("customer_agent_messages", {"agent_id": a["id"], "direction": "in", "channel": "mail",
                                              "subject": subject[:300], "body": body[:8000], "status": "empfangen",
                                              "message_id": mid})
        kpis = merge_kpis(a.get("kpis"), {"rueckmeldungen": int((a.get("kpis") or {}).get("rueckmeldungen") or 0) + 1})
        a["kpis"] = {**(a.get("kpis") or {}), **kpis}
        db.update("customer_agents", {"id": a["id"]}, {"last_contact_at": _now().isoformat(), "kpis": a["kpis"],
                                                       **({"mail_opt_out": True} if optout else {})})
        if optout:
            out["opt_out"] += 1
            a["mail_opt_out"] = True
            db.insert("customer_agent_messages", {"agent_id": a["id"], "direction": "notiz", "channel": "mail",
                                                  "body": "Kunde möchte keine Mails des Agenten mehr – Lieferungen laufen weiter.",
                                                  "status": "empfangen"})
            db.update("inbound_replies", {"id": r["id"]}, {"auto_action": "kunde", "status": "erledigt"})
            continue
        db.insert("agent_tasks", {"agent": TASK_AGENT, "kind": "kunde", "market": c.get("country"),
                                  "brief": task_brief(a, c, subject, topic), "created_by": TASK_BY})
        if topic:
            out["inhaber"] += 1
            from responder import alert_once
            try:
                alert_once(db, r, f"[Leads] Kunde fragt nach {TOPIC_DE[topic]}: {c['company_name']}",
                           f"{c['company_name']} ({c.get('country')}) hat an den Kunden-Agenten {full_name(p)} "
                           f"geschrieben. Thema {TOPIC_DE[topic]} beantwortest du selbst – der Agent bestätigt nur, "
                           f"dass du dich meldest.\n\nBetreff: {subject}\n\n{body[:3000]}",
                           reply_id=r["id"], kind="buy" if topic in ("preis", "vertrag") else "unclear",
                           push_title=f"Kunde: {TOPIC_DE[topic]} – {c['company_name']}"[:80], push_body=subject[:160])
            except Exception as exc:  # noqa: BLE001 - Auftrag steht, Meldung versucht der Inhaber im Cockpit
                print(f"  FEHLER Meldung an den Inhaber: {exc.__class__.__name__}: {str(exc)[:200]}")
            db.update("inbound_replies", {"id": r["id"]}, {"auto_action": "kunde"})
        else:
            db.update("inbound_replies", {"id": r["id"]}, {"auto_action": "kunde", "status": "erledigt"})
    print(f"Kundenmails: {out}")
    return out


def reply(db, agent_id: str, path: str, dry: bool = False) -> int:
    """Antwort des Agenten auf die letzte Kundenmail: prüfen, signieren, senden, speichern."""
    body = Path(path).read_text(encoding="utf-8").strip()
    errs = check_text(body)
    if errs:
        print("Antwort NICHT gesendet – bitte umschreiben:\n- " + "\n- ".join(errs))
        return 2
    agent = _agent(db, agent_id)
    customer = _customer(db, agent["customer_id"])
    msgs = _messages(db, agent_id)
    last_in = next((m for m in reversed(msgs) if m.get("direction") == "in" and m.get("channel") == "mail"), None)
    lang = (agent.get("persona") or {}).get("lang") or "en"
    subject = (last_in or {}).get("subject") or ("Votre interlocuteur NextGen Profit" if lang == "fr"
                                                 else "Your account manager at NextGen Profit")
    if last_in and not subject.lower().startswith(("re:", "aw:")):
        subject = f"Re: {subject}"
    mid = (last_in or {}).get("message_id")
    res = send_agent_mail(db, agent, customer, subject[:200], body, in_reply_to=mid, dry=dry)
    if res == "gesendet" and agent.get("status") == "onboarding" and agent.get("profile"):
        db.update("customer_agents", {"id": agent_id}, {"status": "aktiv"})
    return 0 if res in ("gesendet", "dry") else 4


def update_profile(db, agent_id: str, patch: dict, dry: bool = False) -> dict:
    """Profil mergen, Kennzahlen übernehmen, Lieferfilter des Abos neu ableiten."""
    agent = _agent(db, agent_id)
    profile = merge_profile(agent.get("profile"), patch)
    kpis = merge_kpis(agent.get("kpis"), patch.get("kpis"))
    sub = (db.select("subscriptions", {"id": f"eq.{agent['subscription_id']}",
                                       "select": "id,filters,customers(country)"}) or [{}])[0]
    country = (sub.get("filters") or {}).get("country") or (sub.get("customers") or {}).get("country") or ""
    filters = filters_from_profile(profile, sub.get("filters"), country)
    print("Profil:", json.dumps(profile, ensure_ascii=False))
    print("Lieferfilter:", json.dumps(filters, ensure_ascii=False))
    if dry:
        return filters
    status = agent.get("status")
    if status == "onboarding" and profile:
        status = "aktiv"
    db.update("customer_agents", {"id": agent_id}, {"profile": profile, "kpis": {**(agent.get("kpis") or {}), **kpis},
                                                    "status": status})
    if sub.get("id") and filters != (sub.get("filters") or {}):
        db.update("subscriptions", {"id": sub["id"]}, {"filters": filters})
    db.insert("customer_agent_messages", {"agent_id": agent_id, "direction": "notiz", "channel": "dashboard",
                                          "body": ("Profil aktualisiert: " + ", ".join(k for k in PROFILE_KEYS
                                                                                     if k in patch))[:8000],
                                          "status": "empfangen"})
    return filters


def checkin(db, *, dry: bool = False, now: dt.datetime | None = None) -> dict:
    """Nachfrage nach der 2. und 4. Lieferung – höchstens 1 eigene Mail pro Woche, nie bei mail_opt_out."""
    now = now or _now()
    out = {"gesendet": 0, "geplant": 0}
    agents = db.select_all("customer_agents", {"status": "in.(onboarding,aktiv)", "mail_opt_out": "eq.false",
                                               "select": AGENT_COLS})
    for a in agents:
        sent = db.select("deliveries", {"subscription_id": f"eq.{a['subscription_id']}", "status": "eq.sent",
                                        "select": "id,sent_at"})
        msgs = _messages(db, a["id"])
        if recent_failure(msgs, now):
            continue
        n = checkin_due(sent or [], a.get("kpis"), last_own_mail(msgs), now)
        if not n:
            continue
        customer = _customer(db, a["customer_id"])
        subject, body = checkin_text(a.get("persona") or {}, n)
        res = send_agent_mail(db, a, customer, subject, body, dry=dry)
        if res == "gesendet":
            out["gesendet"] += 1
            kpis = {**(a.get("kpis") or {}), "checkins": sorted(set((a.get("kpis") or {}).get("checkins") or []) | {n})}
            db.update("customer_agents", {"id": a["id"]}, {"kpis": kpis, "next_checkin_at": None})
        elif res == "dry":
            out["geplant"] += 1
    print(f"Check-ins: {out}")
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("ensure")
    e.add_argument("--welcome", action="store_true", help="Begrüßung an Agenten ohne bisherige Mail senden")
    w = sub.add_parser("welcome")
    w.add_argument("agent_id")
    i = sub.add_parser("inbox")
    i.add_argument("--days", type=int, default=14)
    r = sub.add_parser("reply")
    r.add_argument("agent_id")
    r.add_argument("datei")
    p = sub.add_parser("profile")
    p.add_argument("agent_id")
    p.add_argument("json", help="JSON-Text oder @datei.json")
    sub.add_parser("checkin")
    for x in (e, w, i, r, p, sub.choices["checkin"]):
        x.add_argument("--dry-run", action="store_true", help="nur anzeigen, nichts senden oder speichern")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    from lib.owner_settings import paused
    if args.cmd == "ensure":
        welcome = args.welcome
        if welcome and paused(db, "kundenlieferung"):
            print("Kundenlieferung pausiert durch Inhaber – Agenten werden angelegt, aber keine Begrüßung gesendet")
            welcome = False
        ensure(db, welcome=welcome, dry=args.dry_run)
    elif args.cmd == "welcome":
        res = send_welcome(db, _agent(db, args.agent_id), dry=args.dry_run)
        return 0 if res in ("gesendet", "dry") else 4
    elif args.cmd == "inbox":
        inbox(db, days=args.days, dry=args.dry_run)
    elif args.cmd == "reply":
        return reply(db, args.agent_id, args.datei, dry=args.dry_run)
    elif args.cmd == "profile":
        raw = Path(args.json[1:]).read_text(encoding="utf-8") if args.json.startswith("@") else args.json
        patch = json.loads(raw)
        if not isinstance(patch, dict):
            raise SystemExit("Profil muss ein JSON-Objekt sein")
        update_profile(db, args.agent_id, patch, dry=args.dry_run)
    elif args.cmd == "checkin":
        if not args.dry_run and paused(db, "antworten"):
            print("Antwort-Assistent pausiert durch Inhaber – keine automatischen Nachfragen der Kunden-Agenten")
            return 0
        checkin(db, dry=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
