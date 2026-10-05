#!/usr/bin/env python3
"""Bereitschaft einer neuen Zielgruppe prüfen (Inhaber 05.10.2026: „das gehirn … wie einen ablaufplan dazu hat, was es
jederzeit nutzen kann“ – docs/ABLAUFPLAN-NEUE-ZIELGRUPPE.md Schritt 2).

Nur lesen: zählt für Segment × Land die vier Tore der Lieferfähigkeit und zeigt den Stand der Vorbereitung. Schreibt
nichts, startet nichts, sendet nichts. Versand in einem neuen Paar startet erst nach einem Klick des Inhabers
(CLAUDE.md §6, „Tests nur Webagenturen US/UK/FR … erweitern nur der Inhaber“).

  python scripts/zielgruppe_bereit.py S5 US          # JSON + eine kurze deutsche Zeile
  python scripts/zielgruppe_bereit.py S5 US --kurz   # nur die Zeile

Tore (alle müssen grün sein):
  premium   ≥ 50 Firmen mit Premium-Lead (Stufe premium, Punktzahl ≥ 70, Ereignis ≤ 14 Tage, Status new), die die
            Drei-Stufen-Freigabe bestanden haben (lead_checks.result = released)
  probe     genau 10 verschiedene Firmen für eine Probe möglich (≥ SAMPLE_SIZE freigegebene Firmen mit Status new);
            Vorab-Zählung – den echten Bau macht responder.regional_sample (Plan Schritt 3)
  kaeufer   ≥ 200 mail-fähige Käufer (prospects.check_status = ok) im Paar
  land      countries.yaml allowed (nicht never, nie DE/AT/CH/IT/ES/PL/DK) UND docs/KALTMAIL-RECHT.md: Firmen ohne
            Einwilligung „Ja“, Risiko nicht hoch, Stand nicht „nie“/„gesperrt“ (strengere Regel gilt)

Exit 0 = alle Tore grün, 1 = mindestens ein Tor rot, 2 = Eingabe ungültig.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
RECHT = ROOT / "docs" / "KALTMAIL-RECHT.md"

MIN_PREMIUM = 50
MIN_KAEUFER = 200
PREMIUM_MIN_PUNKTE = 70      # lib/premium.PREMIUM_MIN
PREMIUM_MAX_TAGE = 14        # lib/premium.PREMIUM_MAX_AGE
ABRUF_MAX = 1000             # Zeilen je Lead-Abruf (mehr Zeilen = „mindestens“; exakte Zählung über 900.000 Leads
                             # bricht unter Last mit Zeitüberschreitung 57014 ab, darum ohne count)
NIE = {"DE", "AT", "CH", "IT", "ES", "PL", "DK"}  # CLAUDE.md §2

# Zeilen der Rechts-Tabelle (docs/KALTMAIL-RECHT.md, Spalte „Land“) → Ländercode
LAND_NAME = {
    "USA": "US", "Singapur": "SG", "Hongkong": "HK", "Brasilien": "BR", "Mexiko": "MX", "Frankreich": "FR",
    "Australien": "AU", "Neuseeland": "NZ", "Kanada": "CA", "Japan": "JP", "Israel": "IL", "UK": "UK",
    "Irland": "IE", "Schweden": "SE", "Finnland": "FI", "Belgien": "BE", "Deutschland": "DE",
    "Niederlande": "NL", "Österreich": "AT", "Schweiz": "CH", "Italien": "IT", "Spanien": "ES", "Polen": "PL",
    "Dänemark": "DK", "Südafrika": "ZA",
}
TORE = ("premium", "probe", "kaeufer", "land")
TOR_NAME = {"premium": "Premium-Leads", "probe": "Probe 10", "kaeufer": "Käufer", "land": "Land erlaubt"}


def sample_size() -> int:
    try:
        from lib.leadreport import SAMPLE_SIZE
        return int(SAMPLE_SIZE)
    except Exception:  # noqa: BLE001 – Playwright o. Ä. fehlt: Zahl ist fest (Inhaber 29.09.2026)
        return 10


# ---------------------------------------------------------------------------
# Rechtslage (Dateien, ohne Datenbank)
# ---------------------------------------------------------------------------
def recht_tabelle(path: Path = RECHT) -> dict[str, dict]:
    """{Land: {firmen, risiko, stand}} aus der Tabelle in docs/KALTMAIL-RECHT.md."""
    out: dict[str, dict] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or cells[0] not in LAND_NAME:
            continue
        out[LAND_NAME[cells[0]]] = {"firmen": cells[2], "risiko": cells[4], "stand": re.sub(r"\*", "", cells[5])}
    return out


def land_pruefen(land: str, cfg: dict | None = None, recht: dict | None = None) -> dict:
    """Darf das Land Kaltmails bekommen? Strengere Regel aus countries.yaml und Rechts-Tabelle."""
    from lib.rules import country_rules, load_countries
    cfg = load_countries() if cfg is None else cfg
    recht = recht_tabelle() if recht is None else recht
    r = country_rules(cfg, land)
    zeile = recht.get(land)
    gruende = []
    if land in NIE:
        gruende.append("nie (CLAUDE.md §2)")
    if not r.get("allowed"):
        gruende.append("countries.yaml allowed: false")
    if r.get("never"):
        gruende.append("countries.yaml never: true")
    if not zeile:
        gruende.append("nicht in KALTMAIL-RECHT.md")
    else:
        if not re.match(r"(?i)^(eher\s+)?ja\b", zeile["firmen"]):
            gruende.append(f"Firmen ohne Einwilligung: {zeile['firmen']}")
        if re.search(r"(?i)\bhoch\b", zeile["risiko"]):
            gruende.append(f"Risiko {zeile['risiko']}")
        if re.search(r"(?i)\bnie\b|gesperrt", zeile["stand"]):
            gruende.append(f"Stand: {zeile['stand']}")
    return {"ok": not gruende, "gruende": gruende, "nur_firmen": bool(r.get("company_forms_only")),
            "nur_allgemein": bool(r.get("generic_only")), "tageslimit": r.get("daily_limit")}


# ---------------------------------------------------------------------------
# Datenbank (nur lesen)
# ---------------------------------------------------------------------------
def http_abfrage(db):
    """(table, params, zaehlen) -> (rows, total) über PostgREST. zaehlen=True: exakte Zählung (wie
    kundenwerk.count_ok); bricht sie mit Zeitüberschreitung ab, total = None (Aufrufer zählt dann die Zeilen)."""
    def abfrage(table: str, params: dict, zaehlen: bool = False) -> tuple[list[dict], int | None]:
        headers = {"Prefer": "count=exact"} if zaehlen else {}
        r = db.s.get(f"{db.base}/{table}", params=params, headers=headers, timeout=db.timeout)
        if zaehlen and r.status_code == 500 and "57014" in (r.text or ""):
            return [], None
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase GET {table}: {r.status_code} {r.text[:200]}")
        rows = r.json() if r.text else []
        if not zaehlen:
            return rows, None
        return rows, int((r.headers.get("content-range") or "*/0").split("/")[-1] or 0)
    return abfrage


def lead_params(seg: str, land: str, premium: bool, heute: dt.date) -> dict:
    p = {"select": "company_id,lead_checks!inner(result)", "lead_checks.result": "eq.released",
         "segment_id": f"eq.{seg}", "country": f"eq.{land}", "status": "eq.new", "limit": str(ABRUF_MAX)}
    if premium:
        p.update({"premium_score": f"gte.{PREMIUM_MIN_PUNKTE}", "premium->>tier": "eq.premium",
                  "event_date": f"gte.{(heute - dt.timedelta(days=PREMIUM_MAX_TAGE)).isoformat()}"})
    return p


def _firmen(abfrage, params: dict) -> dict:
    """Verschiedene Firmen in höchstens ABRUF_MAX freigegebenen Leads (voll = „mindestens“)."""
    rows, _ = abfrage("leads", params)
    firmen = len({r.get("company_id") for r in rows if r.get("company_id")})
    return {"firmen": firmen, "leads": len(rows), "mindestens": len(rows) >= int(params.get("limit") or ABRUF_MAX)}


def _anzahl(abfrage, table: str, params: dict, ersatz: int) -> dict:
    """Exakte Anzahl; bei Zeitüberschreitung höchstens `ersatz` Zeilen zählen („mindestens“)."""
    _, total = abfrage(table, {**params, "limit": "1"}, True)
    if total is not None:
        return {"n": total, "mindestens": False}
    rows, _ = abfrage(table, {**params, "limit": str(ersatz)})
    return {"n": len(rows), "mindestens": len(rows) >= ersatz}


def _erste(abfrage, table: str, params: dict) -> dict | None:
    rows, _ = abfrage(table, {**params, "limit": "1"})
    return rows[0] if rows else None


def zaehlen(abfrage, seg: str, land: str, heute: dt.date | None = None) -> dict:
    """Alle Zahlen für Segment × Land (nur lesen)."""
    heute = heute or dt.date.today()
    premium = _firmen(abfrage, lead_params(seg, land, True, heute))
    frei = _firmen(abfrage, lead_params(seg, land, False, heute))
    kaeufer = _anzahl(abfrage, "prospects", {"select": "id", "check_status": "eq.ok", "segment_id": f"eq.{seg}",
                                             "country": f"eq.{land}"}, ABRUF_MAX)
    vorrat = _anzahl(abfrage, "sample_stock", {"select": "id", "status": "eq.ready", "segment_id": f"eq.{seg}",
                                               "country": f"eq.{land}"}, 500)
    segment = _erste(abfrage, "segments", {"select": "id,name,status,email_countries", "id": f"eq.{seg}"})
    seite = _erste(abfrage, "landing_pages", {"select": "slug,status", "segment_id": f"eq.{seg}",
                                              "country": f"eq.{land}", "order": "updated_at.desc"})
    exp = _erste(abfrage, "experiments", {"select": "id,variant,status,planned_count", "segment_id": f"eq.{seg}",
                                          "country": f"eq.{land}", "order": "created_at.desc"})
    return {"premium": premium, "freigegeben": frei, "kaeufer_ok": kaeufer["n"],
            "kaeufer_mindestens": kaeufer["mindestens"], "proben_vorrat": vorrat["n"],
            "segment": segment, "seite": seite, "experiment": exp}


# ---------------------------------------------------------------------------
# Bewerten (rein, ohne Netzwerk)
# ---------------------------------------------------------------------------
def site_url() -> str:
    return (os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").strip().rstrip("/")


def bewerten(seg: str, land: str, z: dict, land_info: dict, fokus: dict | None = None) -> dict:
    n = sample_size()
    tore = {
        "premium": {"ok": z["premium"]["firmen"] >= MIN_PREMIUM, "ist": z["premium"]["firmen"], "soll": MIN_PREMIUM},
        "probe": {"ok": z["freigegeben"]["firmen"] >= n, "ist": z["freigegeben"]["firmen"], "soll": n},
        "kaeufer": {"ok": z["kaeufer_ok"] >= MIN_KAEUFER, "ist": z["kaeufer_ok"], "soll": MIN_KAEUFER},
        "land": {"ok": bool(land_info["ok"]), "ist": "erlaubt" if land_info["ok"] else "; ".join(land_info["gruende"]),
                 "soll": "erlaubt"},
    }
    seg_row = z.get("segment") or {}
    seite = z.get("seite") or {}
    vorschau = []
    if seite.get("slug"):
        vorschau = [f"{site_url()}/{seite['slug']}?vorschau=1", f"{site_url()}/{seite['slug']}/start?vorschau=1"]
    fokus = fokus or {}
    return {
        "segment": seg, "land": land, "bereit": all(t["ok"] for t in tore.values()), "tore": tore,
        "info": {
            "segment_status": seg_row.get("status"), "segment_name": seg_row.get("name"),
            "mail_land_im_segment": land in (seg_row.get("email_countries") or []),
            "premium_leads": z["premium"]["leads"], "freigegebene_leads": z["freigegeben"]["leads"],
            "mindestens": [k for k, v in (("premium", z["premium"]["mindestens"]),
                                          ("probe", z["freigegeben"]["mindestens"]),
                                          ("kaeufer", z.get("kaeufer_mindestens"))) if v],
            "proben_vorrat": z["proben_vorrat"], "seite": seite.get("slug"), "seite_status": seite.get("status"),
            "experiment_status": (z.get("experiment") or {}).get("status"),
            "im_fokus": bool(fokus.get("im_fokus")), "test_freigabe": bool(fokus.get("test_freigabe")),
            "nur_firmen": land_info.get("nur_firmen"), "tageslimit": land_info.get("tageslimit"),
            "vorschau": vorschau,
        },
        "versand": "läuft bereits (Fokus)" if fokus.get("im_fokus") else "erst nach Klick des Inhabers (Freigabe-Antrag)",
    }


def _zahl(v) -> str:
    return f"{v:,}".replace(",", ".") if isinstance(v, int) else str(v)


def zeile(e: dict) -> str:
    """Eine kurze deutsche Zeile: Paar, bereit/nicht bereit, je Tor Ist/Soll."""
    t = e["tore"]
    gruen = sum(1 for x in t.values() if x["ok"])
    teile = []
    for k in TORE:
        x = t[k]
        if k == "land":
            teile.append(f"{TOR_NAME[k]} {'ok' if x['ok'] else 'nein (' + x['ist'] + ')'}")
        else:
            ab = "≥" if k in e["info"].get("mindestens", []) else ""
            teile.append(f"{TOR_NAME[k]} {ab}{_zahl(x['ist'])}/{_zahl(x['soll'])} {'ok' if x['ok'] else 'fehlt'}")
    kopf = f"{e['segment']}/{e['land']}: {'bereit' if e['bereit'] else 'nicht bereit'} ({gruen}/4)"
    return f"{kopf} – " + ", ".join(teile) + f". Versand {e['versand']}."


def antrag(e: dict) -> dict:
    """decisions-Zeile „Freigabe nötig“ für lib.kurz.insert_decisions (Plan Schritt 4). Nur wenn alle Tore grün."""
    if not e["bereit"]:
        raise ValueError("Freigabe-Antrag nur, wenn alle vier Tore grün sind")
    seg, land, t = e["segment"], e["land"], e["tore"]
    name = (e["info"].get("segment_name") or seg).split("(")[0].strip()
    zahlen = (f"{_zahl(t['premium']['ist'])} Premium-Firmen, Probe 10 möglich, {_zahl(t['kaeufer']['ist'])} "
              f"mail-fähige Käufer, Land erlaubt")
    return {
        "type": "segment", "status": "proposed", "needs_owner": True,
        "subject": f"Freigabe nötig: {seg}/{land} Versand starten",
        "kurz_titel": f"Freigabe nötig: {name} {land}"[:60],
        "kurz_grund": f"Alle Tore grün: {zahlen}."[:160],
        "reasoning": (f"Ablaufplan neue Zielgruppe (docs/ABLAUFPLAN-NEUE-ZIELGRUPPE.md): {seg}/{land} ist vorbereitet. "
                      f"{zahlen}. Seite, Video, Probe, Entwürfe und Experiment liegen als Vorschau bereit."),
        "action": (f"Annehmen/Erledigt = Freigabe: Gehirn trägt {seg}/{land} in config/fokus.yaml ein (fokus + tests), "
                   f"schaltet die Seite live und startet 50 Mails nach §5. Ablehnen = bleibt vorbereitet."),
        "metrics": {"freigabe": "zielgruppe", "segment": seg, "land": land,
                    "tore": {k: {"ist": v["ist"], "soll": v["soll"]} for k, v in t.items()},
                    "vorschau": e["info"].get("vorschau") or []},
    }


def fokus_stand(seg: str, land: str) -> dict:
    from lib.fokus import focus_pairs, test_allowed
    return {"im_fokus": (seg, land) in focus_pairs(), "test_freigabe": test_allowed(seg, land)}


def pruefen(seg: str, land: str, abfrage=None, heute: dt.date | None = None) -> dict:
    if abfrage is None:
        from lib.db import DB
        abfrage = http_abfrage(DB())
    z = zaehlen(abfrage, seg, land, heute)
    return bewerten(seg, land, z, land_pruefen(land), fokus_stand(seg, land))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Bereitschaft Segment × Land prüfen (nur lesen)")
    ap.add_argument("segment", help="z. B. S5")
    ap.add_argument("land", help="z. B. US")
    ap.add_argument("--kurz", action="store_true", help="nur die deutsche Zeile")
    args = ap.parse_args(argv)
    seg, land = args.segment.strip().upper(), args.land.strip().upper()
    if not re.fullmatch(r"S\d{1,2}", seg) or not re.fullmatch(r"[A-Z]{2}", land):
        print("Eingabe ungültig: Segment wie S5, Land wie US", file=sys.stderr)
        return 2
    e = pruefen(seg, land)
    if not args.kurz:
        print(json.dumps(e, ensure_ascii=False, indent=2, default=str))
    print(zeile(e))
    return 0 if e["bereit"] else 1


if __name__ == "__main__":
    sys.exit(main())
