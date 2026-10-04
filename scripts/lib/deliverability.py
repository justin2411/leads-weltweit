"""Schutz der Absenderdomain: langsames Hochfahren, Notbremse, Empfänger-Domain prüfen."""
from __future__ import annotations

import datetime as dt
import re as _re

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
        # Inhaber hat die Aufwärmphase abgeschaltet (26.09.2026): gleich das Tagesziel. Ab `tagesziel_ab` steigt es
        # täglich um `tagesziel_schritt` bis `tagesziel_max` (Inhaber 03.10.2026: „haupt soll auch bis auf 150 hochgehen“)
        target = int(_cfg("tagesziel") or 100)
        since, step, top = _cfg("tagesziel_ab"), _cfg("tagesziel_schritt"), _cfg("tagesziel_max")
        if since and step and top:
            days = max(0, (today - dt.date.fromisoformat(since)).days)
            target = min(target + int(step) * days, int(top))
        return max(0, min(target, HARD_MAX_PER_DAY, provider_cap() - 10))
    schedule = sorted(schedule or DEFAULT_WARMUP)
    day = 0 if first_sent is None else (today - first_sent).days
    cap = schedule[0][1]
    for start, limit in schedule:
        if day >= start:
            cap = limit
    # Puffer von 10 für Testmails und automatische Antworten
    return max(0, min(cap, HARD_MAX_PER_DAY, provider_cap() - 10))


def window_start(now: dt.datetime, days: int = 30) -> dt.datetime:
    """Beginn des Notbremse-Fensters: letzte `days` Tage, aber nicht vor `notbremse_ab` aus config/versand.yaml
    (Inhaber 03.10.2026: „pass die notbremse an, das sie ab jetzt neu zählt“). Schwelle und Mindestmenge bleiben."""
    start = now - dt.timedelta(days=days)
    raw = _cfg("notbremse_ab")
    if raw:
        reset = dt.datetime.fromisoformat(raw.strip('"').replace("Z", "+00:00"))
        if reset.tzinfo is None:
            reset = reset.replace(tzinfo=dt.timezone.utc)
        start = max(start, reset)
    return start


def emergency_stop(sent: int, bounced: int, complained: int) -> str | None:
    """Grund für einen Versandstopp oder None."""
    if complained >= COMPLAINT_STOP:
        return f"{complained} Spam-Beschwerde(n): Versand gestoppt, Inhaber muss entscheiden"
    if sent >= MIN_SAMPLE and bounced / sent > BOUNCE_STOP:
        return f"Bounce-Quote {bounced}/{sent} = {bounced / sent:.1%} über {BOUNCE_STOP:.0%}: Versand gestoppt"
    return None


TRANSIENT_STATUS = _re.compile(r"^4\.\d{1,3}\.\d{1,3}$")


def is_transient(bounce: dict) -> bool:
    """Vorübergehend: Typ „Transient“ oder erweiterter Status 4.x.x (RFC 3463: „persistent transient failure“, z. B.
    4.4.1 Timeout, „will retry“). Bounce-Analyse 05.10.2026: Unzustellbar-Meldungen aus dem Postfach trugen bisher
    immer „Permanent“, auch bei 4.x.x. Jeder 5.x.x-Status und jede Meldung ohne Status zählt weiter voll."""
    return str(bounce.get("type", "")).lower() == "transient" or bool(TRANSIENT_STATUS.match(str(bounce.get("status") or "").strip()))


def count_bounces(events: list[dict]) -> tuple[int, int]:
    """(Bounces, Beschwerden) für die Notbremse, je Empfängeradresse gezählt (Inhaber 03.10.2026, Punkt 3):
    dieselbe Adresse zählt nur einmal, eine vorübergehende Abweisung („Transient“, Postfach existiert)
    (oder Status 4.x.x) erst, wenn sie bei derselben Adresse wiederholt auftritt. Ereignisse: type, payload, to_email (oder message_id)."""
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
        if is_transient(bounce):
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
