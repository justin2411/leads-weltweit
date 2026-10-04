"""Version 12: Premium-Film „So findet unser Radar Ihren nächsten Kunden“ für Webagenturen (S2) in US, UK, FR.

python segments.py  ->  segments/<markt>-radar.json

Ablauf (Inhaber 05.10.2026, Auftrag „Premium-Video“): Radar entdeckt einen Premium-Anlass (Neugründung, Website lädt nicht,
mit Datum) → Beleg (Quelle, Datum, Abrufdatum) → Ansprechperson aus dem Register mit Firmenkontakt → Wert: nur belegte
Zahlen aus docs/PREMIUM-WERT.md (app/content/premium-wert.json) mit Quelle, ausdrücklich „kein Versprechen“.
Regeln wie v5: landesweit, keine Garantien, kein Druck, keine eigenen Preise (die testet das Gehirn), kein „exklusiv“
(erst wenn technisch durchgesetzt). Firma, Person, Domain (.example) und Telefonnummern (Fiktionsbereiche) sind erfunden
und im Bild als Beispiel markiert; die Wert-Szene zeigt nur veröffentlichte Zahlen mit Quelle.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / "segments"

# Stimmen wie v5 (UK seit #175 mit US-Stimme)
M = {
 "us": {"lang": "en", "tts": "en-us", "voice": "af_heart", "speed": 1.04, "locale": "en-US", "key": "us/web-agencies:radar"},
 "uk": {"lang": "en", "tts": "en-us", "voice": "af_heart", "speed": 1.04, "locale": "en-GB", "key": "uk/web-agencies:radar"},
 "fr": {"lang": "fr", "tts": "fr-fr", "voice": "ff_siwis", "speed": 1.06, "locale": "fr-FR", "key": "fr/agences-web:radar"},
}

EN_UI = {
 "ill": "Illustrative example", "scan": ["Public registers", "Company websites", "Checked daily"],
 "new": "New company", "web": "Website doesn't load", "proofhd": "Evidence", "proofok": "Verified",
 "pf": ["Signal", "Date", "Source", "Website check", "Checked"],
 "personhd": "Who to ask for", "pk": ["Phone", "Email", "Source"],
 "valuehd": "What one client can be worth", "srcl": "Source:", "note": "Published figures · not a promise",
}

# Zeilen: (id, Text, Pause) oder (id, Text, Aussprache)
D = {
 "us": {"script": [
   ("radar", "Every day, our radar scans public registers and company websites across the US.", .35),
   ("found", "Here's one: a company filed six days ago. The domain exists, but the website doesn't load.", .55),
   ("proof", "Every signal comes with proof: the source, the date, and when we checked it.", .5),
   ("person", "Then the person to ask for, from the public record, with the business phone and email.", .55),
   ("value", "What could one client be worth? Clutch says most web design projects cost under ten thousand dollars. "
             "And a Google Ads lead averages about seventy dollars.", .4),
   ("note", "Published figures, not a promise. Do the maths with your own numbers.", .5),
   ("end", "Start with ten free leads from across the US, at nextgen-profit dot de.",
    "Start with ten free leads from across the U.S., at next gen profit, dot D E.")],
  "ui": {**EN_UI, "area": "Across the US", "endfree": "10 free leads from across the US",
         "co": "Harbor Lane Bakery LLC", "domain": "harborlanebakery.example", "age": "Filed 6 days ago",
         "pv": ["New company filed", "Sep 28, 2026 · 6 days ago", "Public business register", "No response · domain registered",
                "Oct 4, 2026"],
         "person": "Jordan Reyes", "role": "Owner · Harbor Lane Bakery LLC",
         "pc": ["(312) 555-0142", "hello@harborlanebakery.example", "Public register"],
         "vals": [["Web design projects", "Most under $10,000", "Clutch", "monitor"],
                  ["Google Ads, average cost per lead", "$70.11", "WordStream 2025", "search"]]}},
 "uk": {"script": [
   ("radar", "Every day, our radar scans public registers and company websites across the UK.", .35),
   ("found", "Here's one: a company registered six days ago. The domain exists, but the website doesn't load.", .55),
   ("proof", "Every signal comes with proof: the source, the date, and when we checked it.", .5),
   ("person", "Then the person to ask for: the director, from the public register, with the business phone and email.", .55),
   ("value", "What does a lead cost elsewhere? In US data, a Google Ads lead averages about seventy dollars, "
             "and for business services, about a hundred.", .4),
   ("note", "Published figures, not a promise. Do the maths with your own numbers.", .5),
   ("end", "Start with ten free leads from across the UK, at nextgen-profit dot de.",
    "Start with ten free leads from across the UK, at next gen profit, dot D E.")],
  "ui": {**EN_UI, "area": "Across the UK", "endfree": "10 free leads from across the UK",
         "valuehd": "What one lead costs elsewhere",
         "co": "Harbour Lane Bakery Ltd", "domain": "harbourlanebakery.example", "age": "Registered 6 days ago",
         "pv": ["New company registered", "28 Sep 2026 · 6 days ago", "Public company register", "No response · domain registered",
                "4 Oct 2026"],
         "person": "Sam Whitfield", "role": "Director · Harbour Lane Bakery Ltd",
         "pc": ["020 7946 0381", "hello@harbourlanebakery.example", "Public register"],
         "vals": [["Google Ads, average cost per lead", "$70.11", "WordStream 2025 · US data", "search"],
                  ["Google Ads, business services", "$103.54", "WordStream 2025 · US data", "briefcase"]]}},
 "fr": {"script": [
   ("radar", "Chaque jour, notre radar parcourt les registres publics et les sites des entreprises, partout en France.", .35),
   ("found", "En voici une : une société immatriculée il y a six jours. Le nom de domaine existe, mais le site ne s'affiche pas.", .55),
   ("proof", "Chaque signal a sa preuve : la source, la date, et le jour de notre vérification.", .5),
   ("person", "Puis l'interlocuteur à demander, issu du registre, avec le téléphone et l'e-mail de l'entreprise.", .55),
   ("value", "Combien peut valoir un client ? Selon Codeur, un site réalisé par une agence coûte de deux mille à dix mille euros.", .4),
   ("note", "Des chiffres publiés, pas une promesse. Faites le calcul avec vos propres chiffres.", .5),
   ("end", "Commencez avec dix pistes gratuites, partout en France, sur nextgen-profit point d e.",
    "Commencez avec dix pistes gratuites, partout en France, sur nekst djène profit, point dé e.")],
  "ui": {"ill": "Exemple illustratif", "scan": ["Registres publics", "Sites des entreprises", "Vérifié chaque jour"],
         "area": "Partout en France", "endfree": "10 pistes gratuites, partout en France",
         "new": "Nouvelle société", "web": "Le site ne s'affiche pas", "proofhd": "Preuve", "proofok": "Vérifié",
         "pf": ["Signal", "Date", "Source", "Contrôle du site", "Vérifié le"],
         "personhd": "Interlocuteur", "pk": ["Téléphone", "E-mail", "Source"],
         "valuehd": "Ce que peut valoir un client", "srcl": "Source :", "note": "Chiffres publiés · pas une promesse",
         "co": "Boulangerie du Quai SAS", "domain": "boulangerie-du-quai.example", "age": "Immatriculée il y a 6 jours",
         "pv": ["Nouvelle immatriculation", "28 sept. 2026 · il y a 6 jours", "Registre public des entreprises",
                "Aucune réponse · domaine enregistré", "4 oct. 2026"],
         "person": "Camille Laurent", "role": "Présidente · Boulangerie du Quai SAS",
         "pc": ["01 99 00 52 17", "contact@boulangerie-du-quai.example", "Registre public"],
         "vals": [["Site internet par une agence", "2 000 à 10 000 €", "Codeur", "monitor"],
                  ["Site internet par un freelance", "500 à 2 000 €", "Codeur", "user"]]}},
}


def main():
    OUT.mkdir(exist_ok=True)
    for mk, d in D.items():
        m = M[mk]
        script = []
        for i, text, x in d["script"]:
            e = {"id": i, "text": text, "pause": x if isinstance(x, (int, float)) else .3}
            if isinstance(x, str):
                e["say"] = x
            script.append(e)
        seg = {"key": m["key"], "file": f"v12-{mk}-radar", "lang": m["lang"], "tts": m["tts"], "voice": m["voice"],
               "speed": m["speed"], "film": "radar.html", "industry": "web-agencies",
               "ui": {"locale": m["locale"], **d["ui"]}, "script": script}
        (OUT / f"{mk}-radar.json").write_text(json.dumps(seg, ensure_ascii=False, indent=1) + "\n")
        print("segment", mk)


if __name__ == "__main__":
    main()
