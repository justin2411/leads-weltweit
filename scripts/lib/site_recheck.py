"""Nachprüfung „ohne Website“ vor Probe und Lieferung (Inhaber 02.10.2026).

Anlass: Probe-Lead „202 Main Coffee“ ging als „ohne Website“ raus, hat aber 202main.coffee. Leads aus dem Bestand
wurden mit der alten, schwächeren Suche geprüft. Bevor ein solcher Lead an einen Kunden geht, sucht diese Prüfung
mit den aktuellen Kandidaten (inkl. Branchen-Endungen) noch einmal. Findet sie eine bestätigte Website der Firma,
geht der Lead nicht raus: Status `expired`, Website an der Firma gespeichert (nichts wird gelöscht).
Keine Suchmaschinen, robots.txt über enrich.Fetcher (wie im Lead-Werk).
"""
from __future__ import annotations

import datetime as dt
import re

NO_SITE_SIGNALS = {"no_website"}


def _candidate(co: dict) -> dict:
    addr = co.get("address") or ""
    zm = re.search(r"\b(\d{5})(?:-\d{4})?\b", addr) if co.get("country") == "US" else \
        re.search(r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{4,5})\b", addr.upper())
    return {"name": co.get("name") or "", "country": co.get("country") or "", "city": co.get("city") or "",
            "state": co.get("region") or "", "zip": zm.group(1) if zm else "", "street": addr.split(",")[0],
            "phone": co.get("phone_main") or "", "email": "", "source": "recheck",
            "facts": {"category": (co.get("industry") or "").replace("_", " ")}}


def found_site(co: dict, fetcher) -> str | None:
    """Bestätigte Website der Firma mit den aktuellen Kandidaten, sonst None."""
    from extraktor.enrich import find_site
    r = find_site(_candidate(co), fetcher)
    site = r.get("site") or {}
    return site.get("url") if site.get("verified") else None


def drop_with_site(db, leads: list[dict], fetcher=None, log=print) -> set[str]:
    """Prüft die „ohne Website“-Leads der Liste; gibt die IDs zurück, deren Firma doch eine Website hat
    (und markiert sie in der Datenbank). Andere Leads bleiben unberührt."""
    todo = [l for l in leads if l.get("signal_type") in NO_SITE_SIGNALS and l.get("id")]
    if not todo:
        return set()
    if fetcher is None:
        from enrich import Fetcher
        fetcher = Fetcher()
    ids = sorted({l["company_id"] for l in todo})
    cos = {}
    for i in range(0, len(ids), 100):
        for c in db.select("watch_companies", {"id": f"in.({','.join(ids[i:i + 100])})",
                                               "select": "id,name,country,city,region,address,phone_main,industry,website"}):
            cos[c["id"]] = c
    bad: set[str] = set()
    for l in todo:
        co = cos.get(l["company_id"])
        if not co:
            continue
        url = co.get("website") or found_site(co, fetcher)
        if not url:
            continue
        bad.add(l["id"])
        log(f"Nachprüfung: {co['name']} hat doch eine Website ({url}) – Lead geht nicht raus")
        try:
            db.update("leads", {"id": l["id"]}, {"status": "expired"})
            if not co.get("website"):
                db.update("watch_companies", {"id": co["id"]},
                          {"website": url, "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        except Exception as exc:  # noqa: BLE001 - Lead geht trotzdem nicht raus
            log(f"  Markierung fehlgeschlagen: {type(exc).__name__}: {exc}")
    return bad
