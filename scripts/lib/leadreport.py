"""Lead-Report als PDF im NextGen-Profit-Design (Deckblatt + eine Karte je Firma).

Eingabe ist die Lead-CSV (deliveries.to_csv oder ältere Proben-CSV). Pro Firma eine Karte: das stärkste Signal
vorn, weitere Signale darunter. Bewusst ohne Links und ohne konkrete Fundstelle (nur die Art der Quelle und das
Datum), damit der Report die Recherche nicht offenlegt. Nur Firmendaten.

Rendern über Chromium (Playwright). Fehlt Playwright, gibt render_pdf None zurück und es bleibt bei der CSV.
"""
from __future__ import annotations

import base64
import csv
import datetime as dt
import html
import io
import re
from pathlib import Path

from lib.playbook import briefing

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / "video" / "fonts"
URG = {"high": 0, "medium": 1, "low": 2}

T = {
    "en": {"title": "Lead report", "for": "Prepared for", "conf": "Confidential · for your firm only",
           "firms": "companies", "signals": "signals", "week": "Week of", "what": "What happened", "why": "Why now",
           "tip": "Sales tip", "open": "Opening line", "also": "Also detected", "contact": "Contact",
           "phone": "Phone", "email": "Email", "web": "Website", "detected": "Detected", "checked": "Verified",
           "prio": {"high": "High priority", "medium": "Medium priority", "low": "Low priority"},
           "src": {"register": "Official company register", "careers": "Employer's own careers page", "other": "Public company information"},
           "sig": {"new_incorporation": "New company", "job_open_30d": "Role open 30+ days", "jobs_3plus": "Several hires",
                   "website_outdated": "Outdated website", "new_location": "New site",
                   "new_company": "New company", "incorporation": "New company", "funding_new_company": "New company, capital raised",
                   "funding_growth": "Capital raised", "funding_executive": "Capital raised", "new_fleet": "New carrier registration",
                   "no_website": "No website found", "jobs_open": "Open roles"},
           "how": "How to use this report", "how1": "Start with the high-priority companies. The event is recent, the timing is right.",
           "how2": "Use the opening line as a first sentence and adapt it to your style.",
           "how3": "Each company is reserved for your firm. No other firm in your field receives it.",
           "foot": "Company data only. No personal data of employees."},
    "fr": {"title": "Rapport de pistes", "for": "Préparé pour", "conf": "Confidentiel · réservé à votre entreprise",
           "firms": "entreprises", "signals": "signaux", "week": "Semaine du", "what": "Ce qui s'est passé", "why": "Pourquoi maintenant",
           "tip": "Conseil de vente", "open": "Phrase d'accroche", "also": "Également détecté", "contact": "Contact",
           "phone": "Téléphone", "email": "E-mail", "web": "Site web", "detected": "Détecté", "checked": "Vérifié",
           "prio": {"high": "Priorité haute", "medium": "Priorité moyenne", "low": "Priorité basse"},
           "src": {"register": "Registre officiel des entreprises", "careers": "Page carrières de l'employeur", "other": "Informations publiques de l'entreprise"},
           "sig": {"new_incorporation": "Nouvelle entreprise", "job_open_30d": "Poste ouvert 30+ jours", "jobs_3plus": "Plusieurs recrutements",
                   "website_outdated": "Site web ancien", "new_location": "Nouveau site",
                   "new_company": "Nouvelle entreprise", "incorporation": "Nouvelle entreprise",
                   "funding_new_company": "Nouvelle entreprise, levée de fonds", "funding_growth": "Levée de fonds",
                   "funding_executive": "Levée de fonds", "new_fleet": "Nouveau transporteur enregistré",
                   "no_website": "Aucun site trouvé", "jobs_open": "Postes ouverts"},
           "how": "Comment utiliser ce rapport", "how1": "Commencez par les entreprises en priorité haute. L'événement est récent, le moment est bon.",
           "how2": "Utilisez la phrase d'accroche comme première phrase et adaptez-la à votre style.",
           "how3": "Chaque entreprise est réservée à votre entreprise. Aucune autre entreprise de votre secteur ne la reçoit.",
           "foot": "Données d'entreprise uniquement. Aucune donnée personnelle de salariés."},
}


def _font(weight: int) -> str:
    p = FONTS / f"inter-latin-{weight}-normal.woff2"
    if not p.exists():
        return ""
    return (f"@font-face{{font-family:Inter;font-weight:{weight};"
            f"src:url(data:font/woff2;base64,{base64.b64encode(p.read_bytes()).decode()}) format('woff2')}}")


def _nice(name: str) -> str:
    if name and name == name.upper():
        name = re.sub(r"\b(Ltd|Llp|Plc|Llc|Inc)\b", lambda m: m.group(1).upper() if m.group(1) in ("Llp", "Plc") else m.group(1),
                      name.title())
    return name


def _source_kind(src: str, signal: str) -> str:
    s = (src or "").lower()
    if signal.startswith("job") or "career" in s or "karriere" in s or "carri" in s:
        return "careers"
    if "companies house" in s or "register" in s or "registre" in s or "sirene" in s or "department of state" in s or signal == "new_incorporation":
        return "register"
    return "other"


def _event(ev: str, company: str) -> str:
    ev = re.sub(r"\s*\((?:[^()]|\([^()]*\))*\)", "", ev or "").strip()  # Stellenlisten in Klammern raus
    ev = re.sub(r"\s*No website found yet.*$", "", ev)  # Prüfdomains nicht zeigen
    if company and ev.upper().startswith(company.upper()):
        ev = ev[len(company):].strip()
    ev = re.sub(r"\s*[–—]\s*", ", ", ev).rstrip(". ")
    return ev[:1].upper() + ev[1:] + "." if ev else ""


def _day(iso: str, lang: str) -> str:
    try:
        d = dt.date.fromisoformat((iso or "")[:10])
    except ValueError:
        return iso or ""
    months = {"en": "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", "fr": "janv. févr. mars avr. mai juin juil. août sept. oct. nov. déc."}
    return f"{d.day} {months.get(lang, months['en']).split()[d.month - 1]} {d.year}"


SAMPLE_SIZE = 10  # Leads je Probe: immer genau 10 verschiedene Firmen (Inhaber 29.09.2026)


def group_rows(data: bytes) -> list[dict]:
    """CSV -> eine Einheit je Firma, sortiert nach Priorität und Aktualität."""
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig", "replace"))))
    firms: dict[str, dict] = {}
    for r in rows:
        name = (r.get("company") or "").strip()
        if not name:
            continue
        f = firms.setdefault(name.upper(), {"company": _nice(name), "rows": []})
        f["rows"].append(r)
    out = []
    for f in firms.values():
        rs = sorted(f["rows"], key=lambda r: (URG.get(r.get("urgency") or r.get("priority") or "", 3), -(int((r.get("event_date") or "0").replace("-", "")[:8] or 0))))
        seen, uniq = set(), []
        for r in rs:
            k = _event(r.get("event", ""), r.get("company", ""))
            if k and k not in seen:
                seen.add(k)
                uniq.append(r)
        f["rows"] = uniq or rs[:1]
        out.append(f)
    out.sort(key=lambda f: (URG.get(f["rows"][0].get("urgency") or f["rows"][0].get("priority") or "", 3), f["company"]))
    return out


# Seite 2 (nur bei Proben): Wert, Ablauf, Pakete. Preise kommen aus der Datenbank (settings.pricing), nie erfunden.
T2 = {
    "en": {"h": "Why these leads turn into revenue",
           "why": [("A real reason to buy", "Every company has just done something that creates demand for your service: founded, hiring, growing, moving."),
                   ("You call first", "Leads arrive days after the event, often before the company has found a provider."),
                   ("Only for your firm", "Each lead goes to one firm in your field only. No competitor calls the same company.")],
           "how_h": "How it works",
           "how": [("You choose your focus", "The industries and signals that fit your business, or simply the whole country."),
                   ("Every Monday", "A fresh report like this one, as PDF and spreadsheet for your CRM."),
                   ("You call and win clients", "Phone, email, contact person and a short sales briefing in every lead.")],
           "inc_h": "In every lead", "inc": ["Company and location", "What happened, with date", "Phone and email", "Priority", "Sales tip", "Opening line"],
           "plans_h": "Plans", "per": "per month", "btn": "Start my weekly leads", "btn1": "See plans and start", "start": "Ready to start?",
           "cta": "Pick a plan or tell us your number of leads. Your first delivery arrives next Monday.",
           "b_co": "Company profile", "b_ev": "Why it's an opportunity", "b_tip": "Sales approach", "b_what": "What happened", "h_why": "Why now", "h_needs": "What they likely need", "h_win": "How to win them", "w_offer": "Offer:", "w_ask": "Ask:", "doc": "Lead briefing", "h_sit": "The situation", "h_angle": "Your angle", "h_obj": "If they hesitate", "h_call": "Call guide", "h_mail": "Follow-up email, ready to send", "i_addr": "Address", "i_ask": "Ask for", "i_contact": "Contact person", "i_co": "Company",
           "ey": "A personal note", "intro_h": "Thank you for your first order",
           "intro": "Our goal is simple: <b>new clients for you, at exactly the right moment.</b> Every week we find companies that need what you offer <b>right now</b> and hand them to you <b>first</b>, with everything you need to start the conversation.",
           "intro_h_s": "Your free sample",
           "intro_s": "Here are <b>10 companies</b> with a concrete <b>reason to talk to you now</b>. Each one comes with <b>phone, email and who to ask for</b> and a short briefing on how to win them.",
           "role": "Founder, NextGen Profit",
           "f_ind": "Industry", "f_form": "Legal form", "f_reg": "Registered", "f_loc": "Location", "f_web": "Website", "f_noweb": "none found yet",
           "p1": "10 leads selected for you", "p1s": "Business contact details from public registers and company websites",
           "plan_txt": {"starter": "Up to 15 new leads per week. Every lead exclusive to your firm.",
                        "pro": "Up to 50 new leads per week, all matching signals. Every lead exclusive to your firm."},
           "tagline": "New clients. At the right moment.", "per_lead": "From about {price} per lead", "per_lead_c": "The more leads, the lower the price per lead", "custom_n": "Custom", "custom_p": "Your number",
           "custom_t": "Tell us how many leads you need per week, and we will make you an offer that fits your team."},
    "fr": {"h": "Pourquoi ces pistes génèrent du chiffre d'affaires",
           "why": [("Une vraie raison d'acheter", "Chaque entreprise vient de faire quelque chose qui crée un besoin : création, recrutement, croissance, déménagement."),
                   ("Vous appelez en premier", "Les pistes arrivent quelques jours après l'événement, souvent avant que l'entreprise ait trouvé un prestataire."),
                   ("Réservé à votre entreprise", "Chaque piste va à une seule entreprise de votre secteur.")],
           "how_h": "Comment ça marche",
           "how": [("Vous choisissez votre cible", "Les secteurs et signaux qui vous conviennent, ou simplement tout le pays."),
                   ("Chaque lundi", "Un nouveau rapport comme celui-ci, en PDF et en tableau pour votre CRM."),
                   ("Vous appelez et gagnez des clients", "Téléphone, e-mail, interlocuteur et un court briefing commercial dans chaque piste.")],
           "inc_h": "Dans chaque piste", "inc": ["Entreprise et lieu", "L'événement, avec la date", "Téléphone et e-mail", "Priorité", "Conseil de vente", "Phrase d'accroche"],
           "plans_h": "Formules", "per": "par mois", "btn": "Recevoir mes pistes chaque semaine", "btn1": "Voir les formules", "start": "On commence ?",
           "cta": "Choisissez une formule ou indiquez votre volume. Votre première livraison arrive lundi prochain.",
           "b_co": "Profil de l'entreprise", "b_ev": "Pourquoi c'est une opportunité", "b_tip": "Approche commerciale", "b_what": "Ce qui s'est passé", "h_why": "Pourquoi maintenant", "h_needs": "Leurs besoins probables", "h_win": "Comment les gagner", "w_offer": "Proposez :", "w_ask": "Demandez :", "doc": "Briefing pistes", "h_sit": "La situation", "h_angle": "Votre angle", "h_obj": "S'ils hésitent", "h_call": "Guide d'appel", "h_mail": "E-mail de relance, prêt à envoyer", "i_addr": "Adresse", "i_ask": "Demander", "i_contact": "Interlocuteur", "i_co": "Entreprise",
           "ey": "Un mot personnel", "intro_h": "Merci pour votre première commande",
           "intro": "Notre objectif est simple : <b>de nouveaux clients pour vous, au bon moment.</b> Chaque semaine, nous trouvons les entreprises qui ont besoin de votre service <b>maintenant</b> et vous les transmettons <b>en premier</b>, avec tout ce qu'il faut pour engager la conversation.",
           "intro_h_s": "Votre échantillon gratuit",
           "intro_s": "Voici <b>10 entreprises</b> avec une <b>raison concrète de vous parler maintenant</b>. Chacune avec <b>téléphone, e-mail et la personne à demander</b> et un court briefing pour la gagner.",
           "role": "Fondateur, NextGen Profit",
           "f_ind": "Secteur", "f_form": "Forme juridique", "f_reg": "Immatriculée", "f_loc": "Lieu", "f_web": "Site web", "f_noweb": "pas encore trouvé",
           "p1": "10 pistes sélectionnées pour vous", "p1s": "Coordonnées professionnelles issues de registres publics et des sites des entreprises",
           "plan_txt": {"starter": "Jusqu'à 15 nouvelles pistes par semaine. Chaque piste réservée à votre entreprise.",
                        "pro": "Jusqu'à 50 nouvelles pistes par semaine, tous les signaux utiles. Chaque piste réservée à votre entreprise."},
           "tagline": "De nouveaux clients. Au bon moment.", "per_lead": "À partir d'environ {price} par piste", "per_lead_c": "Plus de pistes, prix unitaire plus bas", "custom_n": "Sur mesure", "custom_p": "Votre volume",
           "custom_t": "Dites-nous combien de pistes il vous faut par semaine, nous vous faisons une offre adaptée à votre équipe."},
}
CUR = {"gbp": "£", "eur": "€", "usd": "$"}
# Preise in allen Ländern gleich, in der Landeswährung (Inhaber 29.09.2026: Starter 129, Pro 249 in £, $, €)
LOCAL_CUR = {"UK": "gbp", "US": "usd", "FR": "eur", "IE": "eur", "NL": "eur", "BE": "eur", "SE": "eur"}


def local_plans(plans: list[dict] | None, country: str) -> list[dict] | None:
    if not plans or country not in LOCAL_CUR:
        return plans
    return [dict(p, currency=LOCAL_CUR[country]) for p in plans]
# Leads kommen aus dem ganzen Land (Inhaber 27.09.2026) – im Report nur das Land, keine Region
COUNTRY_NAME = {"en": {"UK": "United Kingdom", "US": "United States", "FR": "France", "IE": "Ireland", "NL": "Netherlands",
                       "BE": "Belgium", "SE": "Sweden"},
                "fr": {"UK": "Royaume-Uni", "US": "États-Unis", "FR": "France", "IE": "Irlande", "NL": "Pays-Bas",
                       "BE": "Belgique", "SE": "Suède"}}


def _money(plan: dict, cents: bool = False) -> str:
    amt = (plan.get("amount_cents") or 0) / 100
    sym = CUR.get((plan.get("currency") or "").lower(), "")
    txt = f"{amt:,.2f}" if cents or amt != int(amt) else f"{amt:,.0f}"
    return f"{txt} {sym}".strip() if (plan.get("currency") or "").lower() == "eur" else f"{sym}{txt}"


PER_WEEK = {"starter": 15, "pro": 50}  # Höchstmenge je Paket, wie in plan_txt beschrieben


def _per_lead(plan: dict, t2: dict) -> str:
    """"ab ca. X pro Lead" bei voller Wochenmenge (Monatspreis / (Leads pro Woche * 52/12))."""
    n = PER_WEEK.get(plan.get("key", ""))
    if not n or not plan.get("amount_cents"):
        return ""
    per = plan["amount_cents"] / 100 / (n * 52 / 12)
    return t2["per_lead"].format(price=_money({**plan, "amount_cents": round(per * 100)}, cents=True))


def _clip(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def build_html(data: bytes, lang: str = "en", area: str | None = None, firm: str | None = None,
               period: dt.date | None = None, plans: list[dict] | None = None, cta_url: str | None = None,
               segment: str | None = None, country: str = "UK", layout: tuple[int, int] = (3, 4)) -> str:
    """Seite 1: persönliche Einleitung und die ersten Leads; danach 3 Leads pro Seite; bei Proben (plans) eine
    Abschlussseite mit Nutzen, Ablauf, Paketen und Button zur Zahlungsseite."""
    t, t2 = T.get(lang, T["en"]), T2.get(lang, T2["en"])
    groups = group_rows(data)[:10]
    e = html.escape
    icon = {
        "phone": '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>',
        "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
        "web": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
        "pin": '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
        "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
        "co": '<path d="M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
        "cal": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    }
    ic = lambda k: f'<svg viewBox="0 0 24 24">{icon[k]}</svg>'
    cards = []
    for num, g in enumerate(groups, 1):
        r = g["rows"][0]
        sig = r.get("signal") or ("new_incorporation" if "regist" in (r.get("event") or "").lower() else "")
        urg = r.get("urgency") or r.get("priority") or ""
        loc = (r.get("location") or "").strip()
        opener = (r.get("opening_line") or r.get("opener") or "").replace((r.get("company") or "").strip() or "\0", g["company"])
        ev = _event(r.get("event", ""), r.get("company", ""))
        web = re.sub(r"^https?://(www\.)?", "", r.get("website") or "").rstrip("/")
        ind = (r.get("industry") or "").split(" - ")[-1].strip()
        sic = (r.get("industry") or "")[:5] if (r.get("industry") or "")[:2].isdigit() else ""
        bf = briefing(sig, segment, r.get("event", ""), r.get("event_date", ""), opener, (r.get("question_to_ask") or "").strip(),
                      ind, loc.split(",")[0], country, sic)
        person = (r.get("contact_name") or "").strip()
        prole = real_role(r.get("contact_role"))
        addr = (r.get("address") or "").strip() or loc
        meta = " · ".join(x for x in [ind, r.get("legal_form"), loc] if x)
        dated = _day(r.get("event_date", ""), lang)
        facts = [("phone", t["phone"], r.get("phone")), ("mail", t["email"], r.get("email")), ("web", t["web"], web),
                 ("user", t2["i_contact"], f"{person}{(' · ' + prole) if prole else ''}" if person else prole),
                 ("pin", t2["i_addr"], addr),
                 ("cal", t2["f_reg"] if sig == "new_incorporation" else t["detected"], dated)]
        facts = [(k, lbl, v or "–") for k, lbl, v in facts if v or k != "user"]
        cards.append(f"""
<article class="lead">
  <div class="no">{num:02d}</div>
  <div class="main">
    <div class="hd"><div><h2>{e(g['company'])}</h2><div class="meta">{e(meta)}</div></div>
      <div class="tags">{f'<span class="pr p-{e(urg)}">{e(t["prio"].get(urg, ""))}</span>' if urg else ''}<span class="sg">{e(t['sig'].get(sig, ''))}</span></div></div>
    <div class="facts">{''.join(f'<div class="f">{ic(k)}<div><span>{e(lbl)}</span><b>{e(v)}</b></div></div>' for k, lbl, v in facts)}</div>
    <div class="brief">
      <div class="why"><h4>{t2['h_why']}</h4><p>{e(bf['why'])}</p></div>
      <div><h4>{t2['h_needs']}</h4><ul>{''.join(f'<li>{e(x)}</li>' for x in bf['needs'])}</ul></div>
      <div><h4>{t2['h_win']}</h4><p><b>{t2['w_offer']}</b> {e(bf['offer'])}</p><p><b>{t2['w_ask']}</b> <i>“{e(bf['ask'])}”</i></p></div>
    </div>
  </div>
</article>""")
    when = _day((period or dt.date.today()).isoformat(), lang)
    sample = bool(plans)
    head = t2["p1"] if len(groups) >= 10 else f"{len(groups)} {t['firms']}"
    intro = f"""<div class="intro"><h1>{t2['intro_h_s'] if sample else t2['intro_h']}{(', ' + e(firm)) if firm else ''}.</h1>
<p>{t2['intro_s'].replace('<b>10 ', f'<b>{len(groups)} ') if sample else t2['intro']}</p></div>"""
    # Seite 1 (mit Einleitung) bis `first`, danach gleichmäßig verteilt, höchstens `rest` je Seite –
    # nie ein einzelner Lead allein auf der letzten Seite (Inhaber 29.09.2026: 10 Leads auf 3 Seiten)
    first, rest = layout
    chunks, k = [(0, cards[:first])], min(first, len(cards))
    left = len(cards) - k
    if left:
        n = -(-left // rest)
        base, extra = divmod(left, n)
        for j in range(n):
            size = base + (1 if j < extra else 0)
            chunks.append((k, cards[k:k + size]))
            k += size
    total = len(chunks) + (1 if plans else 0)
    top = lambda: f"""<header class="top"><div class="logo">NextGen <i>Profit</i></div><div class="doc">{t2['doc']} · {e(when)}</div></header>"""
    foot = lambda i: f"""<footer class="ft"><span>{t['conf']}</span><span>{i} / {total}</span></footer>"""
    pages = []
    for i, (k, chunk) in enumerate(chunks, 1):
        where = COUNTRY_NAME.get(lang, COUNTRY_NAME["en"]).get(country, "")
        lead_in = (f'{intro}<div class="sec"><h3>{e(head)}{(" · " + e(where)) if where else ""}</h3></div>' if k == 0 else "")
        pages.append(f"""<section class="pg">{top()}<div class="in">{lead_in}<div class="grid">{''.join(chunk)}</div></div>{foot(i)}</section>""")
    page2 = ""
    if plans:
        pl = "".join(f"""<div class="plan{' hi' if k == len(plans) - 1 else ''}"><div class="pn">{e(p.get('name', ''))}</div>
<div class="pp">{e(_money(p))}<small> {t2['per']}</small></div><p>{e(t2['plan_txt'].get(p.get('key', ''), ''))}</p>{f'<div class="pl">{e(_per_lead(p, t2))}</div>' if _per_lead(p, t2) else ''}</div>"""
                     for k, p in enumerate(plans))
        pl += f"""<div class="plan cu"><div class="pn">{t2['custom_n']}</div><div class="pp">{t2['custom_p']}</div><p>{t2['custom_t']}</p><div class="pl">{t2['per_lead_c']}</div></div>"""
        page2 = f"""<section class="pg p2">{top()}<div class="in">
<h1 class="h1">{t2['h']}</h1>
<div class="why3">{''.join(f'<div><b>{e(h)}</b><p>{e(d)}</p></div>' for h, d in t2['why'])}</div>
<div class="sec"><h3>{t2['how_h']}</h3></div>
<ol class="how">{''.join(f'<li><b>{e(h)}</b><p>{e(d)}</p></li>' for h, d in t2['how'])}</ol>
<div class="sec"><h3>{t2['plans_h']}</h3></div>
<div class="plans">{pl}</div>
<div class="cta"><div><b>{t2['start']}</b><p>{t2['cta']}</p></div>{f'<a class="btn" href="{e(cta_url)}">{t2["btn"]} &rarr;</a>' if cta_url else ''}</div>
</div>
<div class="orn"><div class="orn-line"><span class="ln l"></span><span class="dm"></span><span class="ln r"></span></div>
<div class="orn-logo">NextGen <i>Profit</i></div><div class="orn-tag">{t2['tagline']}</div></div>{foot(total)}</section>"""
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><style>
{_font(400)}{_font(600)}{_font(700)}{_font(800)}
@page{{size:A4;margin:0}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:Inter,Helvetica,Arial,sans-serif;color:#1c2536;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.pg{{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;background:#fff;display:flex;flex-direction:column}}
.top{{height:19mm;margin:0 16mm;display:flex;align-items:center;justify-content:space-between;border-bottom:.3mm solid #d9c49a}}
.logo{{font-size:17px;font-weight:800;letter-spacing:-.4px;color:#0b1428}}.logo i{{font-style:normal;color:#b08d57}}
.doc{{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#8a92a3;font-weight:600}}
.in{{padding:7mm 16mm 0;flex:1;display:flex;flex-direction:column;min-height:0;margin-bottom:17mm}}
.ft{{position:absolute;left:16mm;right:16mm;bottom:8mm;display:flex;justify-content:space-between;font-size:7.8px;letter-spacing:.08em;color:#9aa1ae;border-top:.2mm solid #eceae4;padding-top:2.5mm}}
.intro{{padding:0 0 5mm;margin-bottom:4mm;border-bottom:.2mm solid #eceae4}}
.intro h1{{font-size:22px;font-weight:800;letter-spacing:-.7px;line-height:1.15;color:#0b1428;margin-bottom:3mm}}
.intro p{{font-size:13.2px;line-height:1.6;color:#39404d;max-width:172mm}}.intro p b{{color:#0b1428;font-weight:700}}
.sig{{margin-top:3.5mm;font-size:11.5px;font-weight:800;letter-spacing:-.2px;color:#0b1428}}.sig i{{font-style:normal;color:#b08d57}}
.sec{{margin:0 0 4mm}}.sec h3{{font-size:8.2px;letter-spacing:.18em;text-transform:uppercase;color:#a07f46;font-weight:700}}
.grid{{display:flex;flex-direction:column;gap:2.6mm;padding:0 .6mm 1.4mm}}
.lead{{display:grid;grid-template-columns:11mm 1fr;gap:2.6mm;padding:2.9mm 3.8mm 3mm 3.2mm;background:#fff;
  border:.25mm solid #e2dccf;border-radius:3mm;box-shadow:none;
  overflow:hidden;break-inside:avoid}}
.no{{font-size:20px;font-weight:800;color:#d9c49a;letter-spacing:-.5px;line-height:1}}
.main{{min-width:0;display:flex;flex-direction:column;gap:2mm}}
.hd{{display:flex;justify-content:space-between;gap:5mm;align-items:flex-start}}
h2{{font-size:16px;font-weight:800;color:#0b1428;letter-spacing:-.35px;line-height:1.15}}
.meta{{font-size:9px;color:#7b8394;margin-top:.8mm}}
.tags{{display:flex;gap:1.5mm;flex:none;margin-top:.5mm}}
.pr,.sg{{font-size:6.9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:.8mm 2.2mm;border-radius:99px;white-space:nowrap;border:.2mm solid #e3d6b8;color:#8a6a33;background:#fbf7ee}}
.pr.p-high{{background:#0b1428;border-color:#0b1428;color:#f3e1b9}}
.facts{{display:grid;grid-template-columns:repeat(3,1fr);gap:1.4mm 5mm}}
.f{{display:flex;gap:2mm;align-items:flex-start;min-width:0}}
.f svg{{flex:none;width:3.6mm;height:3.6mm;margin-top:.6mm;fill:none;stroke:#b08d57;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}}
.f div{{min-width:0}}.f span{{display:block;font-size:6.4px;letter-spacing:.14em;text-transform:uppercase;color:#9aa1ae;font-weight:700}}
.f b{{display:block;font-size:9.4px;font-weight:700;color:#0b1428;overflow-wrap:anywhere;line-height:1.3}}
.brief{{display:grid;grid-template-columns:1.05fr 1fr 1.1fr;gap:5mm;padding-top:2mm;border-top:.2mm dashed #e6e1d6}}
h4{{font-size:6.8px;letter-spacing:.16em;text-transform:uppercase;color:#a07f46;font-weight:700;margin-bottom:1.2mm}}
.brief p,.brief li{{font-size:8.8px;line-height:1.48;color:#2b3446}}
.brief p+p{{margin-top:1.2mm}}.brief b{{color:#0b1428}}.brief i{{color:#475064}}
.brief ul{{list-style:none}}.brief li{{padding-left:3mm;position:relative;margin-bottom:.8mm}}.brief li:before{{content:"";position:absolute;left:0;top:1.7mm;width:1.2mm;height:1.2mm;border-radius:50%;background:#c9a86a}}
.why p{{color:#1c2536}}
.op{{font-size:8.8px;line-height:1.45;color:#475064;font-style:italic;background:#fbf8f1;border-radius:6px;padding:1.8mm 3mm}}
.op span{{font-style:normal;font-size:6.6px;letter-spacing:.14em;text-transform:uppercase;color:#a07f46;font-weight:700;margin-right:2mm}}
.p2 .in{{padding-top:10mm}}.h1{{font-size:24px;font-weight:800;letter-spacing:-.7px;color:#0b1428;margin-bottom:7mm}}
.why3{{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-bottom:10mm}}
.why3 div{{border-top:.6mm solid #c9a86a;padding-top:3mm}}.why3 b{{display:block;font-size:12px;color:#0b1428;margin-bottom:1.5mm}}.why3 p{{font-size:10px;line-height:1.55;color:#475064}}
.how{{list-style:none;counter-reset:s;display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-bottom:10mm}}
.how li{{counter-increment:s}}.how li:before{{content:"0" counter(s);display:block;font-size:18px;font-weight:800;color:#d9c49a;margin-bottom:1.5mm}}
.how b{{font-size:11.5px;color:#0b1428}}.how p{{font-size:10px;line-height:1.55;color:#475064;margin-top:1mm}}
.plans{{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}}.plan{{border:.2mm solid #e3e0d8;border-radius:10px;padding:5mm 6mm}}
.plan.hi{{border:.4mm solid #c9a86a;background:#fdfbf6}}
.pn{{font-size:8px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#8a92a3}}
.plan{{display:flex;flex-direction:column}}.pl{{margin-top:auto;padding-top:3mm;border-top:.2mm solid #eee6d6;font-size:8.8px;font-weight:700;color:#8a6a33;letter-spacing:.02em}}.plan p{{margin-bottom:3mm}}
.plan.cu{{border-style:dashed}}.plan.cu .pp{{font-size:18px;padding:1.6mm 0 1.2mm}}
.pp{{font-size:26px;font-weight:800;color:#0b1428;margin:1.5mm 0 2mm}}.pp small{{font-size:10px;font-weight:600;color:#8a92a3}}
.plan p{{font-size:10px;line-height:1.5;color:#475064}}
.cta{{margin-top:12mm;display:flex;justify-content:space-between;align-items:center;gap:8mm;padding:6mm 7mm;border-radius:12px;background:#fbf8f1;border:.2mm solid #ece3d0}}
.cta b{{font-size:15px;color:#0b1428}}.cta p{{font-size:10.5px;color:#475064;margin-top:1mm}}
.orn{{position:absolute;left:16mm;right:16mm;bottom:17mm;height:62mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:6mm;
  background:radial-gradient(90mm 38mm at 50% 100%,rgba(216,189,138,.20),transparent 70%)}}
.orn-line{{display:flex;align-items:center;gap:4mm;width:120mm;margin-bottom:6mm}}
.orn-line .ln{{display:block;flex:1;height:.3mm;background:linear-gradient(90deg,rgba(201,168,106,0),#c9a86a)}}.orn-line .ln.r{{background:linear-gradient(90deg,#c9a86a,rgba(201,168,106,0))}}
.orn-line .dm{{display:block;flex:none;width:2.6mm;height:2.6mm;transform:rotate(45deg);border:.35mm solid #b08d57;background:#fdfbf6;box-shadow:0 0 0 1.4mm #fff,0 0 0 1.7mm #e3d3b0}}
.orn-logo{{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#0b1428}}.orn-logo i{{font-style:normal;color:#b08d57}}
.orn-tag{{margin-top:2mm;font-size:8.4px;letter-spacing:.34em;text-transform:uppercase;color:#a07f46;font-weight:600}}
.btn{{flex:none;background:linear-gradient(135deg,#e7cf9f,#b08d57);color:#141008;font-weight:700;font-size:12px;padding:3.5mm 7mm;border-radius:99px;text-decoration:none}}
</style></head><body>
{''.join(pages)}
{page2}
</body></html>"""


def render_pdf(data: bytes, lang: str = "en", area: str | None = None, firm: str | None = None,
               period: dt.date | None = None, plans: list[dict] | None = None, cta_url: str | None = None,
               segment: str | None = None, country: str = "UK") -> bytes | None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    try:
        with sync_playwright() as p:
            import os
            b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
            page = b.new_page(viewport={"width": 794, "height": 1123})
            # Gleiches Aussehen bei jedem Inhalt: läuft eine Seite über, weniger Leads pro Seite
            for layout in ((3, 4), (3, 3), (2, 3), (2, 2), (1, 2)):
                page.set_content(build_html(data, lang, area, firm, period, plans, cta_url, segment, country, layout),
                                 wait_until="load")
                if not page.evaluate("[...document.querySelectorAll('.pg .in')].some(e => e.scrollHeight > e.clientHeight + 1)"):
                    break
            pdf = page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
            b.close()
            return pdf
    except Exception as exc:  # noqa: BLE001 - ohne PDF weiter mit CSV
        print(f"PDF-Report nicht erstellt: {exc}")
        return None


CSV_COLS = {
    "en": ["No.", "Company", "Priority", "Signal", "Industry", "Legal form", "Phone", "Email", "Website", "Contact person",
           "Contact role", "Address", "Date", "Why now", "What they likely need", "Offer", "Ask"],
    "fr": ["N°", "Entreprise", "Priorité", "Signal", "Secteur", "Forme juridique", "Téléphone", "E-mail", "Site web",
           "Interlocuteur", "Fonction", "Adresse", "Date", "Pourquoi maintenant", "Besoins probables", "Proposez", "Demandez"],
}
CONTACT_COLS = (9, 10)  # „Contact person“, „Contact role“


def real_role(role: str | None) -> str:
    """Rolle nur, wenn sie aus einer Quelle stammt. Platzhalter aus extraktor/qc („Owner (ask for the owner)“) werden
    nie gezeigt (Inhaber 02.10.2026: „ask for the owner ist wirklich blöd“)."""
    role = (role or "").strip()
    return "" if re.search(r"\((ask for|demander)\b", role, re.I) else role


def clean_csv(data: bytes, lang: str = "en", segment: str | None = None, country: str = "UK") -> bytes:
    """Tabelle zum PDF: dieselben Firmen in derselben Reihenfolge mit denselben Angaben – keine Quellen, keine Links."""
    t = T.get(lang, T["en"])
    buf = io.StringIO()
    w = csv.writer(buf)
    head = CSV_COLS.get(lang, CSV_COLS["en"])
    rows = []
    for num, g in enumerate(group_rows(data)[:10], 1):
        r = g["rows"][0]
        sig = r.get("signal") or ("new_incorporation" if "regist" in (r.get("event") or "").lower() else "")
        urg = r.get("urgency") or r.get("priority") or ""
        loc = (r.get("location") or "").strip()
        ind = (r.get("industry") or "").split(" - ")[-1].strip()
        sic = (r.get("industry") or "")[:5] if (r.get("industry") or "")[:2].isdigit() else ""
        bf = briefing(sig, segment, r.get("event", ""), r.get("event_date", ""), "", (r.get("question_to_ask") or "").strip(),
                      ind, loc.split(",")[0], country, sic)
        rows.append([num, g["company"], t["prio"].get(urg, ""), t["sig"].get(sig, ""), ind, r.get("legal_form") or "",
                    r.get("phone") or "", r.get("email") or "", re.sub(r"^https?://(www\.)?", "", r.get("website") or "").rstrip("/"),
                    r.get("contact_name") or "", real_role(r.get("contact_role")), (r.get("address") or "").strip() or loc,
                    (r.get("event_date") or "")[:10], bf["why"], " | ".join(bf["needs"]), bf["offer"], bf["ask"]])
    # Ansprechperson/Funktion nur, wenn mindestens eine Firma sie hat (Inhaber 02.10.2026: leere Spalte raus)
    drop = {i for i in CONTACT_COLS if not any(str(row[i]).strip() for row in rows)}
    w.writerow([c for i, c in enumerate(head) if i not in drop])
    w.writerows([[v for i, v in enumerate(row) if i not in drop] for row in rows])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


REQUIRED = ("phone", "email", "website", "address", "contact_name")


def complete_only(data: bytes, segment: str | None = None) -> bytes:
    """Nur Zeilen mit allen Pflichtangaben (Inhaber 27.09.2026). Ältere CSVs ohne diese Spalten bleiben unverändert.
    Webagenturen (S2): Website nicht Pflicht, "noch keine Website" ist dort der Verkaufsgrund (Inhaber 27.09.2026)."""
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig", "replace"))))
    if not rows or not all(k in rows[0] for k in REQUIRED):
        return data
    need = [k for k in REQUIRED if not (segment == "S2" and k == "website")]
    # Ansprechperson: Name, sonst Rolle („Fehlt ein Name, steht die Rolle“, CLAUDE.md §9) – wie contact_companies
    has = lambda r, k: (r.get(k) or "").strip() or (k == "contact_name" and (r.get("contact_role") or "").strip())  # noqa: E731
    keep = [r for r in rows if all(has(r, k) for k in need)]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(keep)
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def attachments(csv_bytes: bytes, lang: str, area: str | None = None, firm: str | None = None,
                period: dt.date | None = None, name: str = "leads", plans: list[dict] | None = None,
                cta_url: str | None = None, segment: str | None = None, country: str = "UK",
                sample: bool = False) -> list[tuple[str, bytes]]:
    """PDF-Report (falls möglich) + bereinigte CSV für CRM/Excel. sample=True: Probe, genau 10 Firmen."""
    slug = "-" + re.sub(r"[^A-Za-z0-9]+", "-", area).strip("-") if area else ""
    out = []
    csv_bytes = complete_only(csv_bytes, segment)
    groups = group_rows(csv_bytes)
    if not groups:
        return []
    if (sample or plans is not None) and len(groups) != SAMPLE_SIZE:
        # Probe immer mit genau 10 verschiedenen Firmen (Inhaber 29.09.2026) – sonst lieber gar nicht senden
        print(f"Probe nicht erstellt: {len(groups)} statt {SAMPLE_SIZE} Firmen")
        return []
    pdf = render_pdf(csv_bytes, lang, area, firm, period, local_plans(plans, country), cta_url, segment, country)
    if pdf:
        # Dateiname nach Inhalt, nicht nach Firma (Inhaber 02.10.2026: in Gmail sonst nicht unterscheidbar)
        if sample:
            title = "10-pistes-gratuites" if lang == "fr" else "Your-10-Free-Leads"
        else:
            title = "Vos-pistes" if lang == "fr" else "Your-Leads"
        out.append((f"{title}{slug or '-' + (country or '').upper()}.pdf", pdf))
    out.append((f"{name}{slug}.csv", clean_csv(csv_bytes, lang, segment, country)))
    return out
