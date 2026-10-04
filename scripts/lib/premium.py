"""Premium-Bewertung je Lead (Inhaber 05.10.2026: „sehr gute, einzigartige Trigger, die wir gut verkaufen können“).

Punktzahl 0–100 aus belegbaren Merkmalen des einzelnen Leads, Stufe `premium` oder `standard`:

  Frische       35  datiertes Ereignis höchstens FRESH_HIGH (14) Tage alt
                20  datiertes Ereignis höchstens FRESH_MID (30) Tage alt
  Kombi-Anlass  25  datiertes Ereignis UND ein Website-Zustand (Website-Befund oder keine Website), z. B.
                    Neugründung + keine Website, Umzug + veraltete Website, Zertifikat läuft ab + alte Technik
  Beleg         10  Quelle mit Link, Name der Quelle und Datum
  Ansprechperson 15 mit Namen (nicht nur Rolle)
  Kontakt       15  Telefon und E-Mail vorhanden

Datiert ist ein Ereignis nur, wenn sein Datum ein echtes Geschehen ist (Registereintrag, Umzugsmeldung,
Ablaufdatum eines Zertifikats, vom Radar festgestellte Veränderung). Ein Website-Zustand, der beim Prüfen gesehen
wurde (veraltet, nicht handytauglich, keine Website laut Overture), hat kein Ereignisdatum – sein Prüfdatum zählt
nicht als Frische. Premium = mindestens PREMIUM_MIN Punkte UND ein frisches datiertes Ereignis.

Der Wert ändert nie, OB ein Lead rausgeht – das entscheidet allein die Drei-Stufen-Freigabe (lib/release_gate.py).
Er ändert nur die Reihenfolge (Proben-Vorrat, Lieferungen, Landingpage-Beispiele: premium zuerst, Standard nur als
Auffüllung, solange es keine 10 Premium-Leads gibt – Inhaber 05.10.2026 „nur noch premium leads“).
"""
from __future__ import annotations

import datetime as dt
import re

FRESH_HIGH, FRESH_MID = 14, 30
PREMIUM_MIN = 70
POINTS = {"fresh_high": 35, "fresh_mid": 20, "combo": 25, "evidence": 10, "person": 15, "contact": 15}

# Website-Zustände (gesehen beim Prüfen, kein Ereignisdatum)
STATE_SIGNALS = {"no_https", "website_not_mobile", "website_outdated", "website_broken", "no_website"}
# Signale, deren Datum immer ein echtes Ereignis ist
DATED_SIGNALS = {"relocation", "cert_expiring", "new_incorporation", "incorporation", "new_company",
                 "funding_new_company", "contract_award", "new_fleet"}
# Quellen, deren Ereignisdatum ein Registereintrag ist (auch wenn das Signal „keine Website“ heißt)
DATED_SOURCES = re.compile(r"FMCSA|Connecticut|Companies House|BODACC|SEC EDGAR|change radar|contract award",
                           re.I)


def _date(v) -> dt.date | None:
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def is_dated(signal_type: str, source_name: str = "", details: dict | None = None) -> bool:
    """Ist das Ereignisdatum dieses Leads ein echtes Geschehen (nicht nur das Prüfdatum)?"""
    if (details or {}).get("radar_event"):
        return True
    return signal_type in DATED_SIGNALS or bool(DATED_SOURCES.search(source_name or ""))


def states(signal_type: str, details: dict | None = None) -> set[str]:
    """Website-Zustände, die der Lead belegt (eigenes Signal + Befunde in den Belegen)."""
    out = {signal_type} & STATE_SIGNALS
    for f in (details or {}).get("findings") or []:
        t = f.get("type") if isinstance(f, dict) else f
        if t in STATE_SIGNALS:
            out.add(t)
    for t in (details or {}).get("also") or []:
        if t in STATE_SIGNALS:
            out.add(t)
    return out


def score(lead: dict, today: dt.date | None = None) -> dict:
    """lead: signal_type, event_date, source_name, source_url, details (Belege des Ereignisses), person_name,
    phone, email. Ergebnis {"score", "tier", "reasons"} – reasons sind kurze Schlüssel für Anzeige und Tests."""
    today = today or dt.date.today()
    sig = lead.get("signal_type") or ""
    details = lead.get("details") or {}
    ev = _date(lead.get("event_date"))
    dated = is_dated(sig, lead.get("source_name") or "", details)
    pts, reasons = 0, []
    fresh = False
    if dated and ev is not None:
        age = (today - ev).days
        if 0 <= age <= FRESH_HIGH:
            pts += POINTS["fresh_high"]
            reasons.append(f"frisch_{age}_tage")
            fresh = True
        elif 0 <= age <= FRESH_MID:
            pts += POINTS["fresh_mid"]
            reasons.append(f"frisch_{age}_tage")
            fresh = True
    # Kombi: datiertes Ereignis + Website-Zustand. Registerquellen mit Signal „keine Website“ = Neugründung + keine
    # Website; Radar-/Umzugs-Leads tragen die Befunde der Website in details.findings/also.
    st = states(sig, details)
    registry_state = sig in STATE_SIGNALS and not details.get("radar_event") \
        and bool(DATED_SOURCES.search(lead.get("source_name") or ""))
    if dated and (st - {sig} or (st and registry_state)):
        pts += POINTS["combo"]
        reasons.append("kombi:" + "+".join(sorted(st)))
    if re.match(r"^https?://", lead.get("source_url") or "") and lead.get("source_name") and ev:
        pts += POINTS["evidence"]
        reasons.append("beleg")
    if (lead.get("person_name") or "").strip():
        pts += POINTS["person"]
        reasons.append("person")
    if (lead.get("phone") or "").strip() and (lead.get("email") or "").strip():
        pts += POINTS["contact"]
        reasons.append("kontakt")
    pts = min(100, pts)
    tier = "premium" if pts >= PREMIUM_MIN and fresh else "standard"
    return {"score": pts, "tier": tier, "reasons": reasons}


def columns(lead: dict, today: dt.date | None = None) -> dict:
    """Spalten für signalwerk.leads: premium_score, premium (Stufe + Gründe)."""
    s = score(lead, today)
    return {"premium_score": s["score"], "premium": {"tier": s["tier"], "reasons": s["reasons"],
                                                     "on": (today or dt.date.today()).isoformat()}}


def tier_now(row: dict, today: dt.date | None = None) -> str:
    """Stufe eines gespeicherten Leads heute: „premium“ nur, solange das Ereignis höchstens FRESH_MID Tage alt ist
    (die Stufe wird beim Speichern berechnet und veraltet sonst unbemerkt)."""
    p = row.get("premium") or {}
    if not isinstance(p, dict) or p.get("tier") != "premium":
        return "standard"
    ev = _date(row.get("event_date"))
    # -1: Ereignisdatum aus einer anderen Zeitzone (Lauf kurz nach Mitternacht UTC) gilt als heute
    if ev is None or not -1 <= ((today or dt.date.today()) - ev).days <= FRESH_MID:
        return "standard"
    return "premium"


def count(rows: list[dict], today: dt.date | None = None) -> int:
    """Wie viele dieser Leads heute Premium sind."""
    return sum(tier_now(r, today) == "premium" for r in rows)


def sort_key(row: dict, today: dt.date | None = None, weights: dict[str, float] | None = None) -> tuple:
    """Premium zuerst (nur Reihenfolge, schließt nichts aus): Stufe heute, dann Punktzahl; ohne Wert zuletzt.
    Standard-Leads füllen nur auf, wenn es keine 10 Premium-Leads gibt (Inhaber 05.10.2026, Übergang).

    weights: Kunden-Feedback je Anlass (lib/feedback.py, Feedback-Werk 05.10.2026) – Umgewichtung der Punktzahl
    innerhalb derselben Stufe (0,8–1,25). Ändert nie die Stufe und nie, ob ein Lead rausgeht."""
    v = row.get("premium_score")
    if not isinstance(v, (int, float)):
        return (0 if tier_now(row, today) == "premium" else 1, 1)
    if weights:
        from lib.feedback import weight_for
        v = v * weight_for(row, weights)
    return (0 if tier_now(row, today) == "premium" else 1, -round(v, 3))


def key_with(weights: dict[str, float] | None, today: dt.date | None = None):
    """sort_key mit festen Feedback-Gewichten (für sorted(key=…))."""
    return lambda row: sort_key(row, today, weights)
