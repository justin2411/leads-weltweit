#!/usr/bin/env python3
"""Entwürfe für geprüfte Käufer schreiben (Status draft, nie gesendet).

  python scripts/drafts.py            # für alle prospects mit check_status=ok ohne Mail im Experiment v1
  python scripts/drafts.py --dry-run  # nur anzeigen

Eine Botschaft pro Experiment (v1): gleicher Kern, individueller erster Satz (Firmenname, Kategorie; landesweit,
kein Ort) und zwei Betreffe je Land (A/B, fest je Käufer, messages.subject_variant).
Jeder Entwurf wird gegen die Schreibregeln geprüft; Fehler landen in messages.check_errors.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import catalog  # noqa: E402
from lib.rules import brand, lint_draft, word_count  # noqa: E402

MAX_WORDS = 120  # Schreibregel §7 (lint_draft)

GENERIC_SPEC = {"recruitment", "general recruitment", "financial advice", "independent financial advice",
                "web design", "small business websites", "unverified", "", "it support", "commercial insurance",
                "accounting"}


LAND = {"UK": "the UK", "US": "the US", "IE": "Ireland", "NL": "the Netherlands", "SE": "Sweden", "BE": "Belgium", "FR": "France",
        "FI": "Finland", "SG": "Singapore", "HK": "Hong Kong", "MX": "Mexico", "BR": "Brazil"}
# Sprache der Mail je Land (wie countries.yaml language; Test MailLanguageTests): FR Französisch, BR Portugiesisch,
# MX Spanisch (Inhaber 04.10.2026), sonst Englisch
MAIL_LANG = {"FR": "fr", "BR": "pt", "MX": "es"}
# Land in der eigenen Sprache, landesweit (Inhaber 27.09.2026): „em todo o Brasil“, „en todo México“
LAND_LOCAL = {"pt": {"BR": "Brasil"}, "es": {"MX": "México"}}
AREA_LOCAL = {"pt": {"BR": "em todo o Brasil"}, "es": {"MX": "en todo México"}}
AREA_FROM = {"pt": {"BR": "de todo o Brasil"}, "es": {"MX": "de todo México"}}


def mail_lang(country: str | None) -> str:
    return MAIL_LANG.get((country or "").upper(), "en")


def subject_prefix(country: str | None) -> str:
    """Pflicht-Kennzeichnung am Betreffanfang aus countries.yaml (SG Spam Control Act: „<ADV> “)."""
    from lib.rules import country_rules, load_countries
    global _CFG
    if _CFG is None:
        _CFG = load_countries()
    return country_rules(_CFG, country or "").get("subject_prefix") or ""


_CFG = None


def _place(region: str | None) -> tuple[str, str]:
    """(Ort, Großraum) aus 'Stockport, Greater Manchester' bzw. 'Brooklyn, NY'."""
    parts = [p.strip() for p in (region or "").split(",") if p.strip()]
    if not parts:
        return "your area", "your area"
    town = parts[0]
    area = parts[1] if len(parts) > 1 and not re.fullmatch(r"[A-Z]{2}", parts[1]) else town
    return town, area


def _clean_name(name: str) -> str:
    # Rechtsformen aller Mail-Länder (UK/US/FR/IE/NL/BE/SE) aus der Anrede entfernen
    # Neue Länder 04.10.2026: FI Oy/Oyj, SG Pte Ltd, MX S.A. de C.V./S. de R.L., BR Ltda/S.A./EIRELI
    name = re.sub(r"[\s,]+(S\.?\s?A\.?\s?P\.?\s?I\.?\s?de\s?C\.?\s?V\.?|S\.?\s?A\.?\s?de\s?C\.?\s?V\.?|"
                  r"S\.?\s?de\s?R\.?\s?L\.?(\s?de\s?C\.?\s?V\.?)?|Pte\.?\s?Ltd\.?|Ltda\.?|EIRELI|Oyj|Oy)$",
                  "", name.strip(), flags=re.I)
    return re.sub(r"[\s,]+(Ltd\.?|Limited|LLP|LLC|Inc\.?|Corp\.?|SAS|SARL|SASU|EURL|SA|DAC|CLG|UC|Teo\.?|"
                  r"B\.?V\.?|N\.?V\.?|VOF|BVBA|SRL|SPRL|CommV|AB|HB|KB|S\.A\.)$", "", name.strip(), flags=re.I)


_GENERIC_WORDS = {"website", "websites", "web", "and", "&", "marketing", "solutions", "design", "designs", "agency",
                  "services", "digital", "media", "group", "studio", "studios", "development", "seo", "creative"}


def short_name(name: str) -> str:
    """Firmenname für die Anrede: lange Namen bis vor das erste Allerweltswort kürzen
    („Vertical Insite Website And Marketing Solutions“ -> „Vertical Insite“). Leer = zu lang für eine Anrede."""
    words = _clean_name(name).split()
    if len(words) > 3:
        for i, w in enumerate(words[1:], 1):
            if w.lower().strip(",.") in _GENERIC_WORDS:
                words = words[:i]
                break
    return " ".join(words) if len(words) <= 4 else ""


TAGLINE = {"en": "Exclusive trigger leads for B2B service firms",
           "fr": "Pistes exclusives au bon moment pour les prestataires B2B",
           "pt": "Leads exclusivos no momento certo para prestadores B2B",
           "es": "Leads exclusivos en el momento justo para empresas de servicios B2B"}


def signature(lang: str) -> str:
    """Signatur aus Umgebungsvariablen (GitHub-Secrets/Variablen). Nur Angaben, die es wirklich gibt."""
    name = os.environ.get("SENDER_NAME") or brand()
    company = brand()
    title = os.environ.get("SENDER_TITLE") or {"fr": "Fondateur", "pt": "Fundador", "es": "Fundador"}.get(lang, "Founder")
    tagline = TAGLINE.get(lang, TAGLINE["en"])
    lines = [name, f"{title}, {company}", tagline] if name != company else [company, tagline]
    site = os.environ.get("SENDER_WEBSITE") or "www.nextgen-profit.de"
    lines += [x for x in (site.replace("https://", "").rstrip("/"), os.environ.get("SENDER_PHONE")) if x]
    return "\n".join(lines)


# Erster Satz (CLAUDE.md §7: „Erster Satz zeigt, dass wir die Firma kennen“; Auftrag 04.10.2026): aus echten Daten des
# Käufers (Firmenname + Kategorie aus der Käuferquelle), ohne erfundene Fakten und ohne Ort/Region (landesweit).
# Kategorie -> Mehrzahl, so wie wir den Käufer gesucht haben („while looking at web design studios“).
SPEC_PLURAL = {
    "en": {
        "web designer": "web design studios", "graphic designer": "graphic design studios",
        "social media agency": "social media agencies", "web hosting service": "web hosting providers",
        "internet marketing service": "online marketing agencies", "software development": "software developers",
        "advertising agency": "advertising agencies", "marketing agency": "marketing agencies",
        "media agency": "media agencies", "b2b advertising and marketing service": "B2B marketing agencies",
        "b2b marketing consultant": "B2B marketing consultants", "e commerce service": "e-commerce agencies",
        "employment agency": "recruitment agencies", "recruitment": "recruitment agencies",
        "general recruitment": "recruitment agencies", "insurance agency": "insurance brokers",
        "commercial insurance": "commercial insurance brokers", "accountant": "accountants",
        "accounting": "accounting firms", "bookkeeper": "bookkeepers", "payroll service": "payroll providers",
        "tax service": "tax advisers", "financial advising": "financial advisers", "financial advice": "financial advisers",
        "independent financial advice": "financial advisers", "it support": "IT support firms",
    },
    "fr": {
        "web designer": "agences de création de sites web", "graphic designer": "studios de design graphique",
        "social media agency": "agences de réseaux sociaux", "web hosting service": "hébergeurs web",
        "internet marketing service": "agences de marketing digital",
        "software development": "sociétés de développement logiciel", "advertising agency": "agences de publicité",
        "marketing agency": "agences marketing", "media agency": "agences média",
        "b2b advertising and marketing service": "agences de marketing B2B",
        "b2b marketing consultant": "consultants en marketing B2B", "e commerce service": "agences e-commerce",
        "employment agency": "cabinets de recrutement", "recruitment": "cabinets de recrutement",
        "insurance agency": "courtiers en assurance", "commercial insurance": "courtiers en assurance",
        "accountant": "experts-comptables", "accounting": "cabinets comptables", "bookkeeper": "cabinets comptables",
        "financial advising": "conseillers en gestion de patrimoine",
        "financial advice": "conseillers en gestion de patrimoine",
    },
    # Neue Länder BR/MX (Inhaber 04.10.2026): nur die S2-Käufer-Kategorien des Kunden-Werks
    "pt": {
        "web designer": "agências de criação de sites", "graphic designer": "estúdios de design gráfico",
        "social media agency": "agências de redes sociais", "web hosting service": "empresas de hospedagem de sites",
        "internet marketing service": "agências de marketing digital", "software development": "empresas de software",
        "advertising agency": "agências de publicidade", "marketing agency": "agências de marketing",
        "media agency": "agências de mídia", "b2b advertising and marketing service": "agências de marketing B2B",
        "b2b marketing consultant": "consultores de marketing B2B", "e commerce service": "agências de e-commerce",
    },
    "es": {
        "web designer": "agencias de diseño web", "graphic designer": "estudios de diseño gráfico",
        "social media agency": "agencias de redes sociales", "web hosting service": "proveedores de hosting",
        "internet marketing service": "agencias de marketing digital", "software development": "empresas de software",
        "advertising agency": "agencias de publicidad", "marketing agency": "agencias de marketing",
        "media agency": "agencias de medios", "b2b advertising and marketing service": "agencias de marketing B2B",
        "b2b marketing consultant": "consultores de marketing B2B", "e commerce service": "agencias de e-commerce",
    },
}


def _opener_name(company_name: str | None) -> str:
    """Firmenname für den ersten Satz: Kurzname wie in der Anrede, sonst bereinigter Name bis 5 Wörter.
    Leer, wenn kein brauchbarer Name da ist (zu lang, wie ein Link geschrieben)."""
    raw = (company_name or "").strip()
    if not raw:
        return ""
    name = short_name(raw) or _clean_name(raw)
    if len(name.split()) > 5 or re.search(r"https?://|www\.|\.(com|net|org|io|co|uk|fr|ie|nl|be|se|fi|sg|hk|mx|br)\b",
                                         name, re.I):
        return ""
    return name


def opener(p: dict, lang: str) -> str:
    """Individueller erster Satz aus echten Daten (Firmenname, Kategorie); ehrlich: wir sind bei der Suche nach
    Firmen dieser Art auf sie gestoßen (so finden wir Käufer). Ohne Kategorie: neutraler Satz mit Firmenname."""
    name = _opener_name(p.get("company_name"))
    spec = SPEC_PLURAL.get(lang, SPEC_PLURAL["en"]).get((p.get("specialization") or "").strip().lower())
    if lang == "pt":
        if spec:
            return f"Encontrei {name or 'a sua empresa'} ao pesquisar {spec}."
        return f"Escrevo diretamente para a equipe de {name}." if name else "Escrevo diretamente para a sua equipe."
    if lang == "es":
        if spec:
            return f"Encontré {name or 'su empresa'} mientras buscaba {spec}."
        return f"Escribo directamente al equipo de {name}." if name else "Escribo directamente a su equipo."
    if lang == "fr":
        if spec:
            return f"J'ai découvert {name or 'votre entreprise'} en cherchant des {spec}."
        return f"Je me permets d'écrire directement à {name}." if name else "Je me permets de vous écrire directement."
    if spec:
        return f"I came across {name or 'your firm'} while looking at {spec}."
    return f"I'm writing to the team at {name} directly." if name else "I'm writing to your team directly."


# Zwei Betreffe je Land (A/B-Test, Auftrag 04.10.2026): landesweit, ≤ 60 Zeichen, keine Emojis, kein „Re:“.
# A = bisheriger Betreff (Vergleichsbasis), B = Variante. Zuteilung fest je Käufer (subject_variant).
SUBJECTS = {
    "en": {
        "S1": ("Employers across {area} who need recruitment help", "Recruitment leads: employers hiring across {area}"),
        "S2": ("Local businesses across {area} without a website", "No website yet: local businesses across {area}"),
        "S3": ("Growing businesses across {area}", "IT leads: growing businesses across {area}"),
        "S4": ("New businesses across {area} that need cover", "Insurance leads: new businesses across {area}"),
        "S5": ("New companies across {area} needing an accountant", "Accounting leads: new companies across {area}"),
        "S9": ("New company directors across {area}", "Advice leads: new company directors across {area}"),
        # Marketing-/SEO-Agenturen (Inhaber 05.10.2026): dieselben Firmen wie S2 (keine oder schwache Website)
        "S12": ("Local businesses across {area} with a weak web presence",
                "Marketing leads: local businesses across {area}"),
        "": ("Companies across {area} with a reason to buy", "Trigger leads: companies across {area}"),
    },
    "fr": {
        "S1": ("Employeurs en France qui cherchent de l'aide pour recruter",
               "Pistes de recrutement : employeurs partout en France"),
        "S2": ("Entreprises en France sans site web", "Pas encore de site web : entreprises partout en France"),
        "": ("Nouveaux dirigeants en France", "Pistes : nouveaux dirigeants partout en France"),
    },
    # Neue Länder (Inhaber 04.10.2026): nur S2 (Webagenturen); andere Branchen haben dort keinen Mail-Test
    "pt": {
        "S2": ("Empresas no {land} sem site", "Ainda sem site: empresas locais {area}"),
        "": ("Empresas no {land} com um motivo para comprar", "Leads: empresas {area}"),
    },
    "es": {
        "S2": ("Negocios en {land} sin sitio web", "Aún sin sitio web: negocios locales {area}"),
        "": ("Empresas en {land} con un motivo para comprar", "Leads: empresas {area}"),
    },
}


# Satz 1 der Buchhaltungs-Mail (S5) je Land, Bauplan docs/KALTMAIL-VORLAGE.md §3 (Branchen-Test 05.10.2026):
# nur, was die Quellen wirklich liefern – UK: Neugründungen aus Companies House; US: Neueintragungen (Register, US DOT)
# und junge Firmen mit einer frischen SEC-Form-D-Meldung
S5_FIRST = {
    "UK": "We find companies across the UK that were incorporated in recent weeks, a clear reason for them to talk to "
          "an accountant.",
    "US": "We find new businesses across the US that just registered or just raised capital, a clear reason for them "
          "to talk to an accountant.",
}


# Bausteine 3–6 und 9 der Kaltmail-Vorlage für BR (Portugiesisch) und MX (Spanisch), Inhaber 04.10.2026:
# Wortlaut wie EN/FR („1:1 nachbauen“), landesweit, nur wahre Aussagen, keine Exklusivitätszusage
LOCAL_TEXT = {
    "pt": {
        "greet": "Olá, equipe {short},", "greet_anon": "Olá,", "bye": "Atenciosamente,",
        "intro": "Sou {me}, fundador da {brand}.", "intro_anon": "Sou o fundador da {brand}.",
        "s2": "Encontramos empresas locais {area} que ainda não têm site, um bom motivo para elas falarem com uma "
              "agência web.",
        "other": "Encontramos empresas {area} com um motivo concreto para comprar agora.",
        "core": "Toda segunda-feira você recebe um breve relatório em PDF e uma planilha: empresa, telefone, e-mail, "
                "com quem falar e uma frase de abordagem.",
        "ask": "Preparei uma amostra gratuita com 10 leads atuais {area_from}. Posso enviar?",
    },
    "es": {
        "greet": "Hola, equipo de {short}:", "greet_anon": "Hola:", "bye": "Saludos cordiales,",
        "intro": "Soy {me}, fundador de {brand}.", "intro_anon": "Soy el fundador de {brand}.",
        "s2": "Encontramos negocios locales {area} que todavía no tienen sitio web, una buena razón para que hablen "
              "con una agencia web.",
        "other": "Encontramos empresas {area} con un motivo concreto para comprar ahora.",
        "core": "Cada lunes recibe un breve informe en PDF y una hoja de cálculo: empresa, teléfono, correo, a quién "
                "preguntar y una frase de apertura.",
        "ask": "Preparé una muestra gratuita de 10 leads actuales {area_from}. ¿Se la envío?",
    },
}


def subject_variant(p: dict) -> str:
    """'A' oder 'B', 50/50 und fest je Käufer (Hash der Käufer-ID), damit ein neu geschriebener Entwurf denselben
    Betreff behält und Antworten je Variante gemessen werden können. Den Test gibt es nur in der Freigabe-Liste
    config/fokus.yaml `tests` (Inhaber 04.10.2026: nur Webagenturen US/UK/FR); sonst immer 'A' (Kontrolle)."""
    from lib.fokus import test_allowed
    if not test_allowed(p.get("segment_id"), p.get("country")):
        return "A"
    key = str(p.get("id") or p.get("email") or p.get("company_name") or "")
    return "AB"[hashlib.sha256(key.encode("utf-8")).digest()[0] % 2]


def subject_for(p: dict, lang: str, variant: str | None = None) -> str:
    """Betreff der Variante (A/B) für Segment und Land des Käufers. SG: Pflicht-Präfix „<ADV> “ (Spam Control Act)
    aus countries.yaml subject_prefix, zählt bei den 60 Zeichen mit."""
    table = SUBJECTS.get(lang, SUBJECTS["en"])
    pair = table.get(p.get("segment_id") or "", table[""])
    co = (p.get("country") or "").upper()
    subject = pair[(variant or subject_variant(p)) == "B"].format(
        area=AREA_LOCAL.get(lang, {}).get(co) or LAND.get(co, "your country"), land=LAND_LOCAL.get(lang, {}).get(co, ""))
    prefix = subject_prefix(co)
    room = 60 - len(prefix)
    if len(subject) > room:
        subject = subject[:room - 3].rsplit(" ", 1)[0]
    return prefix + subject


def _example_line(example: dict | None, lang: str) -> str:
    """Ein echter Probe-Lead als Beleg (Firma, Ort, Datum, Quelle)."""
    if not example:
        return ""
    if lang == "fr":
        return (f"Un exemple récent : {example['company']}, {example['event_fr']} "
                f"le {example['date_fr']} ({example['source']}).")
    return f"A recent example: {example['company']}, {example['event']} on {example['date']} ({example['source']})."


def build(p: dict, sender: str | None = None, example: dict | None = None) -> tuple[str, str, str]:
    """(Betreff, Text, Sprache) für einen Käufer. example = echter Probe-Lead aus dem Markt des Käufers."""
    seg, country = p["segment_id"], p["country"]
    firm = _clean_name(p["company_name"])
    # Leads aus dem ganzen Land (Inhaber 27.09.2026), keine Region im Text
    area = LAND.get(country, "your country")
    spec = (p.get("specialization") or "").strip()
    has_spec = spec.lower() not in GENERIC_SPEC
    lang = mail_lang(country)
    fr = lang == "fr"
    ex = _example_line(example, lang) if lang in ("en", "fr") else ""

    # Aufbau (Inhaber 27.09.2026, Richtung "C, auf den Punkt"): persönlich vom Gründer, klarer Nutzen
    # (Leads, mit denen der Käufer Umsatz machen kann, weil die Firmen einen konkreten Anlass haben),
    # Lieferung und Exklusivität in einem Satz, Probe als fertiges Geschenk, Ja/Nein-Frage.
    me = (os.environ.get("SENDER_NAME") or "").split(" ")[0]
    if lang in ("pt", "es"):
        # Neue Länder BR/MX (Inhaber 04.10.2026): Webagenturen-Mail 1:1 nach docs/KALTMAIL-VORLAGE.md übersetzt
        t = LOCAL_TEXT[lang]
        where = AREA_LOCAL[lang].get(country, "")
        intro = t["intro"].format(me=me, brand=brand()) if me else t["intro_anon"].format(brand=brand())
        first = f"{intro} " + (t["s2"] if seg == "S2" else t["other"]).format(area=where)
        core = t["core"]
        ask = t["ask"].format(area_from=AREA_FROM[lang].get(country, ""))
        short = _opener_name(p["company_name"]) and short_name(p["company_name"])
        greet = t["greet"].format(short=short) if short else t["greet_anon"]
        bye = t["bye"]
    elif fr:
        # Betreff: subject_for() (A/B je Käufer, SUBJECTS)
        need, kind = {
            "S1": (f"des employeurs de toute la France qui ont en ce moment un vrai besoin de recrutement, par exemple un poste "
                   "ouvert depuis des semaines ou plusieurs embauches à la fois", "cabinet"),
            "S2": (f"des entreprises de toute la France tout juste créées qui ont encore besoin de leur site web", "agence"),
        }.get(seg, (f"des dirigeants de toute la France qui viennent de créer leur entreprise et se posent leurs premières "
                    "questions de retraite et de prévoyance", "cabinet"))
        intro = (f"Je suis {me}, fondateur de {brand()}." if me else f"Je suis le fondateur de {brand()}.")
        first = f"{intro} Nous livrons des pistes qui se transforment en chiffre d'affaires : {need}."
        core = (f"Elles arrivent chaque lundi en briefing PDF et en tableau, avec téléphone, e-mail, interlocuteur et une "
                f"phrase d'accroche. Chaque piste ne va qu'à "
                f"une seule {'agence' if kind == 'agence' else 'entreprise'} de votre secteur.")
        ask = f"J'ai préparé pour vous un échantillon gratuit de 10 pistes actuelles de toute la France. Je vous l'envoie ?"
        if seg == "S2":
            # Webagenturen (Inhaber 02.10.2026): Leads sind Firmen ohne Website (Overture), nicht unbedingt neu gegründet;
            # Ansprechperson nicht immer mit Namen; keine Exklusivitätszusage in der Kaltmail
            first = (f"{intro} Nous trouvons des entreprises locales de toute la France qui n'ont toujours pas de site web, "
                     "une bonne raison pour elles de parler à une agence web.")
            core = ("Chaque lundi, vous recevez un court briefing PDF et un tableau : entreprise, téléphone, e-mail, "
                    "la personne à demander et une phrase d'accroche.")
            ask = "J'ai préparé pour vous un échantillon gratuit de 10 pistes actuelles de toute la France. Je vous l'envoie ?"
            ex = ""
        greet, bye = "Bonjour,", "Bien cordialement,"
    else:
        # Betreff: subject_for() (A/B je Käufer, SUBJECTS)
        need, kind = {
            "S1": (f"employers across {area} with a real need for recruitment help right now, such as roles open for weeks "
                   "or several hires at once", "agency"),
            "S2": (f"companies across {area} that were just founded and still need their website", "web agency"),
            "S3": (f"companies across {area} that are growing fast and will soon need IT support", "IT firm"),
            "S4": (f"new businesses across {area} that need their first liability, property and employer cover", "broker"),
            "S5": (f"companies across {area} that were just founded and still need an accountant", "practice"),
            "S9": (f"new company directors across {area} facing pension and protection questions for the first time",
                   "advice firm"),
        }.get(seg, (f"companies across {area} with a concrete reason to buy right now", "firm"))
        intro = f"I'm {me}, founder of {brand()}." if me else f"I'm the founder of {brand()}."
        first = f"{intro} We deliver leads you can turn into revenue: {need}."
        core = (f"They arrive every Monday as a short PDF briefing and a spreadsheet, each with phone, email, the contact person "
                f"and an opening line. Each lead goes to one {kind} only.")
        ask = f"I've put together a free sample of 10 current leads from across {area} for you. Shall I send it over?"
        greet, bye = f"Hi {firm} team,", "Best regards,"
        if seg in ("S2", "S12"):
            # Webagenturen (Inhaber 02.10.2026): Leads sind Firmen ohne Website (Overture), nicht unbedingt neu gegründet;
            # Ansprechperson nicht immer mit Namen; keine Exklusivitätszusage in der Kaltmail; kurze Anrede.
            # Marketing-/SEO-Agenturen (S12, Inhaber 05.10.2026): gleiche Leads (S2-Bestand: keine, veraltete, nicht
            # mobile oder unsichere Website), daher „no website or a weak one“; Aufbau 1:1 nach KALTMAIL-VORLAGE.md
            first = (f"{intro} We find local businesses across {area} that still have no website, a clear reason for "
                     "them to talk to a web agency.") if seg == "S2" else (
                     f"{intro} We find local businesses across {area} with no website or a weak one, a clear reason "
                     "for them to talk to a marketing agency.")
            core = ("Every Monday you get a short PDF briefing and a spreadsheet: company, phone, email, who to ask for "
                    "and an opening line.")
            ask = f"I've put together a free sample of 10 current leads from across {area}. Shall I send it over?"
            short = _opener_name(p["company_name"]) and short_name(p["company_name"])  # nie wie ein Link
            greet = f"Hi {short} team," if short else "Hi there,"
            ex = ""
        elif seg == "S5" and country in S5_FIRST:
            # Buchhaltung (Branchen-Test 05.10.2026): 1:1 wie S2 (docs/KALTMAIL-VORLAGE.md), nur Satz 1 und Käufer
            # anders; nur was die Quellen liefern (UK Companies House, US Register/FMCSA/SEC Form D), keine Exklusivität
            first = f"{intro} {S5_FIRST[country]}"
            core = ("Every Monday you get a short PDF briefing and a spreadsheet: company, phone, email, who to ask for "
                    "and an opening line.")
            ask = f"I've put together a free sample of 10 current leads from across {area}. Shall I send it over?"
            short = _opener_name(p["company_name"]) and short_name(p["company_name"])
            greet = f"Hi {short} team," if short else "Hi there,"
            ex = ""
    # Betreff A/B je Käufer; erster Satz individuell aus echten Daten (Auftrag 04.10.2026)
    subject = subject_for(p, lang)
    tail = ([ex] if ex else []) + [core, ask, f"{bye}\n{sender or signature(lang)}"]
    body = "\n\n".join([greet, f"{opener(p, lang)} {first}"] + tail)
    if word_count(body) > MAX_WORDS:
        # längere Texte (S1, Beleg-Satz) bleiben im Rahmen von 70–120 Wörtern: dann ohne Einstiegssatz wie bisher
        body = "\n\n".join([greet, first] + tail)
    return subject, body, lang


def has_variant_column(db) -> bool:
    """Gibt es messages.subject_variant schon (Migration 20261004130000)? Bis sie angewendet ist, schreiben die
    Skripte die Variante nicht mit; sie bleibt dann über subject_variant(prospect) bzw. den Betreff ablesbar."""
    cached = getattr(db, "_subject_variant_col", None)
    if cached is None:
        try:
            db.select("messages", {"select": "subject_variant", "limit": "1"})
            cached = True
        except Exception:  # noqa: BLE001 – Spalte fehlt (PostgREST 400) oder Attrappe ohne select
            cached = False
        try:
            db._subject_variant_col = cached
        except Exception:  # noqa: BLE001
            pass
    return cached


def regional_counts(db) -> dict:
    """(Segment, Land, Käufer-Region) -> Anzahl Leads aus dieser Region."""
    from lib.regions import FR, UK, US, lead_matches
    areas = {"UK": UK, "US": US, "FR": FR}
    county = {}
    for o in db.select_all("observations", {"kind": "eq.incorporation", "select": "company_id,details",
                                            "order": "id"}):
        county[o["company_id"]] = o.get("details") or {}
    out: dict = {}
    for l in db.select_all("leads", {"status": "in.(new,sample)", "order": "id",
                                      "select": "segment_id,country,company_id,watch_companies(address,region,city)"}):
        for area in areas.get(l["country"], {}):
            if lead_matches(l["country"], area, l["watch_companies"], county.get(l["company_id"])):
                k = (l["segment_id"], l["country"], area)
                out[k] = out.get(k, 0) + 1
    return out


def load_examples(db) -> dict:
    """Je Segment und Land ein echter Probe-Lead (status sample) für den Beleg-Satz."""
    out = {}
    months_fr = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
                 "octobre", "novembre", "décembre"]
    for l in db.select("leads", {"status": "eq.sample", "signal_type": "eq.new_incorporation",
                                  "select": "segment_id,country,event_date,source_name,watch_companies(name,city,region)",
                                  "order": "event_date.desc"}):
        key = (l["segment_id"], l["country"])
        if key in out or not l.get("event_date"):
            continue
        import datetime as _dt
        d = _dt.date.fromisoformat(l["event_date"])
        c = l["watch_companies"]
        src = {"US": "NY Department of State", "FR": "BODACC", "UK": "Companies House"}.get(l["country"], l["source_name"])
        out[key] = {"company": c["name"].title().replace("Llc", "LLC").replace("Inc.", "Inc."),
                    "event": "registered", "event_fr": "immatriculée",
                    "date": f"{d:%-d %B %Y}", "date_fr": f"{d.day} {months_fr[d.month - 1]} {d.year}", "source": src}
    return out


def _open_initial(db, page: int = 250):
    """Offene Erstmail-Entwürfe seitenweise nach id (Keyset statt offset): offset 2000 mit eingebetteten Käufern lief
    in die Zeitüberschreitung der Datenbank und ließ den Versandlauf scheitern (Betrieb 05.10.2026)."""
    last = None
    while True:
        params = {"status": "in.(draft,approved)", "sent_at": "is.null", "kind": "eq.initial", "order": "id",
                  "select": "id,status,subject,body,check_errors,prospects(*)", "limit": str(page)}
        if last is not None:
            params["id"] = f"gt.{last}"
        rows = db.select("messages", params) or []
        yield from rows
        if len(rows) < page:
            return
        last = rows[-1]["id"]


def refresh(db, dry_run: bool = False) -> int:
    """Offene Entwürfe neu schreiben (gleicher Käufer, aktueller Text). Verstößt der neue Text gegen eine Regel,
    geht ein freigegebener Entwurf zurück auf draft – nie umgekehrt."""
    n = back = 0
    col = has_variant_column(db)
    for m in _open_initial(db):
        p = m.get("prospects")
        if not p:
            continue
        subject, body, lang = build(p)
        if subject == m["subject"] and body == m["body"]:
            continue
        lint = lint_draft(subject, body, lang)
        from lib.freshness import keep_holds  # Zurückstell-Gründe (Bounce-Analyse 05.10.2026) bleiben stehen
        upd = {"subject": subject, "body": body, "language": lang, "check_errors": keep_holds(m.get("check_errors"), lint.errors),
               **({"subject_variant": subject_variant(p)} if col else {})}
        if m["status"] == "approved" and not lint.ok:
            upd["status"] = "draft"
            back += 1
        n += 1
        if not dry_run:
            db.update("messages", {"id": m["id"]}, upd)
    print(f"{n} Entwürfe neu geschrieben, {back} wegen Regelverstoß zurück auf draft")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--variant", default="v1")
    ap.add_argument("--approve", help="Freigabe des Inhabers (Wortlaut/Datum): Entwürfe ohne Regelverstoß freigeben")
    ap.add_argument("--max-new", type=int, default=300, help="höchstens so viele neue Entwürfe je Experiment und Lauf")
    ap.add_argument("--refresh", action="store_true",
                    help="offene Entwürfe (draft/approved, nicht gesendet) auf den aktuellen Text bringen")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    if args.refresh:
        rc = refresh(db, dry_run=args.dry_run)
        # offene Nachfassmails ebenso auf den aktuellen Stand (landesweiter Betreff, aktueller Text)
        from followups import refresh_open
        refresh_open(db, dry_run=args.dry_run)
        return rc
    # nur laufende Experimente (gestoppte und abgeschlossene bekommen keine neuen Entwürfe)
    exps = {(e["segment_id"], e["country"]): e for e in db.select("experiments", {"variant": f"eq.{args.variant}"})
            if e.get("decision") != "killed" and e.get("status") != "done"}
    # Fokus-Tests zuerst (config/fokus.yaml); bei nur_fokus nur diese (andere Branchen ruhen, Inhaber 02.10.2026)
    from lib.fokus import focus_only, rank
    keys = sorted(exps, key=lambda k: rank(*k))
    if focus_only():
        keys = [k for k in keys if rank(*k) == 0]
    # CLAUDE.md 5.1: ohne mindestens 10 echte Probe-Leads kein Entwurf und kein Versand
    samples = {}
    for l in db.select("leads", {"status": "eq.sample", "select": "segment_id,country"}):
        k = (l["segment_id"], l["country"])
        samples[k] = samples.get(k, 0) + 1
    ready = {k for k, v in samples.items() if v >= 10}
    print("Probe vorhanden für:", ", ".join(f"{a}/{b}" for a, b in sorted(ready)) or "keine")
    n = bad = 0
    total_cap = int(os.environ.get("MAX_TOTAL_MAILS", "100000"))  # Inhaber 26.09.2026: 250 pro Tag fortlaufend
    total = len(db.select_all("messages", {"select": "id"}))
    col = has_variant_column(db)
    # Je Experiment einmal laden statt je Käufer abfragen (03.10.2026: der tägliche Lauf brach nach Stunden ab,
    # weil für ~70.000 Käufer je eine Abfrage lief); höchstens --max-new neue Entwürfe je Experiment und Lauf
    from lib.leadsegment import lead_segment  # S12 nutzt S2-Proben/Leads (lib/leadsegment.py)
    for key in keys:
        if (lead_segment(key[0]), key[1]) not in ready:
            continue
        e = exps[key]
        have = {m["prospect_id"] for m in db.select_all("messages", {"experiment_id": f"eq.{e['id']}",
                                                                     "select": "prospect_id"})}
        room = min((e.get("planned_count") or 50) - len(have), args.max_new)
        if room <= 0:
            continue
        made = 0
        # Reihenfolge eindeutig (created_at,id): gleiche created_at ließen beim Blättern Käufer doppelt erscheinen ->
        # 409 Duplicate Key (Prüfung 04.10.2026)
        for p in db.select_all("prospects", {"check_status": "eq.ok", "segment_id": f"eq.{key[0]}",
                                             "country": f"eq.{key[1]}", "order": "created_at,id"}):
            if made >= room:
                break
            if total + n >= total_cap:
                print(f"Gesamtgrenze {total_cap} erreicht")
                break
            if p["id"] in have or not p.get("email"):
                continue
            if db.rpc("is_suppressed", {"p_email": p["email"]}):
                continue
            subject, body, lang = build(p)
            lint = lint_draft(subject, body, lang)
            have.add(p["id"])  # derselbe Käufer nie zweimal in diesem Lauf (Prüfung 04.10.2026)
            if not args.dry_run:
                approve = bool(args.approve) and lint.ok
                # eindeutiger Index messages_prospect_experiment_kind_uq: schon vorhandene Erstmail wird übersprungen
                # statt den ganzen Lauf mit 409 abzubrechen (Prüfung 04.10.2026)
                saved = db.insert("messages", {"prospect_id": p["id"], "experiment_id": e["id"], "kind": "initial",
                                               "to_email": p["email"], "subject": subject, "body": body,
                                               "language": lang, "status": "approved" if approve else "draft",
                                               "check_errors": lint.errors,
                                               **({"subject_variant": subject_variant(p)} if col else {}),
                                               **({"approved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                                   "approved_by": f"Inhaber: {args.approve}"} if approve else {})},
                                  upsert_on="prospect_id,experiment_id,kind", ignore_duplicates=True)
                if not saved:
                    print(f"{p['segment_id']}/{p['country']} {p['email']:<40} schon vorhanden – übersprungen")
                    continue
            n += 1
            made += 1
            bad += 0 if lint.ok else 1
            print(f"{p['segment_id']}/{p['country']} {p['email']:<40} {lint.summary()}")
        print(f"{key[0]}/{key[1]}: {made} neue Entwürfe (bisher {len(have)})")
    print(f"\n{n} Entwürfe, davon {bad} mit Regelverstoß")
    return 0


if __name__ == "__main__":
    sys.exit(main())
