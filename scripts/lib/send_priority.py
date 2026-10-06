"""Reihenfolge der Erstmails (Agentenauftrag 04.10.2026): die besten Entwürfe je Fokus-Experiment zuerst.

Ändert nur die Reihenfolge, nie Menge, Limits, Prüfregeln, Sperrliste oder Notbremse. Jede Mail durchläuft im
Versand weiter alle Prüfungen. Score aus kostenlosen, schon gespeicherten Daten:
  +2  Adresse auf der eigenen Firmendomain (Mail von der Website statt Freemail/fremder Domain)
  +1  Quelle nicht Overture (Kontakt direkt von der Firmenwebsite/aus dem Register)
  +1  erkannte Kapitalgesellschaft (lib.rules.is_legal_person) – in US bisher weniger Rückläufer
  +1  Adresse in den letzten 30 Tagen auf der eigenen Website bestätigt (checked_at, Quelle nicht Overture;
      Bounce-Analyse 05.10.2026: höchste Zustellsicherheit zuerst)
  +0..1  prospects.qualitaet_score / 100
  +1 / −1  nur US: Postfach-Anbieter des Empfängers aus dem MX (Gehirn 06.10.2026, harte Rückläufer 30 T: große
      Anbieter Google/M365/Zoho/Proofpoint … ~4,5 %, kleiner/eigener Server 7,4 %, Rackspace 4 von 6). Großer
      Anbieter +1, Rackspace −1, Rest 0. DNS nur für die vorderen Kandidaten, je Lauf zwischengespeichert.
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


# Anbieter-Bonus je Empfänger-Domain (von best_ids aus frischem DNS gefüllt, nur innerhalb eines Laufs)
MX_COUNTRIES = {"US"}
BAD_PROVIDERS = {"rackspace"}
_PROVIDER_BONUS: dict[str, float] = {}


def provider_bonus(provider: str | None) -> float:
    if provider is None:
        return 0.0
    return -1.0 if provider in BAD_PROVIDERS else 1.0


def _mail_dom(m: dict) -> str:
    return (m.get("to_email") or "").rsplit("@", 1)[-1].strip().lower()


def score(m: dict) -> float:
    p = m.get("prospects") or {}
    s = 0.0
    if (p.get("country") or "").upper() in MX_COUNTRIES:
        s += _PROVIDER_BONUS.get(_mail_dom(m), 0.0)
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


def load_providers(rows: list[dict], mx=None, workers: int = 16) -> None:
    """Anbieter-Bonus für die Empfänger-Domains (nur MX_COUNTRIES) aus frischem DNS; Fehler zählen als 0."""
    from .address_risk import provider
    if mx is None:
        from .deliverability import mx_hosts as mx
    doms = sorted({_mail_dom(m) for m in rows if ((m.get("prospects") or {}).get("country") or "").upper()
                   in MX_COUNTRIES and _mail_dom(m) and _mail_dom(m) not in _PROVIDER_BONUS})
    if not doms:
        return

    def one(d: str) -> float:
        try:
            hosts = mx(d)
        except Exception:  # noqa: BLE001 - nur Reihenfolge: DNS-Fehler = neutral
            return 0.0
        return provider_bonus(provider(hosts)) if hosts else 0.0

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=workers) as ex:
        _PROVIDER_BONUS.update(zip(doms, ex.map(one, doms)))


def best_ids(db, experiment_id: str, n: int, mx=None) -> list[str]:
    """IDs der n besten freigegebenen Erstmails eines Experiments (leichte Abfrage, ohne Mailtexte). Für die vorderen
    Kandidaten (3 × n) wird der Postfach-Anbieter nachgeschlagen und neu sortiert – nur Reihenfolge."""
    rows = db.select_all("messages", {"status": "eq.approved", "kind": "eq.initial",
                                      "experiment_id": f"eq.{experiment_id}", "select": LIGHT_SELECT})
    head = rank(rows)[:max(3 * n, n + 50)]
    load_providers(head, mx)
    return [m["id"] for m in rank(head)[:n]]
