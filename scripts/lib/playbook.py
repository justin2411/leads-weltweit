"""Vertriebs-Playbook je Signal und Zielgruppe für den Lead-Report (Kurz-Briefing pro Lead).

Nur allgemeine, ehrliche Handlungsempfehlungen, abgeleitet aus Signal und Branche des Käufers. Keine erfundenen
Fakten über die Firma: alles Firmenbezogene kommt aus den Lead-Daten (Ereignis, Profil, Datum).
"""
from __future__ import annotations

# Was der Käufer verkauft (Zielgruppe) – für Formulierungen wie "your {service}"
SERVICE = {
    "en": {"S1": "recruitment support", "S2": "a new website", "S3": "IT support", "S4": "business insurance",
           "S5": "bookkeeping and tax support", "S6": "office space and fit-out", "S7": "commercial cleaning",
           "S9": "your service"},
    "fr": {"S1": "un accompagnement au recrutement", "S2": "un nouveau site web", "S3": "un support informatique",
           "S4": "une assurance professionnelle", "S5": "la comptabilité et la fiscalité",
           "S6": "des bureaux et leur aménagement", "S7": "le nettoyage professionnel", "S9": "votre service"},
}

PB = {
    "en": {
        "new_incorporation": {
            "when": "Call within the next 2–3 weeks. New owners choose most providers in their first month.",
            "points": ["They are setting everything up right now: bank, tax, insurance, website.",
                       "The first provider they pick often stays for years.",
                       "Keep it simple: one clear starter offer with a fixed price."],
            "obj": ("“It's too early for us.”", "Offer a 15-minute setup call now and agree a start date that suits them."),
            "follow": "Congratulations on the new company – quick idea for your first months",
        },
        "job_open_30d": {
            "when": "Call the main number this week and mention the role by name. The longer it stays open, the more it costs them.",
            "points": ["The role has been open for weeks, so hiring alone has not worked.",
                       "Every week without the role means lost output or overtime.",
                       "Offer a quick, low-risk way to close the gap."],
            "obj": ("“We are handling it internally.”", "Ask how long they want to keep the role open and offer help only for that gap."),
            "follow": "About the open role on your careers page",
        },
        "jobs_3plus": {
            "when": "Call this week. Several open roles at once usually means growth and a stretched team.",
            "points": ["They are growing and their team is stretched.",
                       "Growth creates new needs beyond the open roles.",
                       "One contact now can become a long-term account."],
            "obj": ("“We have no time right now.”", "Exactly why you called: offer to take one task off their plate."),
            "follow": "Supporting your growth – a quick idea",
        },
        "new_location": {
            "when": "Call before the opening date. Providers for a new site are chosen early.",
            "points": ["A new site needs new suppliers and set-up work.",
                       "Budgets for the opening are already planned.",
                       "Local presence and quick start are your strongest arguments."],
            "obj": ("“We already work with someone.”", "Offer to cover only the new site as a trial."),
            "follow": "Your new location – quick question",
        },
        "website_outdated": {
            "when": "Call or email this week. Point to one concrete, visible issue on their site.",
            "points": ["Their website no longer matches the business.",
                       "Customers judge them by it every day.",
                       "Show one quick win before talking about a full project."],
            "obj": ("“Our website is fine.”", "Ask how many enquiries it brings per month and offer a free short review."),
            "follow": "Three quick wins for your website",
        },
        "_": {
            "when": "Call this week while the event is fresh.",
            "points": ["Something changed in their business recently.", "Change creates new needs.", "Offer one clear next step."],
            "obj": ("“Not interested.”", "Ask one question about their plans and offer to send a short summary by email."),
            "follow": "A quick idea after the recent change at your company",
        },
        "labels": {"when": "When and how", "points": "Talking points", "obj": "If they say", "q": "Ask",
                   "open": "Opening line", "follow": "Follow-up email subject", "offer": "What to offer",
                   "offer_txt": "Lead with {service} as a simple first step."},
    },
    "fr": {
        "new_incorporation": {
            "when": "Appelez dans les 2 à 3 semaines. Les créateurs choisissent la plupart de leurs prestataires le premier mois.",
            "points": ["Ils mettent tout en place en ce moment : banque, fiscalité, assurance, site web.",
                       "Le premier prestataire choisi reste souvent des années.",
                       "Restez simple : une offre de démarrage claire à prix fixe."],
            "obj": ("« C'est trop tôt pour nous. »", "Proposez un appel de 15 minutes maintenant et une date de démarrage qui leur convient."),
            "follow": "Félicitations pour la création – une idée pour vos premiers mois",
        },
        "job_open_30d": {
            "when": "Appelez le standard cette semaine et citez le poste. Plus il reste ouvert, plus il coûte.",
            "points": ["Le poste est ouvert depuis des semaines : le recrutement seul n'a pas suffi.",
                       "Chaque semaine sans ce poste coûte en production ou en heures supplémentaires.",
                       "Proposez une solution rapide et sans risque."],
            "obj": ("« Nous gérons en interne. »", "Demandez combien de temps ils veulent garder le poste ouvert et proposez de l'aide pour cette période."),
            "follow": "À propos du poste ouvert sur votre site",
        },
        "jobs_3plus": {
            "when": "Appelez cette semaine. Plusieurs postes ouverts signifient souvent croissance et équipe sous tension.",
            "points": ["Ils grandissent et l'équipe est sous tension.", "La croissance crée d'autres besoins.",
                       "Un contact maintenant peut devenir un client durable."],
            "obj": ("« Nous n'avons pas le temps. »", "C'est justement pour cela : proposez de les décharger d'une tâche."),
            "follow": "Accompagner votre croissance – une idée rapide",
        },
        "_": {
            "when": "Appelez cette semaine tant que l'événement est récent.",
            "points": ["Quelque chose a changé récemment.", "Le changement crée de nouveaux besoins.", "Proposez une étape simple."],
            "obj": ("« Pas intéressé. »", "Posez une question sur leurs projets et proposez un court résumé par e-mail."),
            "follow": "Une idée suite au changement dans votre entreprise",
        },
        "labels": {"when": "Quand et comment", "points": "Arguments", "obj": "S'ils disent", "q": "Question",
                   "open": "Phrase d'accroche", "follow": "Objet de l'e-mail de relance", "offer": "Quoi proposer",
                   "offer_txt": "Commencez par {service} comme première étape simple."},
    },
}


def playbook(signal: str, segment: str | None, lang: str = "en") -> dict:
    """Empfehlungen für ein Signal; segment bestimmt, was der Käufer anbietet."""
    L = PB.get(lang, PB["en"])
    p = dict(L.get(signal) or L["_"])
    svc = SERVICE.get(lang, SERVICE["en"]).get(segment or "", SERVICE["en"]["S9"] if lang == "en" else SERVICE["fr"]["S9"])
    p["offer"] = L["labels"]["offer_txt"].format(service=svc)
    p["labels"] = L["labels"]
    return p
