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


def build_html(data: bytes, lang: str = "en", area: str | None = None, firm: str | None = None,
               period: dt.date | None = None) -> str:
    t = T.get(lang, T["en"])
    groups = group_rows(data)
    n_sig = sum(len(g["rows"]) for g in groups)
    e = html.escape
    cards = []
    for g in groups:
        r = g["rows"][0]
        sig = r.get("signal") or ("new_incorporation" if "regist" in (r.get("event") or "").lower() else "")
        urg = r.get("urgency") or r.get("priority") or ""
        loc = ", ".join(x for x in [(r.get("location") or "").strip()] if x)
        why = r.get("why_now") or r.get("urgency_reason") or ""
        why = re.sub(r"(\d{2})\.(\d{2})\.(\d{4})", lambda m: _day(f"{m.group(3)}-{m.group(2)}-{m.group(1)}", lang), why)
        tip = r.get("sales_tip") or ""
        opener = r.get("opening_line") or r.get("opener") or ""
        profile = r.get("company_profile") or ""
        contact = [(t["phone"], r.get("phone")), (t["email"], r.get("email")), (t["web"], re.sub(r"^https?://(www\.)?", "", r.get("website") or "").rstrip("/"))]
        contact = [(k, v) for k, v in contact if v]
        also = [_event(x.get("event", ""), x.get("company", "")) for x in g["rows"][1:3]]
        chips = [t["sig"].get(sig, "")] + [t["sig"].get(x.get("signal") or "", "") for x in g["rows"][1:]]
        chips = list(dict.fromkeys(c for c in chips if c))
        kind = _source_kind(r.get("source", ""), sig)
        cards.append(f"""
<section class="card">
  <div class="top"><div><h2>{e(g['company'])}</h2><div class="loc">{e(loc)}</div></div>
    <span class="prio p-{e(urg)}">{e(t['prio'].get(urg, ''))}</span></div>
  <div class="chips">{''.join(f'<span>{e(c)}</span>' for c in chips)}</div>
  {f'<p class="profile">{e(profile)}</p>' if profile else ''}
  <div class="grid">
    <div><h3>{t['what']}</h3><p>{e(_event(r.get('event', ''), r.get('company', '')))}</p>
      {''.join(f'<p class="also">+ {e(a)}</p>' for a in also if a)}</div>
    {f'<div><h3>{t["why"]}</h3><p>{e(why)}</p></div>' if why else ''}
  </div>
  {f'<div class="tip"><h3>{t["tip"]}</h3><p>{e(tip)}</p></div>' if tip else ''}
  {f'<blockquote><h3>{t["open"]}</h3>“{e(opener)}”</blockquote>' if opener else ''}
  {('<div class="contact">' + ''.join(f'<div><span>{e(k)}</span>{e(v)}</div>' for k, v in contact) + '</div>') if contact else ''}
  <div class="meta">{t['detected']} {e(_day(r.get('event_date', ''), lang))} · {t['checked']} {e(_day(r.get('checked_on', ''), lang))} · {e(t['src'][kind])}</div>
</section>""")
    when = _day((period or dt.date.today()).isoformat(), lang)
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><style>
{_font(400)}{_font(600)}{_font(700)}{_font(800)}
@page{{size:A4;margin:14mm 0 12mm}}@page:first{{margin:0}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:Inter,Helvetica,Arial,sans-serif;color:#15203a;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.cover{{height:297mm;background:radial-gradient(900px 600px at 80% 10%,rgba(216,189,138,.18),transparent 60%),linear-gradient(160deg,#0b1428,#081026 70%);color:#f2efe8;padding:28mm 22mm;position:relative;page-break-after:always}}
.logo{{font-size:30px;font-weight:800;letter-spacing:-.5px}}.logo i{{font-style:normal;color:#d8bd8a}}
.cover .rule{{width:60px;height:2px;background:#d8bd8a;margin:70mm 0 10mm}}
.cover h1{{font-size:54px;font-weight:800;letter-spacing:-1.5px;line-height:1.05}}
.cover .sub{{font-size:20px;color:#c9cfdb;margin-top:6mm}}
.stats{{display:flex;gap:14mm;margin-top:18mm}}.stats b{{display:block;font-size:40px;color:#f3e1b9;font-weight:800}}.stats span{{font-size:13px;color:#9aa6ba;letter-spacing:.14em;text-transform:uppercase}}
.cover .for{{position:absolute;left:22mm;bottom:40mm;font-size:14px;color:#9aa6ba;letter-spacing:.14em;text-transform:uppercase}}.cover .for b{{display:block;color:#f2efe8;font-size:22px;letter-spacing:0;text-transform:none;margin-top:2mm}}
.cover .conf{{position:absolute;left:22mm;right:22mm;bottom:20mm;border-top:1px solid rgba(216,189,138,.35);padding-top:5mm;font-size:12px;color:#d8bd8a;letter-spacing:.16em;text-transform:uppercase;display:flex;justify-content:space-between}}
.page{{padding:0 16mm}}
.how{{border:1px solid #e6dcc8;background:#fbf8f1;border-radius:14px;padding:6mm 7mm;margin-bottom:7mm}}.how h3{{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a07f46;margin-bottom:2mm}}
.how ol{{padding-left:5mm;font-size:12.5px;line-height:1.6;color:#39404d}}
.card{{border:1px solid #e3e6ee;border-radius:16px;padding:7mm 8mm 5mm;margin-bottom:6mm;page-break-inside:avoid;position:relative;overflow:hidden;background:#fff}}
.card:before{{content:"";position:absolute;left:0;top:0;right:0;height:3px;background:linear-gradient(90deg,#0b1428,#d8bd8a,#0b1428)}}
.top{{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}}
h2{{font-size:21px;font-weight:800;letter-spacing:-.3px;color:#0b1428}}.loc{{font-size:12.5px;color:#6b7486;margin-top:1mm}}
.prio{{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:2mm 3.5mm;border-radius:99px;white-space:nowrap;background:#0b1428;color:#f3e1b9}}
.prio.p-medium{{background:#f3ead8;color:#7a5b24}}.prio.p-low{{background:#eef0f4;color:#6b7486}}
.chips{{display:flex;gap:2mm;flex-wrap:wrap;margin:3.5mm 0 1mm}}.chips span{{font-size:10.5px;font-weight:600;padding:1.2mm 3mm;border-radius:99px;background:linear-gradient(135deg,#e7cf9f,#c29d5c);color:#1a1408}}
.profile{{font-size:12px;color:#39404d;margin-top:2mm}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:4mm}}
h3{{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#a07f46;font-weight:700;margin-bottom:1.2mm}}
.grid p{{font-size:12.5px;line-height:1.5;color:#1f2940}}.grid p.also{{font-size:11.5px;color:#6b7486;margin-top:1mm}}
.tip{{margin-top:4mm;background:#0b1428;color:#e8e2d4;border-radius:10px;padding:3.5mm 5mm}}.tip h3{{color:#d8bd8a}}.tip p{{font-size:12.5px;line-height:1.5}}
blockquote{{margin-top:4mm;border-left:3px solid #d8bd8a;padding:1mm 0 1mm 5mm;font-size:13px;line-height:1.55;color:#1f2940;font-style:italic}}blockquote h3{{font-style:normal}}
.contact{{display:flex;gap:8mm;margin-top:4mm;padding-top:3mm;border-top:1px dashed #e3e6ee;font-size:12.5px;font-weight:600}}.contact span{{display:block;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#6b7486;font-weight:700}}
.meta{{margin-top:4mm;font-size:10.5px;color:#8a92a3}}
.foot{{font-size:10px;color:#8a92a3;text-align:center;margin-top:4mm}}
</style></head><body>
<div class="cover"><div class="logo">NextGen <i>Profit</i></div><div class="rule"></div>
<h1>{t['title']}</h1><div class="sub">{e(area or '')}{' · ' if area else ''}{t['week']} {e(when)}</div>
<div class="stats"><div><b>{len(groups)}</b><span>{t['firms']}</span></div><div><b>{n_sig}</b><span>{t['signals']}</span></div></div>
{f'<div class="for">{t["for"]}<b>{e(firm)}</b></div>' if firm else ''}
<div class="conf"><span>{t['conf']}</span><span>nextgen-profit.de</span></div></div>
<div class="page"><div class="how"><h3>{t['how']}</h3><ol><li>{t['how1']}</li><li>{t['how2']}</li><li>{t['how3']}</li></ol></div>
{''.join(cards)}<p class="foot">{t['foot']} · NextGen Profit</p></div>
</body></html>"""


def render_pdf(data: bytes, lang: str = "en", area: str | None = None, firm: str | None = None,
               period: dt.date | None = None) -> bytes | None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    doc = build_html(data, lang, area, firm, period)
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
                period: dt.date | None = None, name: str = "leads") -> list[tuple[str, bytes]]:
    """PDF-Report (falls möglich) + bereinigte CSV für CRM/Excel."""
    slug = "-" + re.sub(r"[^A-Za-z0-9]+", "-", area).strip("-") if area else ""
    out = []
    pdf = render_pdf(csv_bytes, lang, area, firm, period)
    if pdf:
        out.append((f"NextGen-Profit-Lead-Report{slug}.pdf", pdf))
    out.append((f"{name}{slug}.csv", clean_csv(csv_bytes, lang)))
    return out
