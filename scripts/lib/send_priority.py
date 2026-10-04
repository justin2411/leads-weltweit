"""Reihenfolge der Erstmails (Agentenauftrag 04.10.2026): die besten Entwürfe je Fokus-Experiment zuerst.

Ändert nur die Reihenfolge, nie Menge, Limits, Prüfregeln, Sperrliste oder Notbremse. Jede Mail durchläuft im
Versand weiter alle Prüfungen. Score aus kostenlosen, schon gespeicherten Daten:
  +2  Adresse auf der eigenen Firmendomain (Mail von der Website statt Freemail/fremder Domain)
  +1  Quelle nicht Overture (Kontakt direkt von der Firmenwebsite/aus dem Register)
  +1  erkannte Kapitalgesellschaft (lib.rules.is_legal_person) – in US bisher weniger Rückläufer
  +1  Adresse in den letzten 30 Tagen auf der eigenen Website bestätigt (checked_at, Quelle nicht Overture;
      Bounce-Analyse 05.10.2026: höchste Zustellsicherheit zuerst)
  +0..1  prospects.qualitaet_score / 100
Gleichstand: älteste Freigabe zuerst (wie bisher)."""
from __future__ import annotations

import datetime as dt

from .rules import is_legal_person

LIGHT_SELECT = "id,approved_at,to_email,prospects(country,domain,source_url,legal_form,qualitaet_score,checked_at)"


def fresh(p: dict, now: dt.datetime | None = None) -> bool:
    """Adresse in den letzten 30 Tagen auf der eigenen Website gesehen (nicht nur aus Fremddaten)."""
    if "overture" in (p.get("source_url") or "").lower() or not p.get("checked_at"):
        return False
    try:
        when = dt.datetime.fromisoformat(str(p["checked_at"]).replace("Z", "+00:00"))
    except ValueError:
        return False
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    return (now or dt.datetime.now(dt.timezone.utc)) - when <= dt.timedelta(days=30)


def score(m: dict) -> float:
    p = m.get("prospects") or {}
    s = 0.0
    dom = (p.get("domain") or "").lower().removeprefix("www.")
    mail_dom = (m.get("to_email") or "").rsplit("@", 1)[-1].lower()
    if dom and mail_dom == dom:
        s += 2
    if "overture" not in (p.get("source_url") or "").lower():
        s += 1
    if is_legal_person(p.get("country") or "", p.get("legal_form")):
        s += 1
    if fresh(p):
        s += 1
    try:
        s += max(0.0, min(1.0, float(p.get("qualitaet_score") or 0) / 100))
    except (TypeError, ValueError):
        pass
    return s


def rank(rows: list[dict]) -> list[dict]:
    """Beste zuerst; bei gleichem Score älteste Freigabe zuerst (stabile Sortierung)."""
    rows = sorted(rows, key=lambda m: m.get("approved_at") or "")
    return sorted(rows, key=score, reverse=True)


def best_ids(db, experiment_id: str, n: int) -> list[str]:
    """IDs der n besten freigegebenen Erstmails eines Experiments (leichte Abfrage, ohne Mailtexte)."""
    rows = db.select_all("messages", {"status": "eq.approved", "kind": "eq.initial",
                                      "experiment_id": f"eq.{experiment_id}", "select": LIGHT_SELECT})
    return [m["id"] for m in rank(rows)[:n]]
