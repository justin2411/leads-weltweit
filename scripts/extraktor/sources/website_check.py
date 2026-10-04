"""S2 (Webagenturen): Firmen MIT Website, deren Website unsicher, nicht handytauglich, veraltet oder kaputt ist.

Inhaber 02.10.2026: „wir wollen nicht nur Leads ohne Website verkaufen, sondern auch sehr alte Websites oder fehlende
Sicherheit“. Firmenliste: Overture-Places mit eingetragener Website (offene Lizenz, wie `overture.py`, gleiche
Ausschlüsse: Ketten, Behörden, `SKIP_CAT`; Telefon und Adresse Pflicht). Geprüft wird nur die eigene Startseite,
einmal: robots.txt beachtet, keine gesperrten Plattformen, 1 Abruf/s je Domain (enrich.Fetcher), jede Seite höchstens
einmal am Tag (Gedächtnis `out/cache/webcheck_seen.json`, geprüfte Firmen ohne Befund erst nach RECHECK_DAYS wieder).

Befunde (nur objektiv und belegbar; im Zweifel kein Befund):
  no_https           kein HTTPS (Startseite nur über http erreichbar, Chrome zeigt „Nicht sicher“) oder ungültiges /
                     abgelaufenes Zertifikat (Browser warnt vor dem Öffnen)
  website_not_mobile Startseite ohne <meta name="viewport"> (nicht für Handys gebaut)
  website_outdated   Copyright-Jahr ≤ 2018, WordPress < 5, Joomla 1.x/2.x, Flash, jQuery 1.x
  website_broken     Fehlerseite (404/410/500) oder geparkte Domain / Standardseite des Servers / gesperrtes Konto
Bei Befunden auf einer geladenen Seite muss die Seite die Firma belegen (Telefon aus Overture, Name auf der Seite oder
in der Domain); bei kaputten/geparkten Seiten muss die Domain den Namen der Firma tragen.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import threading
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import requests

from extraktor.sources import overture
from lib import websites as W
from lib.fetch import BLOCKED_HOSTS, USER_AGENT, capped_get, host_blocked

SOURCE = "overture_web"
SEEN = Path(os.environ.get("EXTRAKTOR_WEBCHECK_SEEN", "out/cache/webcheck_seen.json"))
RECHECK_DAYS = 120
# Overture-Konfidenz: Standard ab 0,6. UK/FR (Scout 04.10.2026: Vorrat ab 0,6 abgearbeitet, alle Firmen 120 Tage
# geprüft) zusätzlich 0,4–0,6 über `--web-min-conf 0.4` – dort zählen nur Befunde auf einer geladenen Seite, die die
# Firma per Telefon oder Namen belegt (kein „kaputt/geparkt“: bei unsicherem Eintrag könnte die Firma geschlossen sein)
HIGH_CONF = 0.6
LOW_CONF = 0.4  # tiefer nie (Einträge unter 0,4 sind zu oft geschlossene oder falsch zugeordnete Firmen)
# Firmen ohne Telefon im Overture-Eintrag (`--web-no-phone`): nur hier, Nummer von der eigenen Website
NO_PHONE_COUNTRIES = {"UK", "FR"}
OUTDATED_YEAR = 2018
PRIORITY = ("website_broken", "no_https", "website_not_mobile", "website_outdated")
# Websites, die keine eigene Firmenseite sind (Plattformen, Link-Sammlungen, Buchungs-/Liefer-Portale, Baukasten-
# Unterseiten großer Anbieter mit eigenem Zertifikat)
PLATFORM = re.compile(r"(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|linkedin|linktr|linktree|yelp|tripadvisor|"
                      r"booking|airbnb|ubereats|deliveroo|just-eat|justeat|doordash|grubhub|opentable|seamless|"
                      r"toasttab|square|squareup|business\.site|sites\.google|google|goo|bit|tinyurl|wa|whatsapp|"
                      r"pagesjaunes|yell|thomsonlocal|bbb|nextdoor|etsy|ebay|amazon|treatwell|fresha|vagaro|"
                      r"booksy|planity|doctolib|theknot|weddingwire|houzz|thumbtack|angi|homeadvisor|checkatrade|"
                      r"mybusiness|carrd|about|beacons|taplink|wixsite|godaddysites|webflow|weebly|jimdo|"
                      r"blogspot|wordpress|squarespace|shopify|myshopify|bigcartel)\.", re.I)

_lock = threading.Lock()
_seen: dict[str, str] = {}
COUNTS: Counter = Counter()  # Trichter für bericht.json: geprüft, Befunde je Art, Gründe ohne Befund


def count(res: dict) -> None:
    with _lock:
        COUNTS["checked"] += 1
        for t in {f["type"] for f in res["findings"]}:
            COUNTS[t] += 1
        for d in {f["detail"] for f in res["findings"]}:
            COUNTS[f"detail:{d}"] += 1
        if res["findings"]:
            COUNTS["with_finding"] += 1
        else:
            COUNTS[f"none:{(res['note'] or 'site_ok').split(' ')[0]}"] += 1


# ---------------------------------------------------------------------------
# Firmenliste aus dem Overture-Auszug
# ---------------------------------------------------------------------------
def host_of(url: str) -> str:
    """Host wie eingetragen (mit www., ohne Port), klein."""
    u = (url or "").strip()
    return (urlparse(u if "//" in u else "http://" + u).hostname or "").lower().rstrip(".")


SECOND_LEVEL = {"co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "asso.fr", "com.fr", "gouv.fr"}


def registrable(host: str) -> bool:
    """Eigene Domain (beispiel.co.uk, www.beispiel.fr) statt Unterseite eines Anbieters (blog.anbieter.com)."""
    labels = (host[4:] if host.startswith("www.") else host).split(".")
    n = 3 if ".".join(labels[-2:]) in SECOND_LEVEL else 2
    return len(labels) == n


def usable(url: str) -> bool:
    h = host_of(url)
    if not h or "." not in h or re.fullmatch(r"[\d.]+", h) or not registrable(h):
        return False
    if host_blocked("https://" + h) or any(b in h for b in BLOCKED_HOSTS) or PLATFORM.search(h + "."):
        return False
    path = urlparse(url if "//" in url else "http://" + url).path.strip("/")
    return path.count("/") <= 1  # tiefe Unterseiten = Filial-/Portalseiten, keine eigene Startseite


def load_seen() -> dict[str, str]:
    """Gedächtnis dieses Teils plus das aller anderen Teile desselben Landes (`webcheck_seen_<i>.json`, vom
    Workflow abgelegt): wird die Aufteilung geändert, ruft kein Teil eine Seite erneut ab, die ein anderer Teil
    gerade geprüft hat (höchstens einmal täglich je Seite). Je Firma gilt das jüngste Datum."""
    global _seen
    _seen = {}
    for f in sorted(SEEN.parent.glob(SEEN.stem + "*.json")):
        try:
            for k, v in json.loads(f.read_text()).items():
                if v > _seen.get(k, ""):
                    _seen[k] = v
        except (OSError, ValueError):
            continue
    return _seen


def remember(source_id: str, day: dt.date | None = None) -> None:
    with _lock:
        _seen[source_id] = (day or dt.date.today()).isoformat()


def save_seen() -> None:
    cut = (dt.date.today() - dt.timedelta(days=RECHECK_DAYS)).isoformat()
    with _lock:
        keep = {k: v for k, v in _seen.items() if v >= cut}
    SEEN.parent.mkdir(parents=True, exist_ok=True)
    SEEN.write_text(json.dumps(keep))


def recently_checked(today: dt.date | None = None) -> set[str]:
    cut = ((today or dt.date.today()) - dt.timedelta(days=RECHECK_DAYS)).isoformat()
    return {k for k, v in _seen.items() if v >= cut}


def in_part(source_id: str, part: tuple[int, int] | None) -> bool:
    """Gleiche feste Aufteilung wie run.py --shard (Quelle + ID), damit parallele Teile nie dieselbe Firma prüfen."""
    if not part:
        return True
    import hashlib
    i, n = part
    return int(hashlib.md5(f"{SOURCE}:{source_id}".encode()).hexdigest(), 16) % n == i


def with_website(country: str, limit: int, log=print, exclude: set[str] | None = None,
                 path: Path | None = None, part: tuple[int, int] | None = None, min_conf: float = HIGH_CONF,
                 no_phone: bool = False) -> list[dict]:
    """Firmen mit eingetragener Website und Telefon, ohne Ketten (Name oder Domain mehrfach) und ohne Behörden.
    part = (i, n): nur der eigene Anteil dieses Teils, damit `limit` eigene Firmen zählt.
    min_conf < HIGH_CONF: sichere Einträge zuerst, danach die unsicheren (siehe HIGH_CONF).
    no_phone (nur UK/FR): zusätzlich Firmen mit Website, aber ohne Telefon im Eintrag (Nummer dann von der Website)."""
    min_conf = max(LOW_CONF, min(float(min_conf), HIGH_CONF))
    import duckdb
    path = path or web_cache_for(country)
    paths = [path] + ([overture.CACHE_WEB_NOPHONE] if no_phone and country in NO_PHONE_COUNTRIES else [])
    for p in paths:
        if not p.exists():
            overture.build_cache(log, p)
    src = "read_parquet([" + ", ".join(f"'{p}'" for p in paths) + "], union_by_name=true)"
    exclude = exclude or set()
    cc = overture.code(country)
    con = duckdb.connect()
    # schon geprüfte Firmen in der Abfrage ausschließen (Anti-Join), damit LIMIT nur neue Firmen zählt
    con.execute("CREATE TEMP TABLE seen (id VARCHAR)")
    if exclude:
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as fh:
            fh.write("id\n" + "\n".join(sorted(exclude)) + "\n")
        con.execute(f"INSERT INTO seen SELECT id FROM read_csv('{fh.name}', header=true, columns={{'id': 'VARCHAR'}})")
        os.unlink(fh.name)
    con.execute(f"""
        CREATE TEMP TABLE pool AS
        WITH base AS (SELECT *, lower(regexp_extract(websites[1], '^(?:[a-zA-Z]+://)?(?:www\\.)?([^/:?#]+)', 1)) AS dom
                      FROM {src} WHERE country = ? AND websites IS NOT NULL AND len(websites) > 0),
             chains AS (SELECT lower(name) n FROM base GROUP BY 1 HAVING count(*) > 3),
             shared AS (SELECT dom FROM base GROUP BY 1 HAVING count(*) > 1)
        SELECT id, name, phones, emails, socials, websites, street, city, postcode, category, datasets, updated,
               confidence, region
        FROM base
        WHERE coalesce(operating_status, 'open') NOT IN ('permanently_closed', 'temporarily_closed')
          AND name IS NOT NULL AND lower(name) NOT IN (SELECT n FROM chains)
          AND dom <> '' AND dom NOT IN (SELECT dom FROM shared)
          AND coalesce(confidence, 0) >= ?
          AND street IS NOT NULL AND postcode IS NOT NULL
          AND id NOT IN (SELECT id FROM seen)
        ORDER BY (coalesce(confidence, 0) >= {HIGH_CONF}) DESC, (coalesce(len(phones), 0) > 0) DESC, md5(id)""",
                [cc, min_conf])
    cols = ["id", "name", "phones", "emails", "socials", "websites", "street", "city", "postcode", "category",
            "datasets", "updated", "confidence", "region"]
    out, offset, page = [], 0, max(1000, limit * 2)
    while len(out) < limit:
        rows = con.execute("SELECT * FROM pool LIMIT ? OFFSET ?", [page, offset]).fetchall()
        if not rows:
            break
        offset += len(rows)
        for r in rows:
            d = dict(zip(cols, r))
            if not in_part(d["id"], part):
                continue
            if overture.SKIP_CAT.search(d["category"] or "none") or not (d["street"] and d["postcode"]):
                continue
            if overture.BRANDS.search(d["name"] or "") or not usable(d["websites"][0]):
                continue
            out.append(d)
            if len(out) >= limit:
                break
    low = sum(1 for d in out if (d["confidence"] or 0) < HIGH_CONF)
    tel = sum(1 for d in out if not d["phones"])
    log(f"Overture {country}: {len(out)} Firmen mit Website zur Website-Prüfung ausgewählt"
        + (f", davon {low} mit Konfidenz {min_conf:g}–{HIGH_CONF:g}" if low else "")
        + (f", {tel} ohne Telefon im Eintrag" if tel else ""))
    return out


def web_cache_for(country: str) -> Path:
    """GB/FR und IE/NL/BE/SE: der vorhandene Auszug (alle Firmen mit Telefon); US: eigener Auszug mit Website."""
    return overture.CACHE_US_WEB if country == "US" else overture.cache_for(country)


def to_candidate(d: dict, country: str) -> dict:
    c = overture.to_candidate(d, country)
    url = d["websites"][0].strip()
    c.update(source=SOURCE, website="")  # Website wird erst nach der Prüfung gesetzt (qc vergleicht E-Mail-Domain)
    c["facts"]["listed_website"] = url if "//" in url else "http://" + url
    c["facts"]["domain"] = W.site_domain(c["facts"]["listed_website"])
    if (d.get("confidence") or 0) < HIGH_CONF:
        c["facts"]["low_confidence"] = round(float(d.get("confidence") or 0), 2)
    return c


def confirmed_only(c: dict, res: dict) -> dict:
    """Unsicherer Overture-Eintrag (Konfidenz < HIGH_CONF): nur Befunde auf einer geladenen Seite, die die Firma per
    Telefon oder Namen auf der Seite belegt; „kaputt/geparkt“ und Zertifikatsbefunde ohne Seite fallen weg."""
    if not c["facts"].get("low_confidence") or not res["findings"]:
        return res
    ok = res["html"] and {"phone_on_site", "name_on_site"} & set(res["belongs"])
    keep = [f for f in res["findings"] if ok and f["type"] != "website_broken"]
    if not keep:
        return {**res, "findings": [], "note": "low_confidence_unconfirmed"}
    return {**res, "findings": keep}


# ---------------------------------------------------------------------------
# Startseite prüfen
# ---------------------------------------------------------------------------
PARKING = re.compile(r"sedoparking|parkingcrew|bodis\.com|parklogic|above\.com|hugedomains|dan\.com|afternic|"
                     r"domain (?:name )?(?:is |may be )?for sale|buy this domain|this domain (?:name )?(?:is|may be) "
                     r"(?:for sale|parked)|domain parking|ce nom de domaine est (?:à vendre|en vente)|domaine (?:à vendre|parqué)", re.I)
DEFAULT_PAGE = re.compile(r"welcome to nginx!|apache2 (?:ubuntu|debian) default page|it works!|"
                          r"this account has been suspended|account suspended|default web site page|"
                          r"future home of something quite cool|iis windows server|test page for the (?:apache|nginx)", re.I)
VIEWPORT = re.compile(r"<meta[^>]+name\s*=\s*[\"']?viewport", re.I)
REDIRECT = re.compile(r"<meta[^>]+http-equiv\s*=\s*[\"']?refresh|(?:window\.|document\.)?location(?:\.href)?\s*=|"
                      r"location\.replace\(", re.I)
GENERATOR = re.compile(r"<meta[^>]+name\s*=\s*[\"']?generator[\"']?[^>]*content\s*=\s*[\"']([^\"']+)", re.I)
GENERATOR2 = re.compile(r"<meta[^>]+content\s*=\s*[\"']([^\"']+)[\"'][^>]*name\s*=\s*[\"']?generator", re.I)
COPYRIGHT = re.compile(r"(?:©|\bcopyright\b|\(c\))", re.I)  # im sichtbaren Text (Entitäten schon aufgelöst)
# Fehlerseiten, die wirklich „kaputt“ belegen (Baukasten ohne verbundene Seite, Datenbank-/Serverfehler, leere 404)
ERROR_PAGE = re.compile(r"connectyourdomain|site not found|this site is not published|unknown domain|database error|"
                        r"error establishing a database connection|critical error on this website|wordpress &rsaquo; error|"
                        r"\b404 not found\b|\bpage not found\b|^\s*not found!?\s*$|internal server error|"
                        r"page introuvable|site introuvable", re.I | re.M)
# Sperre für Bots statt Fehler (lacuvellerie.fr am 02.10.2026: 404 mit „403 Forbidden“ für Bots, 200 für Browser)
BOT_BLOCK = re.compile(r"forbidden|access denied|captcha|attention required|cloudflare|request blocked|"
                       r"administrative rules|not acceptable|mod_security|are you a robot|bot protection|unusual traffic",
                       re.I)
FLASH = re.compile(r"application/x-shockwave-flash|<(?:embed|param|object)[^>]+\.swf\b|swfobject\.embedSWF", re.I)
SCRIPT_SRC = re.compile(r"<script[^>]+src\s*=\s*[\"']([^\"']+)", re.I)
JQUERY1 = re.compile(r"jquery[-.]?(1\.\d{1,2}(?:\.\d{1,2})?)(?:\.min)?\.js|jquery(?:\.min)?\.js\?ver=(1\.\d{1,2}(?:\.\d{1,2})?)|"
                     r"/jquery/(1\.\d{1,2}(?:\.\d{1,2})?)/jquery(?:\.min)?\.js", re.I)
RECENT_YEAR = 2021  # steht irgendwo auf der Startseite ein Jahr ab hier, wird die Seite gepflegt -> kein Copyright-Befund


def visible_html(html: str) -> str:
    """HTML ohne Kommentare, Styles und Skript-Inhalte (Skript-Tags bleiben als Marker stehen): Lizenzkommentare
    eingebundener Bibliotheken („(c) 2005, 2014 jQuery Foundation“) sind kein Copyright der Firma."""
    h = re.sub(r"<!--.*?-->|<style[^>]*>.*?</style>", " ", html or "", flags=re.S | re.I)
    return re.sub(r"<script[^>]*>.*?</script>", "<script></script>", h, flags=re.S | re.I)


def copyright_year(html: str) -> int | None:
    """Höchstes Jahr in sichtbaren Copyright-Vermerken der Startseite. None, wenn keiner da ist, das Jahr per Skript
    eingesetzt wird oder irgendwo im Quelltext ein Jahr ab RECENT_YEAR steht (Baukasten-Seiten wie Wix/Duda tragen
    aktuelle Jahre in ihren Daten und sind modern, auch wenn der Vermerk alt ist)."""
    if re.search(rf"(?<!\d)20(?:{str(RECENT_YEAR)[2]}[{str(RECENT_YEAR)[3]}-9]|[3-4]\d)(?!\d)", html or ""):
        return None
    vis = visible_html(html).replace("<script></script>", " SCRIPTYEAR ")
    text = W.page_text(vis)
    years = []
    for m in COPYRIGHT.finditer(text):
        tail = text[m.end():m.end() + 60]
        if re.search(r"SCRIPTYEAR|getFullYear|\{\{|\{%|<\?", tail):
            return None
        years += [int(y) for y in re.findall(r"(?<!\d)(19[89]\d|20[0-4]\d)(?!\d)", tail.split("\n")[0])]
    return max(years) if years else None


def jquery1(html: str) -> str | None:
    """Version, wenn die Startseite jQuery 1.x lädt (nur echte <script src>, keine auskommentierten)."""
    for src in SCRIPT_SRC.findall(re.sub(r"<!--.*?-->", " ", html or "", flags=re.S)):
        m = JQUERY1.search(src)
        if m:
            return next(g for g in m.groups() if g)
    return None


def generator_finding(html: str) -> tuple[str, str] | None:
    """(Text, Version) für WordPress < 5 und Joomla 1.x/2.x laut meta generator."""
    for m in list(GENERATOR.finditer(html)) + list(GENERATOR2.finditer(html)):
        g = m.group(1).strip()
        wp = re.match(r"WordPress\s+(\d+)\.(\d+)(?:\.(\d+))?", g, re.I)
        if wp and int(wp.group(1)) < 5:
            return "WordPress", ".".join(x for x in wp.groups() if x)
        jo = re.match(r"Joomla!?\s+(\d+)\.(\d+)", g, re.I)
        if jo and int(jo.group(1)) < 3:
            return "Joomla", f"{jo.group(1)}.{jo.group(2)}"
    return None


def belongs(c: dict, html: str, final_url: str) -> list[str]:
    """Belege, dass die geladene Seite die Seite dieser Firma ist (leer = nicht belegt)."""
    ev = []
    digits = lambda p: re.sub(r"\D", "", p or "")[-9:]  # noqa: E731
    src = digits(c.get("phone"))
    if src and len(src) == 9 and src in {digits(p) for p in W.phones_on_page(html, c["country"])[0]}:
        ev.append("phone_on_site")
    text = W.norm(W.page_text(html[:300000])[:20000] + " " + W.title_of(html))
    core = [w for w in W.core_words(c["name"]) if len(w) >= 3]
    if core and all(w in text.split() or w in text.replace(" ", "") for w in core):
        ev.append("name_on_site")
    if name_in_domain(c["name"], final_url):
        ev.append("name_in_domain")
    return ev


def name_in_domain(name: str, url: str) -> bool:
    """Domain trägt den Namen der Firma: das erste Kernwort (meist das unterscheidende) und mindestens die Hälfte
    der Kernwörter ab 4 Buchstaben. Ein Branchenwort allein reicht nicht („Fine Grain Furniture“ ≠ xyzfurniture.co.uk)."""
    label = W.site_domain(url).split(".")[0].replace("-", "")
    words = [w for w in W.core_words(name) if len(w) >= 4]
    if not words or words[0] not in label:
        return False
    return sum(w in label for w in words) * 2 >= len(words)


def _get(fetcher, url: str) -> tuple[requests.Response | None, Exception | None]:
    """Ein Abruf über die Drosselung des Fetchers, ohne Weiterleitungs-Magie zu verstecken."""
    fetcher._throttle(url)
    try:
        r = capped_get(fetcher.session, url, timeout=20)
        fetcher.requests += 1
        return r, None
    except requests.RequestException as e:
        return None, e


def _robots_ok(text: str, url: str) -> bool:
    import urllib.robotparser
    rp = urllib.robotparser.RobotFileParser()
    rp.parse((text or "").splitlines())
    return rp.can_fetch(USER_AGENT, url)


def _tls_problem(e: Exception) -> str | None:
    """Art des Zertifikatsfehlers (abgelaufen, falscher Name, selbst signiert) oder None, wenn es keiner ist."""
    if not isinstance(e, requests.exceptions.SSLError):
        return None
    s = str(e).lower()
    if "certificate has expired" in s or "certificate expired" in s:
        return "expired"
    if "hostname mismatch" in s or "doesn't match" in s or "not valid for" in s:
        return "wrong_name"
    if "self-signed" in s or "self signed" in s:
        return "self_signed"
    # „unable to get local issuer certificate“ (fehlendes Zwischenzertifikat) u. a.: Chrome lädt Zwischenzertifikate
    # oft nach und zeigt die Seite dann ohne Warnung -> kein eindeutiger Befund
    return None


def _robots(fetcher, root: str) -> tuple[str, requests.Response | None, Exception | None]:
    """robots.txt holen: ('ok'|'deny'|'error', Antwort, Fehler). 401/403 = nicht abrufen."""
    r, e = _get(fetcher, root + "/robots.txt")
    if r is None:
        return "error", None, e
    if r.status_code in (401, 403):
        return "deny", r, None
    return "ok", r, None


def _https(fetcher, host: str, alt: str) -> tuple[str, str, str, str]:
    """(Zustand, Host, robots.txt, Zertifikatsfehler). Zustand: ok | bad_cert | none | deny | unknown.
    Beide Schreibweisen (mit/ohne www.) werden versucht; erst wenn keine ein gültiges HTTPS hat, gibt es einen Befund."""
    tls, refused = "", 0
    for h in (host, alt):
        state, r, e = _robots(fetcher, f"https://{h}")
        if state == "deny":
            return "deny", h, "", ""
        if state == "ok":
            return "ok", h, (r.text if r.status_code < 400 else ""), ""
        kind = _tls_problem(e)
        if kind:
            tls = tls or kind
        elif isinstance(e, requests.ConnectionError) and not isinstance(e, (requests.Timeout, requests.exceptions.SSLError)):
            refused += 1  # Port 443 lehnt ab / Name nicht auflösbar
        else:
            return "unknown", host, "", ""  # Zeitüberschreitung, unklarer TLS-Fehler: keine Aussage
    return ("bad_cert" if tls else "none"), host, "", tls


def inspect(c: dict, fetcher, today: dt.date | None = None) -> dict:
    """Startseite der eingetragenen Website prüfen. Ergebnis:
    {'findings': [{'type', 'detail', 'value', 'evidence'}], 'final_url', 'belongs', 'note', 'checked_on', 'html'}"""
    today = today or dt.date.today()
    host = host_of(c["facts"]["listed_website"])
    alt = host[4:] if host.startswith("www.") else "www." + host
    res = {"findings": [], "final_url": "", "html": "", "belongs": [], "note": "", "checked_on": today.isoformat()}

    def done(note: str = "", keep: bool = False) -> dict:
        res["note"] = note
        if not keep:
            res["findings"] = []
        return res

    if host_blocked("https://" + host):
        return done("platform")
    state, h, robots_txt, tls = _https(fetcher, host, alt)
    if state in ("deny", "unknown"):
        return done("robots_denied" if state == "deny" else "https_unknown")
    scheme = "https" if state == "ok" else "http"
    named = name_in_domain(c["name"], host)

    def forced_bad_cert(e) -> dict | None:
        # http leitet auf das ungültige https um: jeder Besucher bekommt die Zertifikatswarnung
        if state == "bad_cert" and isinstance(e, requests.exceptions.SSLError) and _tls_problem(e) and named:
            res["findings"] = [{"type": "no_https", "detail": f"certificate_{tls}", "value": "",
                                "evidence": f"http://{host}/ redirects to https with a {tls.replace('_', ' ')} certificate"}]
            res["belongs"] = ["name_in_domain"]
            return done(keep=True)
        return None

    if scheme == "http":
        st, r, e = _robots(fetcher, f"http://{host}")
        if st != "ok":
            return forced_bad_cert(e) or done("robots_denied" if st == "deny" else f"http_unreachable ({type(e).__name__})")
        robots_txt, h = (r.text if r.status_code < 400 else ""), host
    url = f"{scheme}://{h}/"
    if not _robots_ok(robots_txt, url):
        return done("robots_denied")
    page, e = _get(fetcher, url)
    if page is None:
        return forced_bad_cert(e) or done(f"home_unreachable ({type(e).__name__})")
    final = page.url
    if state == "ok" and urlparse(final).scheme == "http":
        res["findings"].append({"type": "no_https", "detail": "redirects_to_http", "value": "",
                                "evidence": f"https://{h}/ redirects to {final}"})
    elif state in ("none", "bad_cert") and urlparse(final).scheme == "http":
        res["findings"].append({"type": "no_https", "detail": "no_https" if state == "none" else f"certificate_{tls}",
                                "value": "",
                                "evidence": (f"no HTTPS connection to {host} or {alt}, {final} loads unencrypted"
                                             if state == "none" else
                                             f"https://{host}/ certificate {tls.replace('_', ' ')}, {final} loads unencrypted")})
    res["final_url"] = final
    html = page.text if "html" in (page.headers.get("content-type") or "text/html") else ""
    res["html"] = html
    same_site = W.site_domain(final) == W.site_domain(url)

    # kaputt / geparkt: die Domain muss den Firmennamen tragen
    body = W.page_text(html[:100000]) + " " + W.title_of(html)
    error_page = bool(ERROR_PAGE.search(body) or ERROR_PAGE.search(html[:5000])) and not BOT_BLOCK.search(body) \
        and len(body) < 3000
    if page.status_code in (404, 410, 500) and named and same_site and error_page:
        res["findings"] = [{"type": "website_broken", "detail": f"http_{page.status_code}", "value": str(page.status_code),
                            "evidence": f"{final} answers HTTP {page.status_code}"}]
        res["belongs"] = ["name_in_domain"]
        return done(keep=True)
    if page.status_code >= 400:
        return done(f"http_{page.status_code}")
    text = W.page_text(html[:200000])
    park = PARKING.search(html[:60000]) or (DEFAULT_PAGE.search(text[:3000]) if len(text) < 3000 else None)
    if park and len(text) < 3000:
        if not (named and same_site):
            return done("parked_unconfirmed")
        res["findings"] = [{"type": "website_broken", "detail": "parked" if PARKING.search(html[:60000]) else "default_page",
                            "value": "", "evidence": f"{final}: {park.group(0)[:80]}"}]
        res["belongs"] = ["name_in_domain"]
        return done(keep=True)

    # Befunde auf der Seite: nur, wenn die Seite die Firma belegt
    res["belongs"] = belongs(c, html, final)
    if not res["belongs"] or (not same_site and "name_in_domain" not in res["belongs"]):
        return done("page_not_confirmed")
    real = len(html) >= 1500 and re.search(r"<body|<frameset", html, re.I) and not REDIRECT.search(html[:20000])
    if real and not VIEWPORT.search(html):
        res["findings"].append({"type": "website_not_mobile", "detail": "no_viewport", "value": "",
                                "evidence": f"{final}: no <meta name=\"viewport\"> on the homepage"})
    year = copyright_year(html)
    if year and 1990 <= year <= OUTDATED_YEAR:
        res["findings"].append({"type": "website_outdated", "detail": "copyright", "value": str(year),
                                "evidence": f"{final}: copyright notice {year}"})
    gen = generator_finding(html)
    if gen:
        res["findings"].append({"type": "website_outdated", "detail": gen[0].lower(), "value": gen[1],
                                "evidence": f"{final}: meta generator {gen[0]} {gen[1]}"})
    fl = FLASH.search(re.sub(r"<!--.*?-->", " ", html, flags=re.S))
    if fl:
        res["findings"].append({"type": "website_outdated", "detail": "flash", "value": "",
                                "evidence": f"{final}: embeds Adobe Flash ({fl.group(0)[:60]})"})
    jq = jquery1(html)
    if jq:
        res["findings"].append({"type": "website_outdated", "detail": "jquery1", "value": jq,
                                "evidence": f"{final}: loads jQuery {jq}"})
    return done(keep=True)


def primary(findings: list[dict]) -> str:
    types = {f["type"] for f in findings}
    return next(t for t in PRIORITY if t in types)
