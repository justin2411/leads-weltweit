#!/usr/bin/env python3
"""Nachfassmails (freigegeben laut Entscheidung des Inhabers 26.09.2026, CLAUDE.md 8a).

  python scripts/followups.py            # Probelauf
  python scripts/followups.py --apply    # Nachfassmails als 'approved' anlegen (Versand über outreach.py send)

1) followup: genau EINE kurze Nachfassmail, frühestens 4 Tage nach der Erstmail, nur wenn
   keine Antwort, keine Sperre und kein Bounce/keine Beschwerde vorliegt.
2) sample_followup: 3 Tage nach einer automatisch gesendeten Probe ohne weitere Antwort:
   Nachfrage nach Feedback und ob die wöchentliche Lieferung starten soll (keine Preise).
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from drafts import LAND, build, has_variant_column, short_name, signature, subject_variant  # noqa: E402
from lib.rules import lint_draft  # noqa: E402

NEGATIVE = {"bounced", "complained", "failed", "reply", "reply_positive", "reply_negative", "sample_requested",
            "unsubscribed"}  # auto_reply (Abwesenheit) bricht die Nachfassmail nicht ab

SIGNAL = {
    "S1": ("employers whose job adverts have stayed open for 30+ days", "employeurs dont les offres restent ouvertes"),
    "S2": ("local businesses {land} that still have no website", "entreprises locales encore sans site web"),
    "S3": ("growing businesses", "entreprises en croissance"),
    "S4": ("newly registered and expanding businesses", "sociétés nouvellement créées"),
    "S5": ("newly registered companies", "sociétés nouvellement créées"),
    "S9": ("new and growing companies", "entreprises nouvelles et en croissance"),
}


def _land(p: dict, lang: str) -> str:
    """Landesweit statt regional (Inhaber 27.09.2026): 'across the UK' / 'partout en France'."""
    if lang == "fr":
        return "partout en France"
    return "across " + LAND.get((p.get("country") or "").upper(), "your country")


def followup_subject(p: dict, parent_subject: str | None, lang: str) -> tuple[str, str | None]:
    """(Betreff, Variante) der Nachfassmail: der Betreff der Erstmail, wenn er landesweit ist (nennt das Land),
    damit die Mail im selben Verlauf bleibt. Alte Erstmails nannten Regionen („Greater Manchester“, „Queens“);
    dann den aktuellen landesweiten Betreff des Käufers (A/B wie die Kaltmail). Variante None = Betreff der
    Erstmail übernommen (Variante steht dort)."""
    land = "France" if lang == "fr" else LAND.get((p.get("country") or "").upper(), "")
    if parent_subject and land and land.lower() in parent_subject.lower():
        return parent_subject, None
    return build(p)[0], subject_variant(p)


def followup_text(p: dict, lang: str) -> tuple[str, str]:
    """Eine Nachfassmail nach 4 Tagen ohne Antwort; gleicher Aufbau wie die Kaltmail (docs/KALTMAIL-VORLAGE.md)."""
    land = _land(p, lang)
    en, fr = SIGNAL.get(p["segment_id"], ("companies with a current reason to buy", "entreprises avec un besoin actuel"))
    if lang == "fr":
        body = (f"Bonjour,\n\nJe reviens brièvement vers vous au sujet des {fr} {land}.\n\n"
                f"Votre échantillon gratuit de 10 pistes actuelles est prêt : entreprise, téléphone, e-mail, la "
                f"personne à demander et une phrase d'accroche. Sans engagement, et vous voyez en quelques minutes si "
                f"cela vous correspond.\n\nJe vous l'envoie ?\n\nBien cordialement,\n{signature(lang)}")
    else:
        short = short_name(p["company_name"])
        greet = f"Hi {short} team," if short else "Hi there,"
        about = en.format(land=land) if "{land}" in en else f"{en} {land}"
        body = (f"{greet}\n\nJust a short follow-up on my note about {about}.\n\n"
                f"Your free sample of 10 current leads is ready: company, phone, email, who to ask for and an "
                f"opening line. No obligation, and you will see within a few minutes whether it fits.\n\n"
                f"Shall I send it over?\n\nBest regards,\n{signature(lang)}")
    return body, land


def sample_followup_text(p: dict, lang: str, plan_url: str | None = None) -> str:
    """Nachfrage 3 Tage nach der Probe; mit Link zur Buchungsseite, wenn es eine gibt (wie die Probe-Mail)."""
    land = _land(p, lang)
    if lang == "fr":
        step = (f"Choisissez votre formule : {plan_url}" if plan_url
                else "Répondez simplement à cet e-mail et nous nous occupons du reste.")
        return (f"Bonjour,\n\nAvez-vous pu jeter un œil aux 10 pistes que je vous ai envoyées ?\n\n"
                f"Si une ou deux entreprises vous ont parlé, vous recevez une nouvelle liste comme celle-ci chaque "
                f"lundi, {land}, réservée à votre entreprise.\n\n{step}\n\n"
                f"On démarre lundi prochain ?\n\nBien cordialement,\n{signature(lang)}")
    step = f"Choose your plan: {plan_url}" if plan_url else "Just reply to this email and we will set it up."
    return (f"Hello,\n\nDid you get a chance to look at the 10 leads I sent over?\n\n"
            f"If one or two of them caught your eye, you get a fresh list like this every Monday, {land}, "
            f"reserved for your firm.\n\n{step}\n\n"
            f"Shall we start next Monday?\n\nBest regards,\n{signature(lang)}")


def _variant_field(parent: dict, variant: str | None) -> dict:
    """Betreff-Variante für die Nachfassmail, nur wenn es die Spalte gibt (die Erstmail kommt mit select=* und hat
    dann den Schlüssel subject_variant)."""
    if "subject_variant" not in parent:
        return {}
    return {"subject_variant": variant or parent.get("subject_variant")}


def refresh_open(db, dry_run: bool = False) -> int:
    """Offene Nachfassmails (draft/approved, nicht gesendet) auf den aktuellen Stand bringen: Betreff landesweit
    (alte Entwürfe erbten Regionen wie „Greater Manchester“ aus der Erstmail), Erinnerung mit aktuellem Text.
    Nichts wird gelöscht; verstößt der neue Text gegen eine Regel, geht ein freigegebener Entwurf zurück auf draft."""
    n = back = 0
    col = has_variant_column(db)
    for m in db.select_all("messages", {"status": "in.(draft,approved)", "sent_at": "is.null",
                                         "kind": "in.(followup,sample_followup)", "order": "id",
                                         "select": "id,kind,status,subject,body,language,prospects(*)"}):
        p = m.get("prospects")
        if not p:
            continue
        lang = m.get("language") or "en"
        subject, var = followup_subject(p, m["subject"], lang)
        # Text der Probe-Nachfrage enthält den Link zur Buchungsseite – nur den Betreff angleichen
        body = followup_text(p, lang)[0] if m["kind"] == "followup" else m["body"]
        if subject == m["subject"] and body == m["body"]:
            continue
        upd = {"subject": subject, **({"subject_variant": var} if col and var else {})}
        if m["kind"] == "followup":  # Probe-Nachfrage wird wie bisher nicht geprüft (Link zur Buchungsseite)
            lint = lint_draft(subject, body, lang, min_words=30, max_words=120, require_sample=False)
            upd.update(body=body, check_errors=lint.errors)
            if m["status"] == "approved" and not lint.ok:
                upd["status"] = "draft"
                back += 1
        n += 1
        if not dry_run:
            db.update("messages", {"id": m["id"]}, upd)
    print(f"{n} Nachfassmails neu geschrieben, {back} wegen Regelverstoß zurück auf draft")
    return 0


def answered(db, prospect_id: str, since: str | None = None) -> bool:
    """Hat die Firma geantwortet (Antworten-Cockpit, auch von einer anderen Adresse oder während der Pause des
    Antwort-Assistenten)? Dann keine Nachfassmail (Nachtschicht 04.10.2026). Abwesenheitsnotizen stehen nicht im
    Cockpit. Ist die Tabelle nicht lesbar, lieber keine Nachfassmail (Rückgabe True)."""
    params = {"prospect_id": f"eq.{prospect_id}", "select": "id", "limit": "1"}
    if since:
        params["received_at"] = f"gt.{since}"
    try:
        return bool(db.select("inbound_replies", params))
    except Exception as exc:  # noqa: BLE001
        print(f"  Antworten-Cockpit nicht lesbar ({exc.__class__.__name__}) – Nachfassmail an {prospect_id} ausgelassen")
        return True


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--days", type=int, default=None, help="Tage bis zur Nachfassmail (Standard: Dashboard, sonst 4)")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    now = dt.datetime.now(dt.timezone.utc)
    # Dashboard (Inhaber 03.10.2026): Nachfassmail an/aus und Tage bis zur Nachfassmail (3–10)
    from lib.owner_settings import ack, followup_days, load as load_owner_settings
    owner = load_owner_settings(db)
    if args.apply:  # Quittung fürs Dashboard (nur echte Läufe)
        ack(db, "nachfass", ["followup_enabled", "followup_days"], owner)
    days = args.days if args.days is not None else followup_days(4, owner["followup_days"])
    cutoff = (now - dt.timedelta(days=days)).isoformat()
    note = "Inhaber 26.09.2026: Nachfassmails freigegeben ('stell alles ein')"
    n1 = n2 = 0

    initial = db.select("messages", {"status": "eq.sent", "kind": "eq.initial", "sent_at": f"lte.{cutoff}",
                                     "select": "*,prospects(*)", "limit": "2000"})
    if not owner["followup_enabled"]:
        print("Nachfassmails im Dashboard ausgeschaltet (Inhaber) – keine neuen Nachfassmails")
        initial = []
    for m in initial:
        p = m["prospects"]
        if db.select("messages", {"prospect_id": f"eq.{p['id']}", "kind": "neq.initial", "select": "id"}):
            continue
        evs = db.select("email_events", {"message_id": f"eq.{m['id']}", "select": "type"})
        if any(e["type"] in NEGATIVE for e in evs) or db.rpc("is_suppressed", {"p_email": m["to_email"]}):
            continue
        if answered(db, p["id"]):
            continue
        lang = m.get("language") or "en"
        body, _ = followup_text(p, lang)
        subj, var = followup_subject(p, m["subject"], lang)
        lint = lint_draft(subj, body, lang, min_words=30, max_words=120, require_sample=False)
        print(f"FOLLOWUP {m['to_email']:<40} {lint.summary()}")
        n1 += 1
        if args.apply and lint.ok:
            db.insert("messages", {"prospect_id": p["id"], "experiment_id": m["experiment_id"], "to_email": m["to_email"],
                                   "subject": subj, "body": body, "language": lang, "kind": "followup",
                                   **_variant_field(m, var), "parent_id": m["id"], "status": "approved",
                                   "approved_at": now.isoformat(), "approved_by": note})

    s_cut = (now - dt.timedelta(days=3)).isoformat()
    sent_samples = db.select("email_events", {"type": "eq.sample_requested", "created_at": f"lte.{s_cut}",
                                              "select": "message_id,created_at,messages(*,prospects(*))"})
    for ev in sent_samples:
        m = ev.get("messages")
        if not m:
            continue
        p = m["prospects"]
        if db.select("messages", {"prospect_id": f"eq.{p['id']}", "kind": "eq.sample_followup", "select": "id"}):
            continue
        later = db.select("email_events", {"message_id": f"eq.{m['id']}", "created_at": f"gt.{ev['created_at']}",
                                           "type": "in.(reply,reply_positive,reply_negative,unsubscribed,complained)",
                                           "select": "id"})
        if later or db.rpc("is_suppressed", {"p_email": m["to_email"]}) or answered(db, p["id"], ev["created_at"]):
            continue
        lang = m.get("language") or "en"
        from responder import booking_url
        body = sample_followup_text(p, lang, booking_url(p["segment_id"], p.get("country")))
        subj, var = followup_subject(p, m["subject"], lang)
        print(f"PROBE-NACHFASS {m['to_email']}")
        n2 += 1
        if args.apply:
            db.insert("messages", {"prospect_id": p["id"], "experiment_id": m["experiment_id"], "to_email": m["to_email"],
                                   "subject": subj, "body": body, "language": lang, "kind": "sample_followup",
                                   **_variant_field(m, var), "parent_id": m["id"], "status": "approved",
                                   "approved_at": now.isoformat(), "approved_by": note})
    print(f"\n{n1} Nachfassmails, {n2} Nachfragen nach Probe" + ("" if args.apply else " (Probelauf)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
