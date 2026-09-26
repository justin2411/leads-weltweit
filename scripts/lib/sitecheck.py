"""Hat eine frisch eingetragene Firma schon eine Website? Prüft nur naheliegende Domains aus dem Firmennamen.

Ergebnis ist eine ehrliche Aussage: gefunden (mit Adresse) oder "unter den geprüften Domains nichts gefunden".
"""
from __future__ import annotations

import re
import socket

import requests

from lib.fetch import USER_AGENT

SUFFIX = re.compile(r"\b(ltd|limited|llc|l\.l\.c\.|inc|incorporated|corp|corporation|co|company|plc|llp|sas|sasu|sarl|"
                    r"eurl|sa|sci|the|group|holdings?)\b\.?", re.I)
TLDS = {"UK": [".co.uk", ".uk", ".com"], "US": [".com"], "FR": [".fr", ".com"]}


def candidates(name: str, country: str) -> list[str]:
    core = SUFFIX.sub(" ", name.lower())
    core = re.sub(r"&", "and", core)
    slug = re.sub(r"[^a-z0-9]+", "", core)
    dashed = re.sub(r"[^a-z0-9]+", "-", core).strip("-")
    if len(slug) < 4:
        return []
    out = []
    for tld in TLDS.get(country, [".com"]):
        out.append(slug + tld)
        if dashed != slug:
            out.append(dashed + tld)
    return out[:5]


def find_website(name: str, country: str, session: requests.Session | None = None) -> tuple[str | None, list[str]]:
    """(gefundene Website oder None, geprüfte Domains)."""
    session = session or requests.Session()
    checked = []
    words = [w for w in re.findall(r"[a-z]{4,}", SUFFIX.sub(" ", name.lower()))][:3]
    for dom in candidates(name, country):
        checked.append(dom)
        try:
            socket.gethostbyname(dom)
        except OSError:
            continue
        try:
            r = session.get(f"https://{dom}", timeout=10, headers={"User-Agent": USER_AGENT}, allow_redirects=True)
        except requests.RequestException:
            continue
        text = r.text[:20000].lower() if r.status_code < 400 else ""
        parked = re.search(r"domain (is )?for sale|parked|buy this domain|coming soon|godaddy|sedo", text)
        if text and not parked and any(w in text for w in words):
            return r.url, checked
    return None, checked
