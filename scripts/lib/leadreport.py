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
                   "website_outdated": "Outdated website", "new_location": "New site"},
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
                   "website_outdated": "Site web ancien", "new_location": "Nouveau site"},
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
                   ("Only for your firm", "Each lead goes to one firm in your field and area. No competitor calls the same company.")],
           "how_h": "How it works",
           "how": [("You choose your area", "Towns or counties you serve, and the signals that fit your business."),
                   ("Every Monday", "A fresh report like this one, as PDF and spreadsheet for your CRM."),
                   ("You call and win clients", "Phone, email, sales tip and opening line are in every lead.")],
           "inc_h": "In every lead", "inc": ["Company and location", "What happened, with date", "Phone and email", "Priority", "Sales tip", "Opening line"],
           "plans_h": "Plans", "per": "per month", "btn": "Start my weekly leads", "btn1": "See plans and start", "start": "Ready to start?",
           "cta": "Just reply to our email with your towns. Your first delivery arrives next Monday.",
           "b_co": "Company profile", "b_ev": "Why it's an opportunity", "b_tip": "Sales approach", "b_what": "What happened", "h_sit": "The situation", "h_angle": "Your angle", "h_obj": "If they hesitate", "h_call": "Call guide", "h_mail": "Follow-up email, ready to send", "i_addr": "Address", "i_ask": "Ask for", "i_contact": "Contact person", "i_co": "Company",
           "ey": "A personal note", "intro_h": "Thank you for your first order",
           "intro": "We are glad to have you on board. Our goal is simple: to bring you new clients at exactly the right moment. "
                    "Every week we look for companies that need what you offer right now, because they have just been founded, are hiring or are growing, "
                    "and we hand them to you first, with everything you need to start the conversation. We look forward to your first wins.",
           "intro_h_s": "Your free sample",
           "intro_s": "Thank you for your interest in NextGen Profit. Our goal is simple: to bring you new clients at exactly the right moment. "
                      "The companies below need what you offer right now, because they have just been founded, are hiring or are growing. "
                      "Each one comes with everything you need to start the conversation. We hope they bring you your first new client.",
           "role": "Founder, NextGen Profit",
           "f_ind": "Industry", "f_form": "Legal form", "f_reg": "Registered", "f_loc": "Location", "f_web": "Website", "f_noweb": "none found yet",
           "p1": "10 leads selected for you", "p1s": "Business contact details from public registers and company websites",
           "plan_txt": {"starter": "Up to 30 new leads per week from 1 area. Every lead exclusive to your firm.",
                        "pro": "Up to 100 new leads per week from up to 3 areas, all matching signals. Every lead exclusive to your firm."}},
    "fr": {"h": "Pourquoi ces pistes génèrent du chiffre d'affaires",
           "why": [("Une vraie raison d'acheter", "Chaque entreprise vient de faire quelque chose qui crée un besoin : création, recrutement, croissance, déménagement."),
                   ("Vous appelez en premier", "Les pistes arrivent quelques jours après l'événement, souvent avant que l'entreprise ait trouvé un prestataire."),
                   ("Réservé à votre entreprise", "Chaque piste va à une seule entreprise de votre secteur et de votre zone.")],
           "how_h": "Comment ça marche",
           "how": [("Vous choisissez votre zone", "Les villes ou départements que vous couvrez, et les signaux qui vous conviennent."),
                   ("Chaque lundi", "Un nouveau rapport comme celui-ci, en PDF et en tableau pour votre CRM."),
                   ("Vous appelez et gagnez des clients", "Téléphone, e-mail, conseil de vente et phrase d'accroche dans chaque piste.")],
           "inc_h": "Dans chaque piste", "inc": ["Entreprise et lieu", "L'événement, avec la date", "Téléphone et e-mail", "Priorité", "Conseil de vente", "Phrase d'accroche"],
           "plans_h": "Formules", "per": "par mois", "btn": "Recevoir mes pistes chaque semaine", "btn1": "Voir les formules", "start": "On commence ?",
           "cta": "Répondez simplement à notre e-mail avec vos villes. Votre première livraison arrive lundi prochain.",
           "b_co": "Profil de l'entreprise", "b_ev": "Pourquoi c'est une opportunité", "b_tip": "Approche commerciale", "b_what": "Ce qui s'est passé", "h_sit": "La situation", "h_angle": "Votre angle", "h_obj": "S'ils hésitent", "h_call": "Guide d'appel", "h_mail": "E-mail de relance, prêt à envoyer", "i_addr": "Adresse", "i_ask": "Demander", "i_contact": "Interlocuteur", "i_co": "Entreprise",
           "ey": "Un mot personnel", "intro_h": "Merci pour votre première commande",
           "intro": "Nous sommes ravis de vous compter parmi nos clients. Notre objectif est simple : vous apporter de nouveaux clients au bon moment. "
                    "Chaque semaine, nous repérons les entreprises qui ont besoin de votre service maintenant, parce qu'elles viennent d'être créées, recrutent ou grandissent, "
                    "et nous vous les transmettons en premier, avec tout ce qu'il faut pour engager la conversation. Au plaisir de vos premiers succès.",
           "intro_h_s": "Votre échantillon gratuit",
           "intro_s": "Merci de votre intérêt pour NextGen Profit. Notre objectif est simple : vous apporter de nouveaux clients au bon moment. "
                      "Les entreprises ci-dessous ont besoin de votre service maintenant, parce qu'elles viennent d'être créées, recrutent ou grandissent. "
                      "Chacune est accompagnée de tout ce qu'il faut pour engager la conversation.",
           "role": "Fondateur, NextGen Profit",
           "f_ind": "Secteur", "f_form": "Forme juridique", "f_reg": "Immatriculée", "f_loc": "Lieu", "f_web": "Site web", "f_noweb": "pas encore trouvé",
           "p1": "10 pistes sélectionnées pour vous", "p1s": "Coordonnées professionnelles issues de registres publics et des sites des entreprises",
           "plan_txt": {"starter": "Jusqu'à 30 nouvelles pistes par semaine dans 1 zone. Chaque piste réservée à votre entreprise.",
                        "pro": "Jusqu'à 100 nouvelles pistes par semaine dans 3 zones maximum, tous les signaux utiles. Chaque piste réservée à votre entreprise."}},
}
CUR = {"gbp": "£", "eur": "€", "usd": "$"}


def _money(plan: dict) -> str:
    amt = (plan.get("amount_cents") or 0) / 100
    sym = CUR.get((plan.get("currency") or "").lower(), "")
    txt = f"{amt:,.0f}" if amt == int(amt) else f"{amt:,.2f}"
    return f"{txt} {sym}".strip() if (plan.get("currency") or "").lower() == "eur" else f"{sym}{txt}"


def _clip(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def build_html(data: bytes, lang: str = "en", area: str | None = None, firm: str | None = None,
               period: dt.date | None = None, plans: list[dict] | None = None, cta_url: str | None = None,
               segment: str | None = None) -> str:
    """Seite 1: Logo und bis zu 10 Leads. Seite 2 (nur wenn plans übergeben, also bei Proben): Wert, Ablauf, Pakete."""
    t, t2 = T.get(lang, T["en"]), T2.get(lang, T2["en"])
    groups = group_rows(data)[:10]
    e = html.escape
    cards = []
    for g in groups:
        r = g["rows"][0]
        sig = r.get("signal") or ("new_incorporation" if "regist" in (r.get("event") or "").lower() else "")
        urg = r.get("urgency") or r.get("priority") or ""
        loc = (r.get("location") or "").strip()
        opener = (r.get("opening_line") or r.get("opener") or "").replace((r.get("company") or "").strip() or "\0", g["company"])
        profile = (r.get("company_profile") or "").strip()
        tip = (r.get("sales_tip") or "").strip()
        why = (r.get("why_now") or "").strip()
        ev = _event(r.get("event", ""), r.get("company", ""))
        web = re.sub(r"^https?://(www\.)?", "", r.get("website") or "").rstrip("/")
        q = (r.get("question_to_ask") or "").strip()
        bf = briefing(sig, segment, g["company"], ev, _day(r.get("event_date", ""), lang), opener, q, tip, lang)
        addr = (r.get("address") or "").strip() or loc
        co = " · ".join(x for x in [r.get("industry"), r.get("legal_form"),
                                    (t2["f_reg"] + " " + _day(r.get("event_date", ""), lang)) if sig == "new_incorporation" else ""] if x)
        info = [(t["phone"], r.get("phone") or "–"), (t["email"], r.get("email") or "–"), (t["web"], web or t2["f_noweb"]),
                (t2["i_addr"], addr),
                (t2["i_contact"], (r.get("contact_name") or "").strip() + (f" ({r.get('contact_role').strip()})" if (r.get("contact_role") or "").strip() else "")),
                (t2["i_co"], co or "–")]
        info = [(k, v) for k, v in info if v and v.strip()]
        cards.append(f"""
<article class="lead">
  <div class="hd"><div class="nm">{e(g['company'])}</div>
    <div class="tags">{f'<span class="pr p-{e(urg)}">{e(t["prio"].get(urg, ""))}</span>' if urg else ''}<span class="sg">{e(t['sig'].get(sig, ''))}</span></div></div>
  <dl class="info">{''.join(f'<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>' for k, v in info)}</dl>
  <div class="body">
    <div><h4>{t2['h_sit']}</h4><p>{e(bf['situation'])}</p></div>
    <div><h4>{t2['h_angle']}</h4><p>{e(bf['angle'])}</p></div>
    <div><h4>{t2['h_obj']}</h4><p>{e(bf['objection'])}</p></div>
  </div>
</article>""")
    when = _day((period or dt.date.today()).isoformat(), lang)
    head = (t2['p1'] if len(groups) >= 10 else f"{len(groups)} {t['firms']}") + (f" · {area}" if area else "")
    sample = bool(plans)
    intro = f"""<div class="intro"><div class="ey">{t2['ey']}</div><div class="ih">{t2['intro_h_s'] if sample else t2['intro_h']}{(' · ' + e(firm)) if firm else ''}</div>
<p>{t2['intro_s'] if sample else t2['intro']}</p>
<div class="sig"><span class="sn">NextGen <i>Profit</i></span></div></div>"""
    chunks, k = [], 0
    while k < max(len(cards), 1):
        size = 2 if k == 0 else 3
        chunks.append((k, cards[k:k + size]))
        k += size
    pages = []
    for k, chunk in chunks:
        ttl = (f'{intro}<div class="ttl"><h1>{e(head)}</h1><span>{e(when)}</span></div>' if k == 0 else "")
        pages.append(f"""<section class="p1"><header class="bar"><div class="logo">NextGen <i>Profit</i></div></header>
<div class="in">{ttl}<div class="grid">{''.join(chunk)}</div></div>
<div class="ft"><span>{t['conf']}</span><span>{t2['p1s']}</span></div></section>""")
    pages = "\n".join(pages)
    page2 = ""
    if plans:
        pl = "".join(f"""<div class="plan{' hi' if k == len(plans) - 1 else ''}"><div class="pn">{e(p.get('name', ''))}</div>
<div class="pp">{e(_money(p))}<small> {t2['per']}</small></div><p>{e(t2['plan_txt'].get(p.get('key', ''), ''))}</p></div>"""
                     for k, p in enumerate(plans))
        page2 = f"""<section class="p2">
<header class="bar"><div class="logo">NextGen <i>Profit</i></div></header>
<div class="in">
<h1>{t2['h']}</h1>
<div class="why">{''.join(f'<div><b>{e(h)}</b><p>{e(d)}</p></div>' for h, d in t2['why'])}</div>
<h2>{t2['how_h']}</h2>
<ol class="how">{''.join(f'<li><b>{e(h)}</b><p>{e(d)}</p></li>' for h, d in t2['how'])}</ol>
<h2>{t2['inc_h']}</h2>
<ul class="inc">{''.join(f'<li>{e(x)}</li>' for x in t2['inc'])}</ul>
<h2>{t2['plans_h']}</h2>
<div class="plans">{pl}</div>
<div class="cta"><b>{t2['start']}</b><p>{t2['cta']}</p>{f'<a class="btn" href="{e(cta_url)}">{t2["btn"]} &rarr;</a>' if cta_url else '<span>nextgen-profit.de</span>'}</div>
</div></section>"""
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><style>
{_font(400)}{_font(600)}{_font(700)}{_font(800)}
@page{{size:A4;margin:0}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:Inter,Helvetica,Arial,sans-serif;color:#15203a;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
section{{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always}}
.bar{{height:20mm;background:linear-gradient(120deg,#0b1428,#101d38);display:flex;align-items:center;padding:0 14mm;border-bottom:1.2mm solid #d8bd8a}}
.logo{{font-size:21px;font-weight:800;letter-spacing:-.4px;color:#f2efe8}}.logo i{{font-style:normal;color:#d8bd8a}}
.in{{padding:7mm 14mm 0}}
.p1 .ttl{{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4.5mm}}
.p1 .ttl h1{{font-size:19px;font-weight:800;letter-spacing:-.3px;color:#0b1428}}.p1 .ttl span{{font-size:10.5px;color:#6b7486}}
.grid{{display:flex;flex-direction:column;gap:4mm}}
.lead{{height:79mm;border:1px solid #e3e6ee;border-radius:12px;padding:4.2mm 5.5mm 3.8mm 7mm;position:relative;overflow:hidden;background:#fff;display:flex;flex-direction:column;gap:2.8mm}}
.lead:before{{content:"";position:absolute;left:0;top:0;bottom:0;width:1.5mm;background:linear-gradient(180deg,#d8bd8a,#b08d57)}}
.hd{{display:flex;justify-content:space-between;align-items:center;gap:5mm}}
.nm{{font-size:16.5px;font-weight:800;color:#0b1428;letter-spacing:-.3px;line-height:1.2}}
.tags{{display:flex;gap:1.6mm;flex:none}}
.pr,.sg{{font-size:7.4px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:.9mm 2.4mm;border-radius:99px;white-space:nowrap}}
.pr{{background:#0b1428;color:#f3e1b9}}.pr.p-medium{{background:#f3ead8;color:#7a5b24}}.pr.p-low{{background:#eef0f4;color:#6b7486}}
.sg{{background:linear-gradient(135deg,#ecd6a6,#c29d5c);color:#1a1408}}
.info{{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:1.6mm 5mm;background:#f7f3ea;border:1px solid #efe5d3;border-radius:8px;padding:2.4mm 4mm;margin:0}}
.info div{{min-width:0}}.info dt{{font-size:6.8px;letter-spacing:.12em;text-transform:uppercase;color:#a07f46;font-weight:700}}
.info dd{{margin:.3mm 0 0;font-size:9.6px;font-weight:700;color:#0b1428;line-height:1.3;overflow-wrap:anywhere}}
.body{{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;flex:1;min-height:0}}
.body>div+div{{border-left:1px solid #eef0f4;padding-left:4mm}}
h4{{font-size:7.2px;letter-spacing:.14em;text-transform:uppercase;color:#a07f46;font-weight:700;margin:0 0 1mm}}
.body p{{font-size:8.9px;line-height:1.45;color:#1f2940;margin:0}}
.p1 ~ .p1 .lead{{height:83mm}}
.intro{{position:relative;margin:2mm 0 7mm;padding:1mm 0 1mm 7mm;border-left:.9mm solid #c9a86a}}
.ey{{font-size:7.8px;letter-spacing:.22em;text-transform:uppercase;color:#a07f46;font-weight:700;margin-bottom:2mm}}
.ih{{font-size:21px;font-weight:800;color:#0b1428;letter-spacing:-.5px;line-height:1.15;margin-bottom:2.6mm}}
.intro p{{font-size:10.8px;line-height:1.65;color:#39404d;max-width:165mm}}
.sig{{margin-top:3.6mm;display:flex;align-items:center;gap:3mm}}
.sig:before{{content:"";width:9mm;height:1px;background:#c9a86a}}
.sn{{font-size:12.5px;font-weight:800;letter-spacing:-.2px;color:#0b1428}}.sn i{{font-style:normal;color:#b08d57}}
.sr{{font-size:8.6px;letter-spacing:.14em;text-transform:uppercase;color:#a07f46;font-weight:700}}
.ft{{position:absolute;left:14mm;right:14mm;bottom:7mm;display:flex;justify-content:space-between;font-size:8.5px;color:#8a92a3;letter-spacing:.06em}}
.p2 .in{{padding:12mm 16mm 0}}
.p2 h1{{font-size:24px;font-weight:800;letter-spacing:-.5px;color:#0b1428;margin-bottom:6mm}}
.p2 h2{{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#a07f46;font-weight:700;margin:11mm 0 4.5mm}}
.why{{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}}.why div{{background:#0b1428;color:#e8e2d4;border-radius:12px;padding:5mm}}
.why b{{display:block;color:#f3e1b9;font-size:13px;margin-bottom:2mm}}.why p{{font-size:10.5px;line-height:1.5}}
.how{{list-style:none;counter-reset:s;display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}}
.how li{{counter-increment:s;border:1px solid #e3e6ee;border-radius:12px;padding:5mm;position:relative}}
.how li:before{{content:counter(s);display:grid;place-items:center;width:8mm;height:8mm;border-radius:50%;border:1px solid #d8bd8a;color:#a07f46;font-weight:700;font-size:12px;margin-bottom:3mm}}
.how b{{font-size:12.5px;color:#0b1428}}.how p{{font-size:10.5px;line-height:1.5;color:#4a5263;margin-top:1.5mm}}
.inc{{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 5mm}}
.inc li{{font-size:11.5px;font-weight:600;color:#0b1428;padding:3mm 4mm;border-radius:10px;background:#fbf8f1;border:1px solid #efe5d3}}
.inc li:before{{content:"✓";color:#a07f46;font-weight:800;margin-right:2mm}}
.plans{{display:grid;grid-template-columns:1fr 1fr;gap:5mm}}.plan{{border:1px solid #e3e6ee;border-radius:12px;padding:5mm 6mm}}
.plan.hi{{border:1.5px solid #d8bd8a;background:#fbf8f1}}
.pn{{font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#6b7486}}
.pp{{font-size:26px;font-weight:800;color:#0b1428;margin:1.5mm 0 2mm}}.pp small{{font-size:11px;font-weight:600;color:#6b7486}}
.plan p{{font-size:10.5px;line-height:1.5;color:#39404d}}
.cta{{margin-top:12mm;border-radius:14px;padding:6mm 7mm;background:radial-gradient(400px 200px at 90% 0%,rgba(216,189,138,.25),transparent 60%),linear-gradient(135deg,#0b1428,#14243f);color:#e8e2d4;position:relative}}
.btn{{display:inline-block;margin-top:5mm;background:linear-gradient(135deg,#ecd6a6,#b08d57);color:#141008;font-weight:700;font-size:13px;padding:3.5mm 8mm;border-radius:99px;text-decoration:none}}
.btn1{{position:absolute;right:14mm;top:6.5mm;background:linear-gradient(135deg,#ecd6a6,#b08d57);color:#141008;font-weight:700;font-size:11px;padding:2.2mm 5mm;border-radius:99px;text-decoration:none}}
.cta b{{font-size:17px;color:#fff}}.cta p{{font-size:11.5px;margin-top:1.5mm;max-width:130mm}}.cta span{{position:absolute;right:7mm;bottom:6mm;color:#d8bd8a;font-weight:700;font-size:11px}}
</style></head><body>
{pages}
{page2}
</body></html>"""


def render_pdf(data: bytes, lang: str = "en", area: str | None = None, firm: str | None = None,
               period: dt.date | None = None, plans: list[dict] | None = None, cta_url: str | None = None,
               segment: str | None = None) -> bytes | None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    doc = build_html(data, lang, area, firm, period, plans, cta_url, segment)
    try:
        with sync_playwright() as p:
            import os
            b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
            page = b.new_page()
            page.set_content(doc, wait_until="load")
            pdf = page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
            b.close()
            return pdf
    except Exception as exc:  # noqa: BLE001 - ohne PDF weiter mit CSV
        print(f"PDF-Report nicht erstellt: {exc}")
        return None


def clean_csv(data: bytes, lang: str = "en") -> bytes:
    """CSV für den Kunden: ohne Links und ohne konkrete Fundstelle (nur Art der Quelle)."""
    t = T.get(lang, T["en"])
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig", "replace"))))
    if not rows:
        return data
    cols = [c for c in rows[0].keys() if c not in ("source_url",)]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        r = dict(r)
        if "source" in r:
            r["source"] = t["src"][_source_kind(r.get("source", ""), r.get("signal") or "")]
        w.writerow(r)
    return ("﻿" + buf.getvalue()).encode("utf-8")


def attachments(csv_bytes: bytes, lang: str, area: str | None = None, firm: str | None = None,
                period: dt.date | None = None, name: str = "leads", plans: list[dict] | None = None,
                cta_url: str | None = None, segment: str | None = None) -> list[tuple[str, bytes]]:
    """PDF-Report (falls möglich) + bereinigte CSV für CRM/Excel."""
    slug = "-" + re.sub(r"[^A-Za-z0-9]+", "-", area).strip("-") if area else ""
    out = []
    pdf = render_pdf(csv_bytes, lang, area, firm, period, plans, cta_url, segment)
    if pdf:
        out.append((f"NextGen-Profit-Lead-Report{slug}.pdf", pdf))
    out.append((f"{name}{slug}.csv", clean_csv(csv_bytes, lang)))
    return out
