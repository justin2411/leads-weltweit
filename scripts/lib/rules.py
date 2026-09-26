"""Prüfregeln für Käufer (prospects) und Mail-Entwürfe.

Reine Funktionen ohne Netzwerk, damit sie überall gleich greifen:
im CLI (outreach.py), vor dem Versand und in den Tests.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]

FREEMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk",
    "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "proton.me",
    "protonmail.com", "gmx.com", "gmx.net", "web.de", "mail.com", "yandex.com", "zoho.com",
    "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "sfr.fr", "btinternet.com", "sky.com",
    "virginmedia.com", "comcast.net", "verizon.net", "att.net", "eircom.net", "ziggo.nl", "kpnmail.nl",
}

# Kapitalgesellschaften je Land (für company_forms_only). Kleinbuchstaben, ohne Punkte.
COMPANY_FORMS = {
    "UK": {"ltd", "limited", "llp", "plc", "cic"},
    "IE": {"ltd", "limited", "dac", "clg", "plc", "uc", "teoranta", "teo"},
    "NL": {"bv", "nv", "cooperatie", "stichting"},
    "SE": {"ab", "publ", "ek för", "ekonomisk förening"},
    "BE": {"bv", "srl", "nv", "sa", "cv", "sc", "bvba", "sprl", "vzw", "asbl"},
    "FR": {"sas", "sasu", "sarl", "eurl", "sa", "sca", "snc", "sci", "scop"},
    "US": {"inc", "llc", "corp", "corporation", "co", "pc", "pllc", "lp", "llp", "ltd"},
}

# Wörter, die nach Garantie, Druck oder Übertreibung klingen (Abschnitt 7).
FORBIDDEN_PATTERNS = {
    "en": [
        r"\bguarant\w*", r"\burgent\w*", r"\bact now\b", r"\blimited time\b", r"\bdon'?t miss\b",
        r"\bhurry\b", r"\blast chance\b", r"\bexclusive offer\b", r"\bno[- ]brainer\b", r"\brisk[- ]free\b",
        r"\bbest in (the )?(industry|market|class)\b", r"\b#1\b", r"\bnumber one\b", r"\brevolution\w*",
        r"\bgame[- ]chang\w*", r"\b100 ?%", r"\bskyrocket\w*", r"\bexplod\w*", r"\bimmediately\b",
        r"\bonly today\b", r"\bfree money\b", r"\bdouble your\b", r"\btriple your\b",
    ],
    "fr": [
        r"\bgaranti\w*", r"\burgent\w*", r"\bimmédiatement\b", r"\bdernière chance\b", r"\boffre exclusive\b",
        r"\bsans risque\b", r"\bnuméro ?1\b", r"\b100 ?%", r"\brévolution\w*", r"\bne ratez pas\b",
        r"\bdépêchez\w*", r"\bdurée limitée\b",
    ],
}

FAKE_REPLY_SUBJECT = re.compile(r"^\s*(re|fw|fwd|aw|wg|tr)\s*:", re.IGNORECASE)
EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F900-\U0001F9FF\U00002B00-\U00002BFF️]"
)
HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def load_countries(path: Path | None = None) -> dict:
    with open(path or ROOT / "countries.yaml", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def country_rules(cfg: dict, country: str) -> dict:
    c = (cfg.get("countries") or {}).get(country.upper())
    if c is None:
        return {"allowed": False, "notes": "nicht in countries.yaml"}
    return {**(cfg.get("defaults") or {}), **c}


def normalize_domain(value: str | None) -> str:
    if not value:
        return ""
    v = value.strip().lower()
    v = re.sub(r"^[a-z]+://", "", v)
    v = v.split("/")[0].split("?")[0].split(":")[0]
    return v[4:] if v.startswith("www.") else v


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower().strip()


def is_generic(email: str, cfg: dict) -> bool:
    local = email.split("@", 1)[0].lower()
    return local in {p.lower() for p in cfg.get("generic_local_parts") or []}


def _norm_form(legal_form: str) -> str:
    return re.sub(r"[.\s]+", " ", legal_form.lower()).strip().replace(" ", "") if legal_form else ""


def is_company_form(country: str, legal_form: str | None) -> bool:
    if not legal_form:
        return False
    norm = _norm_form(legal_form)
    return any(norm == f.replace(" ", "") for f in COMPANY_FORMS.get(country.upper(), set()))


@dataclass
class CheckResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def summary(self) -> str:
        if self.ok and not self.warnings:
            return "OK"
        parts = [*(f"FEHLER: {e}" for e in self.errors), *(f"Hinweis: {w}" for w in self.warnings)]
        return "; ".join(parts)


def check_prospect(
    *,
    email: str | None,
    country: str,
    website: str | None,
    legal_form: str | None,
    source_url: str | None,
    size_note: str | None = None,
    suppressed: bool = False,
    cfg: dict | None = None,
) -> CheckResult:
    """Darf diese Firma per Mail angeschrieben werden?"""
    cfg = cfg or load_countries()
    rules = country_rules(cfg, country)
    errors: list[str] = []
    warnings: list[str] = []

    if not rules.get("allowed"):
        errors.append(f"Land {country.upper()} ist nicht für E-Mail freigegeben ({rules.get('notes', '')})")

    if not email:
        errors.append("keine E-Mail-Adresse")
    elif not EMAIL_RE.match(email):
        errors.append(f"ungültige E-Mail-Adresse: {email}")
    else:
        dom = email_domain(email)
        if dom in FREEMAIL_DOMAINS:
            errors.append("Freemail-Adresse (keine Firmenadresse)")
        site = normalize_domain(website)
        if site and not (dom == site or dom.endswith("." + site) or site.endswith("." + dom)):
            warnings.append(f"Mail-Domain {dom} passt nicht zur Website {site}")
        if rules.get("generic_only") and not is_generic(email, cfg):
            errors.append("in diesem Land nur allgemeine Firmenadressen (info@, hello@ ...)")

    if rules.get("company_forms_only") and not is_company_form(country, legal_form):
        errors.append(f"Rechtsform '{legal_form or '?'}' ist keine Kapitalgesellschaft in {country.upper()}")

    if not source_url:
        errors.append("keine Quelle, wo die Adresse veröffentlicht ist")

    if not size_note:
        warnings.append("keine Größenangabe (KMU statt Konzern bitte belegen)")

    if suppressed:
        errors.append("Adresse oder Domain steht auf der Sperrliste")

    return CheckResult(ok=not errors, errors=errors, warnings=warnings)


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'’-]+\b", text, flags=re.UNICODE))


def lint_draft(subject: str, body: str, language: str = "en") -> CheckResult:
    """Prüft einen Entwurf gegen die Schreibregeln (Abschnitt 7)."""
    errors: list[str] = []
    warnings: list[str] = []
    subject = unicodedata.normalize("NFC", subject or "")
    body = unicodedata.normalize("NFC", body or "")

    if not subject.strip():
        errors.append("Betreff fehlt")
    if len(subject) > 60:
        errors.append(f"Betreff hat {len(subject)} Zeichen (max. 60)")
    if FAKE_REPLY_SUBJECT.match(subject):
        errors.append("Betreff täuscht eine Antwort/Weiterleitung vor")
    if EMOJI.search(subject) or EMOJI.search(body):
        errors.append("Emojis sind nicht erlaubt")
    if HTML_TAG.search(body):
        errors.append("nur reiner Text, kein HTML")

    n = word_count(body)
    if n < 70 or n > 120:
        errors.append(f"Text hat {n} Wörter (erlaubt 70–120)")

    for pat in FORBIDDEN_PATTERNS.get(language, FORBIDDEN_PATTERNS["en"]):
        for text, where in ((subject, "Betreff"), (body, "Text")):
            m = re.search(pat, text, flags=re.IGNORECASE)
            if m:
                errors.append(f"verbotene Formulierung im {where}: '{m.group(0)}'")

    if re.search(r"https?://|www\.", body, flags=re.IGNORECASE):
        errors.append("keine Links im Text (nur die Abmeldung in der Fußzeile)")
    if re.search(r"unsubscribe|désinscri|abmeld", body, flags=re.IGNORECASE):
        warnings.append("Abmeldehinweis steht im Text; die Fußzeile kommt vom System")

    # Zahlen außer der 10 (Probe) müssen belegt sein -> Hinweis für die Prüfung
    numbers = [x for x in re.findall(r"\d[\d.,]*", body) if x.strip(".,") != "10"]
    if numbers:
        warnings.append(f"Zahlen im Text prüfen (belegt?): {', '.join(numbers)}")

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]
    # Frage im letzten oder vorletzten Absatz (danach darf noch ein Gruß stehen)
    if not any(p.rstrip().endswith("?") for p in paragraphs[-2:]):
        errors.append("Schluss braucht eine einfache Ja/Nein-Frage")
    if len(paragraphs) < 3:
        warnings.append("kurze Absätze verwenden (mind. 3)")
    if any(len(p.split()) > 60 for p in paragraphs):
        warnings.append("ein Absatz ist länger als 60 Wörter")

    sample_words = {"en": r"\b(free|no[- ]cost)\b.*\bsample\b|\bsample\b", "fr": r"\béchantillon\b|\bgratuit"}
    if not re.search(sample_words.get(language, sample_words["en"]), body, flags=re.IGNORECASE):
        warnings.append("Angebot der kostenlosen Probe mit 10 Leads fehlt")

    return CheckResult(ok=not errors, errors=errors, warnings=warnings)


FOOTER = {
    "en": (
        "--\n{sender_name}, {postal_address}\n"
        "You are receiving this one-off message because {company} publishes this address as a business contact. "
        "To receive no further emails: {unsubscribe_url}"
    ),
    "fr": (
        "--\n{sender_name}, {postal_address}\n"
        "Vous recevez ce message unique car {company} publie cette adresse comme contact professionnel. "
        "Pour ne plus recevoir d'e-mails : {unsubscribe_url}"
    ),
}


def render_footer(language: str, *, sender_name: str, postal_address: str, company: str, unsubscribe_url: str) -> str:
    if not sender_name or not postal_address:
        raise ValueError("Absendername und Postanschrift sind Pflicht für die Fußzeile")
    return FOOTER.get(language, FOOTER["en"]).format(
        sender_name=sender_name, postal_address=postal_address, company=company, unsubscribe_url=unsubscribe_url
    )
