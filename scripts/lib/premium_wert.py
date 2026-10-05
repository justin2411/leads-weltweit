"""Wertrechnung für Webagenturen (S2) US/UK/FR – Probe-PDF (Inhaber 04.10.2026: „premium leads … verstehen wie
wertvoll diese leads für sie sind“). Nur Zahlen aus docs/PREMIUM-WERT.md (Daten: app/content/premium-wert.json),
belegte Zahlen mit Quelle, Annahmen nur als „Rechenbeispiel, kein Versprechen“. Gleiche Rechnung wie
app/lib/premium-wert.ts (gemeinsame Fälle: tests/fixtures/premium_wert_cases.json).
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "app" / "content" / "premium-wert.json"
MONTHS = {"en": "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(),
          "fr": "janv. févr. mars avr. mai juin juil. août sept. oct. nov. déc.".split()}


def _r(x: float) -> int:
    """Runden wie Math.round in JS (nicht wie Pythons Bankrundung)."""
    return int(math.floor(x + 0.5))


WEB_SIGNALS = {"no_website", "website_outdated", "website_not_mobile", "no_https", "website_broken"}


@lru_cache(maxsize=1)
def daten() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def land(segment: str | None, country: str | None) -> dict | None:
    if (segment or "").upper() != "S2":
        return None
    return daten()["laender"].get((country or "").upper())


def geld(x: float, sym: str, lang: str) -> str:
    """$3,500 · £1.44 · 3 000 € · 1,44 € (ganze Zahlen ohne Nachkommastellen) – wie geld() in TS."""
    whole = abs(x - _r(x)) < 0.005
    s = str(_r(x)) if whole else f"{_r(x * 100) / 100:.2f}"
    i, _, d = s.partition(".")
    fr = lang == "fr"
    i = re.sub(r"\B(?=(\d{3})+(?!\d))", " " if fr else ",", i)
    num = f"{i}{',' if fr else '.'}{d}" if d else i
    return f"{num}\u00a0{sym}" if fr or sym == "€" else f"{sym}{num}"


def rechnung(lnd: dict, plans: list[dict] | None) -> dict | None:
    """Kosten je Lead und Monate Abo aus den Paketpreisen; ohne beide Pakete None."""
    def price(k: str) -> float:
        return next((float(p.get("amount_cents") or 0) for p in plans or [] if p.get("key") == k), 0.0) / 100
    s, p = price("starter"), price("pro")
    pw = daten()["pro_woche"]
    ns, np_ = pw.get("starter", 0) * 52 / 12, pw.get("pro", 0) * 52 / 12
    if not (s > 0 and p > 0 and ns > 0 and np_ > 0):
        return None
    g = lambda x: geld(x, lnd["sym"], lnd["lang"])  # noqa: E731
    b = lnd["beispiel"]
    return {"proLead": {"starter": g(s / ns), "pro": g(p / np_)},
            "monate": {"starter": _r(b["jahr1"] / s), "pro": _r(b["jahr1"] / p)},
            "leads": {"starter": _r(ns), "pro": _r(np_)},
            "beispiel": {"projekt": g(b["projekt"]), "monat": g(b["monat"]), "jahr1": g(b["jahr1"])}}


def _starter_num(plans: list[dict] | None) -> float:
    """Starter-Preis je Lead als Zahl (nur für die Balkenlänge)."""
    s = next((float(p.get("amount_cents") or 0) for p in plans or [] if p.get("key") == "starter"), 0.0) / 100
    n = daten()["pro_woche"].get("starter", 0) * 52 / 12
    return round(s / n, 2) if n else 0.0


def fuell(s: str, **kw) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: str(kw[m.group(1)]) if m.group(1) in kw else m.group(0), s or "")


def tag(iso: str, lang: str) -> str:
    try:
        d = dt.date.fromisoformat((iso or "")[:10])
    except ValueError:
        return iso or ""
    return f"{d.day} {MONTHS.get(lang, MONTHS['en'])[d.month - 1]} {d.year}"


def alter(iso: str, heute: dt.date, lang: str) -> str:
    """„vor 6 Tagen“ – Alter des Anlasses am Tag des Reports (leer bei unbekanntem Datum oder Zukunft)."""
    try:
        n = (heute - dt.date.fromisoformat((iso or "")[:10])).days
    except ValueError:
        return ""
    if n < 0:
        return ""
    t = daten()["texte"]["fr" if lang == "fr" else "en"]
    return t["karte_alter_0"] if n == 0 else t["karte_alter_1"] if n == 1 else fuell(t["karte_alter_n"], n=n)


def beleg(signal: str, website: str, source_url: str, source_date: str, lang: str, source_name: str = "") -> dict | None:
    """Beleg-Link einer Lead-Karte: Website-Befund → die geprüfte Website selbst, sonst der Quell-Link; mit Abrufdatum.
    Website-Befund mit datiertem Registereintrag (z. B. Companies-House-Eigentümerwechsel): der Registereintrag ist
    der Anlass und damit der Beleg (Premium-Labor 05.10.2026); den Website-Zustand nennt der Lead-Text mit Prüfdatum."""
    from lib.premium import DATED_SOURCES
    site = (website or "").strip()
    url = (source_url or "").strip()
    register = bool(DATED_SOURCES.search(source_name or "")) and "radar" not in (source_name or "").lower() \
        and bool(re.match(r"^https?://", url))
    if signal in WEB_SIGNALS and site and signal != "no_website" and not register:
        url = site if re.match(r"^https?://", site) else f"https://{site}"
    if not re.match(r"^https?://", url):
        return None
    host = re.sub(r"^www\.", "", re.sub(r"^https?://", "", url).split("/")[0].split("#")[0].split("?")[0])
    t = daten()["texte"]["fr" if lang == "fr" else "en"]
    return {"url": url, "label": host, "checked": fuell(t["karte_abruf"], date=tag(source_date, lang)) if source_date else ""}


APP = Path(__file__).resolve().parents[2] / "app"
# Premium-Film „So findet unser Radar Ihren nächsten Kunden“ (video/v12, Inhaber 05.10.2026). Nur Probe-Mail und
# Probe-PDF verlinken ihn; auf den Landingpages läuft erst der A/B-Test „Lohnt sich das?“ (kein zweiter Seitentest).
VIDEO_KEY = {"US": "us/web-agencies:radar", "UK": "uk/web-agencies:radar", "FR": "fr/agences-web:radar"}


def video(segment: str | None, country: str | None) -> dict | None:
    """{"url", "sek"} des Radar-Films für S2 US/UK/FR – nur wenn eingetragen und die Datei wirklich ausgeliefert wird."""
    if not land(segment, country):
        return None
    try:
        v = json.loads((APP / "content" / "videos.json").read_text(encoding="utf-8")).get(VIDEO_KEY[(country or "").upper()])
    except (OSError, ValueError, KeyError):
        return None
    src = str((v or {}).get("src") or "")
    if not src.startswith("/video/") or not (APP / "public" / src.lstrip("/")).is_file():
        return None
    base = (os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").rstrip("/")
    return {"url": base + src, "sek": int(v.get("seconds") or 0)}


def video_zeile(segment: str | None, country: str | None, art: str = "mail") -> str:
    """Eine Zeile mit Link für die Probe-Mail (art=mail) bzw. Linktext fürs Probe-PDF (art=pdf); sonst leer."""
    v = video(segment, country)
    if not v:
        return ""
    lang = "fr" if land(segment, country)["lang"] == "fr" else "en"
    return fuell(daten()["texte"][lang][f"video_{art}"], sek=v["sek"], url=v["url"])


def seite(segment: str | None, country: str | None, plans: list[dict] | None) -> dict | None:
    """Daten der Seite „Was ein Kunde wert ist“ im Probe-PDF (nur S2 US/UK/FR und nur mit beiden Paketpreisen)."""
    lnd = land(segment, country)
    if not lnd:
        return None
    r = rechnung(lnd, plans)
    if not r:
        return None
    D = daten()
    lang = "fr" if lnd["lang"] == "fr" else "en"
    t = D["texte"][lang]
    checked = fuell(t["geprueft"], date=tag(D["geprueft"], lang))
    belegt = [{"text": b["text"], "source": b["quelle"], "url": b["url"], "checked": checked} for b in lnd["belegt"]]
    vergleich = [{"label": t[v["key"]], "value": geld(v["wert"], v["sym"], lang), "note": t["us_daten"],
                  "source": v["quelle"], "url": v["url"], "checked": checked, "num": v["wert"]} for v in D["vergleich"]]
    v = video(segment, country)
    return {
        **({"video": {"label": video_zeile(segment, country, "pdf"), "url": v["url"]}} if v else {}),
        "title": t["pdf_titel"], "lede": t["pdf_lede"], "proofTitle": t["pdf_belegt"], "proof": belegt,
        "noProof": t["pdf_ohne_beleg"] if not belegt else "", "compareTitle": t["landing_titel"], "compare": vergleich,
        "ours": {"label": t["wir"], "value": fuell(t["wir_wert"], **r["proLead"]), "num": _starter_num(plans)},
        "costTitle": t["pdf_kosten"],
        "cost": fuell(t["pdf_kosten_text"], n_starter=r["leads"]["starter"], n_pro=r["leads"]["pro"], **r["proLead"]),
        "exampleTitle": t["beispiel_titel"],
        "example": fuell(t["beispiel"], m_starter=r["monate"]["starter"], m_pro=r["monate"]["pro"], **r["beispiel"]),
        "own": t["eigene"], "sourceLabel": t["quelle"],
    }
