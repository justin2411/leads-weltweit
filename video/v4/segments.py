"""Version 4: landesweite Filme im Radar-Stil, Marke Dunkelblau + Gold.

python segments.py  ->  segments/<name>.json  (Startseite en/fr/de, Branche x Land für UK, US, FR und optional DE)

Regeln: keine Regionen (Leads aus dem ganzen Land), keine erfundenen Zahlen, keine Garantien, keine Superlative.
Beispiel-Firmen sind erfunden und im Bild als Beispiel gekennzeichnet. Telefonnummern aus den für Film/Fiktion
reservierten Bereichen (UK 0113 496 0xxx, US 555-01xx, FR 04 65 71 xx xx, DE 040 66969 xxx).
Belegte Aussagen: Qualitätswert mit Mindestwert 60 (scripts/match.py), Quelle und Datum je Lead, Lieferung montags
als PDF-Briefing und Tabelle, jeder Lead nur an eine Firma je Branche, kostenlose Probe mit 10 Leads.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / "segments"
IDS = ["hook", "tension", "brand", "radar", "signals", "lead", "brief", "quality", "monday", "exclusive", "cta", "end"]
PAUSE = {"hook": 0.55, "tension": 0.8, "brand": 0.55, "radar": 0.3, "signals": 0.45, "lead": 0.3, "brief": 1.2,
         "quality": 0.45, "monday": 0.4, "exclusive": 0.5, "cta": 0.55, "end": 0.3}

# --- Bildtexte je Sprache (kurz) --------------------------------------------------------------------------------
UI = {
 "en": {"newco": "New company", "ill": "Illustrative example", "daily": "Checked daily", "newlead": "New lead",
        "brief": "Sales briefing", "why": "Why now", "needs": "Likely needs", "win": "How to win", "opener": "Opening line",
        "score": "Quality score · minimum 60", "ills": "Illustrative scores", "pdf": "PDF briefing", "sheet": "Spreadsheet",
        "nosoft": "No software needed", "excl": "Exclusive · one firm per industry", "free": "10 free leads · judge for yourself",
        "btn": "Get 10 free leads", "tag": "The right companies, at the right moment.", "prio": "High priority",
        "f": ["Phone", "Email", "Website", "Contact", "Address", "Sector"], "phone_hd": "Free sample"},
 "fr": {"newco": "Nouvelle entreprise", "ill": "Exemple illustratif", "daily": "Vérifié chaque jour", "newlead": "Nouvelle piste",
        "brief": "Briefing commercial", "why": "Pourquoi maintenant", "needs": "Besoins probables", "win": "Comment gagner",
        "opener": "Phrase d'accroche", "score": "Score qualité · minimum 60", "ills": "Scores illustratifs", "pdf": "Briefing PDF",
        "sheet": "Tableur", "nosoft": "Aucun logiciel", "excl": "Exclusif · une entreprise par secteur",
        "free": "10 pistes gratuites · jugez vous-même", "btn": "Recevoir 10 pistes", "tag": "Les bonnes entreprises, au bon moment.",
        "prio": "Priorité haute", "f": ["Téléphone", "E-mail", "Site web", "Contact", "Adresse", "Secteur"], "phone_hd": "Échantillon gratuit"},
 "de": {"newco": "Neues Unternehmen", "ill": "Beispiel zur Veranschaulichung", "daily": "Täglich geprüft", "newlead": "Neuer Lead",
        "brief": "Vertriebs-Briefing", "why": "Warum jetzt", "needs": "Wahrscheinlicher Bedarf", "win": "So gewinnen Sie",
        "opener": "Einstiegssatz", "score": "Qualitätswert · mindestens 60", "ills": "Beispielwerte", "pdf": "PDF-Briefing",
        "sheet": "Tabelle", "nosoft": "Keine Software nötig", "excl": "Exklusiv · eine Firma pro Branche",
        "free": "10 kostenlose Leads · urteilen Sie selbst", "btn": "10 Leads gratis", "tag": "Die richtigen Unternehmen, im richtigen Moment.",
        "prio": "Hohe Priorität", "f": ["Telefon", "E-Mail", "Website", "Ansprechperson", "Adresse", "Branche"], "phone_hd": "Kostenlose Probe"},
}

# --- Land: Stimme, Quellen, Beispielkontakt ------------------------------------------------------------------------
C = {
 "uk": {"lang": "en", "tts": "en-gb", "voice": "bf_emma", "speed": 1.06, "where": "Across the UK", "monday": "Monday · 07:00",
        "src": ["Companies House", "Public notices", "Careers pages"], "today": "Incorporated today", "date": "24 Sep 2026",
        "phone": "0113 496 0418", "tld": ".co.uk", "role": "Director", "person": "S. Hartley", "addr": "Unit 4, Mill Lane, Leeds",
        "radar": "Every day, we look out for you, and find the companies that have just reached that moment, across the whole UK.",
        "lead": "Each lead has phone, email, website, the director's name, and the event with date and source."},
 "us": {"lang": "en", "tts": "en-us", "voice": "af_heart", "speed": 1.08, "where": "Across the US", "monday": "Every Monday",
        "src": ["Secretary of State", "Public notices", "Careers pages"], "today": "Filed today", "date": "Sep 24, 2026",
        "phone": "(614) 555-0147", "tld": ".com", "role": "Owner", "person": "M. Alvarez", "addr": "2150 Harlan Ave, Columbus, OH",
        "radar": "Every day, we look out for you, and find the companies that have just reached that moment, across the US.",
        "lead": "Each lead has phone, email, website, the owner's name where public, and the event with date and source."},
 "fr": {"lang": "fr", "tts": "fr-fr", "voice": "ff_siwis", "speed": 1.16, "where": "Partout en France", "monday": "Lundi · 07:00",
        "src": ["RNE · INPI", "Annonces légales", "Sites carrières"], "today": "Immatriculée aujourd'hui", "date": "24 sept. 2026",
        "phone": "04 65 71 23 18", "tld": ".fr", "role": "Président", "person": "C. Morel", "addr": "12 rue des Tanneurs, Grenoble",
        "radar": "Chaque jour, nous trouvons pour vous les entreprises qui viennent d'arriver à ce moment précis, partout en France.",
        "lead": "Chaque piste : téléphone, e-mail, site web, nom du dirigeant, et l'événement daté, avec sa source."},
 "de": {"lang": "de", "tts": "de", "voice": "piper:de_DE-thorsten-high", "speed": 1.0, "where": "In ganz Deutschland", "monday": "Montag · 07:00",
        "src": ["Handelsregister", "Bekanntmachungen", "Karriereseiten"], "today": "Heute eingetragen", "date": "24.09.2026",
        "phone": "040 66969 482", "tld": ".de", "role": "Geschäftsführer", "person": "J. Brandt", "addr": "Kaistraße 8, Hamburg",
        "radar": "Jeden Tag finden wir für Sie die Firmen, die gerade genau an diesem Punkt stehen, in ganz Deutschland.",
        "lead": "Jeder Lead enthält Telefon, E-Mail, Website, die Geschäftsführung und das Ereignis mit Datum und Quelle."},
}

# Gemeinsame Sätze je Sprache (Spannung, Marke, Briefing, Qualität, Montag, Exklusiv, Probe, Schluss)
S = {
 "en": {"tension": "Call too late, and the decision is already made.", "brand": "NextGen Profit gets you there early.",
        "brief": "Plus a short sales briefing: why now, what they likely need, and how to win them.",
        "quality": "Every lead is scored. Below sixty, we don't deliver it.",
        "monday": "Every Monday, you get a PDF briefing and a spreadsheet. No software needed.",
        "exclusive": "And each lead goes to one firm per industry. Not to your competitors.",
        "cta": "Start with ten free leads, and judge for yourself.", "end": "NextGen Profit. The right companies, at the right moment."},
 "fr": {"tension": "Appelez trop tard, et la décision est déjà prise.", "brand": "NextGen Profit vous y amène en premier.",
        "brief": "Avec un court briefing : pourquoi maintenant, leurs besoins probables, et comment les convaincre.",
        "quality": "Chaque piste a un score. Sous soixante, nous ne la livrons pas.",
        "monday": "Chaque lundi : un briefing PDF et un tableur. Aucun logiciel nécessaire.",
        "exclusive": "Et chaque piste ne va qu'à une seule entreprise par secteur. Pas à vos concurrents.",
        "cta": "Commencez avec dix pistes gratuites, et jugez vous-même.", "end": "NextGen Profit. Les bonnes entreprises, au bon moment."},
 "de": {"tension": "Wer zu spät anruft, kommt nicht mehr zum Zug.", "brand": "NextGen Profit bringt Sie früher hin.",
        "brief": "Dazu ein kurzes Briefing: warum jetzt, was sie wahrscheinlich brauchen, und wie Sie sie gewinnen.",
        "quality": "Jeder Lead bekommt einen Qualitätswert. Unter sechzig liefern wir nicht.",
        "monday": "Jeden Montag: ein PDF-Briefing und eine Tabelle. Keine Software nötig.",
        "exclusive": "Und jeder Lead geht nur an eine Firma pro Branche. Nicht an Ihre Konkurrenz.",
        "cta": "Starten Sie mit zehn kostenlosen Leads, und urteilen Sie selbst.", "end": "NextGen Profit. Die richtigen Unternehmen, im richtigen Moment."},
}

# --- Branchen: Signale (Icon, Titel, Zusatz), Beispiel-Lead, Sätze ------------------------------------------------
# lead: co, dom (Domain-Stamm), event, sector, why, needs, win, opener
IND = {
 "accountants": {
  "uk": {"for": "For accountants", "hook": "Right now, a new company in the UK is choosing its accountant.",
         "signals": "We flag what matters to accountants: new companies, first payroll, finance roles that stay open.",
         "sig": [["bank", "New company", "Just incorporated"], ["coins", "First payroll", "First staff coming"], ["briefcase", "Finance role open", "Help with the books"]],
         "lead": {"co": "Northfield Freight Ltd", "dom": "northfieldfreight", "event": "Incorporated 3 days ago", "sector": "Freight & logistics",
                  "why": "New company, no accountant yet", "needs": "VAT, payroll, first year-end", "win": "Fixed-fee start package",
                  "opener": "Congratulations on the new company. Have you chosen an accountant for your first year-end?"}},
  "us": {"for": "For accountants & CPAs", "hook": "Right now, a new business in the US is choosing its accountant.",
         "signals": "We flag what matters to accountants: new LLCs, first hires on payroll, bookkeeping roles that stay open.",
         "sig": [["bank", "New LLC filed", "Just registered"], ["coins", "First hires", "Payroll starts"], ["briefcase", "Bookkeeper wanted", "Help with the books"]],
         "lead": {"co": "Ridgeway Freight LLC", "dom": "ridgewayfreight", "event": "LLC filed 3 days ago", "sector": "Freight & logistics",
                  "why": "New LLC, no CPA yet", "needs": "Sales tax, payroll, 1099s", "win": "Flat-fee setup package",
                  "opener": "Congratulations on the new LLC. Who's handling your books and your first tax filing?"}},
  "fr": {"for": "Pour les experts-comptables", "hook": "En ce moment, une nouvelle entreprise en France choisit son expert-comptable.",
         "signals": "Nous repérons ce qui compte pour un cabinet : créations, premières embauches, postes en comptabilité qui restent ouverts.",
         "sig": [["bank", "Nouvelle société", "Tout juste immatriculée"], ["coins", "Premières embauches", "Première paie"], ["briefcase", "Poste comptable", "Besoin d'aide"]],
         "lead": {"co": "Transports Vercors SAS", "dom": "transports-vercors", "event": "Immatriculée il y a 3 jours", "sector": "Transport et logistique",
                  "why": "Société neuve, sans expert-comptable", "needs": "TVA, paie, premier bilan", "win": "Forfait de démarrage",
                  "opener": "Félicitations pour la création. Avez-vous déjà choisi votre expert-comptable pour le premier bilan ?"}},
  "de": {"for": "Für Steuerberater", "hook": "Gerade jetzt wählt ein neues Unternehmen in Deutschland seinen Steuerberater.",
         "signals": "Wir markieren, was für Kanzleien zählt: Neugründungen, erste Mitarbeitende, offene Stellen in der Buchhaltung.",
         "sig": [["bank", "Neugründung", "Frisch eingetragen"], ["coins", "Erste Mitarbeitende", "Erste Lohnabrechnung"], ["briefcase", "Stelle Buchhaltung", "Hilfe gesucht"]],
         "lead": {"co": "Nordkai Logistik GmbH", "dom": "nordkai-logistik", "event": "Vor 3 Tagen eingetragen", "sector": "Logistik",
                  "why": "Neu gegründet, noch ohne Kanzlei", "needs": "Umsatzsteuer, Lohn, Abschluss", "win": "Startpaket zum Festpreis",
                  "opener": "Glückwunsch zur Gründung. Haben Sie für den ersten Jahresabschluss schon einen Steuerberater?"}},
 },
 "recruitment": {
  "uk": {"for": "For recruitment agencies", "hook": "Right now, an employer in the UK has had a role open for weeks.",
         "signals": "We flag what matters to recruiters: roles open for thirty days or more, jobs posted again, several hires at once.",
         "sig": [["hourglass", "Open 30+ days", "Hard to fill alone"], ["repeat", "Re-advertised", "Same job, again"], ["users", "3+ roles at once", "Growing team"]],
         "lead": {"co": "Calder Precision Engineering Ltd", "dom": "calderprecision", "event": "5 roles open · longest 38 days", "sector": "Engineering",
                  "why": "Roles open for weeks", "needs": "Maintenance and CNC staff", "win": "Shortlist for the longest role",
                  "opener": "I noticed your maintenance engineer role has been open for a while. Would a shortlist help?"}},
  "us": {"for": "For staffing & recruiting firms", "hook": "Right now, an employer in the US has had a job open for weeks.",
         "signals": "We flag what matters to recruiters: jobs open for thirty days or more, jobs posted again, several hires at once.",
         "sig": [["hourglass", "Open 30+ days", "Hard to fill alone"], ["repeat", "Reposted job", "Same job, again"], ["users", "3+ openings", "Growing team"]],
         "lead": {"co": "Bluestem Precision Machining Inc.", "dom": "bluestemmachining", "event": "5 openings · longest 38 days", "sector": "Manufacturing",
                  "why": "Jobs open for weeks", "needs": "CNC machinists, maintenance techs", "win": "Shortlist for the longest opening",
                  "opener": "I noticed your maintenance tech opening has been posted for a while. Would a shortlist help?"}},
  "fr": {"for": "Pour les cabinets de recrutement", "hook": "En ce moment, un employeur en France a un poste ouvert depuis des semaines.",
         "signals": "Nous repérons ce qui compte pour un recruteur : postes ouverts depuis trente jours, offres republiées, plusieurs postes à la fois.",
         "sig": [["hourglass", "Ouvert 30+ jours", "Difficile à pourvoir"], ["repeat", "Offre republiée", "Même poste, encore"], ["users", "3+ postes", "Équipe qui grandit"]],
         "lead": {"co": "Mécanique Précise du Forez", "dom": "mecanique-forez", "event": "5 postes · le plus ancien : 38 jours", "sector": "Industrie",
                  "why": "Postes ouverts depuis des semaines", "needs": "Techniciens de maintenance", "win": "Short-list sur le poste le plus ancien",
                  "opener": "J'ai vu que votre poste de technicien de maintenance est ouvert depuis un moment. Une short-list vous aiderait-elle ?"}},
  "de": {"for": "Für Personalvermittler", "hook": "Gerade jetzt sucht ein Arbeitgeber in Deutschland seit Wochen Personal.",
         "signals": "Wir markieren, was für Personalvermittler zählt: Stellen seit dreißig Tagen offen, neu ausgeschrieben, mehrere auf einmal.",
         "sig": [["hourglass", "30+ Tage offen", "Schwer zu besetzen"], ["repeat", "Neu ausgeschrieben", "Gleiche Stelle, wieder"], ["users", "3+ Stellen", "Team wächst"]],
         "lead": {"co": "Brandtwerk Präzisionstechnik GmbH", "dom": "brandtwerk", "event": "5 Stellen · älteste 38 Tage", "sector": "Maschinenbau",
                  "why": "Stellen seit Wochen offen", "needs": "Fachkräfte Instandhaltung", "win": "Vorauswahl für die älteste Stelle",
                  "opener": "Ihre Stelle in der Instandhaltung ist seit einigen Wochen offen. Würde Ihnen eine Vorauswahl helfen?"}},
 },
 "insurance-brokers": {
  "uk": {"for": "For insurance brokers", "hook": "Right now, a new business in the UK needs cover before it opens its doors.",
         "signals": "We flag what matters to brokers: new companies, first employees, new premises.",
         "sig": [["bank", "New company", "Cover from day one"], ["users", "First employees", "Employer's liability"], ["store", "New premises", "Property cover"]],
         "lead": {"co": "Brightline Kitchens Ltd", "dom": "brightlinekitchens", "event": "Incorporated 9 days ago", "sector": "Kitchen fitting",
                  "why": "New premises, first staff", "needs": "Public and employer's liability", "win": "Lead with liability cover",
                  "opener": "Congratulations on the new business. Is your liability and employer's cover already in place?"}},
  "us": {"for": "For commercial insurance agents", "hook": "Right now, a new business in the US needs coverage before it opens its doors.",
         "signals": "We flag what matters to agents: new business filings, first employees, new locations.",
         "sig": [["bank", "New business filed", "Coverage from day one"], ["users", "First employees", "Workers' comp"], ["store", "New location", "Property coverage"]],
         "lead": {"co": "Brightline Cabinets LLC", "dom": "brightlinecabinets", "event": "Filed 9 days ago", "sector": "Cabinet making",
                  "why": "New location, first hires", "needs": "General liability, workers' comp", "win": "Lead with general liability",
                  "opener": "Congratulations on the new business. Are your general liability and workers' comp already in place?"}},
  "fr": {"for": "Pour les courtiers en assurance", "hook": "En ce moment, une nouvelle entreprise en France doit s'assurer avant d'ouvrir.",
         "signals": "Nous repérons ce qui compte pour un courtier : créations, premiers salariés, nouveaux locaux.",
         "sig": [["bank", "Nouvelle société", "Assurée dès le départ"], ["users", "Premiers salariés", "Mutuelle collective"], ["store", "Nouveaux locaux", "Multirisque"]],
         "lead": {"co": "Cuisines Lumière SAS", "dom": "cuisines-lumiere", "event": "Immatriculée il y a 9 jours", "sector": "Agencement de cuisines",
                  "why": "Nouveaux locaux, premiers salariés", "needs": "RC Pro, multirisque, mutuelle", "win": "Commencer par la RC Pro",
                  "opener": "Félicitations pour la création. Votre RC Pro et votre multirisque sont-elles déjà en place ?"}},
  "de": {"for": "Für Versicherungsmakler", "hook": "Gerade jetzt braucht ein neues Unternehmen in Deutschland Versicherungsschutz, bevor es startet.",
         "signals": "Wir markieren, was für Makler zählt: Neugründungen, erste Mitarbeitende, neue Räume.",
         "sig": [["bank", "Neugründung", "Schutz ab Tag eins"], ["users", "Erste Mitarbeitende", "Betriebliche Vorsorge"], ["store", "Neue Räume", "Inhalt und Gebäude"]],
         "lead": {"co": "Lichtblick Küchenbau GmbH", "dom": "lichtblick-kuechen", "event": "Vor 9 Tagen eingetragen", "sector": "Küchenbau",
                  "why": "Neue Räume, erste Mitarbeitende", "needs": "Betriebshaftpflicht, Inhalt", "win": "Mit der Haftpflicht einsteigen",
                  "opener": "Glückwunsch zur Gründung. Ist Ihre Betriebshaftpflicht schon geregelt?"}},
 },
 "financial-advisers": {
  "uk": {"for": "For financial advisers", "hook": "Right now, a new company director in the UK is facing pension and protection questions.",
         "signals": "We flag what matters to advisers: new directors, first employees with a workplace pension due, growing teams.",
         "sig": [["user", "New director", "Company just set up"], ["users", "First employees", "Workplace pension due"], ["trend", "Growing team", "Benefits come up"]],
         "lead": {"co": "Harbour Digital Studio Ltd", "dom": "harbourdigital", "event": "Incorporated 5 days ago", "sector": "Digital agency",
                  "why": "Two new directors, first hires", "needs": "Director's pension, protection", "win": "Start with director's pay",
                  "opener": "Congratulations on the new company. Have you planned your director's pension and protection yet?"}},
  "us": {"for": "For financial advisors", "hook": "Right now, a new business owner in the US is facing retirement and benefits questions.",
         "signals": "We flag what matters to advisors: new business owners, first employees, growing teams that need benefits.",
         "sig": [["user", "New owner", "Business just filed"], ["users", "First employees", "401(k) comes up"], ["trend", "Growing team", "Benefits needed"]],
         "lead": {"co": "Harbor Pixel Studio LLC", "dom": "harborpixel", "event": "Filed 5 days ago", "sector": "Digital agency",
                  "why": "New owners, first hires", "needs": "401(k), key-person cover", "win": "Start with a 401(k) plan",
                  "opener": "Congratulations on the new business. Have you looked at a 401(k) for yourself and your first hires?"}},
  "fr": {"for": "Pour les conseillers en patrimoine", "hook": "En ce moment, un nouveau dirigeant en France se pose des questions de retraite et de prévoyance.",
         "signals": "Nous repérons ce qui compte pour un conseiller : nouveaux dirigeants, premiers salariés, équipes qui grandissent.",
         "sig": [["user", "Nouveau dirigeant", "Société toute neuve"], ["users", "Premiers salariés", "Épargne salariale"], ["trend", "Équipe qui grandit", "Avantages sociaux"]],
         "lead": {"co": "Studio Numérique Calanque SAS", "dom": "studio-calanque", "event": "Immatriculée il y a 5 jours", "sector": "Agence digitale",
                  "why": "Deux dirigeants, premières embauches", "needs": "Retraite, prévoyance du dirigeant", "win": "Commencer par la rémunération",
                  "opener": "Félicitations pour la création. Avez-vous pensé à votre retraite et à votre prévoyance de dirigeant ?"}},
  "de": {"for": "Für Finanzberater", "hook": "Gerade jetzt stellt sich eine neue Geschäftsführung in Deutschland Fragen zu Vorsorge und Absicherung.",
         "signals": "Wir markieren, was für Finanzberater zählt: neue Geschäftsführer, erste Mitarbeitende, wachsende Teams.",
         "sig": [["user", "Neue Geschäftsführung", "Firma frisch gegründet"], ["users", "Erste Mitarbeitende", "bAV wird Thema"], ["trend", "Team wächst", "Benefits gefragt"]],
         "lead": {"co": "Hafenlicht Digital GmbH", "dom": "hafenlicht-digital", "event": "Vor 5 Tagen eingetragen", "sector": "Digitalagentur",
                  "why": "Zwei Geschäftsführer, erste Stellen", "needs": "Altersvorsorge, Absicherung", "win": "Beim GF-Gehalt einsteigen",
                  "opener": "Glückwunsch zur Gründung. Haben Sie Ihre Altersvorsorge als Geschäftsführer schon geplant?"}},
 },
 "web-agencies": {
  "uk": {"for": "For web agencies", "hook": "Right now, a new company in the UK is trading without a website.",
         "signals": "We flag what matters to web agencies: new companies, no website found, sites that aren't mobile-friendly.",
         "sig": [["bank", "New company", "Just incorporated"], ["search", "No website found", "Domains checked"], ["monitor", "Not mobile-friendly", "Outdated site"]],
         "lead": {"co": "Oakridge Home Services Ltd", "dom": "oakridgehomeservices", "event": "Incorporated 4 days ago", "sector": "Home services",
                  "why": "New company, no website found", "needs": "Simple site with booking", "win": "Offer a starter website",
                  "opener": "Congratulations on the new company. Would a simple website with online booking help win your first customers?"},
         "web": "No website found"},
  "us": {"for": "For web design agencies", "hook": "Right now, a new business in the US is open without a website.",
         "signals": "We flag what matters to web agencies: new business filings, no website found, sites that aren't mobile-friendly.",
         "sig": [["bank", "New business filed", "Just registered"], ["search", "No website found", "Domains checked"], ["monitor", "Not mobile-friendly", "Outdated site"]],
         "lead": {"co": "Oakridge Home Services LLC", "dom": "oakridgehomeservices", "event": "Filed 4 days ago", "sector": "Home services",
                  "why": "New business, no website found", "needs": "Simple site with booking", "win": "Offer a starter website",
                  "opener": "Congratulations on the new business. Would a simple website with online booking help win your first customers?"},
         "web": "No website found"},
  "fr": {"for": "Pour les agences web", "hook": "En ce moment, une nouvelle entreprise en France démarre sans site web.",
         "signals": "Nous repérons ce qui compte pour une agence web : créations, aucun site trouvé, sites non adaptés au mobile.",
         "sig": [["bank", "Nouvelle société", "Tout juste immatriculée"], ["search", "Aucun site trouvé", "Domaines vérifiés"], ["monitor", "Site non mobile", "Site vieillissant"]],
         "lead": {"co": "Chênaie Services Habitat SAS", "dom": "chenaie-habitat", "event": "Immatriculée il y a 4 jours", "sector": "Services à l'habitat",
                  "why": "Société neuve, aucun site trouvé", "needs": "Site simple avec réservation", "win": "Proposer un site de démarrage",
                  "opener": "Félicitations pour la création. Un site simple avec prise de rendez-vous vous aiderait-il à trouver vos premiers clients ?"},
         "web": "Aucun site trouvé"},
  "de": {"for": "Für Webagenturen", "hook": "Gerade jetzt startet ein neues Unternehmen in Deutschland ohne Website.",
         "signals": "Wir markieren, was für Webagenturen zählt: Neugründungen, keine Website gefunden, Seiten, die nicht mobilfähig sind.",
         "sig": [["bank", "Neugründung", "Frisch eingetragen"], ["search", "Keine Website", "Domains geprüft"], ["monitor", "Nicht mobilfähig", "Veraltete Seite"]],
         "lead": {"co": "Eichgrund Haustechnik GmbH", "dom": "eichgrund-haustechnik", "event": "Vor 4 Tagen eingetragen", "sector": "Haustechnik",
                  "why": "Neu gegründet, keine Website", "needs": "Einfache Seite mit Terminbuchung", "win": "Start-Website anbieten",
                  "opener": "Glückwunsch zur Gründung. Würde Ihnen eine einfache Website mit Online-Terminbuchung helfen?"},
         "web": "Keine Website gefunden"},
 },
}

# Startseite (alle Branchen)
HOME = {
 "en": {"c": "uk", "where": "Across the UK & US", "src": ["Official registers", "Public notices", "Careers pages"], "for": "Signals for your industry",
        "hook": "Every business needs new clients. The best moment to win one is short.",
        "radar": "Every day, we look out for you, and find the companies that have just reached that moment, across the UK and the US.",
        "signals": "We flag the moments that matter to your industry: new companies, hiring, new locations.",
        "lead": "Each lead has phone, email, website, the decision-maker's name where public, and the event with date and source.",
        "sig": [["bank", "New company", "Just registered"], ["users", "Hiring", "Roles open for weeks"], ["store", "New location", "Growing business"]]},
 "fr": {"c": "fr", "for": "Les signaux de votre secteur",
        "hook": "Chaque entreprise a besoin de nouveaux clients. Et le meilleur moment pour en gagner un est court.",
        "signals": "Nous repérons les moments qui comptent pour votre secteur : créations, recrutements, nouveaux sites.",
        "sig": [["bank", "Nouvelle société", "Tout juste immatriculée"], ["users", "Recrutements", "Postes ouverts"], ["store", "Nouveau site", "Entreprise qui grandit"]]},
 "de": {"c": "de", "for": "Signale für Ihre Branche",
        "hook": "Jedes Unternehmen braucht neue Kunden. Und der beste Moment, einen zu gewinnen, ist kurz.",
        "signals": "Wir markieren die Momente, die für Ihre Branche zählen: Neugründungen, Neueinstellungen, neue Standorte.",
        "sig": [["bank", "Neugründung", "Frisch eingetragen"], ["users", "Neueinstellungen", "Stellen seit Wochen offen"], ["store", "Neuer Standort", "Firma wächst"]]},
}

# Aussprache (nur Tonspur)
SAY = {
 "en-us": {"1099s": "ten ninety-nines", "401(k)": "four oh one K", "LLCs": "L L Cs", "LLC": "L L C"},
 "en-gb": {},
 "fr-fr": {},
 "de": {},
}

# Ausgabe: Schlüssel in videos.json und Dateiname
KEYS = {"uk": ("uk", {"accountants": "accountants", "recruitment": "recruitment", "insurance-brokers": "insurance-brokers",
                      "financial-advisers": "financial-advisers", "web-agencies": "web-agencies"}),
        "us": ("us", {"accountants": "accountants", "recruitment": "recruitment", "insurance-brokers": "insurance-brokers",
                      "financial-advisers": "financial-advisers", "web-agencies": "web-agencies"}),
        "fr": ("fr", {"accountants": "experts-comptables", "recruitment": "recrutement", "insurance-brokers": "courtiers-assurance",
                      "financial-advisers": "conseillers-patrimoine", "web-agencies": "agences-web"})}


def lead_block(c, L, lead, web=None):
    return {**lead, "phone": c["phone"], "email": f"info@{lead['dom']}{c['tld']}", "web": web or f"www.{lead['dom']}{c['tld']}",
            "contact": f"{c['role']} · {c['person']}", "addr": c["addr"], "date": c["date"]}


def build(name, key, file, c, lang, lines, ui_extra):
    tts = c["tts"]
    script = []
    for i in IDS:
        text = lines[i]
        say = text
        for k, v in SAY.get(tts, {}).items():
            say = say.replace(k, v)
        e = {"id": i, "text": text, "pause": PAUSE[i]}
        if say != text:
            e["say"] = say
        script.append(e)
    seg = {"key": key, "file": file, "lang": lang, "tts": tts, "voice": c["voice"], "speed": c["speed"], "film": "film.html",
           "ui": {**UI[lang], "where": c["where"], "monday": c["monday"], "src": c["src"], "today": c["today"], **ui_extra},
           "script": script}
    OUT.mkdir(exist_ok=True)
    f, txt = OUT / f"{name}.json", json.dumps(seg, ensure_ascii=False, indent=1) + "\n"
    if not f.exists() or f.read_text() != txt:  # nur bei Änderung schreiben (build.sh erzeugt dann die Stimme neu)
        f.write_text(txt)
    return name


def main():
    names = []
    for ind, per in IND.items():
        for cc, d in per.items():
            c = C[cc]; lang = c["lang"]
            src = d["lead"].get("src") or ("Careers page" if ind == "recruitment" and lang == "en" else
                                           "Site carrières" if ind == "recruitment" and lang == "fr" else
                                           "Karriereseite" if ind == "recruitment" else c["src"][0])
            lead = {**lead_block(c, None, d["lead"], d.get("web")), "src": src}
            lines = {"hook": d["hook"], "radar": c["radar"], "signals": d["signals"], "lead": c["lead"], **S[lang]}
            if cc == "de":
                key, file, name = f"de:ind/{ind}", f"v4-de-{ind}", f"de-{ind}"
            else:
                pre, slugs = KEYS[cc]
                key, file, name = f"{pre}/{slugs[ind]}", f"v4-{cc}-{ind}", f"{cc}-{ind}"
            names.append(build(name, key, file, c, lang, lines, {"for": d["for"], "sig": d["sig"], "lead": lead}))
    for lang, h in HOME.items():
        c = {**C[h["c"]]}
        if "where" in h: c["where"] = h["where"]
        if "src" in h: c["src"] = h["src"]
        base = IND["accountants"][h["c"]]["lead"]
        lead = {**lead_block(C[h["c"]], None, base), "src": C[h["c"]]["src"][0],
                "why": {"en": "New company, first hires", "fr": "Société neuve, premières embauches", "de": "Neu gegründet, erste Stellen"}[lang],
                "needs": {"en": "Services for a new business", "fr": "Services pour une société neuve", "de": "Dienstleister für den Start"}[lang],
                "win": {"en": "Call first, with a reason", "fr": "Appeler en premier, avec une raison", "de": "Zuerst anrufen, mit Anlass"}[lang],
                "opener": {"en": "Congratulations on the new company. Who is helping you set things up?",
                           "fr": "Félicitations pour la création. Qui vous accompagne pour le démarrage ?",
                           "de": "Glückwunsch zur Gründung. Wer unterstützt Sie beim Start?"}[lang]}
        lines = {"hook": h["hook"], "radar": h.get("radar", c["radar"]), "signals": h["signals"], "lead": h.get("lead", c["lead"]), **S[lang]}
        ui = {"for": h["for"], "sig": h["sig"], "lead": lead}
        names.append(build(f"home-{lang}", f"{lang}:home", f"v4-home-{lang}", c, lang, lines, ui))
    print(len(names), "Segmente:", " ".join(names))


if __name__ == "__main__":
    main()
