"""Extraktor: eigener Bereich nur für die Lead-Beschaffung (Inhaber 01.10.2026).

Ablauf je Lead (docs/EXTRAKTOR.md):
  Quelle (kostenlos, amtlich) -> Sicherheitsfilter -> Segment-Zuordnung -> Anreicherung (kostenlos)
  -> Texte aus Fakten -> Qualitätskontrolle (qc) -> Signalkontrolle (sc) -> Ampel -> CSV / Datenbank

Nur grüne Leads (qc grün UND sc bestanden) sind lieferbar.
"""
