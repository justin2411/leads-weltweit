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

BOUNCE_STOP = 0.03       # über 3 % Bounces -> Versand stoppen
COMPLAINT_STOP = 1       # eine einzige Spam-Beschwerde -> Versand stoppen
MIN_SAMPLE = 20          # Bounce-Quote erst ab 20 gesendeten Mails bewerten


def warmup_cap(first_sent: dt.date | None, today: dt.date, schedule=None) -> int:
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
