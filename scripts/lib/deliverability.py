"""Schutz der Absenderdomain: langsames Hochfahren, Notbremse, Empfänger-Domain prüfen."""
from __future__ import annotations

import datetime as dt

# Tag seit der ersten gesendeten Mail -> maximale Mails pro Tag (über alle Länder zusammen).
# Ziel des Inhabers (26.09.2026): 100 pro Tag (Resend Gratis), hochgefahren über gut eine Woche.
DEFAULT_WARMUP = [(0, 25), (2, 50), (5, 75), (8, 100)]
HARD_MAX_PER_DAY = 250


def provider_cap() -> int:
    """Tagesgrenze des Versanddienstes aus config/versand.yaml (Resend Gratis: 100, Pro: deutlich mehr)."""
    import re
    from pathlib import Path
    cfg = Path(__file__).resolve().parents[2] / "config" / "versand.yaml"
    try:
        m = re.search(r"^anbieter_tageslimit:\s*(\d+)", cfg.read_text(), re.M)
        return int(m.group(1)) if m else 90
    except OSError:
        return 90

BOUNCE_STOP = 0.05       # über 5 % Bounces -> Versand stoppen (Inhaber 26.09.2026: „lockerer“)
COMPLAINT_STOP = 1       # eine einzige Spam-Beschwerde -> Versand stoppen
MIN_SAMPLE = 100         # Bounce-Quote erst ab 100 gesendeten Mails bewerten (Entscheidung Inhaber 26.09.2026)


def _cfg(key: str) -> str | None:
    import re
    from pathlib import Path
    cfg = Path(__file__).resolve().parents[2] / "config" / "versand.yaml"
    try:
        m = re.search(rf"^{key}:\s*(\S+)", cfg.read_text(), re.M)
        return m.group(1) if m else None
    except OSError:
        return None


def warmup_cap(first_sent: dt.date | None, today: dt.date, schedule=None) -> int:
    if _cfg("aufwaermphase") == "false" and schedule is None:
        # Inhaber hat die Aufwärmphase abgeschaltet (26.09.2026): gleich das Tagesziel
        target = int(_cfg("tagesziel") or 100)
        return max(0, min(target, HARD_MAX_PER_DAY, provider_cap() - 10))
    schedule = sorted(schedule or DEFAULT_WARMUP)
    day = 0 if first_sent is None else (today - first_sent).days
    cap = schedule[0][1]
    for start, limit in schedule:
        if day >= start:
            cap = limit
    # Puffer von 10 für Testmails und automatische Antworten
    return max(0, min(cap, HARD_MAX_PER_DAY, provider_cap() - 10))


def emergency_stop(sent: int, bounced: int, complained: int) -> str | None:
    """Grund für einen Versandstopp oder None."""
    if complained >= COMPLAINT_STOP:
        return f"{complained} Spam-Beschwerde(n): Versand gestoppt, Inhaber muss entscheiden"
    if sent >= MIN_SAMPLE and bounced / sent > BOUNCE_STOP:
        return f"Bounce-Quote {bounced}/{sent} = {bounced / sent:.1%} über {BOUNCE_STOP:.0%}: Versand gestoppt"
    return None


def count_bounces(events: list[dict]) -> tuple[int, int]:
    """(Bounces, Beschwerden) für die Notbremse, je Empfängeradresse gezählt (Inhaber 03.10.2026, Punkt 3):
    dieselbe Adresse zählt nur einmal, eine vorübergehende Abweisung („Transient“, Postfach existiert)
    erst, wenn sie bei derselben Adresse wiederholt auftritt. Ereignisse: type, payload, to_email (oder message_id)."""
    hard: set[str] = set()
    soft: dict[str, int] = {}
    complained: set[str] = set()
    for e in events:
        who = (e.get("to_email") or e.get("message_id") or "").lower()
        if e.get("type") == "complained":
            complained.add(who)
            continue
        if e.get("type") != "bounced":
            continue
        bounce = ((e.get("payload") or {}).get("bounce") or {}) if isinstance(e.get("payload"), dict) else {}
        if str(bounce.get("type", "")).lower() == "transient":
            soft[who] = soft.get(who, 0) + 1
        else:
            hard.add(who)
    hard |= {w for w, n in soft.items() if n >= 2}
    return len(hard), len(complained)


def interleave(messages: list[dict], key: str = "experiment_id") -> list[dict]:
    """Abwechselnd aus jedem Experiment, damit alle Zielgruppen gleichmäßig vorankommen."""
    buckets: dict[str, list[dict]] = {}
    for m in messages:
        buckets.setdefault(m[key], []).append(m)
    out, queues = [], list(buckets.values())
    while any(queues):
        for q in queues:
            if q:
                out.append(q.pop(0))
    return out


def domain_accepts_mail(domain: str) -> bool:
    """MX-Eintrag vorhanden? Ohne MX (und ohne A-Eintrag) wäre die Mail ein sicherer Bounce."""
    try:
        import dns.resolver
    except ImportError:  # pragma: no cover
        return True
    try:
        return len(dns.resolver.resolve(domain, "MX", lifetime=10)) > 0
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
        try:
            dns.resolver.resolve(domain, "A", lifetime=10)
            return True
        except Exception:
            return False
    except Exception:
        return True  # Zeitüberschreitung o. Ä.: nicht blockieren, Bounce-Notbremse greift
