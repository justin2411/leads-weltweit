#!/usr/bin/env python3
"""Täglicher Zustellbarkeits-Check (JARVIS-Plan Gruppe E). Kostenlos, nur lesen und DNS-Abfragen.

Prüft:
  1. DNS der Versanddomain (scripts/dns_check.py): MX, SPF, DKIM (Strato), DMARC
  2. kostenlose DNS-Blocklisten (nur DNS-Lookups): Absender-IPs der Versand-Postfächer (SMTP_HOST, SMTP_HOST_2 …,
     Standard smtp.strato.de; zusätzlich ZUSTELL_IPS) gegen Spamhaus ZEN, SpamCop, Barracuda; die Domain gegen
     Spamhaus DBL und SURBL. Antworten 127.255.255.x (Spamhaus: Abfrage über öffentlichen Resolver abgelehnt)
     zählen nicht als Treffer, sondern als „nicht prüfbar“.
  3. Bounce-Quote und Gründe der letzten 7 Tage (email_events: Kaltmails = 'sent' mit message_id), dazu Klassen
     (hart/weich/richtlinie/unbekannt) je Postfach und je Käufer-Quelle/Land (signalwerk.bounce_stats). Richtlinien-
     Bounces (Spam/Blockliste) → gelb. Käufer-Quelle mit > 5 % harten Bounces (ab 20 Mails) → Vorschlag in
     decisions (nur Vorschlag, Prüfregeln bleiben unverändert)
  4. Kontrolladressen (signalwerk.seed_checks, nur wenn SEED_INBOXES gesetzt ist oder Zeilen da sind)
  5. Zustell-Lücke „gesendet vs. delivered“ (Resend-Ereignisse mit resend_id, älter als 2 h)
  6. Link-Scanner: Abmeldungen weniger als 2 min nach dem Versand stammen fast immer von Sicherheits-Scannern
     der Empfänger (kein Mensch klickt in Sekunden). Nur gezählt, damit Antwort-/Klick-Quoten ehrlich bleiben –
     die Abmeldung bleibt IMMER wirksam (Sperrliste unverändert).

Ergebnis: eine Zeile je Tag (deutsche Zeit) in signalwerk.deliverability_daily (grün/gelb/rot + Gründe).
Rot (Blocklisten-Treffer, DMARC/SPF fehlt) → kurzes Update in den Gehirn-Chat und ein decisions-Eintrag.
Ändert NIE den Versand, die Notbremse oder die Sperrliste.

  python scripts/zustellbarkeit.py              # prüfen, speichern, bei Rot melden
  python scripts/zustellbarkeit.py --dry-run    # nur prüfen und anzeigen
  python scripts/zustellbarkeit.py --geplant    # Cron: erst ab 06:00 deutscher Zeit und nur einmal je Tag
"""
from __future__ import annotations

import argparse
import datetime as dt
import ipaddress
import json
import os
import sys
from collections import Counter
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dns_check  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
DOMAIN = "nextgen-profit.de"
DEFAULT_SMTP = "smtp.strato.de"
IP_LISTS = {"Spamhaus ZEN": "zen.spamhaus.org", "SpamCop": "bl.spamcop.net", "Barracuda": "b.barracudacentral.org"}
DOMAIN_LISTS = {"Spamhaus DBL": "dbl.spamhaus.org", "SURBL": "multi.surbl.org"}
BOUNCE_GELB = 0.03          # Notbremse greift bei 5 % – gelb schon vorher
BOUNCE_MIN_SENT = 20        # darunter ist eine Quote nicht aussagekräftig
LUECKE_GELB = 0.10          # mehr als 10 % der Resend-Mails ohne „delivered“
LUECKE_ALTER_H = 2          # jüngere Mails haben ihr „delivered“ evtl. noch nicht
START_STUNDE = 6            # Cron: nicht vor 06:00 deutscher Zeit
QUELLE_HART = 0.05          # Käufer-Quelle: mehr als 5 % harte Bounces …
QUELLE_MIN = 20             # … ab 20 Mails in 7 Tagen -> Vorschlag
SCANNER_SEK = 120           # Abmeldung so kurz nach dem Versand = Link-Scanner, kein Mensch
SCANNER_GELB = 0.5          # gelb, wenn mehr als die Hälfte der Abmeldungen (ab 4) Scanner sind


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# --------------------------------------------------------------------------------------------- DNS
def _resolve(name: str, rtype: str = "A") -> list[str]:
    """Antworten als Text; NXDOMAIN/keine Antwort = []; andere Fehler (Zeitüberschreitung) = Ausnahme."""
    import dns.resolver
    try:
        return [r.to_text().strip('"') for r in dns.resolver.resolve(name, rtype, lifetime=8)]
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return []


def dns_status(domain: str = DOMAIN, rec=None) -> dict:
    rows = dns_check.checks(domain, rec or dns_check.records)
    out = {label: {"ok": ok, "gefunden": found[:3]} for label, ok, found in rows}
    by = {label: ok for label, ok, _ in rows}
    return {"checks": out,
            "spf": by.get("SPF erlaubt Strato (smtp.rzone.de)", False) and by.get("genau ein SPF-Eintrag", False),
            "dkim": by.get("Strato-DKIM (CNAME auf strato.de)", False),
            "dmarc": by.get("DMARC vorhanden", False),
            "mx": by.get("MX zeigt auf Strato (smtpin.rzone.de)", False)}


def sender_hosts(env=None) -> list[str]:
    env = os.environ if env is None else env
    hosts = [env.get("SMTP_HOST") or DEFAULT_SMTP]
    hosts += [env[f"SMTP_HOST_{n}"] for n in range(2, 11) if env.get(f"SMTP_HOST_{n}")]
    return sorted({h.strip().lower() for h in hosts if h and h.strip()})


def sender_ips(env=None, resolve=_resolve) -> list[str]:
    env = os.environ if env is None else env
    ips: set[str] = set()
    for h in sender_hosts(env):
        try:
            ips.update(x for x in resolve(h, "A") if _ipv4(x))
        except Exception:  # noqa: BLE001 - ein Host nicht auflösbar: die anderen trotzdem prüfen
            continue
    ips.update(x.strip() for x in (env.get("ZUSTELL_IPS") or "").split(",") if _ipv4(x.strip()))
    return sorted(ips)


def _ipv4(x: str) -> bool:
    try:
        return isinstance(ipaddress.ip_address(x), ipaddress.IPv4Address)
    except ValueError:
        return False


def classify(answers: list[str]) -> str:
    """'frei' (keine Antwort), 'treffer' (127.0.0.x … 127.0.1.x usw.) oder 'unklar' (127.255.255.x = Abfrage
    abgelehnt, z. B. Spamhaus über öffentlichen Resolver; alles außerhalb 127/8 ebenso)."""
    if not answers:
        return "frei"
    real = [a for a in answers if a.startswith("127.") and not a.startswith("127.255.255.")]
    return "treffer" if real else "unklar"


def blocklists(ips: list[str], domain: str = DOMAIN, resolve=_resolve) -> dict:
    out: dict[str, dict] = {}

    def ask(key: str, name: str) -> None:
        try:
            ans = resolve(name, "A")
            out[key] = {"ergebnis": classify(ans), "antwort": ans[:3]}
        except Exception as e:  # noqa: BLE001 - Zeitüberschreitung = nicht prüfbar, kein Treffer
            out[key] = {"ergebnis": "unklar", "antwort": [type(e).__name__]}

    for ip in ips:
        rev = ".".join(reversed(ip.split(".")))
        for label, zone in IP_LISTS.items():
            ask(f"{label} {ip}", f"{rev}.{zone}")
    for label, zone in DOMAIN_LISTS.items():
        ask(f"{label} {domain}", f"{domain}.{zone}")
    return out


# --------------------------------------------------------------------------------------------- Datenbank
def _since(days: int = 7) -> str:
    return (now() - dt.timedelta(days=days)).isoformat()


def bounce_reason(ev: dict) -> str:
    b = ((ev.get("payload") or {}).get("bounce") or {}) if isinstance(ev.get("payload"), dict) else {}
    code = str(b.get("status") or "")
    if code.startswith("5.1."):
        return "Adresse unbekannt (5.1.x)"
    if code.startswith("5.7."):
        return "abgelehnt/blockiert (5.7.x)"
    if code.startswith("5.2.") or code.startswith("5.3."):
        return "Postfach voll/gesperrt (5.2/5.3)"
    if code.startswith("4."):
        return "vorübergehend (4.x.x)"
    if code.startswith("5."):
        return f"endgültig ({code})"
    return "ohne Code"


def bounces(db) -> dict:
    since = _since(7)
    sent = db.select_all("email_events", {"type": "eq.sent", "occurred_at": f"gte.{since}",
                                          "message_id": "not.is.null", "select": "id"})
    bounced = db.select_all("email_events", {"type": "eq.bounced", "occurred_at": f"gte.{since}",
                                             "select": "id,payload"})
    complained = db.select_all("email_events", {"type": "eq.complained", "occurred_at": f"gte.{since}", "select": "id"})
    reasons = Counter(bounce_reason(e) for e in bounced)
    n = len(sent)
    out = {"gesendet_7t": n, "bounces_7t": len(bounced), "beschwerden_7t": len(complained),
           "quote": round(len(bounced) / n, 4) if n else None, "gruende": dict(reasons.most_common(6))}
    st = klassen_stats(db)
    if st:
        out.update({"klassen": st.get("klassen") or {}, "postfaecher": st.get("postfaecher") or [],
                    "quellen": st.get("quellen") or []})
    return out


def klassen_stats(db, days: int = 7) -> dict:
    """Bounce-Klassen je Postfach und je Käufer-Quelle/Land (signalwerk.bounce_stats); fehlt die Funktion: {}."""
    try:
        r = db.rpc("bounce_stats", {"p_days": days})
    except Exception as e:  # noqa: BLE001 - Auswertung darf den Check nicht rot enden lassen
        print(f"bounce_stats nicht lesbar: {type(e).__name__}: {str(e)[:120]}")
        return {}
    return r if isinstance(r, dict) else {}


def schlechte_quellen(quellen: list[dict]) -> list[dict]:
    """Käufer-Quellen mit mehr als 5 % harten Bounces bei mindestens 20 Mails (7 Tage)."""
    out = []
    for q in quellen or []:
        n, hart = int(q.get("gesendet") or 0), int(q.get("hart") or 0)
        if n >= QUELLE_MIN and hart / n > QUELLE_HART:
            out.append({**q, "quote_hart": round(hart / n, 4)})
    return sorted(out, key=lambda q: -q["quote_hart"])


def quellen_vorschlagen(db, quellen: list[dict]) -> int:
    """Je schlechter Käufer-Quelle ein Vorschlag in decisions (höchstens einmal je Kalenderwoche). Nur Vorschlag:
    Prüfregeln, Sperrliste und Versand bleiben unverändert."""
    from lib.kurz import insert_decisions
    week = berlin_day().isocalendar()
    n = 0
    for q in schlechte_quellen(quellen):
        name = f"{q.get('country')} · {q.get('quelle')}"
        subject = f"Käufer-Quelle {name}: harte Bounces (KW {week[1]}/{week[0]})"
        if db.select("decisions", {"subject": f"eq.{subject}", "select": "id", "limit": "1"}):
            continue
        pct = f"{q['quote_hart'] * 100:.1f}".replace(".", ",")
        insert_decisions(db, {"type": "note", "subject": subject, "status": "proposed",
                              "reasoning": f"{q['hart']} von {q['gesendet']} Kaltmails an Käufer aus {name} kamen in "
                                           "7 Tagen hart zurück (Adresse/Domain fehlt). Vorschlag: Adressen dieser "
                                           "Quelle vor dem Versand zusätzlich prüfen oder Quelle zurückstellen. "
                                           "Prüfregeln, Sperrliste und Versand wurden nicht verändert.",
                              "metrics": {"quelle": q},
                              "kurz_titel": f"Käufer-Quelle {name} prüfen"[:60],
                              "kurz_grund": f"{pct} % harte Bounces ({q['hart']} von {q['gesendet']} Mails, 7 Tage)"[:160]})
        n += 1
    return n


def seeds(db, env=None) -> dict:
    env = os.environ if env is None else env
    configured = bool((env.get("SEED_INBOXES") or "").strip())
    try:
        rows = db.select("seed_checks", {"at": f"gte.{_since(7)}", "select": "country,placement", "limit": "500"})
    except RuntimeError:
        rows = []
    if not configured and not rows:
        return {"aktiv": False}
    pl = Counter(r.get("placement") or "offen" for r in rows)
    return {"aktiv": True, "gesendet_7t": len(rows), "platzierung": dict(pl)}


def _ts(x) -> dt.datetime | None:
    try:
        t = dt.datetime.fromisoformat(str(x).replace("Z", "+00:00").replace(" ", "T"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def scanner(db) -> dict:
    """Abmeldungen (7 T) mit Abstand zum Versand: < SCANNER_SEK = Link-Scanner. Nur zählen, nie entsperren."""
    ev = db.select_all("email_events", {"type": "eq.unsubscribed", "occurred_at": f"gte.{_since(7)}",
                                        "message_id": "not.is.null", "select": "message_id,occurred_at"})
    if not ev:
        return {"abmeldungen_7t": 0, "scanner_7t": 0, "mensch_7t": 0, "quote": None}
    ids = sorted({e["message_id"] for e in ev})
    sent = {}
    for i in range(0, len(ids), 100):
        part = ids[i:i + 100]
        for m in db.select("messages", {"id": f"in.({','.join(part)})", "select": "id,sent_at"}):
            sent[m["id"]] = _ts(m.get("sent_at"))
    n_scan = 0
    for e in ev:
        a, b = sent.get(e["message_id"]), _ts(e.get("occurred_at"))
        if a and b and 0 <= (b - a).total_seconds() < SCANNER_SEK:
            n_scan += 1
    return {"abmeldungen_7t": len(ev), "scanner_7t": n_scan, "mensch_7t": len(ev) - n_scan,
            "quote": round(n_scan / len(ev), 4)}


def luecke(db) -> dict:
    """Resend-Mails (resend_id) der letzten 7 Tage, älter als 2 h: wie viele haben kein 'delivered'?"""
    cut = (now() - dt.timedelta(hours=LUECKE_ALTER_H)).isoformat()
    sent = db.select_all("email_events", {"type": "eq.sent", "occurred_at": f"gte.{_since(7)}",
                                          "resend_id": "not.is.null", "select": "resend_id,occurred_at"})
    sent_ids = {e["resend_id"] for e in sent if str(e.get("occurred_at") or "") <= cut}
    if not sent_ids:
        return {"gesendet": 0, "zugestellt": 0, "fehlt": 0, "quote": None}
    done = db.select_all("email_events", {"type": "in.(delivered,bounced,complained,failed)",
                                          "occurred_at": f"gte.{_since(8)}", "resend_id": "not.is.null",
                                          "select": "resend_id"})
    got = sent_ids & {e["resend_id"] for e in done}
    fehlt = len(sent_ids) - len(got)
    return {"gesendet": len(sent_ids), "zugestellt": len(got), "fehlt": fehlt, "quote": round(fehlt / len(sent_ids), 4)}


# --------------------------------------------------------------------------------------------- Bewertung
def bewerten(d: dict, bl: dict, bo: dict, se: dict, lu: dict, sc: dict | None = None) -> tuple[str, list[str]]:
    rot, gelb = [], []
    hits = sorted(k for k, v in bl.items() if v["ergebnis"] == "treffer")
    if hits:
        rot.append("Blocklisten-Treffer: " + ", ".join(hits)[:140])
    if not d.get("dmarc"):
        rot.append("DMARC fehlt")
    if not d.get("spf"):
        rot.append("SPF fehlt oder falsch")
    if not d.get("dkim"):
        gelb.append("Strato-DKIM nicht gefunden")
    if not d.get("mx"):
        gelb.append("MX zeigt nicht auf Strato")
    unklar = [k for k, v in bl.items() if v["ergebnis"] == "unklar"]
    if unklar:
        gelb.append(f"{len(unklar)} Blocklisten-Abfragen nicht prüfbar")
    if bo.get("beschwerden_7t"):
        gelb.append(f"{bo['beschwerden_7t']} Spam-Beschwerden in 7 Tagen")
    richt = int((bo.get("klassen") or {}).get("richtlinie") or 0)
    if richt:
        gelb.append(f"{richt} Richtlinien-Bounces (Spam/Blockliste) in 7 Tagen")
    q = bo.get("quote")
    if q is not None and bo.get("gesendet_7t", 0) >= BOUNCE_MIN_SENT and q >= BOUNCE_GELB:
        gelb.append(f"Bounce-Quote 7 T {q * 100:.1f} %")
    if lu.get("quote") is not None and lu["quote"] > LUECKE_GELB:
        gelb.append(f"{lu['fehlt']} von {lu['gesendet']} Resend-Mails ohne Zustellung")
    spam = (se.get("platzierung") or {}).get("spam", 0)
    if spam:
        gelb.append(f"{spam} Kontrollmails im Spam")
    sc = sc or {}
    if sc.get("abmeldungen_7t", 0) >= 4 and (sc.get("quote") or 0) > SCANNER_GELB:
        gelb.append(f"{sc['scanner_7t']} von {sc['abmeldungen_7t']} Abmeldungen durch Link-Scanner (< 2 min)")
    status = "rot" if rot else "gelb" if gelb else "gruen"
    return status, rot + gelb


def kurz(status: str, gruende: list[str]) -> str:
    word = {"gruen": "grün", "gelb": "gelb", "rot": "rot"}[status]
    return f"Zustellbarkeit {word}" + (f": {'; '.join(gruende)}" if gruende else "")


def melden_rot(db, row: dict, push=None) -> None:
    """Rot: Gehirn-Chat (höchstens gleicher Text alle 6 h) + decisions (höchstens einmal je Tag)."""
    import jarvis_chat
    from lib.kurz import insert_decisions
    grund = "; ".join(row["gruende"])
    text = (f"Aufgefallen: Zustellbarkeit rot – {grund}"[:250]
            + " · Nächster Schritt: Ursache prüfen, Versand-Regeln bleiben unverändert")[:400]
    try:
        jarvis_chat.gehirn_update(db, text, [{"label": "Zustellbarkeit", "url": "/dashboard/jarvis"}], push=push)
    except Exception as e:  # noqa: BLE001 - die Meldung darf den Check nicht rot enden lassen
        print(f"Gehirn-Update nicht geschrieben: {type(e).__name__}: {str(e)[:160]}")
    day = row["day"]
    subject = f"Zustellbarkeit rot ({day})"
    if db.select("decisions", {"subject": f"eq.{subject}", "select": "id", "limit": "1"}):
        return
    insert_decisions(db, {"type": "safety", "subject": subject, "status": "proposed",
                          "reasoning": f"Täglicher Zustellbarkeits-Check: {grund}. Versand, Notbremse und Sperrliste "
                                       "wurden nicht verändert.",
                          "metrics": {"gruende": row["gruende"], "bounces": row["bounces"], "luecke": row["luecke"]},
                          "kurz_titel": "Zustellbarkeit rot",
                          "kurz_grund": grund[:160]})


def berlin_day(t: dt.datetime | None = None) -> dt.date:
    return (t or now()).astimezone(BERLIN).date()


def due(db, t: dt.datetime | None = None) -> bool:
    """Cron (Sommer- und Winterzeit-Termin): erst ab 06:00 deutscher Zeit und nur, wenn heute noch keine Zeile da ist."""
    local = (t or now()).astimezone(BERLIN)
    if local.hour < START_STUNDE:
        return False
    return not db.select("deliverability_daily", {"day": f"eq.{local.date().isoformat()}", "select": "day"})


def run(db, env=None, resolve=_resolve, rec=None, apply: bool = True, push=None) -> dict:
    env = os.environ if env is None else env
    domain = env.get("ZUSTELL_DOMAIN") or DOMAIN
    d = dns_status(domain, rec)
    ips = sender_ips(env, resolve)
    bl = blocklists(ips, domain, resolve)
    bo, se, lu = bounces(db), seeds(db, env), luecke(db)
    try:
        bo["scanner"] = scanner(db)
    except Exception as e:  # noqa: BLE001 - reine Zählung, darf den Check nicht scheitern lassen
        print(f"Scanner-Zählung nicht möglich: {type(e).__name__}: {str(e)[:160]}")
    status, gruende = bewerten(d, bl, bo, se, lu, bo.get("scanner"))
    row = {"day": berlin_day().isoformat(), "at": now().isoformat(), "status": status, "gruende": gruende,
           "dns": d, "blocklists": {"ips": ips, "ergebnisse": bl}, "bounces": bo, "seeds": se, "luecke": lu}
    if apply:
        db.insert("deliverability_daily", row, upsert_on="day")
        if status == "rot":
            melden_rot(db, row, push)
        try:
            quellen_vorschlagen(db, bo.get("quellen") or [])
        except Exception as e:  # noqa: BLE001 - Vorschlag darf den Check nicht scheitern lassen
            print(f"Quellen-Vorschlag nicht geschrieben: {type(e).__name__}: {str(e)[:160]}")
    return row


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--geplant", action="store_true", help="Cron-Lauf: nur ab 06:00 deutscher Zeit, einmal je Tag")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    if args.geplant and not due(db):
        print("Zustellbarkeit: heute schon geprüft oder vor 06:00 deutscher Zeit – nichts zu tun")
        return 0
    row = run(db, apply=not args.dry_run)
    print(kurz(row["status"], row["gruende"]))
    print(json.dumps({k: row[k] for k in ("bounces", "seeds", "luecke")}, ensure_ascii=False))
    print("Blocklisten: " + ", ".join(f"{k}={v['ergebnis']}" for k, v in row["blocklists"]["ergebnisse"].items()))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"## {kurz(row['status'], row['gruende'])}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
