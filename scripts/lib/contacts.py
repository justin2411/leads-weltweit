"""Allgemeine Firmenkontakte von der eigenen Website der Firma: zentrale Telefonnummer und Sammel-E-Mail.

Nur, was die Firma selbst veröffentlicht (Startseite und eine Kontaktseite), robots.txt wird beachtet (lib.fetch).
Bewusst NUR Rollenadressen wie info@, hello@, office@ (CLAUDE.md: keine persönlichen E-Mails von Mitarbeitenden).
Adressen wie vorname.nachname@ oder j.smith@ werden verworfen.
"""
from __future__ import annotations

import html as _html
import re
from urllib.parse import urljoin, urlparse

import requests

ROLE = {"info", "hello", "contact", "contactus", "enquiries", "enquiry", "office", "admin", "mail", "sales", "team",
        "accounts", "bookings", "reception", "support", "general", "bonjour", "service", "hallo", "kontakt"}
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
TEL = re.compile(r'href=["\']tel:([^"\']+)["\']', re.I)
PHONE_TEXT = re.compile(r"(?:tel(?:ephone)?|phone|call us|t[ée]l[ée]phone|t[ée]l)\s*[.:]?\s*(\+?\(?\d[\d\s().-]{7,18}\d)", re.I)
CONTACT_LINK = re.compile(r'href=["\']([^"\']*(?:contact|kontakt|get-in-touch)[^"\']*)["\']', re.I)


def _domain(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def extract_contacts(page: str, site_url: str) -> dict:
    """{"email": Rollenadresse auf der eigenen Domain oder None, "phone": erste tel:-Nummer oder None}."""
    text = _html.unescape(page)
    dom = _domain(site_url)
    email = None
    for m in EMAIL.findall(text):
        local, _, host = m.lower().partition("@")
        if host.startswith("www."):
            host = host[4:]
        if local in ROLE and dom and (host == dom or host.endswith("." + dom)):
            email = m.lower()
            break
    phone = None
    plain = re.sub(r"<[^>]+>", " ", text)
    for raw in [m for m in TEL.findall(page)] + PHONE_TEXT.findall(plain):
        digits = re.sub(r"[^\d+]", "", _html.unescape(raw))
        if 9 <= len(digits.lstrip("+")) <= 15:
            phone = digits
            break
    return {"email": email, "phone": phone}


def fetch_contacts(site: str, session: requests.Session) -> dict:
    """Startseite und (falls verlinkt) eine Kontaktseite derselben Domain lesen."""
    from lib.fetch import FetchRefused, polite_get
    found: dict = {"email": None, "phone": None, "pages": []}
    urls = [site]
    try:
        r = polite_get(site, last_fetched=None, session=session)
    except (FetchRefused, requests.RequestException):
        return found
    if r.status_code >= 400:
        return found
    found["pages"].append(r.url)
    c = extract_contacts(r.text[:400000], r.url)
    found.update({k: v for k, v in c.items() if v})
    link = CONTACT_LINK.search(r.text)
    if link and not (found["email"] and found["phone"]):
        url = urljoin(r.url, link.group(1))
        if _domain(url) == _domain(r.url) and url not in urls:
            try:
                r2 = polite_get(url, last_fetched=None, session=session)
                if r2.status_code < 400:
                    found["pages"].append(r2.url)
                    c2 = extract_contacts(r2.text[:400000], r2.url)
                    for k, v in c2.items():
                        found[k] = found[k] or v
            except (FetchRefused, requests.RequestException):
                pass
    return found
