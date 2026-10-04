"""Feedback-Werk (Inhaber 05.10.2026): Kunden bewerten gelieferte Leads, die Premium-Bewertung lernt daraus.

Ablauf
  1. Lieferung (deliveries.py) und Probe (sample_stock.py) bekommen je einen Link `/bewerten?t=<token>`
     (Zeile in `signalwerk.lead_feedback_links` mit den Lead-IDs). Kein Tracking-Pixel, keine Öffnungsmessung,
     keine Pflicht für den Kunden: der Link steht als freiwillige Zeile in der Mail.
  2. Auf der Seite markiert der Kunde je Lead „gut“ oder „schlecht“ und optional „Auftrag gewonnen“
     (`signalwerk.lead_feedback`, je Link und Lead eine Zeile, spätere Klicks überschreiben).
  3. `weights()` macht daraus ein Gewicht je Anlass (signal_type) und Land. premium.sort_key nutzt es nur für die
     Reihenfolge (Umgewichtung). Es ändert nie, OB ein Lead rausgeht (Drei-Stufen-Freigabe), und nie die Stufe
     „premium“/„standard“ – Prüfregeln werden dadurch nie gelockert.

Gewicht: geglättete Quote positiver Bewertungen (gewonnen zählt doppelt positiv) mit Vorwert 50 % (PRIOR je Seite),
erst ab MIN_N Bewertungen, begrenzt auf [W_MIN, W_MAX]. Land vor Anlass gesamt, sonst 1.0.
"""
from __future__ import annotations

import os
import secrets

MIN_N = 5          # so viele Bewertungen braucht ein Anlass, bevor er umgewichtet wird
PRIOR = 5          # Glättung: so viele gedachte Bewertungen je Seite (gut/schlecht) vorab
SPREAD = 0.6       # Quote 100 % -> 1 + 0.5 * SPREAD
W_MIN, W_MAX = 0.8, 1.25
RATINGS = ("gut", "schlecht")

TEXT = {
    "en": "Optional: rate these leads with one click (good / bad / won a job) – it helps us send you better ones: {url}",
    "fr": "Facultatif : notez ces leads en un clic (bon / mauvais / contrat gagné) – cela nous aide à mieux cibler : {url}",
}


def site() -> str:
    return (os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").strip().rstrip("/")


def new_token() -> str:
    return secrets.token_urlsafe(24)


def url(token: str) -> str:
    return f"{site()}/bewerten?t={token}"


def mail_line(lang: str, token: str) -> str:
    """Freiwillige Zeile für Lieferung/Probe (Text; das HTML macht daraus einen normalen Link)."""
    return TEXT.get(lang, TEXT["en"]).format(url=url(token))


LINK_LABEL = {"en": "Rate these leads", "fr": "Noter ces leads"}


def add_to_mail(body: str, lang: str, token: str | None, blocks: dict | None = None) -> tuple[str, dict]:
    """Bewertungs-Zeile als eigenen Absatz vor den Gruß setzen (der letzte Absatz ist Gruß + Signatur) und für das HTML
    einen Absatz mit normalem Link (kein Tracking-Parameter, kein Pixel). Ohne Token unverändert."""
    out = dict(blocks or {})
    if not token:
        return body, out
    line = mail_line(lang, token)
    paras = body.rstrip().split("\n\n")
    paras.insert(max(len(paras) - 1, 0), line)
    import html as _h
    from lib.html_email import _p
    link = (f'<a href="{_h.escape(url(token))}" style="color:inherit;font-weight:700;">'
            f'{_h.escape(LINK_LABEL.get(lang, LINK_LABEL["en"]))}</a>')
    text = line.replace(url(token), "§LINK§")
    out[line] = _p(text).replace(_h.escape("§LINK§", quote=False), link)
    return "\n\n".join(paras), out


def create_link(db, kind: str, lead_ids: list[str], country: str | None = None, segment: str | None = None,
                customer_id: str | None = None, delivery_id: str | None = None) -> str | None:
    """Link-Zeile anlegen, Token zurück. Wirft nie (Feedback darf eine Lieferung/Probe nie aufhalten)."""
    ids = [str(i) for i in lead_ids if i]
    if not ids or kind not in ("lieferung", "probe"):
        return None
    token = new_token()
    try:
        db.insert("lead_feedback_links", {"token": token, "kind": kind, "lead_ids": ids, "country": country,
                                          "segment_id": segment, "customer_id": customer_id,
                                          "delivery_id": delivery_id})
    except Exception as e:  # noqa: BLE001
        print(f"  Hinweis: Bewertungs-Link nicht angelegt ({str(e)[:120]})")
        return None
    return token


def _pos_neg(r: dict) -> tuple[float, float]:
    """Eine Zeile aus lead_feedback_stats oder eine einzelne Bewertung -> (positiv, negativ)."""
    if "rating" in r:
        won = 1 if r.get("won") else 0
        return (1 + won if r.get("rating") == "gut" else won), (1 if r.get("rating") == "schlecht" else 0)
    return float(r.get("gut") or 0) + float(r.get("gewonnen") or 0), float(r.get("schlecht") or 0)


def weight(pos: float, neg: float) -> float:
    if pos + neg < MIN_N:
        return 1.0
    p = (pos + PRIOR) / (pos + neg + 2 * PRIOR)
    return round(max(W_MIN, min(W_MAX, 1 + (p - 0.5) * SPREAD)), 3)


def weights(rows: list[dict]) -> dict[str, float]:
    """rows: Zeilen aus lead_feedback_stats (signal_type, country, gut, schlecht, gewonnen) oder einzelne Bewertungen
    (signal_type, country, rating, won). Ergebnis: {"<signal>|<LAND>": w, "<signal>": w} nur für Gewichte ≠ 1."""
    by: dict[str, list[float]] = {}
    for r in rows or []:
        sig = (r.get("signal_type") or "").strip()
        if not sig:
            continue
        pos, neg = _pos_neg(r)
        for k in (f"{sig}|{(r.get('country') or '').upper()}", sig):
            a = by.setdefault(k, [0.0, 0.0])
            a[0] += pos
            a[1] += neg
    out = {}
    for k, (pos, neg) in by.items():
        w = weight(pos, neg)
        if w != 1.0:
            out[k] = w
    return out


def weight_for(row: dict, w: dict[str, float] | None) -> float:
    """Gewicht eines Leads: Anlass im Land, sonst Anlass gesamt, sonst 1.0."""
    if not w:
        return 1.0
    sig = row.get("signal_type") or ""
    return w.get(f"{sig}|{(row.get('country') or '').upper()}", w.get(sig, 1.0))


def load_weights(db) -> dict[str, float]:
    """Gewichte aus der Datenbank. Wirft nie: ohne Tabelle oder bei Fehlern gilt 1.0 für alles."""
    try:
        return weights(db.select("lead_feedback_stats", {"select": "signal_type,country,gut,schlecht,gewonnen",
                                                         "limit": "5000"}))
    except Exception as e:  # noqa: BLE001
        print(f"  Hinweis: Feedback-Gewichte nicht geladen ({str(e)[:120]})")
        return {}
