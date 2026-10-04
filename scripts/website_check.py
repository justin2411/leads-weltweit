"""Website-Check der eigenen Seite (Inhaber 04.10.2026: „die website als themenfeld … schauen das man dort auch immer
alles sauber macht“). Kostenlos, eigener Code, nur die eigene Domain (SITE_URL, Standard https://www.nextgen-profit.de),
höflich: eine Anfrage nach der anderen mit Pause, eigener User-Agent, keine fremden Seiten.

Geprüft: Startseiten (/, /fr, /de), alle Live-Landingpages aus der Datenbank, Rechtstexte, /api/health, eine
absichtlich falsche Adresse (404-Seite) und die internen Links der geprüften Seiten (höchstens MAX_LINKS).
Bereiche (Punkte 0–100, im Dashboard als Ringe): erreichbar, fehler, tempo, handy, recht, formulare, texte.
Ergebnis in signalwerk.website_checks (scores je Bereich, kurze Funde). Sendet nichts, ändert nichts an der Seite.

Lösungsvorschlag je Fund (Inhaber 04.10.2026: „direkt mit lösungsvorschlägen, jarvis soll das aber eigentlich alles selber
machen“): jeder Fund trägt `key` (Bereich:Art:Pfad, stabil über Läufe) und `vorschlag` {text, alt, neu, auto} –
regelbasiert (gekürzter Titel, Überschrift ohne Komma, Gedankenstrich ersetzt), sonst kurz „was zu tun ist“.
`auto = false` bei Rechtstexten, Preisen, Infrastruktur (Variablen, Server) und Hinweisen: nur melden.
Danach (mit Datenbank): erledigte Website-Fixes als behoben markieren und den Auto-Fix anstoßen
(scripts/website_agents.py `autofix`, Schalter owner_settings.website_autofix).

  python scripts/website_check.py              # prüfen und speichern
  python scripts/website_check.py --dry-run    # nur prüfen und anzeigen
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable
from urllib.parse import urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))

DEFAULT_SITE = "https://www.nextgen-profit.de"
ALLOWED_HOSTS = {"www.nextgen-profit.de", "nextgen-profit.de"}
UA = "NextGenProfit-Website-Check/1.0 (+https://www.nextgen-profit.de; eigener Check)"
PAUSE_S = 1.0          # Pause zwischen zwei Anfragen
TIMEOUT_S = 20
MAX_LINKS = 40         # interne Links zusätzlich prüfen (HEAD), je Lauf
BASE_PAGES = ["/", "/fr", "/de"]
LEGAL_PAGES = ["/impressum", "/datenschutz", "/agb", "/privacy", "/terms", "/mentions-legales", "/confidentialite", "/cgv"]
HEALTH = "/api/health"
MISSING = "/website-check-gibt-es-nicht"
SKIP_PREFIX = ("/api/", "/dashboard", "/kunde", "/login", "/_next/", "/danke")

AREAS = ["erreichbar", "fehler", "tempo", "handy", "recht", "formulare", "texte"]
LABEL = {"erreichbar": "Erreichbarkeit", "fehler": "Fehler & 404", "tempo": "Tempo", "handy": "Handy",
         "recht": "Rechtstexte", "formulare": "Formulare", "texte": "Texte"}
WEIGHT = {"rot": 1.0, "gelb": 0.35, "info": 0.0}

SLOW_MS, VERY_SLOW_MS = 2500, 6000
BIG_KB, VERY_BIG_KB = 900, 2500
TITLE_MAX, DESC_MIN, DESC_MAX = 60, 50, 170   # Titel ≤ 60 (wie app/lib/site.ts TITLE_MAX)
PLACEHOLDER_RX = re.compile(r"PLATZHALTER|[Ll]orem ipsum|\[(?:Name|Adresse|Firma|Datum|Ort|Vorname)\]|\bTODO\b")
DASH_RX = re.compile(r"[–—]")
HEAD_PUNCT_RX = re.compile(r"[.,:;!]\s*$|[,;:]")


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# --------------------------------------------------------------------------------------------- HTML lesen
class _Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.desc: str | None = None
        self.viewport: str | None = None
        self.links: list[str] = []
        self.forms: list[str] = []
        self.heads: list[str] = []
        self._in_title = False
        self._head: list[str] | None = None
        self._skip = 0
        self.text: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            name = a.get("name", "").lower()
            if name == "description":
                self.desc = a.get("content", "")
            elif name == "viewport":
                self.viewport = a.get("content", "")
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag == "form":
            self.forms.append(f"{a.get('action', '')} {a.get('class', '')}".strip())
        elif tag in ("h1", "h2"):
            self._head = []
        elif tag in ("script", "style", "noscript", "svg"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag in ("h1", "h2") and self._head is not None:
            t = re.sub(r"\s+", " ", "".join(self._head)).strip()
            if t:
                self.heads.append(t)
            self._head = None
        elif tag in ("script", "style", "noscript", "svg") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._skip:
            return
        if self._head is not None:
            self._head.append(data)
        self.text.append(data)


def parse(html: str) -> _Page:
    p = _Page()
    try:
        p.feed(html or "")
        p.close()
    except Exception:  # kaputtes HTML: was gelesen wurde, zählt
        pass
    p.title = re.sub(r"\s+", " ", p.title).strip()
    return p


def internal_links(page: _Page, base: str, host: str) -> list[str]:
    """Interne Pfade (gleicher Host), ohne Anker/Abfrage, ohne geschützte/technische Bereiche."""
    out = []
    for href in page.links:
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        u = urlsplit(urljoin(base, href))
        if u.scheme not in ("http", "https") or u.hostname not in ({host} | ALLOWED_HOSTS):
            continue
        path = u.path or "/"
        if path.startswith(SKIP_PREFIX) or re.search(r"\.(pdf|png|jpe?g|svg|webp|mp4|ico|xml|txt)$", path, re.I):
            continue
        if path not in out:
            out.append(path)
    return out


# --------------------------------------------------------------------------------------------- Bewertung
def finding(area: str, level: str, text: str, path: str | None = None, art: str = "allgemein",
            alt: str | None = None) -> dict:
    """Ein Fund mit stabilem Schlüssel und Lösungsvorschlag. alt = betroffener Text (Titel, Überschrift, Ausschnitt)."""
    f = {"bereich": area, "stufe": level, "text": text[:160]}
    if path:
        f["pfad"] = path[:200]
    f["key"] = finding_key(area, art, path)
    f["vorschlag"] = suggest(area, art, level, path, alt)
    return f


def finding_key(area: str, art: str, path: str | None) -> str:
    """Stabil über Läufe (ohne Zahlen aus dem Text): gleicher Fund = gleicher Schlüssel (app/lib/website.ts findingKey)."""
    return f"{area}:{art}:{(path or '')[:200]}"


# --------------------------------------------------------------------------------------------- Lösungsvorschläge
BRAND = "NextGen Profit"
PRICE_RX = re.compile(r"[€£$]\s?\d|\d\s?[€£$]|\d\s?(?:EUR|GBP|USD)\b|\b(?:price|prix|preis|pricing|tarif)", re.I)
CONJ = {"en": ("but", "and", "or", "so"), "fr": ("mais", "et", "ou", "donc"), "de": ("aber", "und", "oder", "doch")}
AND = {"en": "and", "fr": "et", "de": "und"}
# Nebensatz/Anschluss nach dem Komma: nicht mit „und“ verbinden, sondern umformulieren
SUBCLAUSE = {"en": ("that", "which", "who", "when", "where", "while", "at", "if", "because"),
             "fr": ("qui", "que", "où", "quand", "au", "à", "lorsque", "si", "parce", "dont"),
             "de": ("die", "der", "das", "wenn", "dass", "weil", "wo", "was", "ob", "als", "damit")}
FILLERS = [(r"\s*\([^)]*\)", ""), (r"\bpartout en France\b", "en France"), (r"\s+(?:still|encore|genau)\b", ""),
           (r",\s*", " ")]
STOP_END = re.compile(r"\s+(?:a|an|the|and|or|of|to|for|at|in|un|une|des|de|du|la|le|les|et|ou|à|en|der|die|das|und|oder|für|im|in|that|which|who|qui|que|dass)$", re.I)
GENERIC = {
    ("texte", "titel_fehlt"): "Seitentitel ergänzen, höchstens 60 Zeichen",
    ("texte", "beschreibung_fehlt"): "Beschreibung mit 50 bis 170 Zeichen ergänzen",
    ("texte", "beschreibung"): "Beschreibung auf 50 bis 170 Zeichen bringen",
    ("texte", "platzhalter"): "Platzhalter durch echten Text ersetzen",
    ("tempo", "langsam"): "Seite schneller machen: Daten zwischenspeichern, große Teile später laden",
    ("tempo", "gross"): "Seite verkleinern: Bilder, Skripte und eingebettete Daten kürzen",
    ("handy", "viewport"): "Viewport width=device-width im Seitenkopf ergänzen",
    ("formulare", "formular"): "Probe-Formular wieder einbauen",
    ("formulare", "keine_landing"): "Mindestens eine Landingpage live schalten",
    ("fehler", "fehlt"): "Seite wiederherstellen oder Weiterleitung einrichten",
    ("fehler", "link"): "Link korrigieren oder entfernen",
    ("fehler", "404seite"): "Unbekannte Adressen mit Status 404 beantworten",
    ("erreichbar", "offline"): "Erreichbarkeit und letztes Deployment prüfen",
    ("erreichbar", "server"): "Serverfehler in den Vercel-Logs suchen und beheben",
    ("erreichbar", "diagnose"): "Diagnose /api/health reparieren",
    ("erreichbar", "variable"): "Variable in Vercel anlegen, Wert vom Inhaber",
    ("recht", "platzhalter"): "Rechtstext vervollständigen, nur durch den Inhaber",
    ("recht", "kurz"): "Rechtstext prüfen, nur durch den Inhaber",
}
NO_AUTO_ARTS = {"variable", "offline", "server", "diagnose", "keine_landing"}


def lang_of(path: str | None) -> str:
    first = (path or "/").strip("/").split("/")[0]
    return first if first in ("fr", "de") else "en"


def _clip(text: str, n: int = 160) -> str:
    return " ".join(str(text or "").split())[:n]


def short_title(title: str, brand: str = BRAND, max_len: int = TITLE_MAX) -> str:
    """Titel ≤ max_len: Marke weglassen, wenn es sonst nicht passt (wie app/lib/site.ts fitTitle); ist der Text allein
    zu lang, erst Klammern/Füllwörter/Kommas weg, dann an einer Wortgrenze kürzen (ohne Stoppwort am Ende)."""
    t = " ".join(str(title or "").split())
    if len(t) <= max_len:
        return t
    parts = [p.strip() for p in t.split(" | ")]
    main = " | ".join(p for p in parts if p != brand) or t
    if len(main) <= max_len:
        return main
    for rx, rep in FILLERS:
        main = " ".join(re.sub(rx, rep, main).split())
        if len(main) <= max_len:
            return main
    cut = main[:max_len - 1]
    if " " in cut:
        cut = cut[:cut.rfind(" ")]
    cut = cut.rstrip(" ,;:.–—-")
    while STOP_END.search(cut):
        cut = STOP_END.sub("", cut)
    return cut + "…"


def fix_heading(head: str, lang: str = "en") -> str:
    """Überschrift ohne Satzzeichen: Satzzeichen am Ende weg; genau ein Komma vor einem Hauptsatz-Teil → „und“/„and“/
    „et“; sonst Kommas, Semikolons und Doppelpunkte entfernen (dann ggf. noch umformulieren)."""
    h = " ".join(str(head or "").split())
    h = re.sub(r"[.,:;!]+$", "", h).strip()
    parts = [p.strip() for p in re.split(r"\s*[,;]\s*", h)]
    if len(parts) == 2 and parts[1]:
        first = parts[1].split()[0].lower()
        if first not in SUBCLAUSE.get(lang, ()) and first not in CONJ.get(lang, ()):
            return f"{parts[0]} {AND.get(lang, 'and')} {parts[1]}"
    h = re.sub(r"\s*[,;]\s*", " ", h)
    return re.sub(r"\s*:\s*", " ", h).strip()


def fix_dash(snippet: str, lang: str = "en") -> str:
    """Gedankenstrich ersetzen: vor „but/mais/aber …“ einfach weglassen, sonst Komma (wie nd() in landing.tsx)."""
    conj = CONJ.get(lang, CONJ["en"])

    def rep(m: re.Match) -> str:
        nxt = m.group(1)
        return f" {nxt}" if nxt.lower() in conj else f", {nxt}"
    out = re.sub(r"\s*[–—]\s*(\w+)", rep, " ".join(str(snippet or "").split()))
    return re.sub(r"\s*[–—]\s*", ", ", out).strip(" ,")


def dash_context(text: str) -> str | None:
    """Kurzer Ausschnitt um den ersten Gedankenstrich (höchstens 4 Wörter davor und danach)."""
    t = " ".join(text.split())
    m = DASH_RX.search(t)
    if not m:
        return None
    before = t[:m.start()].split()[-4:]
    after = t[m.end():].split()[:4]
    return " ".join(before + [m.group(0)] + after)


def suggest(area: str, art: str, level: str, path: str | None, alt: str | None = None) -> dict:
    """Lösungsvorschlag: {text (eine Zeile), alt, neu, auto}. auto = darf JARVIS ohne Inhaber beheben."""
    lang = lang_of(path)
    neu = None
    if area == "texte" and art == "titel" and alt:
        neu = short_title(alt)
        text = f"Titel kürzen auf ≤ {TITLE_MAX} Zeichen"
    elif area == "texte" and art == "ueberschrift" and alt:
        neu = fix_heading(alt, lang)
        joined = f" {AND.get(lang, 'and')} " in neu and f" {AND.get(lang, 'and')} " not in alt
        simple = joined or not re.search(r"[,;:]", re.sub(r"[.,:;!]+\s*$", "", alt))
        text = "Überschrift ohne Satzzeichen" if simple else "Ohne Komma umformulieren (Entwurf)"
    elif area == "texte" and art == "strich" and alt:
        neu = fix_dash(alt, lang)
        text = "Gedankenstrich ersetzen"
    else:
        text = GENERIC.get((area, art), "Ursache prüfen und beheben")
    legal = area == "recht" or (path or "") in LEGAL_PAGES
    price = bool(PRICE_RX.search(f"{alt or ''} {neu or ''}"))
    auto = level in ("rot", "gelb") and not legal and not price and art not in NO_AUTO_ARTS
    if legal:
        text = GENERIC.get((area, art)) or "Rechtstext: nur der Inhaber ändert ihn"
    elif price:
        text = "Preise nur nach den Gehirn-Regeln ändern, nur melden"
    out = {"text": text[:120], "auto": auto}
    if alt:
        out["alt"] = _clip(alt)
    if neu:
        out["neu"] = _clip(neu)
    return out


def check_page(path: str, kind: str, status: int | None, ms: int | None, size: int, html: str) -> list[dict]:
    """Funde einer Seite. kind: start | landing | legal."""
    out: list[dict] = []
    if status is None:
        return [finding("erreichbar", "rot", "nicht erreichbar", path, "offline")]
    if status >= 500:
        return [finding("erreichbar", "rot", f"Serverfehler {status}", path, "server")]
    if status >= 400:
        return [finding("fehler", "rot", f"Seite fehlt ({status})", path, "fehlt")]
    if ms is not None:
        if ms > VERY_SLOW_MS:
            out.append(finding("tempo", "rot", f"sehr langsam ({ms / 1000:.1f} s)", path, "langsam"))
        elif ms > SLOW_MS:
            out.append(finding("tempo", "gelb", f"langsam ({ms / 1000:.1f} s)", path, "langsam"))
    kb = size // 1024
    if kb > VERY_BIG_KB:
        out.append(finding("tempo", "rot", f"sehr groß ({kb} KB)", path, "gross"))
    elif kb > BIG_KB:
        out.append(finding("tempo", "gelb", f"groß ({kb} KB)", path, "gross"))
    p = parse(html)
    if not p.viewport or "width=device-width" not in p.viewport.replace(" ", ""):
        out.append(finding("handy", "rot", "kein Handy-Viewport", path, "viewport"))
    if not p.title:
        out.append(finding("texte", "rot", "Titel fehlt", path, "titel_fehlt"))
    elif len(p.title) > TITLE_MAX:
        out.append(finding("texte", "gelb", f"Titel zu lang ({len(p.title)} Zeichen)", path, "titel", p.title))
    if kind != "legal":
        if not p.desc:
            out.append(finding("texte", "gelb", "Beschreibung fehlt", path, "beschreibung_fehlt"))
        elif not DESC_MIN <= len(p.desc) <= DESC_MAX:
            out.append(finding("texte", "info", f"Beschreibung {len(p.desc)} Zeichen", path, "beschreibung", p.desc))
        bad = [h for h in p.heads if HEAD_PUNCT_RX.search(h)]
        if bad:
            out.append(finding("texte", "gelb", f"Überschrift mit Satzzeichen: „{bad[0][:50]}“", path, "ueberschrift", bad[0]))
    text = " ".join(p.text)
    if kind != "legal":
        n = len(DASH_RX.findall(text))
        if n:
            out.append(finding("texte", "gelb", f"Gedankenstrich im Text ({n}×)", path, "strich",
                                   dash_context(next((x for x in p.text if DASH_RX.search(x)), text))))
    if kind == "legal":
        if PLACEHOLDER_RX.search(text):
            out.append(finding("recht", "rot", "Platzhalter im Rechtstext", path, "platzhalter"))
        if len(re.sub(r"\s+", " ", text)) < 400:
            out.append(finding("recht", "gelb", "Rechtstext sehr kurz", path, "kurz"))
    elif PLACEHOLDER_RX.search(text):
        out.append(finding("texte", "gelb", "Platzhalter im Text", path, "platzhalter"))
    if kind == "landing":
        if not any("/api/sample-request" in f or re.search(r"\bpf\b", f) for f in p.forms):
            out.append(finding("formulare", "rot", "Probe-Formular fehlt", path, "formular"))
    return out


def check_health(status: int | None, body: str) -> list[dict]:
    if status is None or status >= 400:
        return [finding("erreichbar", "rot", f"Diagnose nicht erreichbar ({status or 'keine Antwort'})", HEALTH, "diagnose")]
    try:
        data = json.loads(body)
    except ValueError:
        return [finding("erreichbar", "gelb", "Diagnose liefert kein JSON", HEALTH, "diagnose")]
    missing = [k for k, v in (data.get("variablen") or {}).items() if v == "FEHLT"]
    if missing:
        return [finding("erreichbar", "gelb", f"Variable fehlt: {', '.join(missing[:3])}", HEALTH, "variable")]
    return []


def check_missing(status: int | None) -> list[dict]:
    if status is None:
        return []
    if status != 404:
        return [finding("fehler", "gelb", f"404-Seite liefert {status} statt 404", MISSING, "404seite")]
    return []


def scores(funde: list[dict], checked: dict[str, int]) -> dict[str, int | None]:
    """Punkte je Bereich: Anteil sauberer Prüfungen. Je Seite zählt der schwerste Fund (rot 1, gelb 0,35, info 0);
    nichts geprüft = None. Ein roter Fund hält den Bereich bei höchstens 60 (Ring wird rot)."""
    out: dict[str, int | None] = {}
    for a in AREAS:
        n = checked.get(a, 0)
        if not n:
            out[a] = None
            continue
        worst: dict[str, float] = {}
        for i, f in enumerate(x for x in funde if x["bereich"] == a):
            key = f.get("pfad") or f"#{i}"
            worst[key] = max(worst.get(key, 0.0), WEIGHT.get(f["stufe"], 0.0))
        s = max(0, round(100 * (1 - min(1.0, sum(worst.values()) / n))))
        if any(f["bereich"] == a and f["stufe"] == "rot" for f in funde):
            s = min(s, 60)
        out[a] = s
    return out


def total(sc: dict[str, int | None]) -> int | None:
    vals = [v for v in sc.values() if v is not None]
    return round(sum(vals) / len(vals)) if vals else None


# --------------------------------------------------------------------------------------------- Abruf
class Fetcher:
    """Höflicher Abruf: nur erlaubte Hosts, eine Anfrage nach der anderen mit Pause."""

    def __init__(self, session=None, pause: float = PAUSE_S, sleep: Callable[[float], None] = time.sleep):
        if session is None:
            import requests
            session = requests.Session()
        session.headers.update({"User-Agent": UA, "Accept-Language": "en,de;q=0.8"})
        self.s, self.pause, self.sleep, self.count = session, pause, sleep, 0

    def __call__(self, url: str, method: str = "GET") -> tuple[int | None, int | None, int, str]:
        host = urlsplit(url).hostname
        if host not in ALLOWED_HOSTS:
            raise ValueError(f"fremder Host: {host}")
        if self.count:
            self.sleep(self.pause)
        self.count += 1
        t = time.monotonic()
        try:
            r = self.s.request(method, url, timeout=TIMEOUT_S, allow_redirects=True)
        except Exception:
            return None, None, 0, ""
        ms = int((time.monotonic() - t) * 1000)
        final = urlsplit(getattr(r, "url", url) or url).hostname
        if final and final not in ALLOWED_HOSTS:  # Weiterleitung nach außen: Inhalt nicht lesen
            return r.status_code, ms, 0, ""
        body = r.text if method == "GET" else ""
        return r.status_code, ms, len(r.content or b"") if method == "GET" else 0, body


def site_url() -> str:
    raw = (os.environ.get("SITE_URL") or DEFAULT_SITE).strip().rstrip("/")
    host = urlsplit(raw).hostname
    if urlsplit(raw).scheme != "https" or host not in ALLOWED_HOSTS:
        raise SystemExit(f"Website-Check nur für die eigene Domain ({', '.join(sorted(ALLOWED_HOSTS))}), nicht {raw}")
    return raw


def landing_paths(db) -> list[str]:
    rows = db.select("landing_pages", {"status": "eq.live", "select": "slug", "order": "slug.asc"}) or []
    return [f"/{r['slug']}" for r in rows if re.fullmatch(r"[a-z]{2}/[a-z0-9-]+", str(r.get("slug") or ""))]


def run(fetch: Callable, site: str, landings: list[str], max_links: int = MAX_LINKS) -> dict:
    t0 = time.monotonic()
    host = urlsplit(site).hostname or ""
    funde: list[dict] = []
    checked = {a: 0 for a in AREAS}
    seen: set[str] = set()
    links: list[str] = []
    pages = [(p, "start") for p in BASE_PAGES] + [(p, "landing") for p in landings] + [(p, "legal") for p in LEGAL_PAGES]
    for path, kind in pages:
        status, ms, size, html = fetch(site + path)
        seen.add(path)
        funde += check_page(path, kind, status, ms, size, html)
        checked["erreichbar"] += 1
        checked["fehler"] += 1
        if status and status < 400:
            checked["tempo"] += 1
            checked["handy"] += 1
            checked["texte"] += 1
            if kind == "legal":
                checked["recht"] += 1
            if kind == "landing":
                checked["formulare"] += 1
            for lk in internal_links(parse(html), site + path, host):
                if lk not in links:
                    links.append(lk)
    status, _, _, body = fetch(site + HEALTH)
    funde += check_health(status, body)
    checked["erreichbar"] += 1
    status, *_ = fetch(site + MISSING)
    funde += check_missing(status)
    todo = [lk for lk in links if lk not in seen][:max_links]
    for lk in todo:
        st, *_ = fetch(site + lk, "HEAD")
        if st in (405, 501):  # HEAD nicht erlaubt: einmal normal abrufen
            st, *_ = fetch(site + lk)
        checked["fehler"] += 1
        if st is None or st >= 400:
            funde.append(finding("fehler", "rot", f"kaputter Link ({st or 'keine Antwort'})", lk, "link"))
    if not landings:
        funde.append(finding("formulare", "gelb", "keine Live-Landingpage gefunden", None, "keine_landing"))
    sc = scores(funde, checked)
    order = {"rot": 0, "gelb": 1, "info": 2}
    funde.sort(key=lambda f: (order.get(f["stufe"], 3), AREAS.index(f["bereich"])))
    return {"site": site, "scores": sc, "funde": funde[:80], "seiten": len(seen) + len(todo) + 2,
            "dauer_ms": int((time.monotonic() - t0) * 1000), "gesamt": total(sc)}


def summary(res: dict) -> str:
    lines = [f"Website-Check {res['site']}: gesamt {res.get('gesamt')}/100, {res['seiten']} Abrufe"]
    for a in AREAS:
        v = res["scores"].get(a)
        lines.append(f"  {LABEL[a]:<16} {'–' if v is None else v}")
    for f in [f for f in res["funde"] if f["stufe"] != "info"][:12]:
        lines.append(f"  [{f['stufe']}] {LABEL[f['bereich']]}: {f['text']}{' · ' + f['pfad'] if f.get('pfad') else ''}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    site = site_url()
    db = None
    landings: list[str] = []
    if os.environ.get("SUPABASE_URL"):
        from lib.db import DB
        db = DB()
        landings = landing_paths(db)
    res = run(Fetcher(), site, landings)
    text = summary(res)
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write("```\n" + text + "\n```\n")
    if db is not None and not a.dry_run:
        db.insert("website_checks", {"at": now().isoformat(), "site": res["site"], "scores": res["scores"],
                                     "funde": res["funde"], "seiten": res["seiten"], "dauer_ms": res["dauer_ms"]})
        print("gespeichert: signalwerk.website_checks")
        try:  # behobene Fixes markieren, dann Auto-Fix anstoßen; darf den Check nie scheitern lassen
            import website_agents
            t = now()
            check = {"at": t.isoformat(), "funde": res["funde"]}
            print(f"behoben: {website_agents.mark_fixed(db, res['funde'], t)}")
            print("Auto-Fix:", json.dumps(website_agents.autofix(db, t, True, check=check), ensure_ascii=False))
        except Exception as e:  # noqa: BLE001
            print(f"Auto-Fix übersprungen: {str(e)[:200]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
