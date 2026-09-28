"""Version 5: fünf eigenständige Branchenfilme (je eigenes Konzept und eigene Vorlage) x vier Märkte.

python segments.py  ->  segments/<markt>-<branche>.json

Märkte: uk (en-gb, bf_emma), us (en-us, af_heart), fr (ff_siwis), de (Piper, Thorsten).
Branchen und Vorlagen:
  accountants        accountants.html  "Das erste Jahr einer Firma" (Register-Stempel, Fristen auf der Jahresleiste, Kassenbuch)
  recruitment        recruitment.html  "Die Stelle, die nicht verschwindet" (Tageszähler, neu ausgeschrieben, leere Stühle)
  insurance-brokers  insurance.html    "Neue Risiken" (isometrischer Aufbau: Gebäude, Flotte, Personal, Eröffnung -> Schutzschilde)
  financial-advisers advisers.html     "Der Mensch hinter der Firma" (Registerzeile wird Porträt, Themen im Orbit)
  web-agencies       web.html          "Der Browser-Test" (keine Website, veraltete Seite, bricht auf dem Handy, vorher/nachher)

Regeln: landesweit (keine Regionen der Käufer), keine erfundenen Zahlen über Ergebnisse, keine Garantien, kein Druck,
keine Superlative. Beispiel-Firmen und -Personen sind erfunden und im Bild als Beispiel gekennzeichnet. Telefonnummern aus
den für Film/Fiktion reservierten Bereichen (UK Ofcom 01xx 496 0xxx / 020 7946 0xxx, US 555-01xx, FR ARCEP 01 99 00 / 04 65 71,
DE Bundesnetzagentur 030 23125 / 040 66969 / 069 90009 / 089 99998 / 0221 4710), E-Mail/Web nur auf erfundenen Domains.
Belegte Aussagen: Quellen = öffentliche Register, Bekanntmachungen, Firmenwebsites/Karriereseiten; täglich geprüft;
montags als PDF und Tabelle; jeder Lead nur an eine Firma je Branche; Kontaktdaten inkl. Inhaber/GF-Name, wo öffentlich.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / "segments"

M = {
 "uk": {"lang": "en", "tts": "en-gb", "voice": "bf_emma", "speed": 1.0, "locale": "en-GB", "ill": "Illustrative example",
        "endfree": "10 free leads from across the UK",
        "end": ("Start with ten free leads from across the UK, at nextgen-profit dot de.",
                "Start with ten free leads from across the UK, at next gen profit, dot D E."),
        "week": ["M", "T", "W", "T", "F", "S", "S"], "tld": ".co.uk", "date": "24 Sep 2026", "monday": "Every Monday"},
 "us": {"lang": "en", "tts": "en-us", "voice": "af_heart", "speed": 1.02, "locale": "en-US", "ill": "Illustrative example",
        "endfree": "10 free leads from across the US",
        "end": ("Start with ten free leads from across the US, at nextgen-profit dot de.",
                "Start with ten free leads from across the U.S., at next gen profit, dot D E."),
        "week": ["M", "T", "W", "T", "F", "S", "S"], "tld": ".com", "date": "Sep 24, 2026", "monday": "Every Monday"},
 "fr": {"lang": "fr", "tts": "fr-fr", "voice": "ff_siwis", "speed": 1.04, "locale": "fr-FR", "ill": "Exemple illustratif",
        "endfree": "10 pistes gratuites, partout en France",
        "end": ("Commencez avec dix pistes gratuites, partout en France, sur nextgen-profit point d e.",
                "Commencez avec dix pistes gratuites, partout en France, sur nekst djène profit, point dé e."),
        "week": ["L", "M", "M", "J", "V", "S", "D"], "tld": ".fr", "date": "24 sept. 2026", "monday": "Chaque lundi"},
 "de": {"lang": "de", "tts": "de", "voice": "piper:de_DE-thorsten-high", "speed": 1.0, "locale": "de-DE", "ill": "Beispiel",
        "endfree": "10 kostenlose Leads · in ganz Deutschland",
        "end": ("Starten Sie mit zehn kostenlosen Leads aus ganz Deutschland, auf nextgen-profit punkt de.",
                "Starten Sie mit zehn kostenlosen Leads aus ganz Deutschland, auf Nekst-Dschenn Proffit, Punkt D E."),
        "week": ["M", "D", "M", "D", "F", "S", "S"], "tld": ".de", "date": "24.09.2026", "monday": "Jeden Montag"},
}

# Aussprache (nur Tonspur)
SAY = {"en-us": {"1099s": "ten ninety-nines", "401(k)": "four-oh-one-k", "SEP IRA": "sep I R A", "LLCs": "L L Cs", "LLC": "L L C",
                 "EIN": "E I N", "IRS": "I R S"},
       "en-gb": {"HMRC": "H M R C", "PAYE": "P A Y E"},
       "fr-fr": {"DSN": "D S N", "TVA": "T V A", "PER": "P E R", "RC Pro": "R C pro"},
       "de": {}}

# ---------------------------------------------------------------------------------------------------------------
# 1 Steuerberater / Accountants
ACC = {
 "uk": {"script": [
   ("reg", "Today, a new company is registered at Companies House. Its first year starts now.", .5),
   ("vat", "Soon, it may need to register for VAT with HMRC.", .35),
   ("payroll", "When it hires, its first payroll runs through PAYE.", .35),
   ("filing", "Then comes its first confirmation statement,", .2),
   ("yearend", "and its first year-end accounts and tax return.", .6),
   ("turn", "Each of these dates needs an accountant. The firm that's there before the first deadline often keeps the client for years.", .6),
   ("leads", "We find these companies as they're registered, with the director's name and the company's contact details.", .45),
   ("weekly", "Every Monday, as a PDF and a spreadsheet. Each lead goes to one accounting firm only.", .6)],
  "ui": {"regtitle": "Register entry", "src": "Companies House", "stamp": "Registered",
         "regf": [["Company", "Northfield Freight Ltd"], ["Type", "Private limited company"], ["Incorporated", "24 Sep 2026"], ["Director", "Sarah Hartley"]],
         "yearone": "Year one", "dl": [["receipt", "VAT registration", "HMRC", 1.4], ["coins", "First payroll", "PAYE", 3.2],
                                        ["file", "Confirmation statement", "Companies House", 10.6], ["calc", "Year-end accounts", "Corporation Tax", 11.4]],
         "dlat": [["vat", .05], ["payroll", .05], ["filing", .05], ["yearend", .1]],
         "hub": "Your firm, from the first deadline", "yearw": "Year",
         "ledger": "New registrations", "detail": "Lead", "cols": ["Company", "Incorporated", "Director"],
         "rows": [["Northfield Freight Ltd", "24 Sep", "Sarah Hartley"], ["Kestrel Bakery Ltd", "24 Sep", "Tom Ashby"],
                  ["Linden Dental Care Ltd", "23 Sep", "Priya Nair"], ["Harbour Joinery Ltd", "23 Sep", "Owen Price"],
                  ["Brightwell Studio Ltd", "22 Sep", "Emma Lowe"], ["Ashgrove Cleaning Ltd", "22 Sep", "Daniel Reed"]],
         "co": "Northfield Freight Ltd", "f": ["Director", "Phone", "Email", "Website", "Source"],
         "director": "Sarah Hartley", "phone": "0113 496 0418", "email": "info@northfieldfreight.co.uk", "web": "northfieldfreight.co.uk",
         "srcdate": "Companies House · 24 Sep 2026", "excl": "Each lead goes to one accounting firm"}},
 "us": {"script": [
   ("reg", "Today, a new LLC is filed with the state. Its first year starts now.", .5),
   ("tax", "It needs an EIN from the IRS, and often a sales tax permit.", .35),
   ("payroll", "When it hires, its first payroll begins.", .35),
   ("filing", "Then comes the state's annual report,", .2),
   ("yearend", "and its first business tax return, with 1099s for contractors.", .6),
   ("turn", "Each of these dates needs an accountant. The firm that's there before the first deadline often keeps the client for years.", .6),
   ("leads", "We find these businesses as they're filed, with the owner's name where it's public, and the business contact details.", .45),
   ("weekly", "Every Monday, as a PDF and a spreadsheet. Each lead goes to one accounting firm only.", .6)],
  "ui": {"regtitle": "State filing", "src": "Secretary of State", "stamp": "Filed",
         "regf": [["Business", "Ridgeway Freight LLC"], ["Type", "Limited liability co."], ["Filed", "Sep 24, 2026"], ["Owner", "Maria Alvarez"]],
         "yearone": "Year one", "dl": [["receipt", "EIN & sales tax", "IRS · State", 0.6], ["coins", "First payroll", "Federal & state", 2.6],
                                        ["file", "Annual report", "Secretary of State", 9.8], ["calc", "Business tax return", "IRS · 1099s", 11.3]],
         "dlat": [["tax", .05], ["payroll", .05], ["filing", .05], ["yearend", .1]],
         "hub": "Your firm, from the first deadline", "yearw": "Year",
         "ledger": "New filings", "detail": "Lead", "cols": ["Business", "Filed", "Owner"],
         "rows": [["Ridgeway Freight LLC", "Sep 24", "Maria Alvarez"], ["Kestrel Bakery LLC", "Sep 24", "Tom Becker"],
                  ["Linden Dental Care PLLC", "Sep 23", "Priya Nair"], ["Harbor Woodworks LLC", "Sep 23", "Owen Price"],
                  ["Brightwell Studio LLC", "Sep 22", "Emma Lowe"], ["Ashgrove Cleaning LLC", "Sep 22", "Daniel Reed"]],
         "co": "Ridgeway Freight LLC", "f": ["Owner", "Phone", "Email", "Website", "Source"],
         "director": "Maria Alvarez", "phone": "(614) 555-0147", "email": "info@ridgewayfreight.com", "web": "ridgewayfreight.com",
         "srcdate": "State filing · Sep 24, 2026", "excl": "Each lead goes to one accounting firm"}},
 "fr": {"script": [
   ("reg", "Aujourd'hui, une nouvelle société est immatriculée au registre national des entreprises. Sa première année commence.", .5),
   ("vat", "Il faudra bientôt déclarer la TVA.", .35),
   ("payroll", "À la première embauche, viennent la paie et la DSN.", .35),
   ("filing", "Puis le premier bilan et la liasse fiscale,", .2),
   ("yearend", "et le dépôt des comptes.", .6),
   ("turn", "Chacune de ces échéances demande un expert-comptable. Le cabinet présent avant la première garde souvent le client pendant des années.", .6),
   ("leads", "Nous repérons ces sociétés dès leur immatriculation, avec le nom du dirigeant et les coordonnées de l'entreprise.", .45),
   ("weekly", "Chaque lundi, en PDF et en tableur. Chaque piste ne va qu'à un seul cabinet.", .6)],
  "ui": {"regtitle": "Immatriculation", "src": "RNE · INPI", "stamp": "Immatriculée",
         "regf": [["Société", "Transports Lumen SAS"], ["Forme", "SAS"], ["Immatriculée", "24 sept. 2026"], ["Présidente", "Claire Morel"]],
         "yearone": "Première année", "dl": [["receipt", "Déclaration de TVA", "Impôts", 1.4], ["coins", "Première paie", "DSN", 3.2],
                                               ["calc", "Premier bilan", "Liasse fiscale", 10.4], ["file", "Dépôt des comptes", "Greffe", 11.4]],
         "dlat": [["vat", .05], ["payroll", .05], ["filing", .05], ["yearend", .1]],
         "hub": "Votre cabinet, dès la première échéance", "yearw": "Année",
         "ledger": "Nouvelles immatriculations", "detail": "Piste", "cols": ["Société", "Date", "Dirigeant"],
         "rows": [["Transports Lumen SAS", "24 sept.", "Claire Morel"], ["Boulangerie Kestrel SARL", "24 sept.", "Thomas Aubry"],
                  ["Cabinet Dentaire Tilleul", "23 sept.", "Priya Nair"], ["Menuiserie Portal SAS", "23 sept.", "Olivier Prat"],
                  ["Studio Clairval SAS", "22 sept.", "Emma Lopez"], ["Nettoyage Frêne SARL", "22 sept.", "Daniel Roux"]],
         "co": "Transports Lumen SAS", "f": ["Présidente", "Téléphone", "E-mail", "Site web", "Source"],
         "director": "Claire Morel", "phone": "04 65 71 23 18", "email": "contact@transports-lumen.fr", "web": "transports-lumen.fr",
         "srcdate": "RNE · 24 sept. 2026", "excl": "Chaque piste va à un seul cabinet"}},
 "de": {"script": [
   ("reg", "Heute wird ein neues Unternehmen ins Handelsregister eingetragen. Sein erstes Jahr beginnt.", .5),
   ("vat", "Zuerst die steuerliche Erfassung, dann die Umsatzsteuer-Voranmeldung.", .35),
   ("payroll", "Mit der ersten Einstellung kommt die erste Lohnabrechnung.", .35),
   ("filing", "Und dann der erste Jahresabschluss.", .6),
   ("turn", "Für jeden dieser Termine braucht es einen Steuerberater. Die Kanzlei, die vor der ersten Frist da ist, betreut die Firma oft über Jahre.", .6),
   ("leads", "Wir finden diese Firmen direkt nach der Eintragung, mit dem Namen der Geschäftsführung und den Kontaktdaten der Firma.", .45),
   ("weekly", "Jeden Montag, als PDF und als Tabelle. Jeder Lead geht nur an eine Kanzlei.", .6)],
  "ui": {"regtitle": "Handelsregister", "src": "Neueintragung", "stamp": "Eingetragen",
         "regf": [["Firma", "Nordkai Logistik GmbH"], ["Rechtsform", "GmbH"], ["Eingetragen", "24.09.2026"], ["Geschäftsführerin", "Julia Brandt"]],
         "yearone": "Das erste Jahr", "dl": [["file", "Steuerliche Erfassung", "Finanzamt", 0.6], ["receipt", "Umsatzsteuer", "Voranmeldung", 1.8],
                                              ["coins", "Erste Lohnabrechnung", "Lohn", 3.2], ["calc", "Jahresabschluss", "Steuererklärung", 11.3]],
         "dlat": [["vat", .02], ["vat", .5], ["payroll", .05], ["filing", .1]],
         "hub": "Ihre Kanzlei, ab der ersten Frist", "yearw": "Jahr",
         "ledger": "Neueintragungen", "detail": "Lead", "cols": ["Firma", "Eingetragen", "Geschäftsführung"],
         "rows": [["Nordkai Logistik GmbH", "24.09.", "Julia Brandt"], ["Bäckerei Falke GmbH", "24.09.", "Tobias Arndt"],
                  ["Zahnwerk Linde GmbH", "23.09.", "Priya Nair"], ["Tischlerei Hafen GmbH", "23.09.", "Olaf Peters"],
                  ["Studio Hellweg GmbH", "22.09.", "Emma Lorenz"], ["Eschen Reinigung GmbH", "22.09.", "Daniel Roth"]],
         "co": "Nordkai Logistik GmbH", "f": ["Geschäftsführerin", "Telefon", "E-Mail", "Website", "Quelle"],
         "director": "Julia Brandt", "phone": "040 66969 482", "email": "info@nordkai-logistik.de", "web": "nordkai-logistik.de",
         "srcdate": "Handelsregister · 24.09.2026", "excl": "Jeder Lead geht an eine Kanzlei"}},
}

# ---------------------------------------------------------------------------------------------------------------
# 2 Personalvermittlung / Recruitment
REC = {
 "uk": {"script": [
   ("hook", "This role went live on an employer's careers page.", .35),
   ("d1", "Day one.", .3), ("d30", "Day thirty.", .3), ("d45", "Day forty-five.", .45),
   ("repost", "It's still there. Then it's posted again, and two more roles appear next to it.", .6),
   ("chairs", "The employer has already tried on their own. A role open for thirty days or more is the moment they take a recruiter's call.", .6),
   ("watch", "We check careers pages every day, and log when each role first appeared, when it was re-posted, and how many are open, with the source link.", .45),
   ("weekly", "Every Monday, you get these employers with the company's phone, email and the director's name. Each lead goes to one recruitment firm only.", .6)],
  "ui": {"careers": "Careers", "co": "Calder Precision Engineering Ltd", "jobs": ["Maintenance Engineer", "CNC Machinist", "Production Planner"],
         "meta": "Full-time · Permanent", "apply": "Apply", "day": "Day", "repost": "Re-posted", "three": "3 open roles",
         "tl": [["First seen", "12 Aug 2026"], ["Re-posted", "9 Sep 2026"], ["Still open", "26 Sep 2026"]],
         "srcurl": "calderprecision.co.uk/careers", "daily": "Checked daily", "openfor": "Open 45 days",
         "list": [["Calder Precision Engineering Ltd", "3 roles · longest 45 days", "0113 496 0418"],
                  ["Ashcombe Logistics Ltd", "Re-posted twice", "0121 496 0527"],
                  ["Wexley Care Homes Ltd", "4 roles open", "020 7946 0639"]],
         "listhd": "Employers with long-open roles", "excl": "Each lead goes to one recruitment firm"}},
 "us": {"script": [
   ("hook", "This job went live on an employer's careers page.", .35),
   ("d1", "Day one.", .3), ("d30", "Day thirty.", .3), ("d45", "Day forty-five.", .45),
   ("repost", "It's still there. Then it's reposted, and two more openings appear next to it.", .6),
   ("chairs", "The employer has already tried on their own. A job open for thirty days or more is the moment they take a recruiter's call.", .6),
   ("watch", "We check careers pages every day, and log when each job first appeared, when it was reposted, and how many are open, with the source link.", .45),
   ("weekly", "Every Monday, you get these employers with the company's phone, email and the owner's name where it's public. Each lead goes to one staffing firm only.", .6)],
  "ui": {"careers": "Careers", "co": "Bluestem Precision Machining Inc.", "jobs": ["Maintenance Technician", "CNC Machinist", "Production Planner"],
         "meta": "Full-time · On-site", "apply": "Apply", "day": "Day", "repost": "Reposted", "three": "3 open jobs",
         "tl": [["First seen", "Aug 12, 2026"], ["Reposted", "Sep 9, 2026"], ["Still open", "Sep 26, 2026"]],
         "srcurl": "bluestemmachining.com/careers", "daily": "Checked daily", "openfor": "Open 45 days",
         "list": [["Bluestem Precision Machining Inc.", "3 jobs · longest 45 days", "(614) 555-0147"],
                  ["Ashcombe Logistics LLC", "Reposted twice", "(312) 555-0152"],
                  ["Westbrook Senior Living LLC", "4 jobs open", "(206) 555-0163"]],
         "listhd": "Employers with long-open jobs", "excl": "Each lead goes to one staffing firm"}},
 "fr": {"script": [
   ("hook", "Ce poste a été publié sur la page carrières d'un employeur.", .35),
   ("d1", "Jour un.", .3), ("d30", "Jour trente.", .3), ("d45", "Jour quarante-cinq.", .45),
   ("repost", "Il est toujours là. Puis l'offre est republiée, et deux autres postes apparaissent à côté.", .6),
   ("chairs", "L'employeur a déjà essayé seul. Un poste ouvert depuis trente jours ou plus, c'est le moment où il accepte l'appel d'un cabinet.", .6),
   ("watch", "Nous vérifions les pages carrières chaque jour, et notons quand chaque poste est apparu, quand il a été republié, et combien sont ouverts, avec le lien source.", .45),
   ("weekly", "Chaque lundi, vous recevez ces employeurs, avec téléphone, e-mail et nom du dirigeant. Chaque piste ne va qu'à un seul cabinet.", .6)],
  "ui": {"careers": "Carrières", "co": "Mécanique Précise Arnaud SAS", "jobs": ["Technicien de maintenance", "Usineur CN", "Planificateur de production"],
         "meta": "CDI · Temps plein", "apply": "Postuler", "day": "Jour", "repost": "Republiée", "three": "3 postes ouverts",
         "tl": [["Vu pour la 1re fois", "12 août 2026"], ["Republiée", "9 sept. 2026"], ["Toujours ouverte", "26 sept. 2026"]],
         "srcurl": "mecanique-arnaud.fr/carrieres", "daily": "Vérifié chaque jour", "openfor": "Ouvert depuis 45 jours",
         "list": [["Mécanique Précise Arnaud SAS", "3 postes · le plus ancien 45 j", "04 65 71 23 18"],
                  ["Logistique Ascombe SAS", "Republiée deux fois", "01 99 00 42 17"],
                  ["Résidences Saules SAS", "4 postes ouverts", "04 65 71 58 62"]],
         "listhd": "Employeurs aux postes ouverts depuis longtemps", "excl": "Chaque piste va à un seul cabinet"}},
 "de": {"script": [
   ("hook", "Diese Stelle erscheint auf der Karriereseite eines Arbeitgebers.", .35),
   ("d1", "Tag eins.", .3), ("d30", "Tag dreißig.", .3), ("d45", "Tag fünfundvierzig.", .45),
   ("repost", "Sie ist immer noch da. Dann wird sie neu ausgeschrieben, und daneben erscheinen zwei weitere Stellen.", .6),
   ("chairs", "Der Arbeitgeber hat es schon allein versucht. Ist eine Stelle dreißig Tage oder länger offen, nimmt er den Anruf eines Personalvermittlers eher an.", .6),
   ("watch", "Wir prüfen Karriereseiten jeden Tag, und halten fest, wann jede Stelle zuerst erschien, wann sie neu ausgeschrieben wurde und wie viele offen sind, mit Quellenlink.", .45),
   ("weekly", "Jeden Montag erhalten Sie diese Arbeitgeber, mit Telefon, E-Mail und Geschäftsführung. Jeder Lead geht nur an einen Personalvermittler.", .6)],
  "ui": {"careers": "Karriere", "co": "Brandtwerk Präzisionstechnik GmbH", "jobs": ["Instandhalter (m/w/d)", "CNC-Fräser (m/w/d)", "Produktionsplaner (m/w/d)"],
         "meta": "Vollzeit · unbefristet", "apply": "Bewerben", "day": "Tag", "repost": "Neu ausgeschrieben", "three": "3 offene Stellen",
         "tl": [["Zuerst gesehen", "12.08.2026"], ["Neu ausgeschrieben", "09.09.2026"], ["Noch offen", "26.09.2026"]],
         "srcurl": "brandtwerk.de/karriere", "daily": "Täglich geprüft", "openfor": "Seit 45 Tagen offen",
         "list": [["Brandtwerk Präzisionstechnik GmbH", "3 Stellen · älteste 45 Tage", "040 66969 482"],
                  ["Aschberg Logistik GmbH", "Zweimal neu ausgeschrieben", "030 23125 617"],
                  ["Weidenhof Pflege GmbH", "4 Stellen offen", "089 99998 233"]],
         "listhd": "Arbeitgeber mit lange offenen Stellen", "excl": "Jeder Lead geht an einen Personalvermittler"}},
}

# ---------------------------------------------------------------------------------------------------------------
# 3 Versicherungsmakler / Insurance brokers
INS = {
 "uk": {"script": [
   ("plot", "A new company has just been registered. For now, it's an empty plot.", .45),
   ("build", "It takes on premises: that's property and contents cover.", .3),
   ("fleet", "Vans for deliveries: fleet insurance.", .3),
   ("staff", "Its first employees: employers' liability, which is required by law.", .3),
   ("open", "And when it opens to customers: public liability.", .6),
   ("turn", "Every new asset is a new policy. And new and growing companies need that cover before they start trading.", .6),
   ("leads", "We find new and expanding companies in public registers and on their own websites, with the director's name and contact details.", .45),
   ("weekly", "Every Monday, as a PDF and a spreadsheet. Each lead goes to one broker only.", .6)],
  "ui": {"newco": "New company", "co": "Brightline Kitchens Ltd",
         "cover": [["building", "Property & contents"], ["truck", "Fleet"], ["users", "Employers' liability"], ["store", "Public liability"]],
         "turnchip": "Every new asset, a new policy", "leadhd": "Lead", "sig": ["New company", "New premises", "Hiring"],
         "f": ["Director", "Phone", "Email", "Website", "Source"], "director": "James Whitfield", "phone": "0113 496 0724",
         "email": "info@brightlinekitchens.co.uk", "web": "brightlinekitchens.co.uk", "srcdate": "Companies House · 24 Sep 2026",
         "excl": "Each lead goes to one broker", "monday": "Every Monday · PDF + spreadsheet"}},
 "us": {"script": [
   ("plot", "A new business has just been filed. For now, it's an empty lot.", .45),
   ("build", "It leases a building: commercial property coverage.", .3),
   ("fleet", "Trucks for deliveries: commercial auto.", .3),
   ("staff", "Its first employees: workers' comp, required in most states.", .3),
   ("open", "And when it opens to customers: general liability.", .6),
   ("turn", "Every new asset is a new policy. And new and growing businesses need that coverage before they open.", .6),
   ("leads", "We find new and expanding businesses in public filings and on their own websites, with the owner's name where it's public, and contact details.", .45),
   ("weekly", "Every Monday, as a PDF and a spreadsheet. Each lead goes to one agency only.", .6)],
  "ui": {"newco": "New business", "co": "Brightline Cabinets LLC",
         "cover": [["building", "Commercial property"], ["truck", "Commercial auto"], ["users", "Workers' comp"], ["store", "General liability"]],
         "turnchip": "Every new asset, a new policy", "leadhd": "Lead", "sig": ["New business", "New location", "Hiring"],
         "f": ["Owner", "Phone", "Email", "Website", "Source"], "director": "Daniel Ortiz", "phone": "(919) 555-0138",
         "email": "info@brightlinecabinets.com", "web": "brightlinecabinets.com", "srcdate": "State filing · Sep 24, 2026",
         "excl": "Each lead goes to one agency", "monday": "Every Monday · PDF + spreadsheet"}},
 "fr": {"script": [
   ("plot", "Une nouvelle société vient d'être immatriculée. Pour l'instant, c'est un terrain vide.", .45),
   ("build", "Elle prend des locaux : multirisque professionnelle.", .3),
   ("fleet", "Des véhicules pour livrer : assurance flotte.", .3),
   ("staff", "Ses premiers salariés : prévoyance et mutuelle collective.", .3),
   ("open", "Et quand elle accueille ses clients : responsabilité civile professionnelle.", .6),
   ("turn", "Chaque nouvel actif, c'est un nouveau contrat. Et une entreprise nouvelle ou en croissance doit être assurée avant de démarrer.", .6),
   ("leads", "Nous repérons les créations et les entreprises qui s'agrandissent, dans les registres publics et sur leurs sites, avec le nom du dirigeant et les coordonnées.", .45),
   ("weekly", "Chaque lundi, en PDF et en tableur. Chaque piste ne va qu'à un seul courtier.", .6)],
  "ui": {"newco": "Nouvelle société", "co": "Cuisines Lumière SAS",
         "cover": [["building", "Multirisque pro"], ["truck", "Flotte"], ["users", "Prévoyance · mutuelle"], ["store", "RC Pro"]],
         "turnchip": "Chaque nouvel actif, un nouveau contrat", "leadhd": "Piste", "sig": ["Création", "Nouveaux locaux", "Recrute"],
         "f": ["Président", "Téléphone", "E-mail", "Site web", "Source"], "director": "Julien Mercier", "phone": "01 99 00 37 42",
         "email": "contact@cuisines-lumiere.fr", "web": "cuisines-lumiere.fr", "srcdate": "RNE · 24 sept. 2026",
         "excl": "Chaque piste va à un seul courtier", "monday": "Chaque lundi · PDF + tableur"}},
 "de": {"script": [
   ("plot", "Ein neues Unternehmen ist gerade eingetragen worden. Noch ist es ein leeres Grundstück.", .45),
   ("build", "Es bezieht eigene Räume: Inhalts- und Gebäudeversicherung.", .3),
   ("fleet", "Transporter für die Auslieferung: Flottenversicherung.", .3),
   ("staff", "Die ersten Mitarbeitenden: betriebliche Vorsorge.", .3),
   ("open", "Und wenn es für Kunden öffnet: Betriebshaftpflicht.", .6),
   ("turn", "Jede neue Anschaffung ist eine neue Police. Neue und wachsende Firmen brauchen diesen Schutz, bevor sie starten.", .6),
   ("leads", "Wir finden Neugründungen und wachsende Firmen in öffentlichen Registern und auf ihren Websites, mit Geschäftsführung und Kontaktdaten.", .45),
   ("weekly", "Jeden Montag, als PDF und als Tabelle. Jeder Lead geht nur an einen Makler.", .6)],
  "ui": {"newco": "Neues Unternehmen", "co": "Lichtblick Küchenbau GmbH",
         "cover": [["building", "Inhalt & Gebäude"], ["truck", "Flotte"], ["users", "Betriebliche Vorsorge"], ["store", "Betriebshaftpflicht"]],
         "turnchip": "Jede Anschaffung, eine neue Police", "leadhd": "Lead", "sig": ["Neugründung", "Neue Räume", "Stellen offen"],
         "f": ["Geschäftsführer", "Telefon", "E-Mail", "Website", "Quelle"], "director": "Markus Albers", "phone": "069 90009 845",
         "email": "info@lichtblick-kuechenbau.de", "web": "lichtblick-kuechenbau.de", "srcdate": "Handelsregister · 24.09.2026",
         "excl": "Jeder Lead geht an einen Makler", "monday": "Jeden Montag · PDF + Tabelle"}},
}

# ---------------------------------------------------------------------------------------------------------------
# 4 Vermögensberater / Financial advisers
ADV = {
 "uk": {"script": [
   ("reg", "Behind every new company in the register, there's a person.", .45),
   ("person", "A new director is also a private client, with fresh decisions to make.", .5),
   ("pay", "How to pay themselves: salary or dividends.", .3),
   ("pension", "A pension, perhaps paid in through the company.", .3),
   ("protect", "Protection for their family and the business.", .3),
   ("exit", "And one day, succession, or an exit.", .6),
   ("leads", "The public register shows who they are and when they started. We find new directors for you, with their company's contact details.", .45),
   ("weekly", "Every Monday, as a PDF and a spreadsheet. Each lead goes to one advisory firm only.", .6)],
  "ui": {"regtitle": "Officers · appointed this week", "src": "Companies House",
         "reg": [["Northfield Freight Ltd", "Director", "Sarah Hartley", "24 Sep 2026"], ["Kestrel Bakery Ltd", "Director", "Tom Ashby", "24 Sep 2026"],
                 ["Harbour Digital Studio Ltd", "Director", "Amelia Stone", "23 Sep 2026"], ["Linden Dental Care Ltd", "Director", "Priya Nair", "23 Sep 2026"],
                 ["Harbour Joinery Ltd", "Director", "Owen Price", "22 Sep 2026"], ["Brightwell Studio Ltd", "Director", "Emma Lowe", "22 Sep 2026"]],
         "hi": 2, "name": "Amelia Stone", "role": "Director · Harbour Digital Studio Ltd",
         "topics": [["scale", "Salary or dividends"], ["sprout", "Pension"], ["umbrella", "Protection"], ["exit", "Succession & exit"]],
         "profhd": "New director", "f": ["Company", "Appointed", "Phone", "Email", "Source"],
         "pf": ["Harbour Digital Studio Ltd", "23 Sep 2026", "0131 496 0582", "hello@harbourdigital.co.uk", "Companies House"],
         "excl": "Each lead goes to one advisory firm", "monday": "Every Monday · PDF + spreadsheet"}},
 "us": {"script": [
   ("reg", "Behind every new business filing, there's a person.", .45),
   ("person", "A new owner is also a private client, with fresh decisions to make.", .5),
   ("pay", "How to pay themselves: salary or distributions.", .3),
   ("pension", "A retirement plan, like a solo 401(k) or a SEP IRA.", .3),
   ("protect", "Life and disability cover, for family and business.", .3),
   ("exit", "And one day, succession, or a sale.", .6),
   ("leads", "Public filings show who they are and when they started. We find new owners for you, with their names where public, and business contact details.", .45),
   ("weekly", "Every Monday, as a PDF and a spreadsheet. Each lead goes to one advisory firm only.", .6)],
  "ui": {"regtitle": "New filings · this week", "src": "Secretary of State",
         "reg": [["Ridgeway Freight LLC", "Owner", "Maria Alvarez", "Sep 24, 2026"], ["Kestrel Bakery LLC", "Owner", "Tom Becker", "Sep 24, 2026"],
                 ["Harbor Pixel Studio LLC", "Owner", "Amelia Stone", "Sep 23, 2026"], ["Linden Dental Care PLLC", "Owner", "Priya Nair", "Sep 23, 2026"],
                 ["Harbor Woodworks LLC", "Owner", "Owen Price", "Sep 22, 2026"], ["Brightwell Studio LLC", "Owner", "Emma Lowe", "Sep 22, 2026"]],
         "hi": 2, "name": "Amelia Stone", "role": "Owner · Harbor Pixel Studio LLC",
         "topics": [["scale", "Salary or distributions"], ["sprout", "401(k) · SEP IRA"], ["umbrella", "Life & disability"], ["exit", "Succession & sale"]],
         "profhd": "New business owner", "f": ["Business", "Filed", "Phone", "Email", "Source"],
         "pf": ["Harbor Pixel Studio LLC", "Sep 23, 2026", "(512) 555-0174", "hello@harborpixel.com", "State filing"],
         "excl": "Each lead goes to one advisory firm", "monday": "Every Monday · PDF + spreadsheet"}},
 "fr": {"script": [
   ("reg", "Derrière chaque nouvelle société du registre, il y a une personne.", .45),
   ("person", "Un nouveau dirigeant est aussi un client privé, avec de nouvelles décisions à prendre.", .5),
   ("pay", "Comment se rémunérer : salaire ou dividendes.", .3),
   ("pension", "Préparer sa retraite, par exemple avec un PER.", .3),
   ("protect", "Protéger sa famille et l'entreprise, avec la prévoyance.", .3),
   ("exit", "Et un jour, la transmission.", .6),
   ("leads", "Le registre montre qui ils sont et quand ils ont commencé. Nous trouvons pour vous les nouveaux dirigeants, avec les coordonnées de leur entreprise.", .45),
   ("weekly", "Chaque lundi, en PDF et en tableur. Chaque piste ne va qu'à un seul cabinet.", .6)],
  "ui": {"regtitle": "Dirigeants · nommés cette semaine", "src": "RNE · INPI",
         "reg": [["Transports Lumen SAS", "Présidente", "Claire Morel", "24 sept. 2026"], ["Boulangerie Kestrel SARL", "Gérant", "Thomas Aubry", "24 sept. 2026"],
                 ["Studio Numérique Calanque SAS", "Présidente", "Amélie Garnier", "23 sept. 2026"], ["Cabinet Dentaire Tilleul", "Gérante", "Priya Nair", "23 sept. 2026"],
                 ["Menuiserie Portal SAS", "Président", "Olivier Prat", "22 sept. 2026"], ["Studio Clairval SAS", "Présidente", "Emma Lopez", "22 sept. 2026"]],
         "hi": 2, "name": "Amélie Garnier", "role": "Présidente · Studio Numérique Calanque",
         "topics": [["scale", "Salaire ou dividendes"], ["sprout", "Retraite · PER"], ["umbrella", "Prévoyance"], ["exit", "Transmission"]],
         "profhd": "Nouvelle dirigeante", "f": ["Société", "Nommée le", "Téléphone", "E-mail", "Source"],
         "pf": ["Studio Numérique Calanque SAS", "23 sept. 2026", "01 99 00 51 26", "contact@studio-calanque.fr", "RNE · INPI"],
         "excl": "Chaque piste va à un seul cabinet", "monday": "Chaque lundi · PDF + tableur"}},
 "de": {"script": [
   ("reg", "Hinter jeder neuen Firma im Handelsregister steht ein Mensch.", .45),
   ("person", "Wer eine Firma gründet, ist auch Privatkunde, mit neuen Entscheidungen.", .5),
   ("pay", "Wie zahle ich mich aus: Gehalt oder Ausschüttung?", .3),
   ("pension", "Die eigene Altersvorsorge, vielleicht über die Firma.", .3),
   ("protect", "Die Absicherung für Familie und Unternehmen.", .3),
   ("exit", "Und irgendwann die Nachfolge.", .6),
   ("leads", "Das Handelsregister zeigt, wer sie sind und wann sie gestartet sind. Wir finden neue Geschäftsführer für Sie, mit den Kontaktdaten ihrer Firma.", .45),
   ("weekly", "Jeden Montag, als PDF und als Tabelle. Jeder Lead geht nur an eine Beratung.", .6)],
  "ui": {"regtitle": "Geschäftsführung · diese Woche bestellt", "src": "Handelsregister",
         "reg": [["Nordkai Logistik GmbH", "Geschäftsführerin", "Julia Brandt", "24.09.2026"], ["Bäckerei Falke GmbH", "Geschäftsführer", "Tobias Arndt", "24.09.2026"],
                 ["Hafenlicht Digital GmbH", "Geschäftsführerin", "Anna Seidel", "23.09.2026"], ["Zahnwerk Linde GmbH", "Geschäftsführerin", "Priya Nair", "23.09.2026"],
                 ["Tischlerei Hafen GmbH", "Geschäftsführer", "Olaf Peters", "22.09.2026"], ["Studio Hellweg GmbH", "Geschäftsführerin", "Emma Lorenz", "22.09.2026"]],
         "hi": 2, "name": "Anna Seidel", "role": "Geschäftsführerin · Hafenlicht Digital GmbH",
         "topics": [["scale", "Gehalt oder Ausschüttung"], ["sprout", "Altersvorsorge"], ["umbrella", "Absicherung"], ["exit", "Nachfolge"]],
         "profhd": "Neue Geschäftsführung", "f": ["Firma", "Bestellt am", "Telefon", "E-Mail", "Quelle"],
         "pf": ["Hafenlicht Digital GmbH", "23.09.2026", "0221 4710 391", "info@hafenlicht-digital.de", "Handelsregister"],
         "excl": "Jeder Lead geht an eine Beratung", "monday": "Jeden Montag · PDF + Tabelle"}},
}

# ---------------------------------------------------------------------------------------------------------------
# 5 Webagenturen / Web agencies
WEB = {
 "uk": {"script": [
   ("type", "Let's look up a company that was registered last week, and see what's online.", .3),
   ("nothing", "We type its name. Nothing. No website.", .6),
   ("old", "Another company has a site, but it looks like it was built in two thousand and eight.", .35),
   ("mobile", "And on a phone, it simply breaks.", .6),
   ("fix", "For a web agency, that's an easy conversation to start: the company can see the problem for itself.", .6),
   ("check", "We check the websites of new companies for you, and flag who has none, or one that doesn't work on a phone.", .45),
   ("weekly", "Every Monday, with phone, email and the director's name. Each lead goes to one web agency only.", .6)],
  "ui": {"url1": "oakridgehomeservices.co.uk", "nosite": "No website found", "nosub": "The domain doesn't point to a site.",
         "url2": "brightforge-tools.co.uk", "retro": {"title": "BRIGHTFORGE TOOLS", "welcome": "Welcome to our homepage!", "nav": ["Home", "Products", "About us", "Contact"],
         "body": "We are a family business. Please call us for prices.", "best": "Best viewed in 800×600", "visitors": "Visitors"},
         "modern": {"name": "Brightforge Tools", "h": "Tools for trade, made to last", "cta": "Request a quote", "nav": ["Products", "Trade", "Contact"]},
         "checkhd": "Website check", "checks": [["Oakridge Home Services Ltd", "No website found", "noweb"], ["Brightforge Tools Ltd", "Not mobile-friendly", "mobile"],
                                                ["Kestrel Plumbing Ltd", "No website found", "noweb"], ["Linden Pet Care Ltd", "Outdated website", "monitor"]],
         "checked": "Checked 26 Sep 2026", "f": ["Phone", "Email", "Director"],
         "contact": ["0113 496 0935", "info@oakridgehomeservices.co.uk", "Chris Oakley"], "before": "Before", "after": "After",
         "excl": "Each lead goes to one web agency", "monday": "Every Monday"}},
 "us": {"script": [
   ("type", "Let's look up a business that was filed last week, and see what's online.", .3),
   ("nothing", "We type its name. Nothing. No website.", .6),
   ("old", "Another business has a site, but it looks like it was built in two thousand and eight.", .35),
   ("mobile", "And on a phone, it simply breaks.", .6),
   ("fix", "For a web agency, that's an easy conversation to start: the business can see the problem for itself.", .6),
   ("check", "We check the websites of new businesses for you, and flag who has none, or one that doesn't work on a phone.", .45),
   ("weekly", "Every Monday, with phone, email and the owner's name where it's public. Each lead goes to one web agency only.", .6)],
  "ui": {"url1": "oakridgehomeservices.com", "nosite": "No website found", "nosub": "The domain doesn't point to a site.",
         "url2": "brightforgetools.com", "retro": {"title": "BRIGHTFORGE TOOLS", "welcome": "Welcome to our homepage!", "nav": ["Home", "Products", "About us", "Contact"],
         "body": "We are a family business. Please call us for prices.", "best": "Best viewed in 800×600", "visitors": "Visitors"},
         "modern": {"name": "Brightforge Tools", "h": "Tools for the trade, built to last", "cta": "Request a quote", "nav": ["Products", "Trade", "Contact"]},
         "checkhd": "Website check", "checks": [["Oakridge Home Services LLC", "No website found", "noweb"], ["Brightforge Tools LLC", "Not mobile-friendly", "mobile"],
                                                ["Kestrel Plumbing LLC", "No website found", "noweb"], ["Linden Pet Care LLC", "Outdated website", "monitor"]],
         "checked": "Checked Sep 26, 2026", "f": ["Phone", "Email", "Owner"],
         "contact": ["(303) 555-0129", "info@oakridgehomeservices.com", "Chris Oakley"], "before": "Before", "after": "After",
         "excl": "Each lead goes to one web agency", "monday": "Every Monday"}},
 "fr": {"script": [
   ("type", "Cherchons une entreprise immatriculée la semaine dernière, et voyons ce qu'on trouve en ligne.", .3),
   ("nothing", "Nous tapons son nom. Rien. Aucun site.", .6),
   ("old", "Une autre entreprise a un site, mais il semble dater de deux mille huit.", .35),
   ("mobile", "Et sur un téléphone, il ne s'affiche tout simplement pas.", .6),
   ("fix", "Pour une agence web, la conversation est facile à ouvrir : l'entreprise voit le problème elle-même.", .6),
   ("check", "Nous vérifions pour vous le site des nouvelles entreprises, et signalons celles qui n'en ont pas, ou dont le site ne marche pas sur mobile.", .45),
   ("weekly", "Chaque lundi, avec téléphone, e-mail et nom du dirigeant. Chaque piste ne va qu'à une seule agence.", .6)],
  "ui": {"url1": "chenaie-services-habitat.fr", "nosite": "Aucun site trouvé", "nosub": "Le domaine ne mène à aucun site.",
         "url2": "outillage-brunel.fr", "retro": {"title": "OUTILLAGE BRUNEL", "welcome": "Bienvenue sur notre site !", "nav": ["Accueil", "Produits", "Qui sommes-nous", "Contact"],
         "body": "Entreprise familiale. Appelez-nous pour les tarifs.", "best": "Affichage optimal en 800×600", "visitors": "Visiteurs"},
         "modern": {"name": "Outillage Brunel", "h": "L'outillage des pros, fait pour durer", "cta": "Demander un devis", "nav": ["Produits", "Pros", "Contact"]},
         "checkhd": "Vérification du site", "checks": [["Chênaie Services Habitat SAS", "Aucun site trouvé", "noweb"], ["Outillage Brunel SARL", "Non adapté au mobile", "mobile"],
                                                      ["Plomberie Kestrel SAS", "Aucun site trouvé", "noweb"], ["Soins Animaux Tilleul", "Site vieillissant", "monitor"]],
         "checked": "Vérifié le 26 sept. 2026", "f": ["Téléphone", "E-mail", "Dirigeant"],
         "contact": ["04 65 71 84 09", "contact@chenaie-services-habitat.fr", "Christophe Chenu"], "before": "Avant", "after": "Après",
         "excl": "Chaque piste va à une seule agence", "monday": "Chaque lundi"}},
 "de": {"script": [
   ("type", "Suchen wir eine Firma, die letzte Woche eingetragen wurde, und schauen, was online zu finden ist.", .3),
   ("nothing", "Wir tippen ihren Namen ein. Nichts. Keine Website.", .6),
   ("old", "Eine andere Firma hat eine Seite, aber sie sieht aus wie aus dem Jahr zweitausendacht.", .35),
   ("mobile", "Und auf dem Handy funktioniert sie einfach nicht.", .6),
   ("fix", "Für eine Webagentur ist das ein leichter Gesprächseinstieg: Die Firma sieht das Problem selbst.", .6),
   ("check", "Wir prüfen für Sie die Websites neuer Firmen und markieren, wer keine hat, oder eine, die auf dem Handy nicht funktioniert.", .45),
   ("weekly", "Jeden Montag, mit Telefon, E-Mail und Geschäftsführung. Jeder Lead geht nur an eine Webagentur.", .6)],
  "ui": {"url1": "eichgrund-haustechnik.de", "nosite": "Keine Website gefunden", "nosub": "Die Domain führt zu keiner Seite.",
         "url2": "werkzeug-brunnert.de", "retro": {"title": "WERKZEUG BRUNNERT", "welcome": "Willkommen auf unserer Homepage!", "nav": ["Start", "Produkte", "Über uns", "Kontakt"],
         "body": "Familienbetrieb. Preise bitte telefonisch erfragen.", "best": "Optimiert für 800×600", "visitors": "Besucher"},
         "modern": {"name": "Werkzeug Brunnert", "h": "Werkzeug fürs Handwerk, gemacht für Jahre", "cta": "Angebot anfragen", "nav": ["Produkte", "Handwerk", "Kontakt"]},
         "checkhd": "Website-Prüfung", "checks": [["Eichgrund Haustechnik GmbH", "Keine Website gefunden", "noweb"], ["Werkzeug Brunnert GmbH", "Nicht mobilfähig", "mobile"],
                                                 ["Falke Sanitär GmbH", "Keine Website gefunden", "noweb"], ["Tierpflege Linde GmbH", "Veraltete Website", "monitor"]],
         "checked": "Geprüft am 26.09.2026", "f": ["Telefon", "E-Mail", "Geschäftsführung"],
         "contact": ["030 23125 704", "info@eichgrund-haustechnik.de", "Christian Eichler"], "before": "Vorher", "after": "Nachher",
         "excl": "Jeder Lead geht an eine Webagentur", "monday": "Jeden Montag"}},
}

FILMS = {"accountants": ("accountants.html", ACC), "recruitment": ("recruitment.html", REC),
         "insurance-brokers": ("insurance.html", INS), "financial-advisers": ("advisers.html", ADV), "web-agencies": ("web.html", WEB)}
FR_SLUG = {"accountants": "experts-comptables", "recruitment": "recrutement", "insurance-brokers": "courtiers-assurance",
           "financial-advisers": "conseillers-patrimoine", "web-agencies": "agences-web"}


def key_for(mk, ind):
    return {"uk": f"uk/{ind}", "us": f"us/{ind}", "fr": f"fr/{FR_SLUG[ind]}", "de": f"de:ind/{ind}"}[mk]


def main():
    OUT.mkdir(exist_ok=True)
    names = []
    for ind, (film, D) in FILMS.items():
        for mk, d in D.items():
            m = M[mk]
            script = []
            for row in d["script"] + [("end", m["end"][0], .3, m["end"][1])]:
                i, text, pause = row[:3]
                say = row[3] if len(row) > 3 else text
                for k in sorted(SAY[m["tts"]], key=len, reverse=True):
                    say = say.replace(k, SAY[m["tts"]][k])
                e = {"id": i, "text": text, "pause": pause}
                if say != text:
                    e["say"] = say
                script.append(e)
            name = f"{mk}-{ind}"
            seg = {"key": key_for(mk, ind), "file": f"v5-{mk}-{ind}", "lang": m["lang"], "tts": m["tts"], "voice": m["voice"],
                   "speed": m["speed"], **({"length_scale": 0.92} if mk == "de" else {}), "film": film, "industry": ind,
                   "ui": {"locale": m["locale"], "ill": m["ill"], "endfree": m["endfree"], "week": m["week"], "monday": m["monday"], **d["ui"]}, "script": script}
            f, txt = OUT / f"{name}.json", json.dumps(seg, ensure_ascii=False, indent=1) + "\n"
            if not f.exists() or f.read_text() != txt:
                f.write_text(txt)
            names.append(name)
    print(len(names), "Segmente:", " ".join(names))


if __name__ == "__main__":
    main()
