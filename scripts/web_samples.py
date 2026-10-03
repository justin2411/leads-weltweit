"""Probe-Anfragen von den Landingpages beantworten (stündlich über antworten.yml).

Die Seite verspricht nach dem Klick „Ihre 10 Leads sind unterwegs“. Meist hat die App sie schon direkt nach dem Klick
aus dem Proben-Vorrat geschickt (scripts/sample_stock.py). Dieses Skript bedient den Rest (Warteschlange):
  - fertige Probe im Vorrat -> sofort aus dem Vorrat (gleiche Mail), Status sent
  - 10 vollständige Leads vorhanden -> Probe (PDF + CSV) per Resend (Einwilligung liegt vor), Status sent
  - noch nicht genug vollständige Leads -> Inhaber wird einmal benachrichtigt, Anfrage bleibt offen
  - Adresse gesperrt -> rejected
Gehört die Anfrage zu einem angeschriebenen Käufer, wird das an seiner Erstmail vermerkt: keine Nachfassmail
„Soll ich sie schicken?“ mehr, und nach der Probe greift die Nachfrage aus followups.py.

  python scripts/web_samples.py            # Probelauf
  python scripts/web_samples.py --apply
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

NOTIFIED = "Inhaber informiert: noch keine 10 vollständigen Leads"


def initial_message(db, email: str) -> dict | None:
    """Erstmail an genau diese Adresse (die Seite kam über den persönlichen Link aus dieser Mail)."""
    rows = db.select("messages", {"to_email": f"eq.{email.lower()}", "kind": "eq.initial", "status": "eq.sent",
                                  "select": "id", "order": "sent_at.desc", "limit": "1"})
    return rows[0] if rows else None


def mark(db, msg: dict | None, event_type: str, note: str) -> None:
    if not msg:
        return
    if db.select("email_events", {"message_id": f"eq.{msg['id']}", "type": f"eq.{event_type}", "select": "id"}):
        return
    db.insert("email_events", {"message_id": msg["id"], "type": event_type, "note": note})


def skip_reason(db, r: dict, msg: dict | None) -> str | None:
    """Anfrage nicht beantworten: Inhaber-Vorschau (TEST) oder diese Adresse hat schon eine Probe bekommen."""
    from lib.wishes import split_note
    # nur den Hinweis prüfen, nicht den Freitext des Kunden ("wunsch:…;text=TEST …" ist keine Inhaber-Vorschau)
    if "TEST" in split_note(r.get("note"))[0]:
        return "TEST (Inhaber-Vorschau) – keine Probe an echte Empfänger"
    email = (r.get("email") or "").strip().lower()
    if db.select("sample_requests", {"email": f"eq.{email}", "status": "eq.sent", "id": f"neq.{r['id']}", "select": "id"}):
        return "doppelt: Probe schon über die Landingpage gesendet"
    if msg and db.select("email_events", {"message_id": f"eq.{msg['id']}", "type": "eq.sample_requested", "select": "id"}):
        return "doppelt: Probe schon per Antwort-Mail gesendet"
    return None


def after_sent(db, r: dict, email: str, msg: dict | None, wish: list[str], wish_text: str) -> None:
    """Nach dem Versand: Erstmail vermerken (keine Nachfassmail mehr) und Freitext-Hinweis an den Inhaber."""
    from responder import notify_owner
    mark(db, msg, "sample_requested", "Probe über Landingpage angefordert und gesendet")
    if wish_text:
        # Freitext (z. B. Branche, Größe) wird nicht automatisch ausgewertet: Inhaber kurz informieren
        notify_owner(f"[Leads] Probe gesendet, Hinweis des Kunden: {r['company_name']}",
                     f"{r['company_name']} ({email}, {r['segment_id']}/{r['country']}) hat die Probe "
                     f"bekommen. Gewünschte Signale: {', '.join(wish) or '-'}.\n"
                     f"Hinweis im Formular (nicht automatisch berücksichtigt): {wish_text}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    from lib.db import DB
    from responder import notify_owner, regional_sample, sample_mail, sample_subject, send_reply
    from lib.wishes import parse, split_note, with_note
    db = DB()
    can_send = bool(os.environ.get("RESEND_API_KEY") and os.environ.get("MAIL_FROM"))
    n = {"sent": 0, "waiting": 0, "rejected": 0}
    for r in db.select("sample_requests", {"status": "eq.new", "order": "created_at", "limit": "50"}):
        if r.get("claimed_at") and dt.datetime.fromisoformat(r["claimed_at"].replace("Z", "+00:00")) > \
                dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=15):
            print(f"IN ARBEIT {r['company_name']} ({r['segment_id']}/{r['country']}): wird gerade gesendet")
            continue
        email = (r.get("email") or "").strip().lower()
        msg = initial_message(db, email) if email else None
        if not email or db.rpc("is_suppressed", {"p_email": email}):
            print(f"GESPERRT  {r['company_name']}")
            n["rejected"] += 1
            if args.apply:
                db.update("sample_requests", {"id": r["id"]}, {"status": "rejected", "note": with_note(r.get("note"), "gesperrt")})
            continue
        why_skip = skip_reason(db, r, msg)
        if why_skip:
            print(f"ÜBERSPRUNGEN {r['company_name']}: {why_skip}")
            n["rejected"] += 1
            if args.apply:
                db.update("sample_requests", {"id": r["id"]}, {"status": "rejected", "note": with_note(r.get("note"), why_skip)})
            continue
        lang = "fr" if r.get("country") == "FR" else "en"
        # Wunsch aus dem Formular ("Welche Leads?"): passende vollständige Leads zuerst, sonst auffüllen
        wish, wish_text = parse(r.get("note"))
        if args.apply and can_send:
            # Sperre: die App sendet gerade selbst (Sofortversand nach dem Klick) oder ein anderer Lauf -> überspringen
            if not db.rpc("lock_sample_request", {"p_request": r["id"]}):
                print(f"IN ARBEIT {r['company_name']} ({r['segment_id']}/{r['country']}): wird gerade gesendet")
                continue
            # 1) fertige, geprüfte Probe aus dem Vorrat (scripts/sample_stock.py) – sofort und exklusiv
            from sample_stock import send_stock
            got = send_stock(db, r, email, wish)
            if got == "sent":
                print(f"PROBE     {r['company_name']} ({r['segment_id']}/{r['country']}) aus dem Vorrat"
                      + (f" Wunsch: {','.join(wish)}" if wish else ""))
                n["sent"] += 1
                after_sent(db, r, email, msg, wish, wish_text)
                continue
            if got == "error":
                # Versand aus dem Vorrat gescheitert: Sperre bleibt 15 min, nächster Lauf versucht es erneut
                print(f"FEHLER    {r['company_name']} ({r['segment_id']}/{r['country']}): Versand aus dem Vorrat")
                n["waiting"] += 1
                continue
        # Probelauf oder ohne Versandweg: Leads nicht als „sample“ verbrauchen (Audit 02.10.2026)
        try:
            files, _ = regional_sample(db, r["segment_id"], r["country"], None, wish=wish,
                                       mark=bool(args.apply and can_send))
        except Exception as exc:  # noqa: BLE001 – eine Anfrage darf die übrigen nicht aufhalten (02.10.: Timeout)
            print(f"FEHLER    {r['company_name']} ({r['segment_id']}/{r['country']}): {type(exc).__name__}: "
                  f"{str(exc)[:200]}")
            n["waiting"] += 1
            if args.apply and can_send:
                db.update("sample_requests", {"id": r["id"]}, {"claimed_at": None})
            continue
        body, blocks = sample_mail(lang, None, files, True, r["segment_id"], r["country"])
        if body and can_send:
            print(f"PROBE     {r['company_name']} ({r['segment_id']}/{r['country']})"
                  + (f" Wunsch: {','.join(wish)}" if wish else ""))
            n["sent"] += 1
            if args.apply:
                send_reply(email, sample_subject(lang, None, r["country"]), body, None, lang, files, blocks,
                           requested=True, idempotency_key=f"sample-{r['id']}")
                db.update("sample_requests", {"id": r["id"]},
                          {"status": "sent", "sent_at": dt.datetime.now(dt.timezone.utc).isoformat()})
                after_sent(db, r, email, msg, wish, wish_text)
            continue
        n["waiting"] += 1
        why = "noch keine 10 vollständigen Leads" if not body else "Resend nicht eingerichtet"
        print(f"WARTET    {r['company_name']} ({r['segment_id']}/{r['country']}): {why}")
        if args.apply and NOTIFIED not in split_note(r.get("note"))[0]:
            # Ja zur Probe: keine Nachfassmail "Soll ich sie schicken?" mehr
            mark(db, msg, "reply_positive", "Probe über Landingpage angefordert (noch nicht lieferbar)")
            notify_owner(f"[Leads] Probe angefordert, noch nicht lieferbar: {r['company_name']}",
                         f"{r['company_name']} ({r['segment_id']}/{r['country']}) hat am "
                         f"{r['created_at'][:16].replace('T', ' ')} UTC über die Landingpage eine Probe angefordert "
                         f"({email}).\n"
                         + (f"Gewünschte Leads: {', '.join(wish) or '-'}" + (f"; Hinweis: {wish_text}" if wish_text else "")
                            + "\n" if wish or wish_text else "")
                         + f"\nGrund, warum sie noch nicht raus ist: {why}.\n"
                         f"Die Seite hat bestätigt, dass die Leads unterwegs sind. Bitte persönlich melden oder "
                         f"warten, bis die Anreicherung genug vollständige Leads hat – dann geht die Probe "
                         f"automatisch raus.")
            db.update("sample_requests", {"id": r["id"]}, {"note": with_note(r.get("note"), NOTIFIED)})
        if args.apply and can_send:
            db.update("sample_requests", {"id": r["id"]}, {"claimed_at": None})  # Sperre frei für den nächsten Lauf
    print(f"\n{n}" + ("" if args.apply else "\nProbelauf – mit --apply handeln."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
