"""Kontrolle 1 – Qualität der Kontaktdaten: stimmt die Nummer, die E-Mail, ist die Ansprechperson ein echter Name,
passt die Adresse, gehört die Website zur Firma, widerspricht sich nichts?

Ergebnis: {'status': 'green'|'yellow'|'red', 'blocking': [...], 'missing': [...], 'warnings': [...], 'evidence': [...]}
  red    = Daten falsch oder widersprüchlich -> nie liefern (Inhaber 27.09.2026)
  yellow = Pflichtangabe fehlt -> anreichern, noch nicht liefern
  green  = vollständig und plausibel
"""
from __future__ import annotations

import re

from extraktor.enrich import email_domain, is_freemail
from lib import websites as W

try:
    import phonenumbers
    from phonenumbers import PhoneNumberType, geocoder
except ImportError:  # pragma: no cover - requirements.txt enthält phonenumbers
    phonenumbers = None

try:
    import gender_guesser.detector as _gg
    _NAMES = _gg.Detector(case_sensitive=False)
except ImportError:  # pragma: no cover
    _NAMES = None

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky",
    "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota",
    "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia",
    "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
# ZIP-Präfixe (erste drei Ziffern) je Bundesstaat
ZIP3 = {
    "AL": [(350, 369)], "AK": [(995, 999)], "AZ": [(850, 865)], "AR": [(716, 729)], "CA": [(900, 961)],
    "CO": [(800, 816)], "CT": [(60, 69)], "DE": [(197, 199)], "DC": [(200, 205), (569, 569)],
    "FL": [(320, 349)], "GA": [(300, 319), (398, 399)], "HI": [(967, 968)], "ID": [(832, 838)], "IL": [(600, 629)],
    "IN": [(460, 479)], "IA": [(500, 528)], "KS": [(660, 679)], "KY": [(400, 427)], "LA": [(700, 714)],
    "ME": [(39, 49)], "MD": [(206, 219)], "MA": [(10, 27), (55, 55)], "MI": [(480, 499)], "MN": [(550, 567)],
    "MS": [(386, 397)], "MO": [(630, 658)], "MT": [(590, 599)], "NE": [(680, 693)], "NV": [(889, 898)],
    "NH": [(30, 38)], "NJ": [(70, 89)], "NM": [(870, 884)], "NY": [(100, 149), (5, 5), (63, 63)],
    "NC": [(270, 289)], "ND": [(580, 588)], "OH": [(430, 459)], "OK": [(730, 749)], "OR": [(970, 979)],
    "PA": [(150, 196)], "RI": [(28, 29)], "SC": [(290, 299)], "SD": [(570, 577)], "TN": [(370, 385)],
    "TX": [(750, 799), (733, 733), (885, 885)], "UT": [(840, 847)], "VT": [(50, 59)], "VA": [(220, 246), (201, 201)],
    "WA": [(980, 994)], "WV": [(247, 268)], "WI": [(530, 549)], "WY": [(820, 831)],
}
ROLE_WORDS = re.compile(r"\b(owner|president|ceo|cfo|coo|manager|member|director|officer|agent|secretary|treasurer|"
                        r"admin|office|dispatch|n/?a|none|unknown|same|test)\b", re.I)
FILER_DOMAIN = re.compile(r"(compliance|permit|filing|authority|registration|dotservice|usdot|fmcsa|mcnumber|"
                          r"truckingservice|consult|paperwork|formation|registeredagent|incorporat)", re.I)
PLACEHOLDER_EMAIL = re.compile(r"^(none|na|n/a|noemail|no-email|noreply|no-reply|test|example|unknown|null|x+)@", re.I)
DISPOSABLE = {"mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com",
              "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc"}
REQUIRED = ("phone", "email", "contact_name", "address", "website")
ROLE_FALLBACK_S2 = True  # S2: Rolle statt Name erlaubt, wenn kein Register einen Namen liefert
ROLE_FALLBACK_S1 = True  # S1: Ansprechpartner für Stellen ist die einstellende Stelle, Rolle statt Name erlaubt


def zip_matches_state(zip5: str, state: str) -> bool | None:
    if not re.fullmatch(r"\d{5}", zip5 or "") or state not in ZIP3:
        return None
    z = int(zip5[:3])
    return any(a <= z <= b for a, b in ZIP3[state])


REGION = {"US": "US", "UK": "GB", "FR": "FR", "IE": "IE", "NL": "NL", "BE": "BE", "SE": "SE",
          "FI": "FI", "SG": "SG", "HK": "HK", "MX": "MX", "BR": "BR"}
UK_POSTCODE = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$")


def check_phone(raw: str, state: str, country: str = "US") -> dict:
    """{'e164', 'type', 'ok', 'problem', 'note'}"""
    e164, why = W.normalize_phone(raw or "", country)
    if not e164:
        return {"e164": None, "type": "", "ok": False, "problem": f"phone_{why}" if raw else "phone_missing", "note": ""}
    d = e164[2:] if country == "US" else e164[-9:]
    if len(set(d[3:])) <= 2 or d[3:] in ("1234567", "0000000", "9999999", "456789"):
        return {"e164": e164, "type": "", "ok": False, "problem": "phone_fake_pattern", "note": ""}
    kind, note = "", ""
    if phonenumbers:
        n = phonenumbers.parse(e164, REGION.get(country, "US"))
        if not phonenumbers.is_valid_number(n):
            return {"e164": e164, "type": "", "ok": False, "problem": "phone_invalid", "note": ""}
        t = phonenumbers.number_type(n)
        kind = {PhoneNumberType.TOLL_FREE: "toll_free", PhoneNumberType.MOBILE: "mobile",
                PhoneNumberType.FIXED_LINE: "landline"}.get(t, "landline_or_mobile")
        region = geocoder.description_for_number(n, "en")
        if country == "US" and region and state in STATE_NAMES and STATE_NAMES[state] not in region and f", {state}" not in region \
                and kind != "toll_free":
            note = f"area code is {region}, address in {state} (mobile numbers often keep their old area code)"
    return {"e164": e164, "type": kind, "ok": True, "problem": "", "note": note}


def name_check(name: str, company: str) -> tuple[bool, str, str]:
    """(ok, Problem, Hinweis). Echter Personenname: mind. Vor- und Nachname, nur Buchstaben, keine Firma/Rolle."""
    n = re.sub(r"\s+", " ", (name or "").strip())
    if not n:
        return False, "contact_missing", ""
    if re.search(r"[\d@/\\_#&]", n):
        return False, "contact_not_a_name", ""
    if re.search(r"\b(llc|inc|corp|ltd|company|trucking|transport|logistics|services?|group|enterprises?|holdings?|"
                 r"express|freight)\b", n, re.I):
        return False, "contact_is_company", ""
    if ROLE_WORDS.search(n):
        return False, "contact_is_role", ""
    parts = [p for p in re.split(r"[ ]", n) if p]
    if len(parts) < 2:
        return False, "contact_single_name", ""
    if company and W.norm(n) == W.norm(company):
        return False, "contact_equals_company", ""
    for p in parts:
        core = re.sub(r"[.'\-]", "", p)
        if not core.isalpha():
            return False, "contact_not_a_name", ""
        if len(core) >= 3 and not re.search(r"[aeiouyAEIOUY]", core):
            return False, "contact_not_a_name", ""
        if re.search(r"(.)\1\1", core.lower()):
            return False, "contact_not_a_name", ""
    if len({p.lower() for p in parts}) < len(parts) and len(parts) == 2:
        return False, "contact_repeated_word", ""
    hint = ""
    if _NAMES:
        g = _NAMES.get_gender(re.sub(r"[^A-Za-z]", "", parts[0].split("-")[0]))
        hint = "first_name_in_lexicon" if g != "unknown" else "first_name_not_in_lexicon"
    return True, "", hint


def postcode_ok(c: dict) -> bool | None:
    """US: ZIP passt zum Bundesstaat; UK: Postcode-Format; FR: 5 Ziffern und passt zum Département."""
    z, country = (c.get("zip") or "").strip().upper(), c.get("country")
    if country == "US":
        return zip_matches_state(z, c.get("state"))
    if country == "UK":
        return bool(UK_POSTCODE.match(z))
    if country == "FR":
        if not re.fullmatch(r"\d{5}", z):
            return False
        dep = str((c.get("facts") or {}).get("department") or "")
        if not dep:
            return None
        dep = "20" if dep.upper() in ("2A", "2B") else dep
        return z.startswith(dep) if len(dep) == 2 else z.startswith(dep[:3])
    if country in POSTCODE_FORMAT:
        return bool(re.fullmatch(POSTCODE_FORMAT[country], z))
    return None


# NL: 1234 AB, BE: 4 Ziffern, SE: 123 45 (IE: Eircode fehlt oft oder steht als Grafschaft -> nicht prüfen)
# FI: 5 Ziffern, SG: 6 Ziffern, MX: 5 Ziffern, BR: CEP 12345-678 (neue Länder 04.10.2026)
POSTCODE_FORMAT = {"NL": r"\d{4}\s?[A-Z]{2}", "BE": r"\d{4}", "SE": r"\d{3}\s?\d{2}",
                   "FI": r"\d{5}", "SG": r"\d{6}", "MX": r"\d{5}", "BR": r"\d{5}-?\d{3}"}
# Hongkong hat keine Postleitzahlen: vollständige Adresse = Straße + Ort (Bezirk), PLZ wird dort nicht verlangt
NO_POSTCODE = {"HK"}


def run(c: dict, seg: str, shared: dict | None = None) -> dict:
    """Qualitätskontrolle eines angereicherten Kandidaten."""
    shared = shared or {}
    blocking, missing, warnings, evidence = [], [], [], []
    ev = c.get("evidence") or {}

    # Firma
    if len(re.sub(r"[^A-Za-z]", "", c.get("name") or "")) < 2 or re.search(r"\b(test|sample|dummy)\b", c["name"], re.I):
        blocking.append("company_name_invalid")

    # Fakten der Quelle plausibel? (FMCSA: z. B. 800 Fahrer bei 2 Fahrzeugen = Tippfehler in der Meldung)
    f = c.get("facts") or {}
    if c.get("source") == "fmcsa" and f.get("drivers", 0) > max(10, 5 * max(1, f.get("power_units", 0))):
        blocking.append(f"implausible_fleet ({f.get('drivers')} drivers, {f.get('power_units')} power units)")

    if f.get("out_of_service"):
        blocking.append(f"out_of_service_order ({f['out_of_service']})")
    if f.get("undeliverable"):
        blocking.append("fmcsa_mail_undeliverable")

    # Telefon
    country = c.get("country") or "US"
    ph = check_phone(c.get("phone"), c.get("state"), country)
    if not ph["ok"] and c.get("phone_alt"):
        alt = check_phone(c["phone_alt"], c.get("state"), country)
        if alt["ok"]:
            ph = alt
            warnings.append("main_phone_invalid_used_cell")
    if ph["ok"]:
        c["phone"] = ph["e164"]
        c["phone_type"] = ph["type"]
        cell = check_phone(f.get("cell_phone") or c.get("phone_alt") or "", c.get("state"), country)["e164"]
        if ph["type"] == "mobile" or (cell and cell == ph["e164"]):
            c["phone_type"] = "mobile"
        if c["phone_type"] in ("mobile", "landline_or_mobile") and c.get("country") == "US":
            # TCPA: Handynummern nur von Hand wählen, keine SMS/Wählautomaten, Do-Not-Call abgleichen
            c["phone_note"] = ("mobile: dial manually only, no texts/autodialer, check DNC"
                               if c["phone_type"] == "mobile" else "US: dial manually; check DNC if it is a mobile")
        if ph["note"]:
            warnings.append(ph["note"])
        if shared.get(("phone", ph["e164"]), 0) >= 3:
            blocking.append(f"phone_shared_by_{shared[('phone', ph['e164'])]}_companies (filing agent, not the firm)")
        if ev.get("site_phones") and ph["e164"] in ev["site_phones"]:
            evidence.append("phone_confirmed_on_website")
    elif ph["problem"] == "phone_missing":
        missing.append("phone")
    else:
        blocking.append(ph["problem"])

    # E-Mail
    em = (c.get("email") or "").strip().lower()
    c["email"] = em
    if not em:
        missing.append("email")
    elif not W.EMAIL_SYNTAX.match(em) or PLACEHOLDER_EMAIL.match(em):
        blocking.append("email_invalid")
    else:
        dom = email_domain(em)
        c["email_type"] = "freemail" if is_freemail(em) else "company_domain"
        if dom in DISPOSABLE:
            blocking.append("email_disposable")
        if ev.get("mx") is False:
            blocking.append("email_domain_has_no_mail_server")
        elif ev.get("mx") is None:
            warnings.append("mx_not_checked")
        if shared.get(("email", em), 0) >= 3:
            blocking.append(f"email_shared_by_{shared[('email', em)]}_companies (filing agent, not the firm)")
        label = dom.split(".")[0]
        if c["email_type"] == "company_domain" and FILER_DOMAIN.search(label) \
                and not any(w in label for w in W.core_words(c["name"])):
            blocking.append("email_belongs_to_filing_service")
        if c.get("website"):
            sdom = W.site_domain(c["website"])
            if c["email_type"] == "company_domain" and not (dom == sdom or dom.endswith("." + sdom) or sdom.endswith("." + dom)):
                blocking.append("email_domain_differs_from_website")
            elif c["email_type"] == "company_domain":
                evidence.append("email_domain_equals_website")
        local = re.sub(r"[^a-z]", "", em.split("@")[0])
        pn = [p.lower() for p in re.findall(r"[A-Za-z]+", c.get("person_name") or "") if len(p) >= 3]
        cn = [w for w in W.core_words(c["name"]) if len(w) >= 3]
        if any(p in local for p in pn) or any(w in local for w in cn):
            evidence.append("email_matches_person_or_company")
        elif c.get("source") in ("overture", "rge", "agence_bio", "charity_commission", "diagnostiqueurs", "ico_register") and c["email_type"] == "freemail":
            warnings.append("email_not_obviously_the_company (check before use)")

    # Ansprechperson
    ok, prob, hint = name_check(c.get("person_name"), c.get("name"))
    if ok:
        c["person_name"] = " ".join(p[:1].upper() + p[1:].lower() if p.isupper() or p.islower() else p
                                    for p in c["person_name"].split())
        if hint == "first_name_in_lexicon":
            evidence.append(hint)
        else:
            warnings.append(hint)
        if "director_name" in (ev.get("website") or {}).get("evidence", []):
            evidence.append("contact_named_on_website")
    elif prob == "contact_missing" and seg == "S2" and ROLE_FALLBACK_S2:
        # Inhaber 01.10.2026 („ja“): S2 ohne Registernamen -> Rolle statt Name, klar gekennzeichnet
        c["person_role"] = c.get("person_role") or ("Owner (ask for the owner)" if c.get("country") != "FR"
                                                   else "Gérant / propriétaire (demander le responsable)")
        warnings.append("contact_role_only")
    elif prob == "contact_missing" and seg == "S1" and ROLE_FALLBACK_S1:
        # CLAUDE.md §9 (27.09.2026): „Fehlt ein Name, steht die Rolle (‚Ask for …‘)“
        c["person_role"] = c.get("person_role") or "Hiring manager (ask for the person responsible for recruiting)"
        warnings.append("contact_role_only")
    elif prob == "contact_missing":
        missing.append("contact_name")
    else:
        blocking.append(prob)

    # Adresse
    if not (c.get("street") and c.get("city") and (c.get("zip") or country in NO_POSTCODE)
            and (c.get("state") or country != "US")):
        missing.append("address")
    else:
        zm = postcode_ok(c)
        if zm is False:
            blocking.append(f"zip_{c['zip']}_not_in_{c['state'] or (c.get('facts') or {}).get('department') or country}")
        elif zm is None:
            warnings.append("zip_or_state_unchecked")
        if re.search(r"\b(p\.?\s?o\.?\s?box|pmb)\b", c["street"], re.I):
            warnings.append("street_is_po_box")

    # Website
    if c.get("website"):
        w = ev.get("website") or {}
        evidence.append(f"website_verified({','.join(w.get('evidence', []))})")
    elif seg != "S2":
        missing.append("website")

    status = "red" if blocking else "yellow" if missing else "green"
    return {"status": status, "blocking": blocking, "missing": missing, "warnings": warnings, "evidence": evidence}
