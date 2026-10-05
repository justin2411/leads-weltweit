"""Lead-Bestand je Käufer-Zielgruppe (Inhaber 05.10.2026: „starte gerne automatisch neue branchen die getestet werden“).

Manche Zielgruppen haben keine eigenen Leads, sondern verkaufen an dieselben Firmen wie eine andere Zielgruppe:
Marketing-/SEO-Agenturen (S12) gewinnen genau die Firmen, die auch Webagenturen (S2) suchen – ohne oder mit
schwacher Website (Branchen-Test 05.10.2026, brain_knowledge `branchen-test-0510`). Statt die Leads zu kopieren,
liest S12 den S2-Bestand.

Exklusivität bleibt dabei streng: Ein Lead ist eine Zeile in `leads` mit einem Status. Jede Probe setzt ihn auf
`sample` bzw. `reserved`, jede Lieferung auf `delivered`; gewählt wird nur `status = new`. Ein Lead, den ein
S2-Käufer schon bekommen hat, geht also nie an einen S12-Käufer und umgekehrt („jeder lead geht nur an einen käufer“,
Inhaber 01.10.2026) – strenger als „exklusiv je Branche“.

Nur lesen: ändert keine Leads, keine Prüfregel, keinen Versand.
"""
from __future__ import annotations

# Käufer-Zielgruppe -> Zielgruppe, deren Leads sie bekommt. Fehlt sie hier, hat sie eigene Leads.
LEAD_SEGMENT: dict[str, str] = {"S12": "S2"}


def lead_segment(seg: str | None) -> str:
    """Zielgruppe, deren Leads diese Käufer-Zielgruppe bekommt (S12 -> S2, sonst unverändert)."""
    s = (seg or "").strip().upper()
    return LEAD_SEGMENT.get(s, s)


def shares_leads(seg: str | None) -> bool:
    """True, wenn die Zielgruppe den Lead-Bestand einer anderen nutzt."""
    return lead_segment(seg) != (seg or "").strip().upper()


def buyers_of(lead_seg: str | None) -> set[str]:
    """Alle Käufer-Zielgruppen, die Leads dieser Zielgruppe bekommen (S2 -> {S2, S12})."""
    s = (lead_seg or "").strip().upper()
    return {s} | {k for k, v in LEAD_SEGMENT.items() if v == s}
