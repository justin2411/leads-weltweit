"""Welche Branche (Käufer-Segment) passt zu einem Kandidaten, und die Texte dazu – nur aus belegten Fakten.

Jeder Text entsteht aus den Feldern des einzelnen Leads (Datum, Beträge, Fahrzeuge, Ort, Name). Die
Signalkontrolle (sc.py) prüft danach, dass jede Zahl und jeder Ort im Text wirklich in den Fakten steht.
"""
from __future__ import annotations

import datetime as dt
import re

from extraktor.enrich import email_domain, is_freemail

SEGMENTS = {
    "S1": "Recruitment & staffing agencies",
    "S2": "Web design agencies",
    "S4": "Commercial insurance brokers",
    "S5": "Accounting, bookkeeping & payroll",
    "S9": "Financial & wealth advisers",
}
SMALL_REVENUE = {"No Revenues", "$1 - $1,000,000", "$1,000,001 - $5,000,000", "Decline to Disclose", "Not Applicable", ""}
LARGE_REVENUE = {"$25,000,001 - $100,000,000", "Over $100,000,000"}


# ---------------------------------------------------------------------------
# Zahlen und Daten einheitlich schreiben (die Signalkontrolle vergleicht genau diese Formen)
# ---------------------------------------------------------------------------
def money(n: int | None) -> str:
    return f"${n:,}" if n is not None else ""


def day(d) -> str:
    if isinstance(d, str):
        d = dt.date.fromisoformat(d[:10])
    return f"{d:%B} {d.day}, {d.year}" if d else ""


def plural(n: int, word: str, many: str | None = None) -> str:
    return f"{n} {word if n == 1 else (many or word + 's')}"


def place(c: dict) -> str:
    return f"{c['city']}, {c['state']}" if c.get("city") and c.get("state") else c.get("state") or ""


# ---------------------------------------------------------------------------
# Passt der Kandidat zur Branche? (Regel, Grund)
# ---------------------------------------------------------------------------
def fits(seg: str, c: dict) -> tuple[bool, str]:
    f = c["facts"]
    if c["source"] == "fmcsa":
        if f["power_units"] > 100:
            return False, "large fleet (>100 power units) – not an SMB"
        if seg == "S4":
            if f["power_units"] < 1:
                return False, "no power units registered"
            if not (f["for_hire"] or f["private_fleet"]):
                return False, "neither for-hire nor private fleet"
            return True, "new motor carrier with own vehicles needs commercial auto/cargo cover"
        if seg == "S5":
            if f["power_units"] < 1 or f["drivers"] < 1:
                return False, "no drivers on payroll yet"
            return True, "new transport business with drivers – payroll, bookkeeping and tax registrations start now"
        if seg == "S2":
            if c.get("website"):
                return False, "already has a verified website"
            if c.get("email") and not is_freemail(c["email"]):
                return False, "uses an own email domain (likely has a site)"
            return True, "new business without a website"
        return False, "source does not carry this signal"
    if c["source"] == "sec_form_d":
        sold = f.get("amount_sold") or 0
        if f.get("revenue_range") in LARGE_REVENUE:
            return False, "revenue above $25M – not an SMB"
        if sold <= 0:
            return False, "nothing sold yet"
        young = bool(f.get("year_of_inc") and f["year_of_inc"] >= dt.date.today().year - 3)
        if seg == "S1":
            return (sold >= 1_000_000, "raised $1M+ – capital for hiring" if sold >= 1_000_000 else "raise below $1M")
        if seg == "S5":
            ok = young and f.get("revenue_range") in SMALL_REVENUE and sold < 5_000_000
            return ok, ("young company with first outside capital – bookkeeping, payroll, investor reporting"
                        if ok else "not a young small company")
        if seg == "S9":
            ok = bool(c.get("person_name")) and sold >= 250_000
            return ok, "named executive of a company that just raised capital" if ok else "no named executive or raise < $250k"
    if c["source"] in ("ats_jobs", "careers"):
        if seg != "S1":
            return False, "source only carries the hiring signal"
        n, oldest = f.get("open_roles", 0), f.get("oldest_posted")
        age = (dt.date.today() - dt.date.fromisoformat(oldest)).days if oldest else 0
        ok = n >= 3 or age >= 30
        return ok, (f"{n} open roles, oldest {age} days" if ok else "fewer than 3 roles and none open 30+ days")
    if c["source"] == "dol_lca":
        if seg != "S1":
            return False, "source only carries the hiring signal"
        ok = f.get("new_hires", 0) >= 3
        return ok, (f"{f['new_hires']} new hires for skilled roles filed with the US Department of Labor" if ok
                    else "fewer than 3 new hires filed")
    if c["source"] == "overture":
        if seg != "S2":
            return False, "source only carries the no-website signal"
        if c.get("website"):
            return False, "a verified website exists"
        if c.get("email") and not is_freemail(c["email"]):
            return False, "uses an own email domain (likely has a site)"
        return True, "established local business without a website"
    if c["source"] == "overture_web":
        if seg != "S2":
            return False, "source only carries the website quality signal"
        if not (c.get("website") and f.get("findings")):
            return False, "no verified website problem"
        return True, "local business whose own website is not secure, not built for phones, outdated or broken"
    if c["source"] == "ct_registry":
        if seg == "S2":
            ok = bool(c.get("email")) and is_freemail(c["email"]) and not c.get("website")
            return ok, ("new business registered with a personal email address – no own website or domain yet" if ok
                        else "uses an own email domain (likely has a site)")
        if seg == "S4":
            ok = insured_sector(c)
            return ok, ("new business in a sector that needs commercial insurance from day one" if ok
                        else "sector without obvious commercial insurance need")
        if seg == "S5":
            return True, "new business: bookkeeping, sales tax registration and payroll start now"
        if seg == "S9":
            ok = bool(c.get("person_name"))
            return ok, "named owner of a newly registered business" if ok else "no named owner"
        return False, "source does not carry this signal"
    if c["source"] in ("companies_house", "bodacc"):
        if seg == "S4":
            ok = insured_sector(c)
            return ok, ("new company in a sector that needs commercial insurance from day one" if ok
                        else "sector without obvious commercial insurance need")
        if seg == "S5":
            return True, "new company: first accounts, tax registration, payroll and bookkeeping start now"
        if seg == "S9":
            ok = bool(c.get("person_name"))
            return ok, "named owner/director of a newly founded company" if ok else "no named owner"
        return False, "source does not carry this signal"
    return False, "unknown source"


# Branchen mit klarem Versicherungsbedarf ab Tag 1 (Bau, Transport, Gastronomie, Handel, Produktion, Pflege, Reinigung)
UK_INSURED_SIC = re.compile(r"^(1\d|2\d|3[0-3]|41|42|43|45|46|47|49|52|53|55|56|77|80|81|86|87|88|96)")
FR_INSURED_ACT = re.compile(r"b[aâ]timent|construction|ma[cç]onnerie|plomberie|[ée]lectricit[ée]|menuiserie|couverture|"
                            r"peinture|r[ée]novation|travaux|transport|livraison|d[ée]m[ée]nagement|logistique|"
                            r"restaura|traiteur|bar\b|caf[ée]|h[oô]tel|boulangerie|commerce de d[ée]tail|magasin|"
                            r"boutique|fabrication|atelier|garage|m[ée]canique|nettoyage|entretien|paysag|"
                            r"aide [àa] domicile|soins|location de v[ée]hicules|taxi|vtc", re.I)


US_INSURED_NAICS = re.compile(r"^(23|3[1-3]|42|44|45|48|49|532|56|62|72|811|812)")


def insured_sector(c: dict) -> bool:
    f = c["facts"]
    if c["source"] == "ct_registry":
        return bool(US_INSURED_NAICS.match(f.get("naics") or ""))
    if c["source"] == "companies_house":
        return any(UK_INSURED_SIC.match(code) for code in f.get("sic_codes", []))
    return bool(FR_INSURED_ACT.search(f.get("activity") or ""))


# ---------------------------------------------------------------------------
# Texte
# ---------------------------------------------------------------------------
def _fleet(f: dict) -> str:
    parts = [plural(f["power_units"], "power unit")]
    if f["drivers"]:
        parts.append(plural(f["drivers"], "driver"))
    return " and ".join(parts)


def _kind(f: dict) -> str:
    if f["for_hire"]:
        return f"for-hire {f['operation']} carrier".replace("  ", " ")
    return f"private-fleet operator ({f['operation']})" if f["operation"] else "private-fleet operator"


MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre",
        "décembre"]


def jour(d) -> str:
    if isinstance(d, str):
        d = dt.date.fromisoformat(d[:10])
    return f"{'1er' if d.day == 1 else d.day} {MOIS[d.month - 1]} {d.year}" if d else ""


def uk_day(d) -> str:
    return f"{d.day} {d:%B} {d.year}" if d else ""


def short_activity(a: str, n: int = 110) -> str:
    a = re.sub(r"\s+", " ", (a or "").strip().rstrip("."))
    a = re.sub(r"^(la soci[ée]t[ée] a pour objet( principal)?\s*:?\s*(en france et [àa] l'[ée]tranger)?\s*:?\s*)", "", a, flags=re.I)
    return (a[:n].rsplit(" ", 1)[0] + "…") if len(a) > n else a


def texts_uk(seg: str, c: dict) -> dict:
    f, name, first = c["facts"], c["name"], (c.get("person_name") or "").split(" ")[0]
    inc = uk_day(f["incorporated_on"])
    sic = f["sic"][0] if f["sic"] else "trading"
    info = (f"{name} is a new private limited company (company number {f['company_number']}) incorporated at "
            f"Companies House on {inc}, registered in {c['city']} {c['zip']}. Business activity: {'; '.join(f['sic'][:2]).rstrip('.')}.")
    signal = f"{name} (company no. {f['company_number']}) was incorporated on {inc} – {sic.lower().rstrip('.')}."
    if seg == "S4":
        opener = (f"Congratulations on setting up {name} – as a new {sic.lower()} business, have you already arranged "
                  f"your liability and business insurance?")
        urg, why = "high", "New trading companies in this sector need liability cover before taking on work or staff."
    elif seg == "S5":
        opener = (f"Congratulations on incorporating {name} – who is looking after your bookkeeping, VAT and first "
                  f"year-end accounts?")
        urg, why = "medium", "A new limited company must keep records from day one and file its first accounts and confirmation statement."
    else:
        signal = f"{c['person_name']} – owner of {name}, incorporated on {inc} (company no. {f['company_number']})."
        opener = (f"Congratulations on founding {name}{', ' + first if first else ''} – have you had a chance to set up "
                  f"your own pension and financial plan alongside the new business?")
        urg, why = "medium", "New company owners decide early how to pay themselves, pensions and protection."
    return {"signal": signal, "signal_date": f["incorporated_on"], "company_info": info, "opener": opener,
            "urgency": urg, "urgency_reason": why}


def texts_ct(seg: str, c: dict) -> dict:
    f, name, first = c["facts"], c["name"], (c.get("person_name") or "").split(" ")[0]
    reg = uk_day(f["registered_on"])
    act = (f.get("activity") or "").strip()
    act_l = act.lower() if act else "new"
    info = (f"{name} is a new {f.get('business_type') or 'business'} registered with the Connecticut Secretary of the "
            f"State on {reg}, based in {c['city']}, {c['state']}." + (f" Industry: {act}." if act else ""))
    signal = f"{name} was registered in Connecticut on {reg}" + (f" – {act_l}." if act else ".")
    if seg == "S2":
        opener = (f"Congratulations on starting {name} – I couldn't find a website for the business yet. "
                  f"Is getting found online something you're planning?")
        urg, why = "medium", "Registered with a personal email address and no own domain – customers can't find it online yet."
    elif seg == "S4":
        opener = (f"Congratulations on registering {name} – as a new {act_l} business, have you already arranged "
                  f"your general liability and business insurance?")
        urg, why = "high", "New businesses in this sector need liability cover before taking on jobs, staff or vehicles."
    elif seg == "S5":
        opener = (f"Congratulations on registering {name} – who is looking after your bookkeeping, sales tax and "
                  f"payroll setup?")
        urg, why = "medium", "A new business sets up its books, tax registrations and payroll in the first weeks."
    else:
        signal = f"{c['person_name']} – owner of {name}, registered in Connecticut on {reg}."
        opener = (f"Congratulations on founding {name}{', ' + first if first else ''} – have you had a chance to set up "
                  f"your own retirement and financial plan alongside the new business?")
        urg, why = "medium", "New business owners decide early how to pay themselves, retirement plans and protection."
    return {"signal": signal, "signal_date": f["registered_on"], "company_info": info, "opener": opener,
            "urgency": urg, "urgency_reason": why}


def de(name: str) -> str:
    """Französische Elision: 'de IMVEXO' -> 'd'IMVEXO'."""
    return f"d'{name}" if name[:1].lower() in "aeiouyhéèêàâîôû" else f"de {name}"


def texts_fr(seg: str, c: dict) -> dict:
    f, name, first = c["facts"], c["name"], (c.get("person_name") or "").split(" ")[0]
    pub = jour(f["published_on"])
    act = short_activity(f.get("activity") or "")
    form = (f.get("form") or "société").lower()
    cap = f" au capital de {f['capital']} €" if f.get("capital") else ""
    info = (f"{name} est une {form}{cap} nouvellement immatriculée (SIREN {f['siren']}), siège à {c['city']} "
            f"({c['zip']}). Création publiée au BODACC le {pub}. Activité : {act}")
    signal = f"{name} (SIREN {f['siren']}) : création publiée au BODACC le {pub} – {act}"
    if seg == "S4":
        opener = (f"Félicitations pour la création {de(name)} – avez-vous déjà mis en place votre responsabilité civile "
                  f"professionnelle et vos assurances d'entreprise ?")
        urg, why = "high", "Une entreprise nouvelle dans ce secteur doit être assurée avant de démarrer son activité."
    elif seg == "S5":
        opener = (f"Félicitations pour la création {de(name)} – qui s'occupe de votre comptabilité, de la TVA et de vos "
                  f"premières déclarations ?")
        urg, why = "medium", "Une société nouvelle doit tenir sa comptabilité dès le premier jour et préparer son premier exercice."
    else:
        signal = f"{c['person_name']} ({(c.get('person_role') or 'dirigeant').split(' (')[0]}) – {name} (SIREN {f['siren']}), création publiée au BODACC le {pub}."
        opener = (f"Félicitations pour la création {de(name)}{', ' + first if first else ''} – avez-vous pensé à votre "
                  f"protection sociale et à votre épargne de dirigeant ?")
        urg, why = "medium", "Les nouveaux dirigeants choisissent tôt leur rémunération, leur retraite et leur prévoyance."
    return {"signal": signal, "signal_date": f["published_on"], "company_info": info, "opener": opener,
            "urgency": urg, "urgency_reason": why}


CAT_FR = {"restaurant": "restaurant", "cafe": "café", "bar": "bar", "personal or beauty service": "institut de beauté",
          "home service": "artisan du bâtiment", "food and beverage store": "commerce alimentaire",
          "automotive service": "garage automobile", "casual eatery": "restauration rapide",
          "fashion and apparel store": "boutique de mode", "animal or pet service": "service pour animaux",
          "wellness service": "centre de bien-être", "hardware home and garden store": "magasin de bricolage",
          "professional service": "prestataire de services", "farm": "exploitation agricole",
          "flowers and gifts store": "fleuriste", "event or party service": "prestataire événementiel",
          "hotel": "hôtel", "lodging": "hébergement", "private lodging": "location saisonnière", "gym": "salle de sport",
          "real estate service": "agence immobilière", "b2b service": "prestataire B2B", "bakery": "boulangerie"}


CAT_EN = {"non alcoholic beverage venue": "café / tea room", "automotive service": "car repair and service business",
          "home service": "home services business", "personal or beauty service": "beauty and personal care business",
          "food and beverage store": "food shop", "casual eatery": "casual eatery", "shipping or delivery service":
          "shop and delivery service", "animal or pet service": "pet services business", "professional service":
          "professional services firm", "event or party service": "events business", "wellness service":
          "wellness business", "fashion and apparel store": "clothing shop", "hardware home and garden store":
          "hardware and garden shop", "b2b service": "B2B services firm"}


def texts_overture(c: dict) -> dict:
    f, name = c["facts"], c["name"]
    cat = f.get("category") or "local business"
    social = f.get("social")
    today = f["checked_on"]
    if c["country"] == "FR":
        cat_fr = CAT_FR.get(cat, "entreprise locale")
        extra = (", une adresse e-mail" if c.get("email") else "") + (f" et une page {social}" if social else "")
        signal = (f"Aucun site web trouvé pour {name} : l'entreprise est référencée avec un numéro de téléphone{extra}, "
                  f"mais nous n'avons trouvé aucun site propre (vérifié le {jour(today)}).")
        info = f"{name} : {cat_fr} à {c['city']} ({c['zip']})" + (f", présent sur {social}." if social else ".")
        opener = (f"Bonjour, je n'ai pas trouvé de site web pour {name} – un site simple pour être trouvé par de "
                  f"nouveaux clients vous intéresserait-il ?")
        why = "Sans site web, l'entreprise est peu visible pour les clients qui la cherchent en ligne."
    else:
        extra = (", an email address" if c.get("email") else "") + (f" and a {social} page" if social else "")
        signal = (f"No website found for {name}: it is listed with a phone number{extra}, but we could not find "
                  f"an own website (checked {uk_day(today)}).")
        label = CAT_EN.get(cat, cat)
        art = "an" if label[:1].lower() in "aeiou" else "a"
        # US: Bundesstaat nennen („Milton, FL 32570“), wie in der Adresse (Signalkontrolle prüft das)
        place = f"{c['city']}, {c['state']} {c['zip']}" if c["country"] == "US" and c.get("state") else f"{c['city']} {c['zip']}"
        info = f"{name} is {art} {label} in {place}" + (f", active on {social}." if social else ".")
        opener = (f"Hi – I couldn't find a website for {name}; would a simple site that helps new customers find "
                  f"you be useful?")
        why = "Without a website the business is hard to find for customers searching online."
    return {"signal": signal, "signal_date": today, "company_info": info, "opener": opener, "urgency": "medium",
            "urgency_reason": why}


WEB_EN = {
    "no_https": "Chrome shows \u2018Not secure\u2019 on its website {domain}, because the site has no HTTPS encryption",
    "redirects_to_http": "Chrome shows \u2018Not secure\u2019 on its website {domain}, because the site has no HTTPS encryption",
    "certificate_expired": "the security certificate of its website {domain} has expired, so browsers warn visitors before opening it",
    "certificate_wrong_name": "the security certificate of its website {domain} does not match the domain, so browsers warn visitors before opening it",
    "certificate_self_signed": "its website {domain} uses a self signed security certificate, so browsers warn visitors before opening it",
    "no_viewport": "the homepage is not built for phones (no mobile viewport setting)",
    "copyright": "the copyright notice on the homepage dates from {value}",
    "wordpress": "the site runs on WordPress {value}, an old version",
    "joomla": "the site runs on Joomla {value}, an old version",
    "flash": "the homepage still embeds Adobe Flash, which browsers no longer play",
    "jquery1": "the homepage loads an old version of the jQuery library ({value})",
    "http_404": "its website {domain} shows an error page (HTTP {value}) instead of a homepage",
    "http_410": "its website {domain} shows an error page (HTTP {value}) instead of a homepage",
    "http_500": "its website {domain} shows a server error (HTTP {value}) instead of a homepage",
    "parked": "its listed website {domain} only shows a parked domain page, no own content",
    "default_page": "its listed website {domain} only shows a default server page, no own content",
}
WEB_FR = {
    "no_https": "Chrome affiche \u00ab\u00a0Non s\u00e9curis\u00e9\u00a0\u00bb sur son site {domain}, car le site n'est pas chiffr\u00e9 en HTTPS",
    "redirects_to_http": "Chrome affiche \u00ab\u00a0Non s\u00e9curis\u00e9\u00a0\u00bb sur son site {domain}, car le site n'est pas chiffr\u00e9 en HTTPS",
    "certificate_expired": "le certificat de s\u00e9curit\u00e9 de son site {domain} a expir\u00e9 : les navigateurs affichent un avertissement avant de l'ouvrir",
    "certificate_wrong_name": "le certificat de s\u00e9curit\u00e9 de son site {domain} ne correspond pas au domaine : les navigateurs affichent un avertissement avant de l'ouvrir",
    "certificate_self_signed": "son site {domain} utilise un certificat autosign\u00e9 : les navigateurs affichent un avertissement avant de l'ouvrir",
    "no_viewport": "la page d'accueil n'est pas adapt\u00e9e aux mobiles (pas de r\u00e9glage viewport)",
    "copyright": "la mention de copyright de la page d'accueil date de {value}",
    "wordpress": "le site tourne sous une ancienne version de WordPress ({value})",
    "joomla": "le site tourne sous une ancienne version de Joomla ({value})",
    "flash": "la page d'accueil int\u00e8gre encore Adobe Flash, que les navigateurs ne lisent plus",
    "jquery1": "la page d'accueil charge une ancienne version de la biblioth\u00e8que jQuery ({value})",
    "http_404": "son site {domain} affiche une page d'erreur (HTTP {value}) au lieu d'une page d'accueil",
    "http_410": "son site {domain} affiche une page d'erreur (HTTP {value}) au lieu d'une page d'accueil",
    "http_500": "son site {domain} affiche une erreur serveur (HTTP {value}) au lieu d'une page d'accueil",
    "parked": "le site indiqu\u00e9 {domain} n'affiche qu'une page de domaine parqu\u00e9, sans contenu propre",
    "default_page": "le site indiqu\u00e9 {domain} n'affiche qu'une page serveur par d\u00e9faut, sans contenu propre",
}
WEB_OPENER = {
    "en": {"no_https": "Hi, I noticed Chrome shows \u2018Not secure\u2019 when visiting the {name} website. Would help with a secure, modern site be useful?",
           "website_broken": "Hi, the website listed for {name} does not show your business at the moment. Would a working site that helps new customers find you be useful?",
           "website_not_mobile": "Hi, I noticed the {name} website is not built for phones. Would a site that works well on mobile be useful?",
           "website_outdated": "Hi, I had a look at the {name} website and it runs on older web technology. Would a modern refresh be useful?"},
    "fr": {"no_https": "Bonjour, j'ai remarqu\u00e9 que Chrome affiche \u00ab\u00a0Non s\u00e9curis\u00e9\u00a0\u00bb sur le site de {name}. Un site moderne et s\u00e9curis\u00e9 vous int\u00e9resserait-il ?",
           "website_broken": "Bonjour, le site indiqu\u00e9 pour {name} ne pr\u00e9sente pas votre entreprise en ce moment. Un site qui fonctionne pour \u00eatre trouv\u00e9 par de nouveaux clients vous int\u00e9resserait-il ?",
           "website_not_mobile": "Bonjour, j'ai remarqu\u00e9 que le site de {name} n'est pas adapt\u00e9 aux mobiles. Un site agr\u00e9able sur t\u00e9l\u00e9phone vous int\u00e9resserait-il ?",
           "website_outdated": "Bonjour, j'ai regard\u00e9 le site de {name} : il repose sur une technique web ancienne. Une modernisation vous int\u00e9resserait-elle ?"},
}
WEB_WHY = {
    "en": {"no_https": "Browsers warn visitors that the site is not secure, which puts off customers and enquiries.",
           "website_broken": "Customers who look the business up online find no working website.",
           "website_not_mobile": "Most local searches happen on phones; a site not built for phones loses those visitors.",
           "website_outdated": "An outdated site looks neglected to new customers and is harder to keep secure."},
    "fr": {"no_https": "Les navigateurs pr\u00e9viennent les visiteurs que le site n'est pas s\u00e9curis\u00e9, ce qui fait fuir des clients.",
           "website_broken": "Les clients qui cherchent l'entreprise en ligne ne trouvent pas de site qui fonctionne.",
           "website_not_mobile": "La plupart des recherches locales se font sur t\u00e9l\u00e9phone ; un site non adapt\u00e9 perd ces visiteurs.",
           "website_outdated": "Un site ancien para\u00eet n\u00e9glig\u00e9 aux nouveaux clients et se s\u00e9curise plus difficilement."},
}
WEB_URGENCY = {"no_https": "high", "website_broken": "high", "website_not_mobile": "medium", "website_outdated": "medium"}


def texts_website(c: dict) -> dict:
    """S2 Website-Prüfung: jeder Befund als belegter Halbsatz, Prüfdatum im Signal; keine Gedankenstriche."""
    f, name = c["facts"], c["name"]
    today, dom, kind = f["checked_on"], f["domain"], f["signal_type"]
    fr = c["country"] == "FR"
    table = WEB_FR if fr else WEB_EN
    parts = []
    order = ("website_broken", "no_https", "website_not_mobile", "website_outdated")
    for x in sorted(f["findings"], key=lambda x: order.index(x["type"]))[:3]:
        p = table[x["detail"]].format(domain=dom, value=x.get("value") or "")
        if p not in parts:
            parts.append(p)
    lang = "fr" if fr else "en"
    if fr:
        signal = f"{name} : " + " ; ".join(parts) + f" (vérifié le {jour(today)})."
        cat_fr = CAT_FR.get(f.get("category") or "", "entreprise locale")
        info = f"{name} : {cat_fr} à {c['city']} ({c['zip']}), site web {dom}."
    else:
        signal = f"{name}: " + "; ".join(parts) + f" (checked {uk_day(today)})."
        label = CAT_EN.get(f.get("category") or "", f.get("category") or "local business")
        art = "an" if label[:1].lower() in "aeiou" else "a"
        place = f"{c['city']}, {c['state']} {c['zip']}" if c["country"] == "US" and c.get("state") else f"{c['city']} {c['zip']}"
        info = f"{name} is {art} {label} in {place}, website {dom}."
    return {"signal": signal, "signal_date": today, "company_info": info,
            "opener": WEB_OPENER[lang][kind].format(name=name), "urgency": WEB_URGENCY[kind],
            "urgency_reason": WEB_WHY[lang][kind]}


def texts_jobs(c: dict) -> dict:
    f, name = c["facts"], c["name"]
    n, oldest, titles = f["open_roles"], f.get("oldest_posted"), f.get("titles") or []
    today = f["checked_on"]
    age = (today - dt.date.fromisoformat(oldest)).days if oldest else 0
    if c["country"] == "FR":
        since = f", la plus ancienne publiée le {jour(oldest)}" if oldest else ""
        signal = (f"{name} : {plural(n, 'offre ouverte', 'offres ouvertes')} en France au {jour(today)}{since} – "
                  f"{'; '.join(titles)}.")
        info = (f"{name}" + (f" ({c['city']})" if c.get("city") else "")
                + f" recrute en France : {plural(n, 'poste ouvert', 'postes ouverts')} sur sa page carrières.")
        opener = (f"Bonjour, j'ai vu que {name} recrute ({titles[0] if titles else 'plusieurs postes'}) – "
                  f"des candidats présélectionnés par un cabinet spécialisé vous aideraient-ils ?")
        why = ("Postes ouverts depuis plus d'un mois : le recrutement en direct ne suffit pas." if age >= 30
               else "Plusieurs recrutements en parallèle : besoin de candidats rapidement.")
    else:
        country = "the UK" if c["country"] == "UK" else "the US"
        since = f", the oldest advertised since {uk_day(dt.date.fromisoformat(oldest))}" if oldest else ""
        signal = f"{name}: {plural(n, 'open role')} in {country} as of {uk_day(today)}{since} – {'; '.join(titles)}."
        place = c["city"] + (f", {c['state']}" if c["country"] == "US" and c.get("state") else "")
        info = (f"{name}" + (f", based in {place}," if c.get("city") else "")
                + f" is hiring in {country}: {plural(n, 'open role')} on its careers page"
                + (", and it is a licensed visa sponsor." if f.get("sponsor") else "."))
        opener = (f"I saw {name} is hiring ({titles[0] if titles else 'several roles'}) – would pre-screened candidates "
                  f"from a specialist recruiter help?")
        why = ("Roles open for more than a month suggest direct hiring is not filling them." if age >= 30
               else "Several roles open at once: the team needs candidates quickly.")
    return {"signal": signal, "signal_date": today, "company_info": info, "opener": opener,
            "urgency": "high" if age >= 30 else "medium", "urgency_reason": why}


def texts_lca(c: dict) -> dict:
    """S1/US aus den LCA-Daten: ehrlich als Bedarf an Fachkräften, nicht als offene Stelle; ohne Lohnangaben."""
    f, name = c["facts"], c["name"]
    first, last = f["first_received"], f["last_received"]
    titles = f.get("titles") or []
    roles = "; ".join(titles) if titles else "skilled roles"
    span = f"on {uk_day(last)}" if first == last else f"between {uk_day(first)} and {uk_day(last)}"
    signal = (f"{name} filed H-1B labor condition applications with the US Department of Labor for "
              f"{plural(f['positions'], 'position')} {span}, {f['new_hires']} of them new hires: {roles}.")
    info = (f"{name}, based in {c['city']}, {c['state']}, is hiring skilled staff in the US: "
            f"{plural(f['cases'], 'labor condition application')} for {plural(f['positions'], 'position')} "
            f"in one quarter, mainly {(f.get('soc_titles') or ['specialist roles'])[0].split(',')[0].lower()}.")
    opener = (f"I saw {name} has been hiring for roles like {titles[0] if titles else 'skilled specialists'} in the US. "
              f"Would pre-screened candidates from a specialist recruiter help?")
    why = "Several filings for skilled roles in one quarter show an ongoing need for specialist hires."
    return {"signal": signal, "signal_date": last, "company_info": info, "opener": opener,
            "urgency": "medium", "urgency_reason": why}


def texts(seg: str, c: dict) -> dict:
    """{'signal', 'signal_date', 'company_info', 'opener', 'urgency', 'urgency_reason'}"""
    if c["source"] in ("ats_jobs", "careers"):
        return texts_jobs(c)
    if c["source"] == "dol_lca":
        return texts_lca(c)
    if c["source"] == "ct_registry":
        return texts_ct(seg, c)
    if c["source"] == "overture":
        return texts_overture(c)
    if c["source"] == "overture_web":
        return texts_website(c)
    if c["source"] == "companies_house":
        return texts_uk(seg, c)
    if c["source"] == "bodacc":
        return texts_fr(seg, c)
    f, name, first = c["facts"], c["name"], (c.get("person_name") or "").split(" ")[0].title()
    if c["source"] == "fmcsa":
        reg = day(f["registered_on"])
        cargo = f", hauling {', '.join(f['cargo'][:3])}" if f["cargo"] else ""
        info = (f"{name} is a {_kind(f)} based in {place(c)}, registered with the US DOT on {reg} "
                f"(USDOT {f['dot_number']}). Fleet: {_fleet(f)}{cargo}.")
        if seg == "S4":
            signal = f"{name} (USDOT {f['dot_number']}) registered on {reg} as a {_kind(f)} with {_fleet(f)}{cargo}."
            opener = (f"Congratulations on getting {name} registered with the DOT – with "
                      f"{plural(f['power_units'], 'vehicle')} on the road, is your commercial auto and cargo cover sorted?")
            if f["for_hire"] and f["interstate"]:
                urg, why = "high", ("For-hire interstate carriers must have proof of liability insurance on file with "
                                    "FMCSA before operating under their authority.")
            else:
                urg, why = "medium", "Newly registered fleet: vehicles, drivers and cargo need commercial cover from day one."
        elif seg == "S5":
            signal = (f"{name} (USDOT {f['dot_number']}) registered on {reg} as a {_kind(f)} with "
                      f"{_fleet(f)} – a new transport business with drivers on the road.")
            opener = (f"Congratulations on launching {name} – with {plural(f['drivers'], 'driver')} starting out, "
                      f"who is setting up your payroll and bookkeeping?")
            urg, why = "medium", "New transport businesses set up payroll, bookkeeping and fuel/tax registrations in the first months."
        else:  # S2
            dom = email_domain(c.get("email") or "")
            art = "an" if dom[:1] in "aeiou" else "a"
            mail = f"its contact email is {art} {dom} address" if dom else "it lists no email address"
            signal = (f"{name} (USDOT {f['dot_number']}), registered on {reg}, has no company website: {mail}, "
                      f"and no website under its name could be found.")
            opener = (f"Congratulations on registering {name} – I couldn't find a website for you yet; "
                      f"would a simple site that helps customers find you be useful?")
            urg, why = "medium", "New businesses decide on their web presence in the first months."
        return {"signal": signal, "signal_date": f["registered_on"], "company_info": info, "opener": opener,
                "urgency": urg, "urgency_reason": why}

    filed = day(f["filed_on"])
    sold, offer, inv = f.get("amount_sold"), f.get("offering_amount"), f.get("investors")
    inv_txt = f" from {plural(inv, 'investor')}" if inv else ""
    offer_txt = f" of a {money(offer)} offering" if offer and offer != sold else ""
    inc = f", incorporated in {f['year_of_inc']}" if f.get("year_of_inc") else ""
    rev = f" Reported revenue range: {f['revenue_range']}." if f.get("revenue_range") not in ("", "Decline to Disclose",
                                                                                                "Not Applicable", None) else ""
    industry = (f.get("industry") or "").replace("Other ", "").lower() or "private"
    info = (f"{name} is a {industry} company based in {place(c)}{inc}. In an SEC Form D filed on {filed} it reported "
            f"raising {money(sold)}{offer_txt}{inv_txt}.{rev}")
    signal = f"{name} filed an SEC Form D on {filed}: raised {money(sold)}{offer_txt}{inv_txt}."
    if seg == "S1":
        opener = (f"Congratulations on the {money(sold)} raise at {name} – are you planning to grow the team "
                  f"in {c['city'] or c['state']} over the next months?")
        urg = "high" if sold >= 3_000_000 else "medium"
        why = "Fresh growth capital is often followed by hiring; the raise was reported in the last weeks."
    elif seg == "S5":
        opener = (f"Congratulations on closing {money(sold)} for {name} – who is handling bookkeeping, payroll and "
                  f"investor reporting now that outside capital is in?")
        urg, why = "medium", "First outside capital brings investor reporting, cap-table and payroll obligations."
    else:  # S9
        role = c.get("person_role") or "executive"
        signal = f"{c['person_name']} ({role}) – {name} filed an SEC Form D on {filed}: raised {money(sold)}{inv_txt}."
        opener = (f"Congratulations on {name}'s {money(sold)} raise{', ' + first if first else ''} – have you had a "
                  f"chance to look at your own financial plan alongside the company's growth?")
        urg, why = "medium", "Founders and executives of newly funded companies often review personal and business finances."
    return {"signal": signal, "signal_date": f["filed_on"], "company_info": info, "opener": opener,
            "urgency": urg, "urgency_reason": why}
