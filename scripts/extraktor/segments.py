"""Welche Branche (Käufer-Segment) passt zu einem Kandidaten, und die Texte dazu – nur aus belegten Fakten.

Jeder Text entsteht aus den Feldern des einzelnen Leads (Datum, Beträge, Fahrzeuge, Ort, Name). Die
Signalkontrolle (sc.py) prüft danach, dass jede Zahl und jeder Ort im Text wirklich in den Fakten steht.
"""
from __future__ import annotations

import datetime as dt

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
    return False, "unknown source"


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


def texts(seg: str, c: dict) -> dict:
    """{'signal', 'signal_date', 'company_info', 'opener', 'urgency', 'urgency_reason'}"""
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
            mail = f"its contact email is a {dom} address" if dom else "it lists no email address"
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
