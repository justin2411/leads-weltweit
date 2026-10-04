"""Adressprüfung vor jeder Erstmail (Rückläufer-Analyse 05.10.2026, nur strenger – nie lockern).

Messung: 477 Erstmails bis 04.10.2026, 23 endgültige Rückläufer (4,8 %). Merkmale, die nur aus öffentlichem DNS
kommen (kein SMTP-Abfragen fremder Server, kein Versand):

  kein MX-Eintrag (nur A-Eintrag)                            1 von 1   gesendet zurückgekommen
  Spam-Filter-Gateway (SpamExperts, Barracuda)               2 von 5   (40 %, beide „Richtlinie“)
  kleiner/eigener Mailserver und kein DMARC-Eintrag          6 von 51  (12 %)
  Microsoft 365 und info@/admin@ (Exchange lehnt nicht       6 von 69  (8,7 %; andere Adressen bei M365: 0 von 59)
    eingerichtete Sammeladressen mit 5.4.1 ab)
  Rest                                                       6 von 348 (1,7 %)

Dazu ohne eigene Rückläufer, aber sichere Fehlschläge: Null-MX (RFC 7505), MX auf localhost, Park- und
Wegwerf-Domains. DNS wird je Lauf frisch abgefragt (Zwischenspeicher nur innerhalb eines Laufs, also nie älter als
der Lauf). Ist DNS nicht eindeutig (Zeitüberschreitung), gilt die Adresse als „unklar“: in diesem Lauf nicht senden,
Status bleibt, nächster Lauf prüft erneut.
"""
from __future__ import annotations

# Große Postfach-Anbieter mit eigener Empfänger-Verwaltung (MX-Endungen). Alles andere = kleiner/eigener Server.
BIG_PROVIDERS = {
    "google": ("google.com", "googlemail.com"),
    "m365": ("outlook.com", "mx.microsoft"),
    "proofpoint": ("pphosted.com", "ppe-hosted.com"),
    "mimecast": ("mimecast.com", "mimecast.co.za"),
    "zoho": ("zoho.com", "zoho.eu", "zohomail.com", "zoho.in"),
    "rackspace": ("emailsrvr.com",),
    "fastmail": ("messagingengine.com",),
    "gandi": ("gandi.net",),
    "godaddy": ("secureserver.net",),
    "hostinger": ("hostinger.com",),
    "icloud": ("icloud.com",),
    "yahoo": ("yahoodns.net",),
    "proton": ("protonmail.ch",),
}
M365 = BIG_PROVIDERS["m365"]
M365_COLLECTIVE = {"info", "admin"}  # bei Microsoft 365: 6 von 69 zurück, alle anderen Adressen 0 von 59

# Spam-Filter-Gateways, die unsere Kaltmails als Richtlinie abgewiesen haben (2 von 5)
SPAM_GATEWAYS = ("spamexperts.com", "spamexperts.eu", "spamexperts.net", "antispamcloud.com", "barracudanetworks.com")

# MX von Domain-Parkdiensten: dort gibt es keine Postfächer
PARKING_MX = ("sedoparking.com", "parkingcrew.net", "bodis.com", "above.com", "parklogic.com", "afternic.com",
              "dan.com", "parked.com", "domaincontrol-parked.com", "uniregistrymarket.link")

# Wegwerf-Postfächer (keine Firmenadressen)
DISPOSABLE = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "yopmail.com",
    "yopmail.fr", "trashmail.com", "temp-mail.org", "tempmail.com", "getnada.com", "dispostable.com", "maildrop.cc",
    "mailnesia.com", "throwawaymail.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com",
    "spamgourmet.com", "mytemp.email", "tempr.email", "discard.email", "mailcatch.com", "jetable.org",
}

UNKLAR = "unklar"

_DMARC: dict[str, bool | None] = {}


def _ends(host: str, suffixes) -> bool:
    return any(host == s or host.endswith("." + s) for s in suffixes)


def provider(hosts: list[str] | None) -> str | None:
    """Name des großen Anbieters oder None (kleiner/eigener Server)."""
    for name, suf in BIG_PROVIDERS.items():
        if any(_ends(h, suf) for h in hosts or []):
            return name
    return None


def has_dmarc(domain: str) -> bool | None:
    """DMARC-Eintrag für die Domain oder eine übergeordnete Domain? None = DNS nicht eindeutig."""
    d = (domain or "").strip().lower().rstrip(".")
    if d in _DMARC:
        return _DMARC[d]
    try:
        import dns.resolver
    except ImportError:  # pragma: no cover
        return None
    labels = d.split(".")
    out: bool | None = False
    for i in range(0, max(1, len(labels) - 1)):
        name = "_dmarc." + ".".join(labels[i:])
        try:
            ans = dns.resolver.resolve(name, "TXT", lifetime=8)
        except Exception as e:  # noqa: BLE001
            if type(e).__name__ in ("NXDOMAIN", "NoAnswer"):
                continue
            out = None
            continue
        if any(b"".join(r.strings).decode("utf-8", "replace").strip().lower().startswith("v=dmarc1") for r in ans):
            out = True
            break
    _DMARC[d] = out
    return out


def problems(email: str, hosts: list[str] | None, dmarc: bool | None) -> list[str]:
    """Gründe gegen eine Erstmail an `email` aus MX-Zielen (`hosts`, None = unklar) und DMARC (None = unklar).
    Rückgabe [] = in Ordnung, [UNKLAR] = in diesem Lauf nicht senden, sonst Sperrgründe (Entwurf -> blocked)."""
    email = (email or "").strip().lower()
    local, _, dom = email.rpartition("@")
    if dom in DISPOSABLE:
        return ["Wegwerf-Domain"]
    if hosts is None:
        return [UNKLAR]
    if not hosts:
        return ["kein MX-Eintrag (Domain nimmt keine Mails an)"]
    if all(h in ("", ".", "localhost") or h.startswith("127.") for h in hosts):
        return ["Null-MX: Domain nimmt ausdrücklich keine Mails an"]
    if any(_ends(h, PARKING_MX) for h in hosts):
        return ["geparkte Domain (MX eines Parkdienstes)"]
    if any(_ends(h, SPAM_GATEWAYS) for h in hosts):
        return ["Spam-Filter-Gateway lehnt Kaltmails ab (40 % Rückläufer)"]
    prov = provider(hosts)
    if prov == "m365" and local in M365_COLLECTIVE:
        return [f"Microsoft 365 und {local}@: hohe Rückläuferquote (5.4.1)"]
    if prov is None:
        if dmarc is None:
            return [UNKLAR]
        if not dmarc:
            return ["kleiner Mailserver ohne DMARC: hohe Rückläuferquote"]
    return []


def check(email: str, mx_lookup=None, dmarc_lookup=None) -> list[str]:
    """problems() mit frischem DNS (je Lauf zwischengespeichert)."""
    if mx_lookup is None:
        from lib.deliverability import mx_hosts as mx_lookup
    dmarc_lookup = dmarc_lookup or has_dmarc
    dom = (email or "").rsplit("@", 1)[-1].strip().lower()
    if dom in DISPOSABLE:
        return ["Wegwerf-Domain"]
    hosts = mx_lookup(dom)
    dmarc = dmarc_lookup(dom) if hosts and provider(hosts) is None else True
    return problems(email, hosts, dmarc)
