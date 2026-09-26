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

from drafts import _clean_name, _place, signature  # noqa: E402
from lib.rules import lint_draft  # noqa: E402

NEGATIVE = {"bounced", "complained", "failed", "reply", "reply_positive", "reply_negative", "sample_requested",
            "unsubscribed"}

SIGNAL = {
    "S1": ("employers whose job adverts have stayed open for 30+ days", "employeurs dont les offres restent ouvertes"),
    "S2": ("newly registered businesses", "sociétés nouvellement créées"),
    "S3": ("growing local businesses", "entreprises locales en croissance"),
    "S4": ("newly registered and expanding businesses", "sociétés nouvellement créées"),
    "S5": ("newly registered companies", "sociétés nouvellement créées"),
    "S9": ("new and growing companies", "entreprises nouvelles et en croissance"),
}


def followup_text(p: dict, lang: str) -> tuple[str, str]:
    firm = _clean_name(p["company_name"])
    _, area = _place(p.get("region"))
    en, fr = SIGNAL.get(p["segment_id"], ("local companies with a current reason to buy", "entreprises locales"))
    if lang == "fr":
        body = (f"Bonjour,\n\nJe me permets de revenir vers vous au sujet de mon message de la semaine dernière sur les "
                f"{fr} autour de {area}.\n\nSi cela peut vous être utile, je vous envoie volontiers l'échantillon "
                f"gratuit de 10 pistes actuelles pour {area}, sans engagement. Un simple « oui » suffit.\n\n"
                f"Est-ce que cela vous intéresse ?\n\nBien cordialement,\n{signature(lang)}")
    else:
        body = (f"Hello {firm} team,\n\nA quick follow-up on my note last week about {en} around {area}.\n\n"
                f"If it would help, I am happy to send you the free sample of 10 current leads for {area}, "
                f"with no obligation. A simple \"yes\" is enough.\n\nWould that be useful?\n\n"
                f"Best regards,\n{signature(lang)}")
    return body, area


def sample_followup_text(p: dict, lang: str) -> str:
    _, area = _place(p.get("region"))
    if lang == "fr":
        return (f"Bonjour,\n\nAvez-vous eu le temps de regarder l'échantillon de 10 pistes pour {area} ?\n\n"
                f"Si ces pistes vous sont utiles, je peux lancer la livraison hebdomadaire dès lundi prochain, filtrée "
                f"sur vos villes et votre spécialité. Une réponse rapide suffit, je vous envoie alors les détails.\n\n"
                f"Souhaitez-vous démarrer ?\n\nBien cordialement,\n{signature(lang)}")
    return (f"Hello,\n\nDid you get a chance to look at the sample of 10 leads for {area}?\n\n"
            f"If they are useful, I can start the weekly delivery from next Monday, filtered to your towns and "
            f"specialism. Just reply and I will send you the details.\n\n"
            f"Shall we get started?\n\nBest regards,\n{signature(lang)}")


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
        body = sample_followup_text(p, lang)
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
