#!/usr/bin/env python3
"""Baut die statische Website der Mobilen Physiotherapie Oehlke nach public/.

  python3 sites/physiotherapie-oehlke/build.py

Inhalte der Unterseiten: content/pages.json (aus der bisherigen Website übernommen, frei bearbeitbar).
Startseite, Navigation und Footer: hier im Code. Nur Standardbibliothek.

DEMO = True: Vorschau auf der Subdomain: alle Seiten noindex, keine kanonischen Links.
Zum Livegang auf physiotherapie-oehlke.de DEMO = False setzen.
"""
from __future__ import annotations

import html
import json
import math
import os
import re
from pathlib import Path

DEMO = True
LIVE_URL = "https://physiotherapie-oehlke.de"
ROOT = Path(__file__).resolve().parent
OUT = Path(os.environ.get("SITE_OUT", ROOT / "public"))
PAGES = json.loads((ROOT / "content" / "pages.json").read_text(encoding="utf-8"))


def _version() -> str:
    """Cache-Schlüssel aus dem Inhalt von CSS/JS: jede Änderung lädt sofort neu."""
    import hashlib
    h = hashlib.sha1()
    for f in ("css/site.css", "js/site.js", "assets/fonts/fonts.css"):
        h.update((ROOT / "public" / f).read_bytes())
    return h.hexdigest()[:10]


VERSION = _version()

PHONE = "0176 43630803"
TEL = "tel:+4917643630803"
MAIL = "info@physiotherapie-oehlke.de"
WA = "https://wa.me/4917643630803?text=Hallo%2C%20ich%20m%C3%B6chte%20gerne%20einen%20Termin%20vereinbaren."

# ---------------------------------------------------------------- Icons
P = {
    "arrow": '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    "phone": '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z"/>',
    "mail": '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m3 6 9 7 9-7"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "pin": '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "chev": '<path d="m6 9 6 6 6-6"/>',
    "home": '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    "heart": '<path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.6Z"/><path d="M8 12h2l1.5-2.5 2 5L15 12h1.5"/>',
    "dumbbell": '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    "walk": '<circle cx="13" cy="4" r="2"/><path d="m9 21 2.5-6 2.5 2v4"/><path d="M7 11.5 9.5 8l4-.5 2.5 3.5 3 1"/><path d="M11.5 15 13 9"/>',
    "stairs": '<path d="M3 20h5v-4h4v-4h4V8h5"/><path d="M14 4h7v4"/>',
    "drop": '<path d="M12 2.7s6.5 7 6.5 11.8a6.5 6.5 0 0 1-13 0C5.5 9.7 12 2.7 12 2.7Z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    "hand": '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L6 14"/>',
    "clip": '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M9 11h6M9 15h4"/>',
    "wind": '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    "spark": '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"/><path d="M19 17c.3 1.3 1 2 2 2-1 .3-1.7 1-2 2-.3-1-1-1.7-2-2 1-.3 1.7-1 2-2Z"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    "cal": '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "wa": '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.3 3.2Z"/><path d="M9 9.5c0 2.8 2.7 5.5 5.5 5.5l1.3-1.3-2-1-.8.8c-1 0-2.5-1.5-2.5-2.5l.8-.8-1-2Z"/>',
    "badge": '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
}


def icon(name: str, sw: float = 2) -> str:
    return (f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{P[name]}</svg>')


ARROW = icon("arrow").replace("<svg", '<svg class="arrow"')

# ---------------------------------------------------------------- Stammdaten
SERVICES = [
    ("geriatrische-physiotherapie-hausbesuch", "Geriatrie", "Geriatrische Physiotherapie", "heart", "geriatrie",
     "Mein Schwerpunkt: Menschen wieder in Bewegung bringen. Aufstehen, gehen, den Alltag selbst meistern."),
    ("krankengymnastik-hausbesuch", "Krankengymnastik", "Krankengymnastik (KG)", "dumbbell", "leistung-krankengymnastik",
     "Aktive und passive Übungen für mehr Beweglichkeit, Kraft und Sicherheit im Alltag."),
    ("gangschule-hausbesuch", "Gangschule", "Gangschule & Mobilität", "walk", "leistung-gangschule",
     "Sicheres Gehen und Stehen üben, für mehr Selbstständigkeit und Vertrauen in die eigene Bewegung."),
    ("alltagstraining-hausbesuch", "Alltagstraining", "Alltagstraining", "stairs", "leistung-alltagstraining",
     "Bewegungen aus Ihrem Alltag trainieren: Aufstehen, Treppen steigen, Anziehen."),
    ("manuelle-therapie-hausbesuch", "Manuelle Therapie", "Manuelle Therapie (MT)", "hand", "leistung-manuelle-therapie",
     "Gezielte Handgriffe an Gelenken und Muskeln für mehr Beweglichkeit und weniger Schmerz."),
    ("lymphdrainage-hausbesuch", "Lymphdrainage", "Lymphdrainage (MLD)", "drop", "leistung-lymphdrainage",
     "Sanfte Grifftechnik, die den Abtransport von Gewebeflüssigkeit fördern und Schwellungen reduzieren soll."),
    ("atemtherapie-hausbesuch", "Atemtherapie", "Atemtherapie (AT)", "wind", "leistung-atemtherapie",
     "Gezielte Atemübungen für Lungenfunktion, Atemmechanik und Belastbarkeit."),
    ("klassische-massage-hausbesuch", "Massage", "Klassische Massage", "spark", "leistung-massage",
     "Massagetechniken zur Lockerung verspannter Muskulatur und zur Schmerzlinderung."),
    ("befundung-beratung-hausbesuch", "Befundung", "Befundung & Beratung", "clip", "leistung-befundung",
     "Ausführliche Anamnese im Ersttermin. Gemeinsam legen wir Ihre Therapieziele fest."),
]
SVC = {s[0]: s for s in SERVICES}
SPANS = [7, 5, 4, 4, 4, 4, 4, 4, 12]  # Raster der Leistungskacheln (12 Spalten)

# Ort: (Slug, Name, Breite, Länge, Beschriftung)
TOWNS = [
    ("hockenheim", "Hockenheim", 49.3218, 8.5476, "l"),
    ("schwetzingen", "Schwetzingen", 49.3833, 8.5667, "l"),
    ("heidelberg", "Heidelberg", 49.3988, 8.6724, "r"),
    ("ketsch", "Ketsch", 49.3667, 8.5333, "l"),
    ("oftersheim", "Oftersheim", 49.3667, 8.5833, "r"),
    ("plankstadt", "Plankstadt", 49.3944, 8.5967, "t"),
    ("reilingen", "Reilingen", 49.2967, 8.5650, "r"),
    ("altlussheim", "Altlußheim", 49.3017, 8.4997, "l"),
    ("neulussheim", "Neulußheim", 49.2950, 8.5183, "b"),
    ("bruehl", "Brühl", 49.4000, 8.5333, "l"),
    ("walldorf", "Walldorf", 49.3064, 8.6436, "r"),
    ("wiesloch", "Wiesloch", 49.2942, 8.6983, "b"),
    ("sandhausen", "Sandhausen", 49.3436, 8.6586, "r"),
    ("eppelheim", "Eppelheim", 49.4019, 8.6336, "t"),
]


def e(s: str) -> str:
    return html.escape(s, quote=True)


def fix_links(h: str) -> str:
    h = re.sub(r'href="index\.html(#[^"]*)?"', lambda m: f'href="/{m.group(1) or ""}"', h)
    h = re.sub(r'href="([a-z0-9-]+)\.html(#[^"]*)?"', lambda m: f'href="/{m.group(1)}{m.group(2) or ""}"', h)
    return h


def strip_tags(h: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", h)).strip()


def slugify(s: str) -> str:
    s = strip_tags(s).lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def img(name: str, alt: str, cls: str = "", eager: bool = False, small: bool = False, attrs: str = "") -> str:
    src = f"/assets/img/{name}-800.webp" if small else f"/assets/img/{name}.webp"
    srcset = "" if small else f' srcset="/assets/img/{name}-800.webp 800w, /assets/img/{name}.webp 1600w" sizes="(max-width:860px) 100vw, 60vw"'
    load = 'fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'
    c = f' class="{cls}"' if cls else ""
    return f'<img{c} src="{src}"{srcset} alt="{e(alt)}" {load}{attrs}>'


# ---------------------------------------------------------------- Rahmen
def head(title: str, desc: str, path: str, noindex: bool) -> str:
    robots = "noindex, nofollow" if DEMO else ("noindex, follow" if noindex else "index, follow")
    canon = "" if DEMO else f'<link rel="canonical" href="{LIVE_URL}{path}">'
    return f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="{robots}">
{canon}
<meta name="theme-color" content="#081429">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="/assets/img/og.jpg">
<link rel="icon" href="/assets/img/logo-icon-180.png">
<link rel="apple-touch-icon" href="/assets/img/logo-icon-180.png">
<link rel="preload" href="/assets/fonts/poppins-600-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts/fonts.css?v={VERSION}">
<link rel="stylesheet" href="/css/site.css?v={VERSION}">
<script type="application/ld+json">{json.dumps(SCHEMA, ensure_ascii=False)}</script>
</head>"""


SCHEMA = {
    "@context": "https://schema.org", "@type": "Physiotherapy", "name": "Mobile Physiotherapie Oehlke",
    "telephone": "+4917643630803", "email": MAIL, "url": LIVE_URL,
    "address": {"@type": "PostalAddress", "streetAddress": "Leopoldstraße 5", "postalCode": "68766",
                "addressLocality": "Hockenheim", "addressCountry": "DE"},
    "areaServed": [t[1] for t in TOWNS],
    "openingHoursSpecification": [
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "08:00", "closes": "18:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "09:00", "closes": "15:00"}],
}


def header(current: str, light: bool) -> str:
    def a(href: str, label: str, key: str) -> str:
        cur = ' aria-current="page"' if key == current else ""
        return f'<a href="{href}"{cur}>{label}</a>'
    mega = "".join(
        f'<a href="/{s[0]}"><span class="ico">{icon(s[3])}</span><span>{e(s[2])}<small>{"Schwerpunkt" if i == 0 else "im Hausbesuch"}</small></span></a>'
        for i, s in enumerate(SERVICES))
    msub = "".join(f'<a href="/{s[0]}">{e(s[2])}</a>' for s in SERVICES)
    return f"""<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<div class="progress" aria-hidden="true"></div>
<header class="hdr{' hdr--light' if light else ''}">
  <div class="container hdr__in">
    <a class="hdr__logo" href="/" aria-label="Mobile Physiotherapie Oehlke, Startseite">
      <img class="l-white" src="/assets/img/logo-white.png" alt="" width="479" height="183">
      <img class="l-color" src="/assets/img/logo.png" alt="" width="479" height="183">
    </a>
    <nav class="nav" aria-label="Hauptnavigation">
      {a('/#ueber-mich', 'Über mich', 'ueber')}
      <div class="nav__item">
        <button class="nav__drop" aria-expanded="false" aria-haspopup="true">Leistungen {icon('chev', 2.4)}</button>
        <div class="mega">{mega}<a class="mega__all" href="/#leistungen">Alle Leistungen im Überblick</a></div>
      </div>
      {a('/#ablauf', 'Ablauf', 'ablauf')}
      {a('/#einsatzgebiet', 'Einsatzgebiet', 'gebiet')}
      {a('/karriere', 'Karriere', 'karriere')}
      <a class="btn btn--magnet" href="/#kontakt">Termin anfragen {ARROW}</a>
    </nav>
    <button class="burger" aria-label="Menü" aria-expanded="false" aria-controls="mnav"><span></span><span></span><span></span></button>
  </div>
</header>
<div class="mnav" id="mnav">
  <div class="mnav__main">
    <a href="/">Start</a><a href="/#ueber-mich">Über mich</a><a href="/#leistungen">Leistungen</a>
    <a href="/#einsatzgebiet">Einsatzgebiet</a><a href="/karriere">Karriere</a><a href="/#kontakt">Kontakt</a>
  </div>
  <div class="mnav__sub">{msub}</div>
  <div class="btns"><a class="btn btn--lime btn--lg" href="{TEL}">{icon('phone')} {PHONE}</a></div>
</div>"""


GOOGLE_URL = "https://www.google.com/search?q=mobile+physiotherapie+oehlke"


def google_badge() -> str:
    """Link zu den Google-Bewertungen: Google-Schriftzug, darunter fünf Sterne."""
    star = '<svg viewBox="0 0 24 24" width="26" height="26" fill="#FBBC05" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>'
    word = "".join(f'<span style="color:{c}">{ch}</span>' for ch, c in zip("Google", ("#4285F4", "#EA4335", "#FBBC05", "#4285F4", "#34A853", "#EA4335")))
    return (f'<a class="gbadge" href="{GOOGLE_URL}" target="_blank" rel="noopener" aria-label="Unsere Bewertungen auf Google ansehen">'
            f'<span class="gbadge__word">{word}</span><span class="gbadge__stars">{star * 5}</span>'
            f'<span class="gbadge__txt">Bewertungen ansehen</span></a>')


def footer() -> str:
    svc = "".join(f'<li><a href="/{s[0]}">{e(s[2])}</a></li>' for s in SERVICES[:6])
    towns = "".join(f'<li><a href="/physiotherapie-{t[0]}">{e(t[1])}</a></li>' for t in TOWNS[:6])
    return f"""<footer class="ftr">
  <svg class="ftr__wave" viewBox="0 0 600 300" fill="none" aria-hidden="true"><path d="M0 220C120 170 220 270 340 210S520 90 600 120" stroke="#46b2d0" stroke-width="2"/><path d="M0 250C140 200 240 300 360 240S540 130 600 160" stroke="#80c53f" stroke-width="2"/><path d="M0 280C150 230 250 320 380 270S560 170 600 200" stroke="#1b417a" stroke-width="2"/></svg>
  <div class="container">
    <p class="ftr__big rv">Bewegung beginnt<br><em>zu Hause.</em></p>
    <div class="btns rv" style="--d:.1s"><a class="btn btn--lime btn--lg btn--magnet" href="/#kontakt">Termin anfragen {ARROW}</a><a class="btn btn--ghost btn--lg" href="{TEL}">{icon('phone')} {PHONE}</a></div>
    <div class="ftr__grid" style="margin-top:70px">
      <div>
        <img class="ftr__logo" src="/assets/img/logo-white.png" alt="Mobile Physiotherapie Oehlke" width="157" height="60" loading="lazy">
        <p>Mobile Physiotherapie im Hausbesuch für Privatpatienten, Beihilfeberechtigte und Selbstzahler im Raum Hockenheim, Schwetzingen und Heidelberg.</p>
        <ul><li><a href="{TEL}">{PHONE}</a></li><li><a href="mailto:{MAIL}">{MAIL}</a></li><li>Mo bis Fr 8 bis 18 Uhr · Sa 9 bis 15 Uhr</li></ul>
      </div>
      <div><h4>Leistungen</h4><ul>{svc}<li><a href="/#leistungen">Alle Leistungen</a></li></ul></div>
      <div><h4>Einsatzgebiet</h4><ul>{towns}<li><a href="/#einsatzgebiet">Alle Orte</a></li></ul></div>
      <div><h4>Praxis</h4><ul><li><a href="/#ueber-mich">Über mich</a></li><li><a href="/#ablauf">Ablauf</a></li><li><a href="/karriere">Karriere</a></li><li><a href="/#kontakt">Kontakt</a></li></ul>{google_badge()}</div>
    </div>
    <div class="ftr__bottom"><span>© 2026 Mobile Physiotherapie Oehlke · Ramon Oehlke</span><span><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/agb">AGB</a></span></div>
  </div>
</footer>
<div class="fab" aria-label="Schnellkontakt"><a class="wa" href="{WA}" aria-label="WhatsApp" rel="noopener" target="_blank">{icon('wa')}</a><a class="tel" href="{TEL}" aria-label="Anrufen">{icon('phone')}</a></div>
<script src="/js/site.js?v={VERSION}" defer></script>
</body>
</html>
"""


def page(title, desc, path, body, current="", light=False, noindex=False) -> str:
    return head(title, desc, path, noindex) + "\n<body>\n" + header(current, light) + f'\n<main id="inhalt">\n{body}\n</main>\n' + footer()


# ---------------------------------------------------------------- Bausteine
def svc_card(s, span: int | None = None, tag: str = "", small: bool = True) -> str:
    slug, short, name, ic, im, teaser = s
    st = f' style="grid-column:span {span}"' if span else ""
    t = f'<span class="tag">{tag}</span>' if tag else ""
    feat = " svc--feature" if tag else ""
    return (f'<a class="svc{feat} rv" href="/{slug}" data-tilt{st}>{img(im, "", small=small)}{t}'
            f'<span class="ico">{icon(ic)}</span><span class="go">{icon("arrow")}</span>'
            f'<h3>{e(name)}</h3><p>{e(teaser)}</p></a>')


def mini_svcs(exclude: str = "") -> str:
    return '<div class="mini-svcs">' + "".join(
        f'<a href="/{s[0]}"><span class="ico">{icon(s[3])}</span>{e(s[2])}</a>' for s in SERVICES if s[0] != exclude) + "</div>"


def faq(items) -> str:
    return '<div class="faq">' + "".join(
        f'<details class="rv"><summary>{q}</summary><div class="a">{"".join(f"<p>{fix_links(x)}</p>" for x in a)}</div></details>'
        for q, a in items) + "</div>"


def cta(title: str, text: str, mail_subject: str = "") -> str:
    first = (f'<a class="btn btn--lime btn--lg btn--magnet" href="mailto:{MAIL}?subject={mail_subject}">Initiativ bewerben {ARROW}</a>'
             if mail_subject else f'<a class="btn btn--lime btn--lg btn--magnet" href="/#kontakt">Termin anfragen {ARROW}</a>')
    return f"""<section class="section" style="padding-top:0"><div class="container"><div class="cta rv rv--s">
  <h2>{title}</h2><p>{text}</p>
  <div class="btns">{first}<a class="btn btn--ghost btn--lg" href="{TEL}">{icon('phone')} {PHONE}</a></div>
</div></div></section>"""


def town_xy(lat: float, lon: float, k: float = 22.0):
    """Ortskoordinaten → SVG. Bildmitte = Mitte der Orte, Maßstab k px/km."""
    dx = (lon - 8.5476) * 111.32 * math.cos(math.radians(49.32)) - 3.6
    dy = -(lat - 49.3218) * 111.32 + 2.9
    return 250 + dx * k, 250 + dy * k


def area_map(active: str = "") -> str:
    cx, cy = town_xy(49.3218, 8.5476)
    rings = "".join(f'<circle class="ring" cx="{cx:.0f}" cy="{cy:.0f}" r="{r * 22}"/>' for r in (5, 10, 15))
    lbls = (f'<text class="lbl" x="{cx:.0f}" y="{cy + 110 + 16:.0f}" text-anchor="middle">5 km</text>'
            f'<text class="lbl" x="{cx:.0f}" y="{cy - 220 - 7:.0f}" text-anchor="middle">10 km</text>')
    sweep = (f'<g class="sweep" style="transform-origin:{cx:.0f}px {cy:.0f}px"><path d="M{cx:.0f} {cy:.0f} L{cx:.0f} {cy - 340:.0f} '
             f'A340 340 0 0 1 {cx + 240:.0f} {cy - 240:.0f} Z" fill="url(#sw)"/></g>')
    out = []
    for slug, name, lat, lon, pos in TOWNS:
        x, y = town_xy(lat, lon)
        anchor, tx, ty = {"l": ("end", -12, 4), "r": ("start", 12, 4), "t": ("middle", 0, -13), "b": ("middle", 0, 22)}[pos]
        home = " home" if slug == "hockenheim" else ""
        hl = " hl" if slug == active else ""
        pulse = f'<circle class="pulse" cx="{x:.0f}" cy="{y:.0f}" r="6" fill="#80c53f"/>' if (home or hl) else ""
        r = 9 if home else 6
        out.append(f'<a class="town{home}{hl}" href="/physiotherapie-{slug}" data-town="{slug}" aria-label="Physiotherapie in {e(name)}">{pulse}'
                   f'<circle class="dot" cx="{x:.0f}" cy="{y:.0f}" r="{r}"/><text x="{x + tx:.0f}" y="{y + ty:.0f}" text-anchor="{anchor}">{e(name)}</text></a>')
    return f"""<div class="map rv rv--s"><svg viewBox="0 0 500 500" role="img" aria-label="Karte des Einsatzgebiets rund um Hockenheim">
<defs><linearGradient id="sw" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#46b2d0" stop-opacity="0"/><stop offset="1" stop-color="#46b2d0" stop-opacity=".28"/></linearGradient>
<clipPath id="mc"><circle cx="250" cy="250" r="240"/></clipPath></defs>
<circle class="ring ring--out" cx="250" cy="250" r="240"/><g clip-path="url(#mc)">{rings}{lbls}{sweep}</g>{''.join(out)}</svg></div>"""


def phero(h: dict, crumbs: list[tuple[str, str]], image: str | None, extra_btn: str = "") -> str:
    h1 = h.get("h1", "")
    z = h.get("h1_zusatz", "")
    title = e(strip_tags(h1))
    if not z and " im Hausbesuch" in strip_tags(h1):
        z = strip_tags(h1)[strip_tags(h1).index(" im Hausbesuch"):]
    if z and strip_tags(h1).endswith(strip_tags(z)):
        main = strip_tags(h1)[: -len(strip_tags(z))].strip()
        title = f'{e(main)}<span class="zus">{e(strip_tags(z))}</span>'
    cr = "".join(f'<a href="{u}">{e(t)}</a><span aria-hidden="true">›</span>' for u, t in crumbs[:-1])
    cr += f'<span aria-current="page">{e(crumbs[-1][1])}</span>'
    im = f'<div class="phero__img"><img data-px="-0.12" src="/assets/img/{image}.webp" alt="{e(h.get("alt", ""))}" fetchpriority="high"></div>' if image else ""
    sub = f'<p class="phero__sub fade-up" style="--d:.5s">{h["sub"]}</p>' if h.get("sub") else ""
    eyebrow = f'<p class="eyebrow fade-up" style="--d:.1s">{e(strip_tags(h["eyebrow"]))}</p>' if h.get("eyebrow") else ""
    btn = extra_btn or f'<a class="btn btn--lime btn--lg btn--magnet" href="/#kontakt">Termin vereinbaren {ARROW}</a>'
    plain = "" if image else " phero--plain"
    return f"""<section class="phero{plain}">{im}
  <div class="container">
    <nav class="crumbs fade-up" style="--d:0s" aria-label="Sie befinden sich hier">{cr}</nav>
    {eyebrow}
    <h1 class="fade-up" style="--d:.25s">{title}</h1>
    {sub}
    {'<div class="btns fade-up" style="--d:.7s">' + btn + f'<a class="btn btn--ghost btn--lg" href="{TEL}">{icon("phone")} Jetzt anrufen</a></div>' if image else ''}
  </div>
</section>"""


# ---------------------------------------------------------------- Inhalt in Abschnitte gliedern
def sections(blocks: list[dict]):
    """Teilt die Blöcke an jeder h2. Liefert (h2_html, blocks)."""
    out, cur = [], None
    for b in blocks:
        if b["t"] == "h2":
            cur = [b["html"], []]
            out.append(cur)
        elif cur is not None:
            cur[1].append(b)
    return out


def render_blocks(blocks: list[dict], page_slug: str) -> str:
    html_out, cases, n = [], [], 0

    def flush_cases():
        nonlocal cases
        if cases:
            html_out.append('<div class="cases">' + "".join(cases) + "</div>")
            cases = []

    i = 0
    while i < len(blocks):
        b = blocks[i]
        t = b["t"]
        if t == "h3":
            ps = []
            j = i + 1
            while j < len(blocks) and blocks[j]["t"] in ("p", "ul"):
                ps.append(blocks[j])
                j += 1
            if ps and all(x["t"] == "p" for x in ps) and len(ps) <= 3:
                n += 1
                body = "".join(f"<p>{fix_links(x['html'])}</p>" for x in ps)
                cases.append(f'<article class="case rv" style="--d:{(n % 3) * .08:.2f}s"><span class="num">{n:02d}</span><h3>{b["html"]}</h3>{body}</article>')
                i = j
                continue
            flush_cases()
            html_out.append(f'<h3 class="rv" style="margin-top:1.4em">{b["html"]}</h3>')
            if "Bestandteile" in b["html"]:
                html_out.extend(f"<p>{fix_links(x['html'])}</p>" for x in ps)
                html_out.append(mini_svcs(page_slug))
                i = j
                continue
        elif t == "p":
            flush_cases()
            html_out.append(f'<p class="rv">{fix_links(b["html"])}</p>')
        elif t in ("ul", "ol"):
            flush_cases()
            html_out.append('<ul class="grid-list">' + "".join(f'<li class="rv" style="--d:{(k % 4) * .05:.2f}s">{fix_links(x)}</li>' for k, x in enumerate(b["items"])) + "</ul>")
        elif t == "img":
            flush_cases()
            name = Path(b["src"]).stem
            html_out.append(f'<figure class="figure clip">{img(name, b.get("alt", ""))}</figure>')
        elif t == "quote":
            flush_cases()
            html_out.append(f'<p class="quote rv">{b["html"]}</p>')
        i += 1
    flush_cases()
    return "".join(html_out)


def split_special(blocks):
    """Trennt Kurzüberblick, FAQ und Abschluss-CTA vom Fließtext."""
    glance, faqs, cta_block, body = [], [], None, []
    secs = sections(blocks)
    for h2, bl in secs:
        txt = strip_tags(h2)
        if txt == "Auf einen Blick":
            glance = next((b["items"] for b in bl if b["t"] == "ul"), [])
        elif txt.startswith("Inhalt dieser Seite"):
            continue
        elif txt == "Gut zu wissen":
            faqs = [(b["q"], b["a"]) for b in bl if b["t"] == "faq"]
        elif txt.startswith("Jetzt Termin") or txt == "Initiativ bewerben":
            cta_block = (h2, [b["html"] for b in bl if b["t"] == "p"])
        else:
            body.append((h2, [b for b in bl if b["t"] != "eyebrow"]))
    return glance, faqs, cta_block, body


def glance_html(items) -> str:
    if not items:
        return ""
    pills = "".join(f'<span class="pill rv" style="--d:{k * .05:.2f}s">{e(strip_tags(x))}</span>' for k, x in enumerate(items))
    return f'<div class="glance"><div class="container"><div class="glance__in"><strong>Auf einen Blick</strong>{pills}</div></div></div>'


def faq_section(faqs) -> str:
    if not faqs:
        return ""
    return f"""<section class="section section--paper"><div class="container">
  <div class="head center"><p class="eyebrow rv">Häufige Fragen</p><h2 class="rv" style="--d:.1s">Gut zu <em>wissen</em></h2></div>
  {faq(faqs)}</div></section>"""


# ---------------------------------------------------------------- Seitentypen
def service_page(slug: str) -> str:
    d = PAGES[slug]
    s = SVC[slug]
    glance, faqs, ctab, body = split_special(d["blocks"])
    secs, toc = [], []
    for h2, bl in body:
        sid = slugify(h2)
        toc.append(f'<li><a href="#{sid}">{e(strip_tags(h2))}</a></li>')
        secs.append(f'<section id="{sid}"><h2 class="rv">{h2}</h2>{render_blocks(bl, slug)}</section>')
    more = [x for x in SERVICES if x[0] != slug][:3] if slug != SERVICES[0][0] else SERVICES[1:4]
    if slug != SERVICES[0][0]:
        more = [SERVICES[0]] + [x for x in SERVICES[1:] if x[0] != slug][:2]
    more_html = "".join(svc_card(x) for x in more)
    cta_title = "Jetzt <em>Termin</em> vereinbaren"
    cta_text = " ".join(strip_tags(p) for p in (ctab[1] if ctab else []))[:400] or "Rufen Sie an oder schreiben Sie. Ich melde mich persönlich zurück."
    crumbs = [("/", "Startseite"), ("/#leistungen", "Leistungen"), ("", s[1])]
    if slug == SERVICES[0][0]:
        crumbs = [("/", "Startseite"), ("", "Geriatrische Physiotherapie")]
    body_html = f"""{phero(d['hero'], crumbs, Path(d['hero']['img']).stem)}
{glance_html(glance)}
<section class="section"><div class="container doc">
  <aside class="toc" aria-label="Inhalt dieser Seite"><b>Auf dieser Seite</b><ol>{''.join(toc)}</ol>
    <a class="btn" href="/#kontakt">Termin anfragen {ARROW}</a></aside>
  <div class="prose">{''.join(secs)}</div>
</div></section>
{faq_section(faqs)}
<section class="section"><div class="container">
  <div class="head"><p class="eyebrow rv">Weitere Leistungen</p><h2 class="rv">Oft sinnvoll <em>kombiniert</em></h2></div>
  <div class="more">{more_html}</div>
</div></section>
{cta(cta_title, e(cta_text))}"""
    return page(d["title"], d["description"], f"/{slug}", body_html, current="leistungen", noindex=d["noindex"])


def town_page(t) -> str:
    slug, name = t[0], t[1]
    key = f"physiotherapie-{slug}"
    d = PAGES[key]
    glance, faqs, ctab, body = split_special(d["blocks"])
    prose = []
    for h2, bl in body:
        if strip_tags(h2).startswith("Unsere Leistungen"):
            continue
        else:
            prose.append(f'<section><h2 class="rv">{h2}</h2>{render_blocks(bl, key)}</section>')
    cta_text = " ".join(strip_tags(p) for p in (ctab[1] if ctab else []))
    crumbs = [("/", "Startseite"), ("/#einsatzgebiet", "Einsatzgebiet"), ("", name)]
    body_html = f"""{phero(d['hero'], crumbs, 'hero-hausbesuch')}
<section class="section"><div class="container area">
  <div class="prose">{prose[0]}</div>
  {area_map(slug)}
</div></section>
<section class="section section--paper"><div class="container">
  <div class="head"><p class="eyebrow rv">Leistungen in {e(name)}</p><h2 class="rv">Was ich bei Ihnen <em>zu Hause</em> anbiete</h2></div>
  <div class="services">{''.join(svc_card(x, sp, "Mein Schwerpunkt" if i == 0 else "", small=sp < 7) for i, (x, sp) in enumerate(zip(SERVICES, SPANS)))}</div>
</div></section>
{cta(f'Mobile Physiotherapie in <em>{e(name)}</em>', e(cta_text))}"""
    return page(d["title"], d["description"], f"/{key}", body_html, current="gebiet", noindex=d["noindex"])


def career_page() -> str:
    d = PAGES["karriere"]
    glance, faqs, ctab, body = split_special(d["blocks"])
    secs = "".join(f'<section><h2 class="rv">{h2}</h2>{render_blocks(bl, "karriere")}</section>' for h2, bl in body)
    btn = f'<a class="btn btn--lime btn--lg btn--magnet" href="mailto:{MAIL}?subject=Initiativbewerbung">Initiativ bewerben {ARROW}</a>'
    crumbs = [("/", "Startseite"), ("", "Karriere")]
    cta_text = " ".join(strip_tags(p) for p in (ctab[1] if ctab else []))
    body_html = f"""{phero(d['hero'], crumbs, 'ramon', btn)}
<section class="section"><div class="container" style="max-width:980px"><div class="prose">{secs}</div></div></section>
{cta('Initiativ <em>bewerben</em>', e(cta_text), 'Initiativbewerbung')}"""
    return page(d["title"], d["description"], "/karriere", body_html, current="karriere", noindex=d["noindex"])


def legal_page(slug: str) -> str:
    d = PAGES[slug]
    parts = []
    for b in d["blocks"]:
        if b["t"] == "h1":
            continue
        if b["t"] == "h2":
            parts.append(f"<h2>{b['html']}</h2>")
        elif b["t"] == "h3":
            parts.append(f"<h3>{b['html']}</h3>")
        elif b["t"] == "p":
            parts.append(f"<p>{fix_links(b['html'])}</p>")
        elif b["t"] in ("ul", "ol"):
            parts.append("<ul>" + "".join(f"<li>{fix_links(x)}</li>" for x in b["items"]) + "</ul>")
    h1 = next((strip_tags(b["html"]) for b in d["blocks"] if b["t"] == "h1"), slug.title())
    hero = {"h1": h1}
    body_html = f"""{phero(hero, [("/", "Startseite"), ("", h1)], None)}
<section class="section"><div class="container"><div class="legal">{''.join(parts)}</div></div></section>"""
    return page(d["title"], d["description"], f"/{slug}", body_html, noindex=True)


# ---------------------------------------------------------------- Startseite
def home() -> str:
    d = PAGES["index"]
    faqs = [(b["q"], b["a"]) for b in d["blocks"] if b["t"] == "faq"]

    def words(text: str, start: int = 0) -> str:
        out = []
        for k, w in enumerate(text.split(" ")):
            em = w.startswith("*")
            w = w.strip("*")
            inner = f"<em>{w}</em>" if em else w
            out.append(f'<span class="word"><span style="--i:{start + k}">{inner}</span></span>')
        return " ".join(out)

    cards = "".join(svc_card(s, sp, "Mein Schwerpunkt" if i == 0 else "", small=sp < 7) for i, (s, sp) in enumerate(zip(SERVICES, SPANS)))
    marquee = "".join(f"<span>{e(s[2])}</span>" for s in SERVICES)
    steps = [
        ("Kontakt", "Anrufen oder Formular, ganz unverbindlich."),
        ("Telefonat", "Wir klären Beschwerden, Fragen und die passende Behandlung."),
        ("Termin", "Wir finden einen Termin, der in Ihren Alltag passt."),
        ("Erster Besuch", "Zeit für Anamnese, Befund und Ihre Therapieziele."),
        ("Therapie", "Behandlung ab Tag eins, regelmäßig an Ihre Fortschritte angepasst."),
    ]
    steps_html = "".join(f'<div class="step rv" style="--d:{k * .08:.2f}s"><div class="step__n">{k + 1}</div><div><h3>{t}</h3><p>{x}</p></div></div>' for k, (t, x) in enumerate(steps))
    towns = "".join(f'<li><a href="/physiotherapie-{t[0]}" data-town="{t[0]}">{e(t[1])}</a></li>' for t in TOWNS)

    body = f"""
<section class="hero" aria-label="Willkommen">
  <div class="hero__glow hero__glow--1" data-depth="-30"></div><div class="hero__glow hero__glow--2" data-depth="30"></div><div class="hero__glow hero__glow--3" data-depth="50"></div>
  <div class="hero__grain"></div>
  <svg class="waves" viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden="true"><g>
    <path d="M-100 300C200 200 400 380 700 290S1200 120 1700 230" stroke="#46b2d0" stroke-opacity=".55" stroke-width="2"/>
    <path d="M-100 330C220 240 420 400 720 320S1220 160 1700 270" stroke="#80c53f" stroke-opacity=".45" stroke-width="2"/>
    <path d="M-100 360C240 280 440 420 740 350S1240 200 1700 310" stroke="#ffffff" stroke-opacity=".18" stroke-width="1.5"/>
    <path d="M-100 385C260 320 460 440 760 380S1260 240 1700 350" stroke="#46b2d0" stroke-opacity=".25" stroke-width="1"/>
  </g></svg>
  <div class="container hero__grid">
    <div>
      <p class="hero__badge fade-up" style="--d:.05s"><i></i><span>Hausbesuche · Hockenheim · Heidelberg &amp; Umgebung</span></p>
      <h1>{words("Physiotherapie, die zu *Ihnen* nach Hause kommt.")}</h1>
      <p class="hero__sub fade-up" style="--d:.8s">60 Minuten Zeit pro Termin. Keine Anfahrt, kein Wartezimmer. Für Privatpatienten, Beihilfeberechtigte &amp; Selbstzahler.</p>
      <div class="btns fade-up" style="--d:1s">
        <a class="btn btn--lime btn--lg btn--magnet" href="#kontakt">Termin anfragen {ARROW}</a>
        <a class="btn btn--ghost btn--lg" href="{TEL}">{icon('phone')} {PHONE}</a>
      </div>
      <div class="hero__facts fade-up" style="--d:1.2s">
        <span>{icon('clock')} Mo bis Fr ab 8, Sa ab 9 Uhr</span><span>{icon('badge')} Staatlich anerkannt</span><span>{icon('pin')} ca. 30 km um Hockenheim</span>
      </div>
    </div>
    <div class="hero__visual" data-depth="-14">
      <div class="hero__ring"></div><div class="hero__ring hero__ring--2"></div>
      <div class="hero__arch">{img('hero-hausbesuch', 'Physiotherapeut Ramon Oehlke hilft einer älteren Patientin im Wohnzimmer beim Aufstehen', eager=True)}</div>
      <div class="chip chip--1 float" data-depth="22"><span class="ico">{icon('clock')}</span><span><b>60 Min</b><small>pro Hausbesuch</small></span></div>
      <div class="chip chip--2 float" data-depth="32" style="animation-delay:1.45s,2.8s"><span class="ico">{icon('heart')}</span><span><b>Geriatrie</b><small>mein Schwerpunkt</small></span></div>
      <div class="chip chip--3 float" data-depth="18" style="animation-delay:1.7s,3.2s"><span class="ico">{icon('home')}</span><span><b>Zu Hause</b><small>in Ihrem Umfeld</small></span></div>
    </div>
  </div>
  <a class="scroll-hint" href="#ueber-mich" aria-label="Weiter nach unten"></a>
</section>
<div class="cursor" aria-hidden="true"></div>
<div class="marquee" aria-hidden="true"><div class="marquee__track">{marquee}{marquee}</div></div>

<section class="section" id="ueber-mich">
  <div class="container">
    <div class="about">
      <div class="about__media rv rv--l">
        <div class="about__deco"></div>
        <div class="about__img">{img('ramon', 'Ramon Oehlke, staatlich anerkannter Physiotherapeut', attrs=' data-px="-0.08"')}</div>
        <div class="about__sig"><b>Ramon Oehlke</b><small>Staatl. anerkannter Physiotherapeut</small></div>
      </div>
      <div>
        <p class="eyebrow rv">Über mich</p>
        <h2 class="rv" style="--d:.05s">Ihre Therapie in besten Händen, <em>zu Hause</em></h2>
        <p class="quote rv" style="--d:.1s">Ich nehme mir bewusst Zeit, ohne Hektik, ganz in Ruhe in Ihrem gewohnten Umfeld.</p>
        <p class="lead rv" style="--d:.15s">Mein Ziel: dass Sie möglichst lange selbstständig und sicher in Ihrem eigenen Zuhause bleiben können.</p>
        <ul class="checks">
          <li class="rv" style="--d:.2s">Staatlich anerkannter Physiotherapeut</li>
          <li class="rv" style="--d:.25s">Klinische Erfahrung an der BG Klinik Ludwigshafen</li>
          <li class="rv" style="--d:.3s">Spezialisiert auf Physiotherapie im häuslichen Umfeld</li>
        </ul>
      </div>
    </div>
    <div class="stats">
      <div class="stat rv"><b><span data-count="60">60</span><small>Min</small></b><p>volle Zeit pro Hausbesuch, ohne Hektik</p></div>
      <div class="stat rv" style="--d:.1s"><b><span data-count="30">30</span><small>km</small></b><p>Einsatzradius rund um Hockenheim</p></div>
      <div class="stat rv" style="--d:.2s"><b><span data-count="6">6</span><small>Tage</small></b><p>Mo bis Sa persönlich für Sie erreichbar</p></div>
    </div>
  </div>
</section>

<section class="section section--paper" id="leistungen">
  <div class="container">
    <div class="head"><p class="eyebrow rv">Leistungen</p><h2 class="rv">Behandlung, die zu Ihrem <em>Alltag</em> passt</h2>
      <p class="lead rv">Jede Behandlung wird individuell auf Ihre Ziele abgestimmt.</p></div>
    <div class="services">{cards}</div>
  </div>
</section>

<section class="section section--dark" id="schwerpunkt">
  <div class="container focus">
    <div class="focus__stack">
      <figure class="f1 clip">{img('geriatrie-gangtraining', 'Gangtraining mit Rollator in der Wohnung', small=True, attrs=' data-px="-0.06"')}</figure>
      <figure class="f2 clip" style="transition-delay:.2s">{img('geriatrie-aufstehen', 'Sicheres Aufstehen aus dem Sessel üben', small=True)}</figure>
      <div class="focus__badge rv rv--s" style="--d:.4s"><svg class="spin" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="c" d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1-76 0"/></defs><text font-size="8.6" font-weight="600" letter-spacing="2.4" fill="#081429"><textPath href="#c">SCHRITT FÜR SCHRITT · IN IHREM TEMPO ·</textPath></text></svg><span><b>{icon('walk', 2.2).replace('<svg', '<svg width="34" height="34"')}</b></span></div>
    </div>
    <div>
      <p class="eyebrow rv">Mein Schwerpunkt · Geriatrie</p>
      <h2 class="rv" style="--d:.05s">Wieder mobil werden, <em>Schritt für Schritt</em></h2>
      <p class="lead rv" style="--d:.1s">Menschen wieder in Bewegung bringen: aufstehen, gehen, den Alltag selbst meistern. Gemeinsam, in Ihrem Tempo.</p>
      <ul class="checks">
        <li class="rv" style="--d:.15s">Aufstehen, Gehen &amp; Treppen sicher üben</li>
        <li class="rv" style="--d:.2s">Kraft, Gleichgewicht &amp; Selbstvertrauen</li>
        <li class="rv" style="--d:.25s">Mehr Selbstständigkeit im eigenen Zuhause</li>
      </ul>
      <div class="btns rv" style="--d:.3s;margin-top:36px"><a class="btn btn--lime btn--lg btn--magnet" href="/geriatrische-physiotherapie-hausbesuch">Mehr zum Schwerpunkt {ARROW}</a><a class="btn btn--ghost btn--lg" href="#kontakt">Termin anfragen</a></div>
    </div>
  </div>
</section>

<section class="section" id="ablauf">
  <div class="container">
    <div class="head center"><p class="eyebrow rv">So läuft's ab</p><h2 class="rv">In fünf Schritten zur <em>Therapie zu Hause</em></h2></div>
    <div class="steps"><div class="steps__line"><i></i></div>{steps_html}</div>
    <p class="center rv" style="margin-top:50px;color:var(--ink-mute)">Ihre persönlichen Ziele und Ihre Selbstständigkeit stehen immer im Mittelpunkt.</p>
  </div>
</section>

<section class="section section--paper" id="einsatzgebiet">
  <div class="container area">
    {area_map()}
    <div>
      <p class="eyebrow rv">Einsatzgebiet</p>
      <h2 class="rv">Ich komme <em>zu Ihnen.</em></h2>
      <p class="lead rv">Im Umkreis von ca. 30 km rund um Hockenheim, unter anderem hier:</p>
      <ul class="towns rv">{towns}</ul>
      <p class="rv" style="color:var(--ink-mute)">Ihr Ort ist nicht dabei? Fragen Sie einfach, oft lässt sich das einrichten.</p>
      <div class="btns rv"><a class="btn btn--magnet" href="#kontakt">Termin anfragen {ARROW}</a></div>
    </div>
  </div>
</section>

<section class="section" id="faq">
  <div class="container">
    <div class="head center"><p class="eyebrow rv">Häufige Fragen</p><h2 class="rv">Gut zu <em>wissen</em></h2></div>
    {faq(faqs)}
  </div>
</section>

<section class="section section--dark" id="kontakt">
  <div class="container contact">
    <div class="on-dark">
      <p class="eyebrow rv">Kontakt &amp; Termin</p>
      <h2 class="rv">Lassen Sie uns ins <em>Gespräch</em> kommen.</h2>
      <p class="lead rv">Rufen Sie an oder schreiben Sie. Ich melde mich in der Regel innerhalb von 24 Stunden persönlich zurück.</p>
      <div class="cards">
        <a class="ccard rv" href="{TEL}"><span class="ico">{icon('phone')}</span><span><small>Anrufen</small><b>{PHONE}</b></span></a>
        <a class="ccard rv" style="--d:.05s" href="{WA}" target="_blank" rel="noopener"><span class="ico">{icon('wa')}</span><span><small>WhatsApp</small><b>Nachricht schreiben</b></span></a>
        <a class="ccard rv" style="--d:.1s" href="mailto:{MAIL}"><span class="ico">{icon('mail')}</span><span><small>E-Mail</small><b>{MAIL}</b></span></a>
      </div>
      <div class="hours rv"><b>Mo bis Fr</b><span>08:00 bis 18:00 Uhr</span><b>Samstag</b><span>09:00 bis 15:00 Uhr</span><b>Sonntag</b><span>Ruhetag</span></div>
    </div>
    <form class="form rv rv--r" id="terminForm" novalidate>
      <div class="form__body">
        <h3>Termin anfragen</h3>
        <p style="color:var(--ink-mute);margin-bottom:24px">Unverbindlich. Ich rufe Sie zurück.</p>
        <div class="f-grid">
          <div class="field"><input id="f-name" name="name" placeholder=" " autocomplete="name" required><label for="f-name">Name *</label></div>
          <div class="field"><input id="f-tel" name="tel" type="tel" placeholder=" " autocomplete="tel" required><label for="f-tel">Telefon *</label></div>
          <div class="field field--full"><input id="f-mail" name="email" type="email" placeholder=" " autocomplete="email"><label for="f-mail">E-Mail (optional)</label></div>
          <fieldset class="seg field--full"><legend>Sie sind …</legend>
            <input type="radio" name="art" id="a1" value="Privatpatient"><label for="a1">Privatpatient</label>
            <input type="radio" name="art" id="a2" value="Beihilfeberechtigt"><label for="a2">Beihilfeberechtigt</label>
            <input type="radio" name="art" id="a3" value="Selbstzahler"><label for="a3">Selbstzahler</label>
          </fieldset>
          <div class="field field--full"><textarea id="f-msg" name="msg" placeholder=" "></textarea><label for="f-msg">Ihre Nachricht</label></div>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <label class="consent field--full"><input type="checkbox" name="consent" required><span>Ich bin damit einverstanden, dass meine Angaben, auch freiwillige Angaben zu Beschwerden, zur Bearbeitung meiner Anfrage verarbeitet werden. Hinweise in der <a href="/datenschutz">Datenschutzerklärung</a>. *</span></label>
          <p class="form__status field--full" role="status" aria-live="polite"></p>
          <div class="field--full"><button class="btn btn--lg btn--magnet" type="submit">Anfrage senden {ARROW}</button></div>
        </div>
      </div>
      <div class="form__ok" role="status"><div class="ico">{icon('check', 3)}</div><h3>Vielen Dank!</h3><p style="color:var(--ink-mute)">Ihr Mailprogramm öffnet sich mit der vorbereiteten Nachricht. Bitte dort noch absenden.<br>Ich melde mich schnellstmöglich persönlich zurück.</p></div>
    </form>
  </div>
</section>"""
    return page(d["title"], d["description"], "/", body)


# ---------------------------------------------------------------- Bauen
def main() -> None:
    files = {"index.html": home(), "karriere.html": career_page()}
    for s in SERVICES:
        files[f"{s[0]}.html"] = service_page(s[0])
    for t in TOWNS:
        files[f"physiotherapie-{t[0]}.html"] = town_page(t)
    for slug in ("impressum", "datenschutz", "agb"):
        files[f"{slug}.html"] = legal_page(slug)
    files["404.html"] = page("Seite nicht gefunden · Mobile Physiotherapie Oehlke", "", "/404",
                             phero({"h1": "Diese Seite gibt es nicht (mehr).", "sub": ""}, [("/", "Startseite"), ("", "404")], None)
                             + cta("Zurück zur <em>Startseite</em>?", "Oder rufen Sie direkt an. Ich helfe gern weiter."), noindex=True)
    for name, content in files.items():
        (OUT / name).write_text(content, encoding="utf-8")
    robots = "User-agent: *\nDisallow: /\n" if DEMO else f"User-agent: *\nAllow: /\n\nSitemap: {LIVE_URL}/sitemap.xml\n"
    (OUT / "robots.txt").write_text(robots, encoding="utf-8")
    urls = [n[:-5] for n in files if n != "404.html" and not PAGES.get(n[:-5], {}).get("noindex")]
    sm = "".join(f"<url><loc>{LIVE_URL}/{'' if u == 'index' else u}</loc></url>" for u in sorted(urls))
    (OUT / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sm}</urlset>\n', encoding="utf-8")
    print(f"{len(files)} Seiten nach {OUT} geschrieben")


if __name__ == "__main__":
    main()
