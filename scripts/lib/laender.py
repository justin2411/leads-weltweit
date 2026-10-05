"""Aktive Märkte der Werke an EINER Stelle (Inhaber 05.10.2026: „wenn wir z.b. gerade nur mails an us uk und fr
rausschicken braucht es die anderen speicher nicht befüllen, immer das was wir gerade aktiv machen und was umsatz
bringt“).

- Aktiv = Paare Segment/Land aus config/fokus.yaml `fokus` (lib/fokus.focus_pairs), ohne INACTIVE. Nur dafür füllen
  Lead-Werk (Extraktor, Linien/Autopilot), Kunden-Werk und Proben-Vorrat. Fehlt die Liste, gilt keine Einschränkung
  außer INACTIVE (ein kaputtes fokus.yaml darf die Werke nicht anhalten).
- INACTIVE = ganz raus, auch nicht mehr lieferbar (release_gate). HK: Inhaber 05.10.2026 („hier dann eher rausnehmen,
  weil wir HK nicht easy nutzen dürfen laut rechtliches“), countries.yaml HK allowed: false.
- Nichts wird gelöscht: vorhandene Leads, Käufer und Proben bleiben; ruhende Märkte werden nur nicht mehr befüllt.
  Mail-Erlaubnis bleibt Sache von countries.yaml (allowed); diese Liste macht nur strenger, nie lockerer.
"""
from __future__ import annotations

INACTIVE = frozenset({"HK"})


def _keep(codes, ok):
    kept = [c for c in codes if ok(c)]
    return type(codes)(kept) if isinstance(codes, (tuple, set, frozenset, list)) else tuple(kept)


def active(codes):
    """Länder ohne die ganz abgeschalteten (INACTIVE); Reihenfolge und Typ bleiben."""
    return _keep(codes, lambda c: c not in INACTIVE)


def is_active(code: str | None) -> bool:
    return bool(code) and code not in INACTIVE


def focus_pairs() -> list[tuple[str, str]]:
    from lib.fokus import focus_pairs as fp
    return [(s, c) for s, c in fp() if c not in INACTIVE]


def producing_countries(pairs: list[tuple[str, str]] | None = None) -> set[str] | None:
    """Länder, die die Werke befüllen (aus config/fokus.yaml); None = keine Fokus-Liste, nur INACTIVE gilt."""
    pairs = focus_pairs() if pairs is None else pairs
    return {c for _, c in pairs} or None


def producing(codes, pairs: list[tuple[str, str]] | None = None):
    """Länder, die die Werke jetzt befüllen: aktiv (nicht INACTIVE) und im Fokus. Reihenfolge und Typ bleiben."""
    on = producing_countries(pairs)
    return _keep(codes, lambda c: c not in INACTIVE and (on is None or c in on))


def pair_producing(segment: str | None, country: str | None, pairs: list[tuple[str, str]] | None = None) -> bool:
    """Wird Segment × Land befüllt? Ohne Fokus-Liste: alles außer INACTIVE."""
    if not country or country in INACTIVE:
        return False
    pairs = focus_pairs() if pairs is None else pairs
    return not pairs or (segment, country) in pairs
