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

from drafts import LAND, short_name, signature  # noqa: E402
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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--days", type=int, default=4)
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    now = dt.datetime.now(dt.timezone.utc)
    cutoff = (now - dt.timedelta(days=args.days)).isoformat()
    note = "Inhaber 26.09.2026: Nachfassmails freigegeben ('stell alles ein')"
    n1 = n2 = 0

    initial = db.select("messages", {"status": "eq.sent", "kind": "eq.initial", "sent_at": f"lte.{cutoff}",
                                     "select": "*,prospects(*)", "limit": "2000"})
    for m in initial:
        p = m["prospects"]
        if db.select("messages", {"prospect_id": f"eq.{p['id']}", "kind": "neq.initial", "select": "id"}):
            continue
        evs = db.select("email_events", {"message_id": f"eq.{m['id']}", "select": "type"})
        if any(e["type"] in NEGATIVE for e in evs) or db.rpc("is_suppressed", {"p_email": m["to_email"]}):
            continue
        lang = m.get("language") or "en"
        body, _ = followup_text(p, lang)
        lint = lint_draft(m["subject"], body, lang, min_words=30, max_words=120, require_sample=False)
        print(f"FOLLOWUP {m['to_email']:<40} {lint.summary()}")
        n1 += 1
        if args.apply and lint.ok:
            db.insert("messages", {"prospect_id": p["id"], "experiment_id": m["experiment_id"], "to_email": m["to_email"],
                                   "subject": m["subject"], "body": body, "language": lang, "kind": "followup",
                                   "parent_id": m["id"], "status": "approved",
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
        if later or db.rpc("is_suppressed", {"p_email": m["to_email"]}):
            continue
        lang = m.get("language") or "en"
        from responder import booking_url
        body = sample_followup_text(p, lang, booking_url(p["segment_id"], p.get("country")))
        print(f"PROBE-NACHFASS {m['to_email']}")
        n2 += 1
        if args.apply:
            db.insert("messages", {"prospect_id": p["id"], "experiment_id": m["experiment_id"], "to_email": m["to_email"],
                                   "subject": m["subject"], "body": body, "language": lang, "kind": "sample_followup",
                                   "parent_id": m["id"], "status": "approved",
                                   "approved_at": now.isoformat(), "approved_by": note})
    print(f"\n{n1} Nachfassmails, {n2} Nachfragen nach Probe" + ("" if args.apply else " (Probelauf)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
