"""Veränderungs-Radar S2 (Inhaber 05.10.2026: „sehr gute, einzigartige Trigger“): bekannte Firmen mit Website
regelmäßig neu prüfen – eine Veränderung mit Datum wird zum Ereignis.

Wer: Firmen mit offenem S2-Lead (Status new) und Website, die noch an niemanden gegeben wurden (keine Probe,
Lieferung, Reservierung) und deren Website heute nicht schon nachgeprüft wurde. Jede Firma höchstens alle
RECHECK_DAYS Tage (rotierend, Datenbank-Funktion signalwerk.radar_candidates), nie öfter als einmal am Tag.
Wie: dieselbe Startseiten-Prüfung wie die Website-Prüfung (website_check.inspect: robots.txt, 1 Abruf/s je
Domain, keine gesperrten Plattformen) plus ein TLS-Handshake für das Ablaufdatum des Zertifikats (lib/tls_info).

Ereignisse (nur objektiv belegt, im Zweifel keins):
  website_broken  vorher zeigte die Startseite die Firma, jetzt Fehler-/Parkseite (gleiche Regeln wie inspect);
                  Datum = erster Tag, an dem das Radar sie kaputt sah, „zuletzt in Ordnung“ = Datum davor
  no_https        Zertifikat abgelaufen (inspect bestätigt die Browser-Warnung), Datum = Ablaufdatum aus dem
                  Zertifikat; nur wenn höchstens EXPIRED_MAX_DAYS her
  cert_expiring   Zertifikat läuft bald ab (tls_info.expiring: manuell ≤ 30 Tage, automatisch ≤ 7 Tage), Datum =
                  Prüftag, Ablaufdatum im Text
Nicht als Ereignis: Website nicht erreichbar (Firma könnte geschlossen sein), Domain-Ablauf (RDAP: Nutzungs-
bedingungen von Nominet/Verisign/AFNIC verbieten die Nutzung für Werbung/Akquise – siehe docs/QUELLEN-SCOUT.md).

Zustand je Firma: observations kind=website_audit key=radar (first_seen/last_seen, details: Zustand, Befunde,
Zertifikat, gemeldete Ereignisse). Ein neues Ereignis wird ein neuer Lead (S2, Status new) mit eigener Beobachtung
(kind=filing key=radar_<signal>); der bisherige offene Lead derselben Firma geht auf 'expired' (eine Firma, ein
offener Lead – jede Firma geht nur an einen Käufer). Die Drei-Stufen-Freigabe prüft den neuen Lead wie jeden anderen.
"""
from __future__ import annotations

import datetime as dt
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

RECHECK_DAYS = 2  # jede Firma höchstens alle 2 Tage (nie öfter als einmal am Tag)
EXPIRED_MAX_DAYS = 30
SOURCE_NAME = "Website check (change radar)"
WEB_SIGNALS = ("no_https", "website_not_mobile", "website_outdated", "website_broken", "cert_expiring")
BROKEN_EN = {
    "parked": "only shows a parked domain page",
    "default_page": "only shows a default server page",
    "http_404": "shows an error page (HTTP 404)",
    "http_410": "shows an error page (HTTP 410)",
    "http_500": "shows a server error (HTTP 500)",
}
BROKEN_FR = {
    "parked": "n'affiche plus qu'une page de domaine parqué",
    "default_page": "n'affiche plus qu'une page serveur par défaut",
    "http_404": "affiche une page d'erreur (HTTP 404)",
    "http_410": "affiche une page d'erreur (HTTP 410)",
    "http_500": "affiche une erreur serveur (HTTP 500)",
}


def _date(v) -> dt.date | None:
    if isinstance(v, dt.date):
        return v
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


# ---------------------------------------------------------------------------- Zustand und Veränderung (rein)
def state_of(res: dict) -> str:
    """'broken' (Fehler-/Parkseite belegt), 'page' (Startseite geladen und als Firmenseite belegt), 'unknown'."""
    types = {f["type"] for f in res.get("findings") or []}
    if "website_broken" in types:
        return "broken"
    if res.get("html") and res.get("belongs"):
        return "page"
    return "unknown"


def previous(row: dict) -> tuple[str, dt.date | None]:
    """(Zustand, Datum) der letzten Prüfung: Radar-Gedächtnis, sonst der ursprüngliche Lead (Befund auf einer
    geladenen Seite = 'page', kaputt = 'broken')."""
    r = row.get("radar") or {}
    if r.get("state") in ("page", "broken"):
        return r["state"], _date(r.get("checked_on")) or _date(row.get("radar_last"))
    types = {f.get("type") for f in (row.get("lead_details") or {}).get("findings") or [] if isinstance(f, dict)}
    if row.get("lead_signal") == "website_broken" or "website_broken" in types:
        return "broken", _date(row.get("lead_checked"))
    if types or row.get("lead_signal") in WEB_SIGNALS:
        return "page", _date(row.get("lead_checked"))
    return "unknown", None


def detect(row: dict, res: dict, cert: dict | None, today: dt.date) -> dict | None:
    """Ein Ereignis (höchstens eins je Prüfung) oder None. Rein, für Tests."""
    from lib.tls_info import expiring
    emitted = {(e.get("type"), e.get("key")) for e in (row.get("radar") or {}).get("events") or []}
    findings = res.get("findings") or []
    now = state_of(res)
    prev, prev_on = previous(row)
    also = sorted({f["type"] for f in findings} - {"website_broken"})
    old = sorted({f.get("type") for f in (row.get("lead_details") or {}).get("findings") or [] if isinstance(f, dict)}
                 | ({row.get("lead_signal")} & set(WEB_SIGNALS)))
    if now == "broken" and prev == "page" and prev_on and prev_on < today:
        f = next(x for x in findings if x["type"] == "website_broken")
        key = f"broken:{today.isoformat()}"
        if f["detail"] in BROKEN_EN and ("website_broken", key) not in emitted:
            return {"signal_type": "website_broken", "detail": f["detail"], "event_date": today,
                    "last_ok": prev_on, "key": key, "findings": findings, "also": old}
    if cert:
        na = cert["not_after"]
        exp = next((x for x in findings if x["type"] == "no_https" and x["detail"] == "certificate_expired"), None)
        if exp and na < today and (today - na).days <= EXPIRED_MAX_DAYS and ("no_https", f"expired:{na}") not in emitted:
            return {"signal_type": "no_https", "detail": "certificate_expired", "event_date": na, "not_after": na,
                    "key": f"expired:{na}", "findings": findings, "also": also or old}
        left = expiring(cert, today)
        https_ok = (res.get("final_url") or "").startswith("https://") and now == "page"
        if left is not None and https_ok and ("cert_expiring", f"expiring:{na}") not in emitted:
            return {"signal_type": "cert_expiring", "detail": "cert_expiring", "event_date": today, "not_after": na,
                    "days_left": left, "key": f"expiring:{na}", "findings": findings, "also": also or old}
    return None


# ---------------------------------------------------------------------------- Texte (EN/FR, nur Belegtes)
ALSO_TYPES = ("website_not_mobile", "website_outdated", "no_https", "website_broken")
# Beleg des Kombi-Zustands immer mit Prüfdatum im Text (Premium-Labor 05.10.2026: „Zertifikat …, Website nicht
# mobilfähig (geprüft am …)“). Heute gesehen -> „The same check on <Datum> also found that …“; nur bei einer früheren
# Prüfung gesehen -> „Our earlier check on <Datum> found that …“ (allgemeiner Satz je Zustand, nur Belegtes).
EARLIER_EN = {"website_not_mobile": "the homepage was not built for phones",
              "website_outdated": "the site ran on an old version of its web technology",
              "no_https": "the site had no working HTTPS encryption",
              "website_broken": "the site did not show the business"}
EARLIER_FR = {"website_not_mobile": "la page d'accueil n'était pas adaptée aux mobiles",
              "website_outdated": "le site reposait sur une ancienne version de sa technique web",
              "no_https": "le site n'avait pas de chiffrement HTTPS valide",
              "website_broken": "le site ne présentait pas l'entreprise"}


def _same_event(ev: dict, f: dict) -> bool:
    """Ist der Befund das Ereignis selbst (kein zusätzlicher Zustand)?"""
    sig = ev.get("signal_type")
    return f.get("type") == sig or (sig == "no_https" and f.get("detail") == "certificate_expired")


def earlier_on(row: dict) -> dt.date | None:
    """Datum der früheren Prüfung, deren Befunde ein Radar-Lead übernimmt (ursprünglicher Lead)."""
    return _date(row.get("lead_checked")) or _date((row.get("lead_details") or {}).get("checked_on"))


def also_split(ev: dict, row: dict | None = None) -> tuple[list[str], list[str], dt.date | None]:
    """(heute belegte Zusatz-Zustände, nur früher belegte, Datum der früheren Prüfung)."""
    today = [t for t in ALSO_TYPES if any(isinstance(f, dict) and f.get("type") == t and not _same_event(ev, f)
                                          for f in ev.get("findings") or [])]
    old = [t for t in ALSO_TYPES if t in (ev.get("also") or []) and t not in today and t != ev.get("signal_type")]
    return today, old, earlier_on(row or {})


def also_text(ev: dict, fr: bool, domain: str, row: dict | None = None, today: dt.date | None = None) -> str:
    """Sätze mit den Zusatz-Zuständen des Kombi-Anlasses, jeweils mit Prüfdatum (Beleg). Das datierte
    Radar-Ereignis bleibt der Anlass; der Zustand belegt den Kombi-Anlass (lib/premium.py) und den Wunsch
    „veraltete“/„nicht mobilfähige Website“ (lib/wishes.py)."""
    from extraktor.segments import WEB_EN, WEB_FR, day, jour, uk_day
    words = WEB_FR if fr else WEB_EN
    us = (row or {}).get("country") == "US"
    d = jour if fr else (day if us else uk_day)
    now_types, old_types, old_on = also_split(ev, row)
    parts: list[str] = []
    for t in now_types:
        for f in ev.get("findings") or []:
            if isinstance(f, dict) and f.get("type") == t and not _same_event(ev, f) and f.get("detail") in words:
                p = words[f["detail"]].format(domain=domain, value=f.get("value") or "")
                if p not in parts:
                    parts.append(p)
                break
    out = ""
    if parts:
        on = f" {'du' if fr else 'on'} {d(today)}" if today else ""
        lead_in = f"Le même contrôle{on} a aussi relevé que " if fr else f"The same check{on} also found that "
        out += " " + lead_in + (" ; " if fr else "; ").join(parts[:2]) + "."
    if old_types and old_on:
        ph = [(EARLIER_FR if fr else EARLIER_EN)[t] for t in old_types[:2]]
        out += (f" Notre contrôle du {d(old_on)} avait relevé que " + " ; ".join(ph) + "." if fr
                else f" Our earlier check on {d(old_on)} found that " + "; ".join(ph) + ".")
    return out


def texts(row: dict, ev: dict, domain: str, today: dt.date) -> dict:
    t = _texts(row, ev, domain, today)
    t["event_summary"] += also_text(ev, row["country"] == "FR", domain, row, today)
    return t


def _texts(row: dict, ev: dict, domain: str, today: dt.date) -> dict:
    from extraktor.segments import day, jour, uk_day
    name, fr = row["name"], row["country"] == "FR"
    us = row["country"] == "US"
    d = jour if fr else (day if us else uk_day)
    sig = ev["signal_type"]
    if sig == "website_broken":
        if fr:
            s = (f"{name} : son site {domain} {BROKEN_FR[ev['detail']]} depuis notre contrôle du {d(today)} ; "
                 f"le {d(ev['last_ok'])}, il présentait encore l'entreprise.")
            o = (f"Bonjour, depuis le {d(today)}, le site de {name} ne présente plus votre entreprise. Un site qui "
                 f"fonctionne à nouveau vous intéresserait-il ?")
            w = "Les clients qui cherchent l'entreprise en ligne tombent depuis peu sur une page d'erreur."
        else:
            s = (f"{name}: its website {domain} {BROKEN_EN[ev['detail']]} since our check on {d(today)}; "
                 f"on {d(ev['last_ok'])} it still showed the business.")
            o = (f"Hi, since {d(today)} the {name} website no longer shows your business. Would help getting a "
                 f"working site back online be useful?")
            w = "Customers who look the business up online have recently been landing on an error page."
        return {"event_summary": s, "opener": o, "urgency": "high", "urgency_reason": w}
    na = ev["not_after"]
    if sig == "no_https":
        if fr:
            s = (f"{name} : le certificat de sécurité de son site {domain} a expiré le {d(na)} ; les navigateurs "
                 f"affichent un avertissement avant de l'ouvrir (vérifié le {d(today)}).")
            o = (f"Bonjour, le certificat de sécurité du site de {name} a expiré le {d(na)} et les navigateurs "
                 f"affichent un avertissement. Un site de nouveau sécurisé vous intéresserait-il ?")
            w = "Depuis l'expiration, les navigateurs mettent en garde les visiteurs et la plupart repartent."
        else:
            s = (f"{name}: the security certificate of its website {domain} expired on {d(na)}, so browsers now "
                 f"warn visitors before opening it (checked {d(today)}).")
            o = (f"Hi, the security certificate of the {name} website expired on {d(na)} and browsers now show a "
                 f"warning. Would help getting the site secure again be useful?")
            w = "Since the certificate expired, browsers warn visitors and most of them leave."
        return {"event_summary": s, "opener": o, "urgency": "high", "urgency_reason": w}
    if fr:
        s = (f"{name} : le certificat de sécurité de son site {domain} expire le {d(na)} ; sans renouvellement, "
             f"les navigateurs avertiront les visiteurs avant d'ouvrir le site (vérifié le {d(today)}).")
        o = (f"Bonjour, j'ai remarqué que le certificat de sécurité du site de {name} expire le {d(na)}. Une aide "
             f"pour garder le site sécurisé et à jour vous intéresserait-elle ?")
        w = "Un certificat expiré déclenche un avertissement dans les navigateurs, et la plupart des visiteurs repartent."
    else:
        s = (f"{name}: the security certificate of its website {domain} expires on {d(na)}; if it is not renewed "
             f"in time, browsers will warn visitors before opening the site (checked {d(today)}).")
        o = (f"Hi, I noticed the security certificate of the {name} website runs out on {d(na)}. Would help "
             f"keeping the site secure and up to date be useful?")
        w = "When a certificate runs out, browsers show a security warning and most visitors leave before they see the site."
    return {"event_summary": s, "opener": o, "urgency": "high" if ev.get("days_left", 99) <= 14 else "medium",
            "urgency_reason": w}


# ---------------------------------------------------------------------------- Prüfen (Netz)
def check_one(row: dict, fetcher, today: dt.date) -> dict:
    """Startseite + Zertifikat einer Firma prüfen. {"res", "cert", "event", "error"}."""
    from extraktor.sources import website_check as wc
    from lib import tls_info
    site = row.get("website") or ""
    c = {"name": row.get("name") or "", "country": row.get("country") or "",
         "phone": (row.get("contact") or {}).get("phone") or row.get("phone_main") or "",
         "facts": {"listed_website": site if "//" in site else "http://" + site}}
    try:
        res = wc.inspect(c, fetcher, today)
    except Exception as exc:  # noqa: BLE001 - eine Firma darf den Lauf nicht beenden
        return {"res": None, "cert": None, "event": None, "error": f"{type(exc).__name__}"}
    cert = None
    final = res.get("final_url") or ""
    expired = any(f["type"] == "no_https" and f["detail"] == "certificate_expired" for f in res.get("findings") or [])
    if final.startswith("https://") or expired:
        host = wc.host_of(final if final.startswith("https://") else c["facts"]["listed_website"])
        fetcher._throttle("https://" + host + "/")
        cert = tls_info.read(host)
    ev = detect(row, res, cert, today)
    person = None
    if ev and not ((row.get("person") or {}).get("name") or "").strip():
        try:
            person = legal_person(res.get("final_url") or c["facts"]["listed_website"], res.get("html") or "", fetcher)
        except Exception:  # noqa: BLE001 - die Personensuche darf das Ereignis nie verhindern
            person = None
    return {"res": res, "cert": cert, "event": ev, "error": "", "person": person}


LEGAL_PAGE = re.compile(r"mentions|legal|imprint|impressum|about|propos|qui[-_ ]sommes|contact|team", re.I)
LEGAL_NOTICE = re.compile(r"mentions|legal|imprint|impressum", re.I)
FRENCH_PAGE = re.compile(r"<html[^>]*\blang=[\"']?fr|^https?://[^/]+\.fr(?:/|$)", re.I)
LEGAL_PAGES_MAX = 2  # höchstens 2 Unterseiten je Ereignis (nur bei einem Ereignis, nicht bei jeder Radar-Prüfung)


def legal_person(home_url: str, home_html: str, fetcher) -> dict | None:
    """Ansprechperson mit Namen für einen Radar-Lead (Premium-Labor 05.10.2026: 0 % der UK/FR-Premium-Leads hatten
    einen Namen). Nur mit ausdrücklichem Label aus Startseite, mentions légales/Impressum, Über-uns- oder
    Kontaktseite derselben Domain (websites.person_from_legal_notice – dieselbe Regel wie die Anreicherung).
    robots.txt wird beachtet, höchstens LEGAL_PAGES_MAX Unterseiten. Nichts wird erraten."""
    from extraktor.sources import website_check as wc
    from lib import websites as W
    if not home_url or not home_html:
        return None
    p = W.person_from_legal_notice(W.without_hosting(W.page_text(home_html[:200000])))
    if p:
        return {**p, "source_url": home_url}
    root = re.match(r"^https?://[^/]+", home_url)
    links = [u for u in W.subpage_links(home_html, home_url, limit=4) if LEGAL_PAGE.search(u)]
    if root and not any(LEGAL_NOTICE.search(u) for u in links) and FRENCH_PAGE.search(home_html[:5000] + " " + home_url):
        # mentions légales sind in Frankreich Pflicht (LCEN Art. 6), oft nur per Skript-Menü verlinkt: Standardpfad
        links.insert(0, root.group(0) + "/mentions-legales/")
    links = links[:LEGAL_PAGES_MAX]
    if not links:
        return None
    st, r, _ = wc._robots(fetcher, root.group(0)) if root else ("error", None, None)
    if st != "ok":
        return None
    robots_txt = r.text if r is not None and r.status_code < 400 else ""
    for url in links:
        if W.site_domain(url) != W.site_domain(home_url) or not wc._robots_ok(robots_txt, url):
            continue
        page, _ = wc._get(fetcher, url)
        if page is None or page.status_code >= 400:
            continue
        p = W.person_from_legal_notice(W.without_hosting(W.page_text((page.text or "")[:200000])))
        if p:
            return {**p, "source_url": url}
    return None


def radar_details(row: dict, out: dict, today: dt.date) -> dict:
    res, cert, ev = out["res"] or {}, out["cert"], out["event"]
    prev = (row.get("radar") or {})
    now = state_of(res) if out["res"] else "unknown"
    broken_since = prev.get("broken_since") if now == "broken" and prev.get("state") == "broken" else (
        today.isoformat() if now == "broken" else None)
    events = list(prev.get("events") or [])[-9:]
    if ev:
        events.append({"type": ev["signal_type"], "key": ev["key"], "on": today.isoformat()})
    if now == "unknown" and prev.get("state") in ("page", "broken"):
        # heute keine Aussage (nicht erreichbar, Zeitüberschreitung): letzten belegten Zustand behalten
        return {**prev, "events": events, "unknown_on": today.isoformat(), "note": (res.get("note") or "")[:60],
                "cert_not_after": cert["not_after"].isoformat() if cert else prev.get("cert_not_after")}
    return {"state": now, "checked_on": today.isoformat(), "note": (res.get("note") or "")[:60],
            "types": sorted({f["type"] for f in res.get("findings") or []}), "broken_since": broken_since,
            "cert_not_after": cert["not_after"].isoformat() if cert else None,
            "cert_issuer": (cert or {}).get("issuer", "")[:80] or None, "events": events}


# ---------------------------------------------------------------------------- Lauf (Datenbank)
def candidates(db, country: str, limit: int, min_days: int = RECHECK_DAYS, part: int = 0,
               parts: int = 1) -> list[dict]:
    # immer alle fünf Argumente: es gibt noch die erste Fassung mit drei (nicht gelöscht), PostgREST wählt so eindeutig
    return db.rpc("radar_candidates", {"p_country": country, "p_limit": int(limit), "p_min_days": int(min_days),
                                       "p_part": int(part), "p_parts": max(1, int(parts))}) or []


def _dated_also(ev: dict, row: dict) -> list[str]:
    """Zustände aus einer früheren Prüfung zählen für den Kombi-Anlass nur mit Prüfdatum (Beleg im Text);
    ohne Datum fallen sie weg – nur strenger, nie lockerer."""
    now_types, old_types, old_on = also_split(ev, row)
    return [t for t in (ev.get("also") or []) if t not in old_types or old_on]


def lead_row(row: dict, ev: dict, out: dict, today: dt.date) -> tuple[dict, dict]:
    """(Beobachtung, Lead) für ein Ereignis."""
    from lib import premium
    from lib.websites import site_domain
    res = out["res"] or {}
    url = res.get("final_url") or row.get("website") or ""
    url = url if "//" in url else "http://" + url
    dom = site_domain(url)
    t = texts(row, ev, dom, today)
    details = {"findings": ev["findings"], "checked_on": today.isoformat(), "radar_event": ev["key"],
               "also": _dated_also(ev, row), "listed_website": row.get("website"),
               **({"cert_not_after": ev["not_after"].isoformat()} if ev.get("not_after") else {}),
               **({"last_ok": ev["last_ok"].isoformat()} if ev.get("last_ok") else {})}
    obs = {"company_id": row["company_id"], "kind": "filing", "key": f"radar_{ev['signal_type']}",
           "title": t["event_summary"], "source_name": SOURCE_NAME, "source_url": url,
           "posted_on": ev["event_date"].isoformat(), "first_seen": today.isoformat(), "last_seen": today.isoformat(),
           "details": details}
    contact, person = row.get("contact") or {}, out.get("person") or row.get("person") or {}
    lead = {"company_id": row["company_id"], "segment_id": "S2", "country": row["country"],
            "signal_type": ev["signal_type"], "event_summary": t["event_summary"],
            "event_date": ev["event_date"].isoformat(), "source_name": SOURCE_NAME, "source_url": url,
            "source_date": today.isoformat(), "urgency": t["urgency"], "urgency_reason": t["urgency_reason"],
            "opener": t["opener"], "status": "new",
            **premium.columns({"signal_type": ev["signal_type"], "event_date": ev["event_date"],
                               "source_name": SOURCE_NAME, "source_url": url, "details": details,
                               "person_name": person.get("name") or "", "phone": contact.get("phone") or row.get("phone_main") or "",
                               "email": contact.get("email") or ""}, today)}
    return obs, lead


def person_obs(company_id: str, p: dict, today: dt.date) -> dict:
    """Beobachtung kind=other key=person wie im Extraktor (name, role, source) plus Seite des Belegs."""
    return {"company_id": company_id, "kind": "other", "key": "person", "title": None,
            "source_name": p.get("source") or "Company website (legal notice)", "source_url": p.get("source_url"),
            "posted_on": None, "first_seen": today.isoformat(), "last_seen": today.isoformat(),
            "details": {"name": p["name"], "role": p.get("role"), "source": p.get("source"),
                        "source_url": p.get("source_url"), "found_by": "radar", "checked_on": today.isoformat()}}


def given_out(db, company_id: str) -> bool:
    """Firma schon an einen Käufer gegangen (Probe, Lieferung, reserviert)? Dann kein neuer Lead (exklusiv)."""
    return bool(db.select("leads", {"company_id": f"eq.{company_id}", "status": "in.(sample,delivered,reserved)",
                                    "select": "id", "limit": "1"}))


def save_event(db, row: dict, ev: dict, out: dict, today: dt.date) -> dict | None:
    if given_out(db, row["company_id"]):
        return None
    obs, lead = lead_row(row, ev, out, today)
    o = db.insert("observations", [obs], upsert_on="company_id,kind,key")
    found = out.get("person")
    if found and found.get("name") and not ((row.get("person") or {}).get("name") or "").strip():
        # Name aus dem Impressum der eigenen Website: ersetzt nur die Rolle ohne Namen („Owner (ask for the owner)“)
        db.insert("observations", [person_obs(row["company_id"], found, today)], upsert_on="company_id,kind,key")
    lead["observation_ids"] = [o[0]["id"]] if o else []
    try:
        got = db.insert("leads", [lead])
    except RuntimeError as e:
        if "23505" in str(e):  # gleiches Ereignis schon gespeichert
            return None
        raise
    if got:
        # eine Firma, ein offener Lead: der bisherige offene Lead wird durch das neuere Ereignis ersetzt
        for old in db.select("leads", {"company_id": f"eq.{row['company_id']}", "status": "eq.new",
                                       "id": f"neq.{got[0]['id']}", "select": "id"}):
            db.update("leads", {"id": old["id"], "status": "new"}, {"status": "expired"})
    return got[0] if got else None


CHUNK = 1000  # Kandidaten je Datenbank-Abruf (PostgREST-Höchstzahl; Abfrage ~2 s; gespeicherte Zustände fallen beim nächsten Abruf raus)


def _check_rows(rows: list[dict], fetcher, today: dt.date, workers: int, until: float, stats: Counter,
                log=print) -> tuple[list[dict], list[tuple[dict, dict]], int]:
    states, events, done = [], [], 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for i in range(0, len(rows), workers * 4):
            if until and time.monotonic() >= until:
                break
            batch = rows[i:i + workers * 4]
            for row, out in zip(batch, ex.map(lambda r: check_one(r, fetcher, today), batch)):
                done += 1
                stats["geprueft"] += 1
                if out["error"]:
                    stats["fehler"] += 1
                st = radar_details(row, out, today)
                stats[f"zustand:{st['state']}"] += 1
                if out["cert"]:
                    stats["zertifikat_gelesen"] += 1
                states.append({"company_id": row["company_id"], "kind": "website_audit", "key": "radar",
                               "title": None, "source_name": SOURCE_NAME,
                               "source_url": (out["res"] or {}).get("final_url") or None, "posted_on": None,
                               "first_seen": str(row.get("radar_first") or today.isoformat())[:10],
                               "last_seen": today.isoformat(), "details": st})
                if out["event"]:
                    stats[f"ereignis:{out['event']['signal_type']}"] += 1
                    events.append((row, out))
    return states, events, done


def share(w: dict[str, float], left: list[str]) -> float:
    """Anteil des ersten offenen Landes an der Restzeit (gewichtet; das letzte bekommt alles). Rein, für Tests."""
    total = sum(w.get(c, 1.0) for c in left)
    return 1.0 if len(left) <= 1 or total <= 0 else w.get(left[0], 1.0) / total


def parse_countries(spec: str) -> tuple[list[str], dict[str, float]]:
    """„FR,UK:2,US“ -> (["FR", "UK", "US"], {"UK": 2.0}). Ohne Gewicht = 1."""
    countries, weights = [], {}
    for part in (spec or "").split(","):
        code, _, wt = part.strip().partition(":")
        code = code.strip().upper()
        if not code:
            continue
        countries.append(code)
        if wt.strip():
            weights[code] = float(wt)
    return countries, weights


def run(db, countries: list[str], limit: int, fetcher, deadline: float = 0, workers: int = 16, log=print,
        today: dt.date | None = None, apply: bool = True, min_days: int = RECHECK_DAYS,
        shard: tuple[int, int] = (0, 1), weights: dict[str, float] | None = None, premium_only: bool = False) -> dict:
    """Radar je Land (gewichteter Anteil am Zeitfenster). Ergebnis je Land: Kandidaten, geprüft, Zustände,
    Ereignisse je Art, neue Leads, davon premium. apply=False: nur prüfen, nichts speichern (Test).

    weights: Zeitgewicht je Land (Standard 1). Premium-Labor 05.10.2026: UK/FR haben wenig Premium, das Radar ist dort
    die Hauptquelle; Länder mit kleinem Bestand zuerst, damit ihre Restzeit an die folgenden geht. Ändert nur die
    Reihenfolge/Zeit, nie Prüfregeln oder Abrufgrenzen (1 Abruf je Seite und Tag, robots.txt).

    premium_only (Inhaber 05.10.2026 „nur noch premium leads“): ein Ereignis wird nur dann ein neuer Lead, wenn er
    Premium ist; sonst verworfen (`verworfen_standard`). Das Radar-Gedächtnis (website_audit/radar) wird immer
    gespeichert – es ist die Grundlage, um eine spätere Veränderung zu erkennen."""
    today = today or dt.date.today()
    w = {c: max(0.0, float((weights or {}).get(c, 1.0))) for c in countries}
    report: dict = {}
    for n, co in enumerate(countries):
        stats: Counter = Counter()
        if deadline and time.monotonic() >= deadline:
            log(f"Radar {co}: Zeitfenster vorbei")
            break
        until = time.monotonic() + max(0.0, deadline - time.monotonic()) * share(w, countries[n:]) if deadline else 0
        seen: set[str] = set()
        while stats["geprueft"] < limit and not (until and time.monotonic() >= until):
            try:
                # parallele Teile prüfen getrennte Firmen (Aufteilung in der Datenbank-Funktion): nie zwei Abrufe je Seite
                rows = candidates(db, co, min(CHUNK, limit - stats["geprueft"]), min_days, shard[0], shard[1])
            except Exception as exc:  # noqa: BLE001 - ein Land darf die anderen nicht stoppen
                log(f"Radar {co}: Kandidaten nicht ladbar ({type(exc).__name__}: {str(exc)[:160]})")
                stats["fehler_kandidaten"] += 1
                break
            rows = [r for r in rows if r["company_id"] not in seen]
            if not rows:
                break
            seen.update(r["company_id"] for r in rows)
            stats["kandidaten"] += len(rows)
            states, events, done = _check_rows(rows, fetcher, today, workers, until, stats, log)
            if not apply:
                if done < len(rows):
                    break
                continue
            for i in range(0, len(states), 200):
                try:
                    db.insert("observations", states[i:i + 200], upsert_on="company_id,kind,key")
                except Exception as exc:  # noqa: BLE001
                    log(f"Radar {co}: Zustand nicht gespeichert ({type(exc).__name__}: {str(exc)[:160]})")
            for row, out in events:
                if premium_only:
                    try:
                        tier = lead_row(row, out["event"], out, today)[1]["premium"]["tier"]
                    except Exception:  # noqa: BLE001 - im Zweifel nicht speichern (nur strenger)
                        tier = "standard"
                    if tier != "premium":
                        stats["verworfen_standard"] += 1
                        continue
                try:
                    got = save_event(db, row, out["event"], out, today)
                except Exception as exc:  # noqa: BLE001 - ein Lead darf die übrigen nicht mitreißen
                    log(f"Radar {co}: Ereignis nicht gespeichert ({type(exc).__name__}: {str(exc)[:160]})")
                    continue
                if got:
                    stats["neue_leads"] += 1
                    if (got.get("premium") or {}).get("tier") == "premium":
                        stats["premium"] += 1
            if done < len(rows):
                break
        report[co] = dict(stats)
        log(f"Radar {co}: {dict(stats)}")
    return report
