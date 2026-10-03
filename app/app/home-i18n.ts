/**
 * Texte der Startseite je Sprache (EN = "/", FR = "/fr", DE = "/de"). Neues Design wie die Landingpages
 * (Inhaber 03.10.2026: „wenig text, hochwertige grafiken und animationen, video ist das wichtigste element“).
 * Überschriften ohne Punkt, keine Gedankenstriche. Datenquellen nur allgemein (Inhaber 03.10.2026).
 */
export type HomeLang = "en" | "fr" | "de";
export const HOME_LANGS: HomeLang[] = ["en", "fr", "de"];
export const HOME_PATH: Record<HomeLang, string> = { en: "/", fr: "/fr", de: "/de" };

type Row = [string, string, string];

export type HomeText = {
  title: string; desc: string; nav: [string, string][]; cta: string; contact: string;
  pill: string; h1: string; h1gold: string[]; sub: string; every: string; chips: [string, string][]; btn: string; film: string; fine: string[]; vtag: (s: number) => string;
  kpi: [string, string, string, string]; kpiNote: string;
  revenue: [string, string]; reasons: Row[]; radar: [string, string][]; howTitle: string; steps: Row[];
  indH: string; indGo: string; industries: Record<string, string>; soon: string; countryPick: string;
  pcKick: string; pcH: [string, string]; pcLede: string; pcList: Row[]; pcWho: [string, string]; pcFit: string;
  pcRows: [string, string, string]; pcChat: [string, string]; pcNote: string; pcBtn: string;
  sampleTitle: [string, string]; sampleSub: string; ticks: [string, string][]; talk: [string, string];
  faqH: string; faq: { q: string; a: string }[];
};

export const HOME: Record<HomeLang, HomeText> = {
  en: {
    title: "B2B leads with a reason to call",
    desc: "Every Monday: companies with a real reason to buy, with phone, email and an opening line. For web agencies, recruiters, accountants, insurance brokers and other B2B service firms.",
    nav: [["#film", "Film"], ["#industries", "Industries"], ["#contact-person", "Personal contact"]], cta: "Free sample", contact: "Contact",
    pill: "Trigger leads for B2B service firms",
    h1: "Reach companies at the moment they need you", h1gold: ["need", "you"],
    sub: "Every week we read official registers and company careers pages, find the businesses across the country with a real reason to buy, and send you a short list. Each lead with its date, its source and an opening line.",
    every: "In every lead",
    chips: [["bolt", "Event"], ["cal", "Date"], ["doc", "Source"], ["phone", "Phone & email"], ["bulb", "Sales tip"], ["chat", "Opening line"]],
    btn: "Get 10 free leads", film: "Watch the film", fine: ["Free", "No card", "No obligation"],
    vtag: (s) => `The film · ${s} seconds`,
    kpi: ["Companies in view", "New companies a year", "Dated signals", "Free sample leads"],
    kpiNote: "Official registers in the UK and France; signals counted live from our database.",
    revenue: ["Why these leads turn into ", "revenue"],
    reasons: [
      ["target", "A real reason to buy", "Every company has a concrete event that creates demand for you."],
      ["bolt", "You call first", "New leads every week, found while the need is still open."],
      ["lock", "Only for your firm", "Each lead goes to one firm in your field only."],
    ],
    radar: [["US", "No website"], ["UK", "Role open 30+ days"], ["FR", "Newly registered"]],
    howTitle: "How it works",
    steps: [["focus", "Choose the signals you need", ""], ["cal", "New leads every Monday", ""], ["phone", "You call them and win new clients", ""]],
    indH: "Choose your industry", indGo: "See example leads", soon: "Industry pages are being prepared.", countryPick: "Choose your country",
    industries: { "web-agencies": "Web agencies", recruitment: "Recruitment agencies", accountants: "Accountants", "insurance-brokers": "Insurance brokers",
      "financial-advisers": "Financial advisers", "it-services": "IT services" },
    pcKick: "Your personal contact",
    pcH: ["One person who makes your leads ", "fit better every week"],
    pcLede: "You are not a ticket number. Your contact looks after you only, learns which leads work for you and adjusts every delivery.",
    pcList: [
      ["user", "Only for you", "One contact who knows your firm and your goals."],
      ["focus", "Tuned every week", "Your feedback changes the filters: industry, size, signals."],
      ["target", "Leads that earn money", "Over time your list shows exactly the companies you win."],
    ],
    pcWho: ["Your personal contact", "Looks after your account"], pcFit: "Fit to your firm",
    pcRows: ["Week 1", "Month 1", "Month 3"],
    pcChat: ["Fewer sole traders, more firms with staff, please.", "Done. From Monday your list only shows firms with staff."],
    pcNote: "Illustration of how your leads are refined over time.", pcBtn: "Talk to your contact",
    sampleTitle: ["Your 10 free leads", "for your industry"],
    sampleSub: "Choose your industry and country. We send ten current leads in the format of the weekly delivery.",
    ticks: [["Free", "No card, no subscription."], ["No obligation", "A first look at what you would receive."]],
    talk: ["Prefer to talk first?", "Write to your personal contact"],
    faqH: "Questions",
    faq: [
      { q: "What exactly is a lead?", a: "A company with a recent, dated event that gives you a real reason to get in touch. Each lead has phone, email, the event, the date, a sales tip and an opening line." },
      { q: "Where does the data come from?", a: "From public business sources and the companies' own websites, which we check and combine ourselves." },
      { q: "Is the sample really free?", a: "Yes. Free and without obligation. It gives you a first impression of the leads you would receive." },
      { q: "Will I have a personal contact?", a: "Yes. One person looks after you only and keeps adjusting your leads, so they fit your business better and better and help you earn money." },
      { q: "How often are new leads delivered?", a: "Every Monday morning, as a PDF briefing and a spreadsheet." },
    ],
  },
  fr: {
    title: "Des prospects B2B avec une vraie raison d'appeler",
    desc: "Chaque lundi : des entreprises avec une vraie raison d'acheter, avec téléphone, e-mail et une phrase d'accroche. Pour agences web, cabinets de recrutement, experts-comptables, courtiers et autres prestataires B2B.",
    nav: [["#film", "Film"], ["#industries", "Secteurs"], ["#contact-person", "Interlocuteur"]], cta: "Échantillon gratuit", contact: "Contact",
    pill: "Prospects à déclencheur pour les prestataires B2B",
    h1: "Touchez les entreprises au moment où elles ont besoin de vous", h1gold: ["besoin", "de", "vous"],
    sub: "Chaque semaine, nous lisons les registres officiels et les pages carrières des entreprises, repérons celles qui, partout dans le pays, ont une vraie raison d'acheter, et vous envoyons une courte liste. Chaque prospect avec sa date, sa source et une phrase d'accroche.",
    every: "Dans chaque prospect",
    chips: [["bolt", "Événement"], ["cal", "Date"], ["doc", "Source"], ["phone", "Téléphone et e-mail"], ["bulb", "Conseil de vente"], ["chat", "Phrase d'accroche"]],
    btn: "Recevoir 10 prospects gratuits", film: "Voir le film", fine: ["Gratuit", "Sans carte", "Sans engagement"],
    vtag: (s) => `Le film · ${s} secondes`,
    kpi: ["Entreprises suivies", "Créations par an", "Signaux datés", "Prospects offerts"],
    kpiNote: "Registres officiels au Royaume-Uni et en France ; signaux comptés en direct dans notre base.",
    revenue: ["Pourquoi ces prospects génèrent du ", "chiffre d'affaires"],
    reasons: [
      ["target", "Une vraie raison d'acheter", "Chaque entreprise a un événement concret qui crée un besoin."],
      ["bolt", "Vous appelez en premier", "De nouveaux prospects chaque semaine, tant que le besoin est ouvert."],
      ["lock", "Réservé à votre entreprise", "Chaque prospect ne va qu'à une seule entreprise de votre secteur."],
    ],
    radar: [["US", "Sans site web"], ["UK", "Poste ouvert 30+ jours"], ["FR", "Création récente"]],
    howTitle: "Comment ça marche",
    steps: [["focus", "Choisissez vos signaux", ""], ["cal", "Nouveaux prospects chaque lundi", ""], ["phone", "Vous appelez et gagnez des clients", ""]],
    indH: "Choisissez votre secteur", indGo: "Voir des exemples", soon: "Les pages sectorielles sont en préparation.", countryPick: "Choisissez votre pays",
    industries: { "web-agencies": "Agences web", recruitment: "Cabinets de recrutement", accountants: "Experts-comptables", "insurance-brokers": "Courtiers en assurance",
      "financial-advisers": "Conseillers financiers", "it-services": "Services informatiques" },
    pcKick: "Votre interlocuteur personnel",
    pcH: ["Une personne qui rend vos prospects ", "plus justes chaque semaine"],
    pcLede: "Vous n'êtes pas un numéro de dossier. Votre interlocuteur s'occupe uniquement de vous, apprend quels prospects marchent pour vous et ajuste chaque livraison.",
    pcList: [
      ["user", "Rien que pour vous", "Un seul interlocuteur qui connaît votre entreprise et vos objectifs."],
      ["focus", "Ajusté chaque semaine", "Vos retours changent les filtres : secteur, taille, signaux."],
      ["target", "Des prospects qui rapportent", "Avec le temps, votre liste montre exactement les entreprises que vous gagnez."],
    ],
    pcWho: ["Votre interlocuteur personnel", "S'occupe de votre compte"], pcFit: "Adéquation à votre entreprise",
    pcRows: ["Semaine 1", "Mois 1", "Mois 3"],
    pcChat: ["Moins d'auto-entrepreneurs, plus d'entreprises avec salariés, svp.", "C'est fait. Dès lundi, votre liste ne montre que des entreprises avec salariés."],
    pcNote: "Illustration de l'affinage de vos prospects au fil du temps.", pcBtn: "Écrire à votre interlocuteur",
    sampleTitle: ["Vos 10 prospects gratuits", "pour votre secteur"],
    sampleSub: "Choisissez votre secteur et votre pays. Nous envoyons dix prospects récents au format de la livraison hebdomadaire.",
    ticks: [["Gratuit", "Sans carte, sans abonnement."], ["Sans engagement", "Un premier aperçu de ce que vous recevriez."]],
    talk: ["Vous préférez d'abord échanger ?", "Écrire à votre interlocuteur"],
    faqH: "Questions",
    faq: [
      { q: "Qu'est-ce qu'un prospect exactement ?", a: "Une entreprise avec un événement récent et daté qui vous donne une vraie raison de la contacter. Chaque prospect indique téléphone, e-mail, l'événement, la date, un conseil de vente et une phrase d'accroche." },
      { q: "D'où viennent les données ?", a: "De sources publiques sur les entreprises et des sites des entreprises elles-mêmes, que nous vérifions et recoupons nous-mêmes." },
      { q: "L'échantillon est-il vraiment gratuit ?", a: "Oui. Gratuit et sans engagement. Il vous donne une première idée des prospects que vous recevriez." },
      { q: "Aurai-je un interlocuteur personnel ?", a: "Oui. Une seule personne s'occupe uniquement de vous et ajuste vos prospects au fil du temps, pour qu'ils correspondent toujours mieux à votre entreprise et vous rapportent de l'argent." },
      { q: "À quelle fréquence recevez-vous de nouveaux prospects ?", a: "Chaque lundi matin, sous forme de rapport PDF et de tableur." },
    ],
  },
  de: {
    title: "B2B-Leads mit echtem Anlass",
    desc: "Jeden Montag: Unternehmen mit einem echten Kaufanlass, mit Telefon, E-Mail und Einstiegssatz. Für Webagenturen, Personalvermittler, Steuerberater, Versicherungsmakler und andere B2B-Dienstleister.",
    nav: [["#film", "Film"], ["#industries", "Branchen"], ["#contact-person", "Ansprechpartner"]], cta: "Kostenlose Probe", contact: "Kontakt",
    pill: "Leads mit Anlass für B2B-Dienstleister",
    h1: "Erreichen Sie Unternehmen genau dann, wenn sie Sie brauchen", h1gold: ["brauchen"],
    sub: "Jede Woche lesen wir amtliche Register und Karriereseiten von Unternehmen, finden landesweit die Firmen mit echtem Kaufanlass und schicken Ihnen eine kurze Liste. Jeder Lead mit Datum, Quelle und Einstiegssatz.",
    every: "In jedem Lead",
    chips: [["bolt", "Ereignis"], ["cal", "Datum"], ["doc", "Quelle"], ["phone", "Telefon & E-Mail"], ["bulb", "Vertriebstipp"], ["chat", "Einstiegssatz"]],
    btn: "10 kostenlose Leads", film: "Film ansehen", fine: ["Kostenlos", "Ohne Karte", "Unverbindlich"],
    vtag: (s) => `Der Film · ${s} Sekunden`,
    kpi: ["Unternehmen im Blick", "Neugründungen pro Jahr", "Datierte Signale", "Kostenlose Probe-Leads"],
    kpiNote: "Amtliche Register in Großbritannien und Frankreich; Signale live aus unserer Datenbank gezählt.",
    revenue: ["Warum aus diesen Leads ", "Umsatz wird"],
    reasons: [
      ["target", "Ein echter Kaufanlass", "Jedes Unternehmen hat ein konkretes Ereignis, das Bedarf schafft."],
      ["bolt", "Sie rufen zuerst an", "Jede Woche neue Leads, gefunden solange der Bedarf offen ist."],
      ["lock", "Nur für Ihr Unternehmen", "Jeder Lead geht nur an ein Unternehmen Ihrer Branche."],
    ],
    radar: [["US", "Ohne Website"], ["UK", "Stelle 30+ Tage offen"], ["FR", "Neu gegründet"]],
    howTitle: "So funktioniert es",
    steps: [["focus", "Signale auswählen, die Sie brauchen", ""], ["cal", "Jeden Montag neue Leads", ""], ["phone", "Anrufen und Kunden gewinnen", ""]],
    indH: "Wählen Sie Ihre Branche", indGo: "Beispiel-Leads ansehen", soon: "Die Branchenseiten sind in Vorbereitung.", countryPick: "Land wählen",
    industries: { "web-agencies": "Webagenturen", recruitment: "Personalvermittlung", accountants: "Steuerberater und Buchhaltung", "insurance-brokers": "Versicherungsmakler",
      "financial-advisers": "Finanzberater", "it-services": "IT-Dienstleister" },
    pcKick: "Ihr persönlicher Ansprechpartner",
    pcH: ["Eine Person, die Ihre Leads ", "jede Woche passender macht"],
    pcLede: "Sie sind keine Ticketnummer. Ihr Ansprechpartner kümmert sich nur um Sie, lernt, welche Leads für Sie funktionieren, und passt jede Lieferung an.",
    pcList: [
      ["user", "Nur für Sie da", "Ein Ansprechpartner, der Ihr Unternehmen und Ihre Ziele kennt."],
      ["focus", "Jede Woche nachgeschärft", "Ihr Feedback ändert die Filter: Branche, Größe, Signale."],
      ["target", "Leads, die Geld bringen", "Mit der Zeit zeigt Ihre Liste genau die Firmen, die Sie gewinnen."],
    ],
    pcWho: ["Ihr persönlicher Ansprechpartner", "Betreut Ihr Konto"], pcFit: "Passung zu Ihrem Unternehmen",
    pcRows: ["Woche 1", "Monat 1", "Monat 3"],
    pcChat: ["Bitte weniger Einzelunternehmer, mehr Firmen mit Personal.", "Erledigt. Ab Montag zeigt Ihre Liste nur Firmen mit Personal."],
    pcNote: "Illustration, wie Ihre Leads mit der Zeit verfeinert werden.", pcBtn: "Ansprechpartner kontaktieren",
    sampleTitle: ["Ihre 10 kostenlosen Leads", "für Ihre Branche"],
    sampleSub: "Wählen Sie Branche und Land. Wir schicken zehn aktuelle Leads im Format der wöchentlichen Lieferung.",
    ticks: [["Kostenlos", "Ohne Karte, ohne Abo."], ["Unverbindlich", "Eine erste Einschätzung, was Sie erhalten würden."]],
    talk: ["Lieber erst sprechen?", "Schreiben Sie Ihrem Ansprechpartner"],
    faqH: "Fragen",
    faq: [
      { q: "Was genau ist ein Lead?", a: "Ein Unternehmen mit einem aktuellen, datierten Ereignis, das Ihnen einen echten Anlass zur Kontaktaufnahme gibt. Jeder Lead nennt Telefon, E-Mail, Ereignis, Datum, einen Vertriebstipp und einen Einstiegssatz." },
      { q: "Woher stammen die Daten?", a: "Aus öffentlichen Unternehmensquellen und von den Websites der Unternehmen selbst, die wir selbst prüfen und zusammenführen." },
      { q: "Ist die Probe wirklich kostenlos?", a: "Ja. Kostenlos und unverbindlich. Sie gibt Ihnen eine erste Einschätzung der Leads, die Sie erhalten würden." },
      { q: "Gibt es einen persönlichen Ansprechpartner?", a: "Ja. Eine Person kümmert sich nur um Sie und passt Ihre Leads mit der Zeit immer weiter an, damit sie genau zu Ihrem Unternehmen passen und Sie damit Geld verdienen." },
      { q: "Wie oft kommen neue Leads?", a: "Jeden Montagmorgen als PDF-Briefing und Tabelle." },
    ],
  },
};
