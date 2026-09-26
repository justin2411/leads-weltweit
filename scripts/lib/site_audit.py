"""Prüft die Startseite einer Firma auf Zeichen einer veralteten Website.

Nur einfache, belegbare Befunde aus dem HTML; keine Bewertung von Geschmack.
"""
from __future__ import annotations

import datetime as dt
import re


def audit_html(html: str, final_url: str, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    h = html or ""
    low = h.lower()
    findings: list[str] = []

    if not final_url.lower().startswith("https://"):
        findings.append("keine Verschlüsselung (http statt https)")
    if not re.search(r"<meta[^>]+name=[\"']viewport[\"']", low):
        findings.append("nicht mobil optimiert (kein viewport-Tag)")

    years = [int(y) for y in re.findall(r"(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})", low)]
    if years and max(years) <= today.year - 3:
        findings.append(f"Copyright-Jahr {max(years)}")

    m = re.search(r"jquery[-.]?(\d)\.(\d+)", low)
    if m and (int(m.group(1)), int(m.group(2))) < (1, 12):
        findings.append(f"sehr alte jQuery-Version {m.group(1)}.{m.group(2)}")
    if re.search(r"\.swf\b|shockwave-flash", low):
        findings.append("Flash-Inhalte")
    if re.search(r"<font\b|<center\b|<marquee\b|<frameset\b", low):
        findings.append("veraltete HTML-Elemente (font/center/frameset)")
    if len(re.findall(r"<table\b", low)) >= 5 and "<div" not in low[:5000]:
        findings.append("Layout aus Tabellen")
    gen = re.search(r"<meta[^>]+name=[\"']generator[\"'][^>]+content=[\"']([^\"']+)", low)
    if gen and re.search(r"frontpage|dreamweaver|iweb|wordpress [1-4]\.", gen.group(1)):
        findings.append(f"alter Seiten-Generator ({gen.group(1)})")

    return {"findings": findings, "score": len(findings), "checked_on": today.isoformat()}
