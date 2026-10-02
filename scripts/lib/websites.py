"""Website finden, Zugehörigkeit prüfen und allgemeine Firmenkontakte auslesen – reine Logik ohne Netz.

Grundsatz (Fehler aus der Vergangenheit: Massachusetts-Nummer bei einer UK-Firma, Dubai-Nummer):
eine falsche Website ist schlimmer als keine. Eine Domain gilt nur als Website der Firma, wenn die Seite
selbst belegt, dass sie zu genau dieser Firma gehört: Registernummer (Companies House / SIREN), Postleitzahl,
voller Firmenname, passende Telefonvorwahl. Der Name allein reicht nie.

Kein Suchmaschinen-Scraping (Google, DuckDuckGo, Bing): Kandidaten entstehen nur aus dem Firmennamen
(Domain-Varianten), werden per DNS geprüft und erst dann höflich abgerufen (lib.fetch: robots.txt).

Personen: nur Inhaber/Geschäftsführer aus Registern oder dem Impressum bzw. den „mentions légales“
(CLAUDE.md 8a). Nur Rollenadressen (info@ …) auf der eigenen Domain, keine persönlichen Adressen.
"""
from __future__ import annotations

import html as _html
import json
import re
import unicodedata
from urllib.parse import urljoin, urlparse

# ---------------------------------------------------------------------------
# Firmennamen und Domain-Kandidaten
# ---------------------------------------------------------------------------
LEGAL = re.compile(r"\b(ltd|limited|llc|l\.l\.c|llp|lp|plc|pllc|p\.c|pc|inc|incorporated|corp|corporation|co|company|"
                   r"sas|sasu|sarl|eurl|sa|sci|snc|scp|selarl|scm|sca|gmbh)\b\.?", re.I)
GENERIC = {"the", "and", "uk", "gb", "group", "holdings", "holding", "services", "service", "solutions", "global",
           "international", "consulting", "consultancy", "ventures", "enterprises", "trading", "le", "la", "les", "l",
           "de", "du", "des", "d", "et", "of", "societe", "civile", "nyc", "ny", "usa", "us", "europe", "france",
           "paris", "london", "hq"}
TLDS = {"UK": ["co.uk", "uk", "com"], "IE": ["ie", "com"], "FR": ["fr", "com"], "US": ["com", "net", "us"],
        "NL": ["nl", "com"], "BE": ["be", "com"], "SE": ["se", "com"]}
MAX_CANDIDATES = 16
# Branchen-Endungen (echte gTLDs): kleine Firmen nutzen sie oft statt .com, z. B. 202main.coffee (Inhaber 02.10.2026:
# Lead „ohne Website“ hatte eine). Schlüssel = Wort im Namen oder in der Overture-Kategorie.
CAT_TLDS = {"coffee": ["coffee", "cafe"], "cafe": ["cafe", "coffee"], "espresso": ["coffee"], "bakery": ["bakery"],
            "pizza": ["pizza"], "pizzeria": ["pizza"], "restaurant": ["restaurant"], "kitchen": ["kitchen"],
            "bar": ["bar"], "pub": ["pub"], "grill": ["restaurant"], "salon": ["salon", "hair"], "hair": ["hair", "salon"],
            "barber": ["barber"], "spa": ["spa"], "nails": ["nails"], "beauty": ["beauty"], "yoga": ["yoga"],
            "fitness": ["fitness", "fit"], "gym": ["fitness", "fit"], "dental": ["dental", "dentist"],
            "dentist": ["dentist", "dental"], "clinic": ["clinic"], "vet": ["vet"], "law": ["law", "legal"],
            "legal": ["legal", "law"], "auto": ["auto", "cars"], "car": ["cars", "auto"], "repair": ["repair"],
            "plumbing": ["plumbing"], "plumber": ["plumbing"], "electric": ["solutions"], "cleaning": ["cleaning"],
            "construction": ["construction", "build"], "builders": ["builders", "build"], "roofing": ["builders"],
            "florist": ["florist", "flowers"], "flowers": ["flowers"], "photography": ["photography", "photo"],
            "photo": ["photo"], "studio": ["studio"], "design": ["design", "studio"], "shop": ["shop", "store"],
            "store": ["store", "shop"], "boutique": ["boutique", "shop"], "consulting": ["consulting"],
            "realty": ["realty"], "realestate": ["realestate"], "insurance": ["insurance"], "tax": ["tax"],
            "accounting": ["accountants"], "pet": ["pet"], "dog": ["dog"], "farm": ["farm"], "golf": ["golf"],
            "church": ["church"], "school": ["school"], "academy": ["academy"], "events": ["events"],
            "catering": ["catering"], "wine": ["wine"], "beer": ["beer"], "tattoo": ["tattoo"], "garden": ["garden"]}
GENERIC_TLDS = {"US": ["co", "biz"], "UK": ["co"], "IE": [], "FR": [], "NL": [], "BE": [], "SE": []}


def ascii_fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()


def name_words(name: str, keep_parens: bool = False) -> list[str]:
    """Wörter des Firmennamens ohne Rechtsform, klein, ohne Akzente; '&' wird 'and'."""
    s = ascii_fold(name).lower().replace("&", " and ").replace("'", " ").replace("’", " ")
    if not keep_parens:
        s = re.sub(r"\([^)]*\)", " ", s)
    s = LEGAL.sub(" ", s)
    return re.findall(r"[a-z0-9]+", s)


def core_words(name: str) -> list[str]:
    words = name_words(name)
    core = [w for w in words if w not in GENERIC]
    return core or words


def category_candidates(name: str, country: str, category: str | None = None) -> list[str]:
    """Branchen-Endungen: „202 Main Coffee“ -> 202main.coffee, 202maincoffee.cafe … (nur Namen, keine Suche)."""
    words = name_words(name)
    keys = [w for w in words if w in CAT_TLDS] + [w for w in re.findall(r"[a-z]+", (category or "").lower()) if w in CAT_TLDS]
    out: list[str] = []
    for key in dict.fromkeys(keys):
        rest = [w for w in words if w != key and w != "and"]
        stems = [x for x in ("".join(rest), "".join(words), "-".join(rest)) if len(x) >= 3]
        for tld in CAT_TLDS[key]:
            for st in dict.fromkeys(stems):
                out.append(f"{st}.{tld}")
    joined = "".join(w for w in words if w != "and")
    out += [f"{joined}.{t}" for t in GENERIC_TLDS.get(country, []) if len(joined) >= 4]
    return list(dict.fromkeys(out))


def domain_candidates(name: str, country: str, category: str | None = None) -> list[str]:
    """Naheliegende Domains aus dem Firmennamen (keine Suche, kein Raten über Dritte); mit Branchen-Endungen."""
    words = name_words(name)
    core = core_words(name)
    no_and = [w for w in words if w != "and"]
    joined = list(dict.fromkeys("".join(ws) for ws in (words, no_and, core) if ws))
    dashed = list(dict.fromkeys("-".join(ws) for ws in (words, core) if len(ws) > 1))
    joined = [s for s in joined if len(s) >= 4]
    out: list[str] = []
    for group in (joined, dashed):  # zuerst zusammengeschrieben über alle Endungen, dann mit Bindestrich
        for s in group:
            for tld in TLDS.get(country, ["com"]):
                d = f"{s}.{tld}"
                if d not in out:
                    out.append(d)
    if country == "UK" and joined:  # häufig: firmaltd.co.uk
        out.insert(min(3, len(out)), f"{joined[0]}ltd.co.uk")
    # Branchen-Endungen nach den drei üblichsten Treffern einreihen (sonst fallen sie hinten ab)
    cat = [d for d in category_candidates(name, country, category) if d not in out]
    out = out[:3] + cat[:6] + out[3:]
    return out[:MAX_CANDIDATES]


def name_is_distinctive(name: str) -> bool:
    """Kurze oder allgemeine Namen (z. B. „LE COMPTOIR“, „GAND“) sind ohne harten Beleg nie eindeutig."""
    core = core_words(name)
    return len("".join(core)) >= 6 and not (len(core) == 1 and len(core[0]) < 8)


# ---------------------------------------------------------------------------
# Seiten in Text umwandeln
# ---------------------------------------------------------------------------
def _decode_cfemail(hexstr: str) -> str:
    try:
        key = int(hexstr[:2], 16)
        return "".join(chr(int(hexstr[i:i + 2], 16) ^ key) for i in range(2, len(hexstr), 2))
    except ValueError:
        return ""


def page_text(page: str) -> str:
    """Sichtbarer Text (grob) inkl. entschlüsselter Cloudflare-E-Mails und mailto/tel-Zielen."""
    page = page or ""
    extra = [_decode_cfemail(h) for h in re.findall(r'data-cfemail=["\']([0-9a-fA-F]+)["\']', page)]
    extra += re.findall(r'href=["\'](?:mailto|tel):([^"\'?]+)', page, re.I)
    t = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", page, flags=re.I | re.S)
    t = re.sub(r"<br\s*/?>|</(p|div|li|h[1-6]|tr|td|address|span)>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = _html.unescape(t)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return t + "\n" + "\n".join(_html.unescape(e) for e in extra if e)


HOSTING = re.compile(r"h[ée]berg(?:ement|eur|é par|e par)|\bhosting\b|\bhosted by\b|\bhost(?:ed)?\s*:|website (?:designed |built )?by|"
                     r"site (?:r[ée]alis[ée]|con[çc]u) par|r[ée]alisation\s*:|conception\s*:|webdesign", re.I)
HOSTER_IDS = {"424761419", "431303775", "510909807", "423093459", "443061841", "797876562", "538325478", "501467940"}
LEGAL_URL = re.compile(r"mentions|legal|imprint|impressum|privacy|confidentialit|cookie|terms|cgv|cgu|conditions", re.I)


def without_hosting(text: str) -> str:
    """Abschnitte über Hoster/Webdesigner entfernen (deren Nummern, SIREN und Namen gehören nicht zur Firma)."""
    out, pos = [], 0
    for m in HOSTING.finditer(text):
        if m.start() < pos:
            continue
        out.append(text[pos:m.start()])
        pos = m.start() + 450
    out.append(text[pos:])
    return " ".join(out)


def norm(s: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", ascii_fold(s).lower()))


def title_of(page: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", page or "", re.I | re.S)
    return _html.unescape(m.group(1)).strip() if m else ""


PARKED = re.compile(r"domain (is )?for sale|buy this domain|this domain (name )?(is|may be) (for sale|parked)|parked (free|domain)|"
                    r"domain parking|sedoparking|parkingcrew|hugedomains|dan\.com|afternic|godaddy\.com/domainsearch|"
                    r"ce nom de domaine est (à vendre|en vente)|domaine (à vendre|parqué)|future home of|coming soon|"
                    r"under construction|site en construction|website is (under construction|coming soon)|"
                    r"account (has been )?suspended|default web page|welcome to nginx|apache2 .*default page|"
                    r"index of /", re.I)
DIRECTORY_HOSTS = ("companieshouse", "company-information.service.gov.uk", "opencorporates", "endole", "companycheck",
                   "bizapedia", "dnb.com", "zoominfo", "yell.com", "yelp", "societe.com", "pappers", "infogreffe",
                   "verif.com", "manageo", "pagesjaunes", "annuaire", "facebook", "instagram", "linkedin", "wix.com",
                   "godaddysites", "squarespace.com", "bbb.org", "manta.com", "chamberofcommerce", "wikipedia",
                   "amazon.", "etsy.", "ebay.", "trustpilot", "checkatrade", "bark.com", "thomsonlocal", "192.com",
                   "companiesintheuk", "find-and-update", "northdata", "opengovny", "bizprofile", "corporationwiki")


def is_parked(page: str) -> bool:
    return bool(PARKED.search(page_text(page[:60000])[:6000]))


def is_directory(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(d in host for d in DIRECTORY_HOSTS)


def site_domain(url: str) -> str:
    h = (urlparse(url if "//" in url else "https://" + url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


# ---------------------------------------------------------------------------
# Telefon
# ---------------------------------------------------------------------------
CC = {"UK": "44", "IE": "353", "FR": "33", "US": "1", "NL": "31", "BE": "32", "SE": "46", "DE": "49"}
NY_AREA = {"212", "315", "332", "347", "363", "516", "518", "585", "607", "631", "646", "680", "716", "718", "838",
           "845", "914", "917", "929", "934"}
TEL_LINK = re.compile(r'href=["\']tel:([^"\']+)["\']', re.I)
PHONE_TEXT = re.compile(r"(?:tel(?:ephone)?|phone|call(?: us)?|t[ée]l[ée]?phone|t[ée]l|fixe|standard|office|main|t)\s*"
                        r"[.:]?\s*(\+?\(?\d[\d\s().\-/]{7,20}\d)", re.I)
PHONE_ANY = re.compile(r"(?<![\w/=.-])(\+\d{1,3}[\s.\-]?\(?\d[\d\s().\-]{7,16}\d|\(?0\d[\d\s().\-]{8,14}\d|\(\d{3}\)\s?\d{3}[\s.\-]\d{4}|"
                       r"\b\d{3}[.\-]\d{3}[.\-]\d{4}\b)")


def normalize_phone(raw: str, country: str) -> tuple[str | None, str]:
    """(E.164 oder None, Grund). Grund: 'ok', 'foreign', 'invalid'. Nummern anderer Länder werden nie übernommen."""
    s = _html.unescape(raw or "").strip()
    s = re.sub(r"\(0\)", "", s)
    plus = s.startswith("+") or s.startswith("00")
    d = re.sub(r"\D", "", s)
    if s.startswith("00"):
        d = d[2:]
    cc = CC.get(country)
    if not cc or not d:
        return None, "invalid"
    if country == "US":
        if plus:
            if not d.startswith("1"):
                return None, "foreign"
            d = d[1:]
        elif len(d) == 11 and d.startswith("1"):
            d = d[1:]
        if len(d) != 10 or d[0] in "01" or d[3] in "01" or d[:3] in ("555",) or d[1:3] == "11":
            return None, "invalid"
        return "+1" + d, "ok"
    if plus:
        if not d.startswith(cc):
            return None, "foreign"
        nat = d[len(cc):]
    else:
        if not d.startswith("0"):
            return None, "invalid"
        nat = d[1:]
    if nat.startswith("0"):
        nat = nat[1:]
    if country == "UK" and not (9 <= len(nat) <= 10 and nat[0] in "123578"):
        return None, "invalid"
    if country == "FR" and not (len(nat) == 9 and nat[0] in "123456789"):
        return None, "invalid"
    if country == "IE" and not (7 <= len(nat) <= 9):
        return None, "invalid"
    if country not in ("UK", "FR", "IE") and not (7 <= len(nat) <= 11):
        return None, "invalid"
    return f"+{cc}{nat}", "ok"


def is_mobile(e164: str) -> bool:
    """Mobilnummer (UK 07…, FR 06/07…, IE 08…)? US unterscheidet das nicht an der Nummer."""
    return bool(re.match(r"^\+(447|336|337|3538)", e164 or ""))


def phones_on_page(page: str, country: str) -> tuple[list[str], int]:
    """(gültige Inlandsnummern in Reihenfolge – tel:-Links zuerst –, Anzahl ausländischer Nummern)."""
    found, foreign = [], 0
    raws = TEL_LINK.findall(page or "")
    text = without_hosting(page_text(page))
    raws += PHONE_TEXT.findall(text)
    raws += [m for m in PHONE_ANY.findall(text)]
    for raw in raws:
        digits = re.sub(r"\D", "", raw)
        if len(digits) < 9 or len(digits) > 15 or re.fullmatch(r"(19|20)\d{6}", digits):
            continue
        e164, why = normalize_phone(raw, country)
        if why == "foreign":
            foreign += 1
        if e164 and e164 not in found:
            found.append(e164)
    return found, foreign


# ---------------------------------------------------------------------------
# E-Mail (nur Rollenadressen auf der eigenen Domain)
# ---------------------------------------------------------------------------
ROLE = {"info", "hello", "contact", "contactus", "enquiries", "enquiry", "office", "admin", "mail", "sales", "team",
        "accounts", "bookings", "booking", "reception", "support", "general", "bonjour", "service", "hallo", "kontakt",
        "hi", "studio", "welcome", "customerservice", "customerservices", "help", "care", "orders", "shop", "agence",
        "accueil", "secretariat", "direction", "commercial", "reservations", "hey", "howdy", "business", "newbusiness"}
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
EMAIL_AT = re.compile(r"\b([A-Za-z0-9._%+-]+)\s*[\[(]\s*(?:at|@)\s*[\])]\s*([A-Za-z0-9-]+(?:\s*[\[(]\s*(?:dot|\.)\s*[\])]\s*"
                      r"[A-Za-z0-9-]+|\.[A-Za-z0-9-]+)+)", re.I)
EMAIL_SYNTAX = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$")


def emails_on_page(page: str) -> list[str]:
    text = page_text(page)
    out = [e.lower().rstrip(".") for e in EMAIL.findall(text)]
    for local, dom in EMAIL_AT.findall(text):
        dom = re.sub(r"\s*[\[(]\s*(?:dot|\.)\s*[\])]\s*", ".", dom)
        out.append(f"{local}@{dom}".lower())
    seen, res = set(), []
    for e in out:
        if e not in seen and not re.search(r"\.(png|jpe?g|gif|webp|svg)$", e):
            seen.add(e)
            res.append(e)
    return res


def role_email(emails: list[str], domain: str) -> str | None:
    """Erste Rollenadresse (info@, contact@ …) auf der Domain der Website oder einer Subdomain davon."""
    dom = domain.lower()
    for e in emails:
        local, _, host = e.partition("@")
        host = host[4:] if host.startswith("www.") else host
        if not EMAIL_SYNTAX.match(e):
            continue
        if local in ROLE and dom and (host == dom or host.endswith("." + dom) or dom.endswith("." + host)):
            return e
    return None


# ---------------------------------------------------------------------------
# Registernummern, Postleitzahlen, Adresse, Ansprechperson
# ---------------------------------------------------------------------------
UK_NUMBER_CTX = re.compile(r"(?:company|registration|registered|reg\.?|crn)\s*(?:no\.?|number|num|n[°o])?\s*[.:#]?\s*"
                           r"(?:in [a-z &]+?\s*(?:no\.?|number)?\s*[.:]?\s*)?((?:SC|NI|OC|SO|NC|R0)?\d{6,8})\b", re.I)
FR_SIREN_CTX = re.compile(r"(?:siren|siret|rcs|r\.c\.s\.?|immatricul[ée]e?)[^0-9]{0,40}?(\d{3}\s?\d{3}\s?\d{3})(?:\s?\d{5})?",
                          re.I)
UK_POSTCODE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b")
US_ZIP_NY = re.compile(r"\b(?:NY|New York)\s*,?\s+(1[0-4]\d{3})(?:-\d{4})?\b")


def uk_number_norm(n: str) -> str:
    n = n.upper().strip()
    return n if n[:2].isalpha() else n.zfill(8)


def registry_numbers(text: str, country: str) -> list[str]:
    if country == "UK":
        return list(dict.fromkeys(uk_number_norm(m) for m in UK_NUMBER_CTX.findall(text)))
    if country == "FR":
        return list(dict.fromkeys(re.sub(r"\s", "", m) for m in FR_SIREN_CTX.findall(text)))
    return []


def postcodes(text: str, country: str) -> set[str]:
    if country == "UK":
        return {a + b for a, b in UK_POSTCODE.findall(text.upper())}
    if country == "FR":
        return set(re.findall(r"\b(\d{5})\b", text))
    if country == "US":
        return set(US_ZIP_NY.findall(text))
    return set()


def postal_address_jsonld(page: str) -> dict | None:
    """schema.org PostalAddress aus JSON-LD (Firmen veröffentlichen damit ihre eigene Adresse)."""
    for raw in re.findall(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", page or "", re.I | re.S):
        try:
            data = json.loads(raw.strip())
        except (json.JSONDecodeError, ValueError):
            continue
        stack = [data]
        while stack:
            n = stack.pop()
            if isinstance(n, list):
                stack += n
            elif isinstance(n, dict):
                a = n.get("address")
                if isinstance(a, dict) and (a.get("streetAddress") or a.get("postalCode")):
                    return {k: str(a.get(k) or "").strip() for k in
                            ("streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry")}
                stack += [v for v in n.values() if isinstance(v, (dict, list))]
    return None


def address_line(text: str, postcode: str, country: str) -> str | None:
    """Die Textzeile rund um die bekannte Postleitzahl, als Adresse der Firma (max. 160 Zeichen)."""
    if not postcode:
        return None
    if country == "UK":
        pc = postcode.upper().replace(" ", "")
        pat = re.compile(re.escape(pc[:-3]) + r"\s*" + re.escape(pc[-3:]))
    else:
        pat = re.compile(r"\b" + re.escape(postcode) + r"\b")
    for line in text.splitlines():
        line = line.strip(" ,|·-")
        m = pat.search(line.upper() if country == "UK" else line)
        if m and 8 <= len(line) <= 160 and re.search(r"\d+\s*\w+", line[:m.start()] or line):
            return re.sub(r"\s+", " ", line)
    return None


ADDRESS_LINE = {"UK": UK_POSTCODE, "FR": re.compile(r"\b\d{5}\s+[A-ZÀ-Ý][\w'’\- ]{2,}"), "US": US_ZIP_NY}


def first_address_line(text: str, country: str) -> str | None:
    """Erste Zeile der Kontakt-/Impressumsseite, die wie eine Inlandsadresse aussieht (Hausnummer + PLZ)."""
    pat = ADDRESS_LINE.get(country)
    if not pat:
        return None
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line.strip(" ,|·-"))
        m = pat.search(line.upper() if country == "UK" else line)
        if m and 10 <= len(line) <= 160 and re.search(r"\b\d{1,4}[a-zA-Z]?,?\s+\w{3,}", line[:m.start()]):
            return line
    return None


_NAME = r"((?:[A-Z][a-zà-ÿ'’\-]+|[A-Z]{2,}(?:-[A-Z]{2,})?)(?:\s+(?:[A-Z][a-zà-ÿ'’\-]+|[A-Z]{2,}(?:-[A-Z]{2,})?|de|du|van|von|le|la)){1,3})"
_MR = r"(?:(?:M\.|Mme|Monsieur|Madame|Mr\.?|Mrs\.?|Ms\.?)\s+)?"
# Nur das Label ist unabhängig von Groß-/Kleinschreibung, der Name selbst muss groß geschrieben sein.
PERSON_PATTERNS = [
    (re.compile(r"(?i:directeur|directrice|responsable)\s+(?i:de)\s+(?i:la\s+)?(?i:publication)\s*:?\s*" + _MR + _NAME),
     "Directeur de la publication"),
    (re.compile(r"\b(?i:g[ée]rante?)\s*:\s*" + _MR + _NAME), "Gérant"),
    (re.compile(r"\b(?i:pr[ée]sidente?)\s*:\s*" + _MR + _NAME), "Président"),
    (re.compile(r"\b(?i:managing director)\s*:\s*" + _MR + _NAME), "Managing Director"),
    (re.compile(r"\b(?i:directors?)\s*:\s*" + _MR + _NAME), "Director"),
    (re.compile(r"\b(?i:owner|proprietor)\s*:\s*" + _MR + _NAME), "Owner"),
    (re.compile(r"\b(?i:gesch[äa]ftsf[üu]hr(?:er|erin|ung))\s*:?\s*" + _NAME), "Geschäftsführer"),
]
NOT_A_NAME = re.compile(r"\b(ltd|limited|llc|inc|sas|sarl|sa|company|group|services|contact|email|mail|phone|tel|"
                        r"address|adresse|website|site|privacy|cookies?|policy|terms|conditions|h[ée]bergeur|hosting|"
                        r"ovh|ionos|wix|google|amazon|siège|siege|rue|avenue|street|road|capital|registered|office)\b", re.I)


def person_from_legal_notice(text: str) -> dict | None:
    """Name und Rolle der vertretungsberechtigten Person aus Impressum/mentions légales – nur mit ausdrücklichem Label."""
    for pat, role in PERSON_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        name = re.sub(r"\s+", " ", m.group(1)).strip()
        if NOT_A_NAME.search(name) or not (2 <= len(name.split()) <= 4) or len(name) > 60:
            continue
        name = " ".join(w.capitalize() if w.isupper() else w for w in name.split())
        return {"name": name, "role": role, "source": "Company website (legal notice)"}
    return None


# ---------------------------------------------------------------------------
# Zugehörigkeit prüfen (Punkte mit Belegen)
# ---------------------------------------------------------------------------
THRESHOLD = 60


def postcode_of(company: dict) -> str:
    country = company.get("country")
    for field in ("address", "postcode"):
        v = company.get(field) or ""
        pcs = postcodes(v, country) if country != "US" else set(re.findall(r"\b(1[0-4]\d{3})\b", v))
        if pcs:
            return sorted(pcs)[0]
    return ""


def score_match(company: dict, pages: dict[str, str], site_url: str) -> dict:
    """Wie sicher gehört die Website zu dieser Firma? {'score', 'verified', 'evidence', 'conflicts', 'registry_numbers'}.

    company: name, country, region, city, address, registry_source, registry_id.
    pages: URL -> HTML der geladenen Seiten (Startseite + Kontakt/Impressum)."""
    country = company.get("country") or ""
    text = "\n".join(without_hosting(page_text(p)) for p in pages.values())
    ntext = " " + norm(text + " " + " ".join(title_of(p) for p in pages.values())) + " "
    ev, conflicts, score = [], [], 0

    if is_directory(site_url):
        return {"score": 0, "verified": False, "evidence": [], "conflicts": ["directory_or_platform"], "registry_numbers": []}
    if any(is_parked(p) for p in list(pages.values())[:1]):
        return {"score": 0, "verified": False, "evidence": [], "conflicts": ["parked_or_placeholder"], "registry_numbers": []}

    # 1. Registernummer (Hoster/Webdesigner ausgenommen)
    rid = (company.get("registry_id") or "").strip()
    found_ids = [i for i in registry_numbers(text, country) if i not in HOSTER_IDS]
    registry_hit = False
    if rid:
        rid_n = uk_number_norm(rid) if country == "UK" else re.sub(r"\s", "", rid)
        digits = re.sub(r"\s", "", text)
        if rid_n in found_ids or (len(rid_n) >= 8 and (rid_n in digits or rid_n.lstrip("0") in found_ids)):
            score += 60
            ev.append("registry_id")
            registry_hit = True
        elif found_ids:
            conflicts.append("other_registry_id:" + ",".join(found_ids[:3]))

    # 2. Name
    full = " ".join(name_words(company.get("name") or "", keep_parens=True))
    core = " ".join(core_words(company.get("name") or ""))
    legal_full = norm(company.get("name") or "").replace(" limited", " ltd")
    if legal_full and (" " + legal_full + " ") in ntext.replace(" limited ", " ltd "):
        score += 30
        ev.append("name_full_legal")
    elif full and (" " + full + " ") in ntext:
        score += 20
        ev.append("name_full")
    elif core and (" " + core + " ") in ntext:
        score += 10
        ev.append("name_core")
    if not name_is_distinctive(company.get("name") or "") and ev and ev[-1].startswith("name"):
        score -= 5  # „Le Comptoir“ steht auf vielen Seiten

    # 3. Domain passt zum Namen
    label = site_domain(site_url).split(".")[0].replace("-", "")
    slugs = {"".join(name_words(company.get("name") or "")), "".join(core_words(company.get("name") or ""))}
    if label in slugs or label in {s + "ltd" for s in slugs}:
        score += 10
        ev.append("domain_equals_name")

    # 4. Ort / Postleitzahl
    pc = postcode_of(company)
    if pc and country in ("UK", "FR") and pc in postcodes(text, country):
        score += 25
        ev.append("postcode")
    city = norm(company.get("city") or "")
    if city and len(city) >= 3 and (" " + city + " ") in ntext:
        score += 10
        ev.append("city")
    if country == "US" and (company.get("region") or "").upper() in ("NY", "NEW YORK", "NEW YORK CITY", "LONG ISLAND"):
        if US_ZIP_NY.search(text):
            score += 15
            ev.append("ny_address")

    # 5. Ansprechperson aus dem Register steht auf der Seite (starker Beleg bei kleinen Firmen)
    pname = norm(company.get("_person_name") or "")
    if pname and len(pname.split()) >= 2 and (" " + pname.split()[-1] + " ") in ntext and len(pname.split()[-1]) >= 3:
        score += 25
        ev.append("director_name")

    # 6. Telefon: Landesvorwahl muss passen (Impressums-/Datenschutzseiten nennen oft den Hoster im Ausland)
    main_pages = [p for u, p in pages.items() if not LEGAL_URL.search(u)] or list(pages.values())[:1]
    phones, foreign = phones_on_page("\n".join(main_pages), country)
    if foreign and not phones and not registry_hit:
        score -= 30
        conflicts.append("phone_foreign_only")
    if country == "US" and phones and (company.get("region") or "").upper() in ("NY", "NEW YORK", "NEW YORK CITY",
                                                                                 "LONG ISLAND"):
        if any(p[2:5] in NY_AREA for p in phones):
            score += 15
            ev.append("ny_area_code")
        elif not any(p[2:5] in ("800", "833", "844", "855", "866", "877", "888") for p in phones):
            score -= 25
            conflicts.append("phone_other_state")

    verified = score >= THRESHOLD and not conflicts
    return {"score": score, "verified": verified, "evidence": ev, "conflicts": conflicts, "registry_numbers": found_ids}


def worth_deeper_look(company: dict, home_html: str, site_url: str) -> bool:
    """Lohnt es, Kontakt-/Impressumsseiten zu laden? Nur, wenn die Startseite überhaupt zur Firma passen kann."""
    if is_directory(site_url) or is_parked(home_html):
        return False
    ntext = " " + norm(page_text(home_html) + " " + title_of(home_html)) + " "
    core = " ".join(core_words(company.get("name") or ""))
    label = site_domain(site_url).split(".")[0].replace("-", "")
    return bool(core and (" " + core + " ") in ntext) or label in {"".join(core_words(company.get("name") or "")),
                                                                     "".join(name_words(company.get("name") or ""))}


SUBPAGE = re.compile(r'href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', re.I | re.S)
SUBPAGE_WORDS = [r"mentions[-_ ]?l[ée]gales|legal[-_ ]?notice|imprint|impressum|legal", r"contact|kontakt|get[-_ ]in[-_ ]touch",
                 r"about|a[-_ ]propos|qui[-_ ]sommes|who[-_ ]we[-_ ]are|our[-_ ]story|team", r"terms|privacy|cgv|conditions"]


def subpage_links(home_html: str, base_url: str, limit: int = 3) -> list[str]:
    """Kontakt-, Impressums- und Über-uns-Seiten derselben Domain, nach Wichtigkeit."""
    dom = site_domain(base_url)
    links = []
    for href, label in SUBPAGE.findall(home_html or ""):
        url = urljoin(base_url, _html.unescape(href.strip()))
        if not url.startswith("http") or site_domain(url) != dom or re.search(r"\.(pdf|jpe?g|png|zip|docx?)$", url, re.I):
            continue
        links.append((url.split("#")[0], href + " " + re.sub(r"<[^>]+>", " ", label)))
    out = []
    for pat in SUBPAGE_WORDS:
        for url, hay in links:
            if re.search(pat, hay, re.I) and url not in out and url.rstrip("/") != base_url.rstrip("/"):
                out.append(url)
                break
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------------
# Kontakte aus den Seiten
# ---------------------------------------------------------------------------
def extract_contacts(pages: dict[str, str], site_url: str, country: str, postcode: str = "") -> dict:
    """{'phone', 'email', 'address', 'person'} – nur Firmendaten der eigenen Website."""
    dom = site_domain(site_url)
    phone = email = None
    person = None
    jsonld = None
    ordered = sorted(pages.items(), key=lambda kv: 1 if LEGAL_URL.search(kv[0]) else 0)
    for url, page in ordered:
        if not phone:
            ph, _ = phones_on_page(page, country)
            phone = ph[0] if ph else None
        if not email:
            email = role_email(emails_on_page(page), dom)
        if not person and re.search(r"mentions|legal|imprint|impressum|about|propos|contact", url, re.I):
            person = person_from_legal_notice(without_hosting(page_text(page)))
        jsonld = jsonld or postal_address_jsonld(page)
    address = None
    if jsonld and jsonld.get("streetAddress"):
        address = ", ".join(v for v in (jsonld.get("streetAddress"), jsonld.get("addressLocality"),
                                        jsonld.get("addressRegion"), jsonld.get("postalCode")) if v)
    if not address:
        for url, page in ordered:
            text = without_hosting(page_text(page))
            if postcode:
                address = address_line(text, postcode, country)
            elif re.search(r"contact|legal|mentions|imprint|about|propos|find-us|locat", url, re.I):
                address = first_address_line(text, country)
            if address:
                break
    return {"phone": phone, "email": email, "address": address, "person": person}


# ---------------------------------------------------------------------------
# Qualität eines Leads (vollständig / unvollständig mit Gründen)
# ---------------------------------------------------------------------------
REQUIRED = ("phone", "email", "website", "address", "contact_name")


def assess(company: dict, contact: dict | None, person: dict | None, website_check: dict | None,
           today_iso: str, max_age_days: int = 90) -> dict:
    """Pflichtangaben (wie lib.leadreport.REQUIRED) + Plausibilität. 'blocking' = Daten widersprechen sich."""
    import datetime as dt
    contact = contact or {}
    country = company.get("country") or ""
    have = {"phone": contact.get("phone") or company.get("phone_main"), "email": contact.get("email"),
            "website": company.get("website"), "address": company.get("address"),
            "contact_name": (person or {}).get("name")}
    missing = [k for k in REQUIRED if not have[k]]
    issues = []
    if have["website"] and website_check is not None and website_check.get("verified") is False:
        issues.append("website_not_verified")
    if have["email"] and have["website"]:
        edom = have["email"].rsplit("@", 1)[-1]
        sdom = site_domain(have["website"])
        if not (edom == sdom or edom.endswith("." + sdom) or sdom.endswith("." + edom)):
            issues.append("email_domain_differs_from_website")
    if contact.get("email_mx") is False:
        issues.append("email_domain_without_mx")
    if have["phone"]:
        e164, why = normalize_phone(have["phone"], country)
        if not e164:
            issues.append(f"phone_{why}")
    seen = contact.get("checked_on")
    if seen:
        try:
            age = (dt.date.fromisoformat(today_iso) - dt.date.fromisoformat(seen[:10])).days
            if age > max_age_days:
                issues.append("contact_stale")
        except ValueError:
            pass
    blocking = [i for i in issues if i != "contact_stale"]
    return {"complete": not missing and not blocking, "missing": missing, "issues": issues, "blocking": bool(blocking)}
