"""Schutz der Absenderdomain: langsames Hochfahren, Notbremse, Empfänger-Domain prüfen."""
from __future__ import annotations

import datetime as dt

# Tag seit der ersten gesendeten Mail -> maximale Mails pro Tag (über alle Länder zusammen).
DEFAULT_WARMUP = [(0, 10), (3, 15), (7, 25), (14, 40), (21, 60)]
HARD_MAX_PER_DAY = 80  # Resend Gratis-Tarif: 100/Tag; Puffer für Tests und Antworten

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
    return min(cap, HARD_MAX_PER_DAY)


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
