/**
 * Übersetzungen der Rechtstexte (Grundlage: app/content/legal.ts, vom Inhaber bestätigt 26.09.2026).
 * Wortgetreu, inhaltlich unverändert. Maßgeblich ist immer die deutsche Fassung (Hinweis oben auf jeder Seite).
 * Neue Inhalte immer zuerst in legal.ts (deutsch) ändern und dann hier nachziehen.
 */
import type { LegalDoc } from "./legal";

export type LegalLang = "en" | "fr";
export type LegalKey = "impressum" | "datenschutz" | "agb";

const ADDRESS = "Poststraße 14-16, 20354 Hamburg, Germany";
const ADRESSE = "Poststraße 14-16, 20354 Hambourg, Allemagne";
const CONTACT_EN = "Phone: +49 151 59115014\nEmail: info@nextgen-profit.de";
const CONTACT_FR = "Téléphone : +49 151 59115014\nE-mail : info@nextgen-profit.de";

export const TRANSLATION_NOTE: Record<LegalLang, string> = {
  en: "This is a translation for your convenience. The German version is legally binding.",
  fr: "Ceci est une traduction fournie pour information. Seule la version allemande fait foi.",
};

export const LEGAL_I18N: Record<LegalLang, Record<LegalKey, LegalDoc>> = {
  en: {
    impressum: {
      title: "Legal notice",
      placeholder: false,
      body: `Information pursuant to § 5 DDG (German Digital Services Act)

Justin Koch
NextGen Profit (sole proprietorship)
${ADDRESS}

${CONTACT_EN}

Responsible for content
Justin Koch, ${ADDRESS}

Consumer dispute resolution
We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board.`,
    },
    datenschutz: {
      title: "Privacy policy",
      placeholder: false,
      body: `1. Data protection at a glance
The following information provides an overview of what happens to your personal data when you visit this website or use our services. Personal data is any data by which you can be personally identified.

2. Controller
Justin Koch, NextGen Profit (sole proprietorship)
${ADDRESS}
${CONTACT_EN}

3. Hosting and service providers
This website is hosted by Vercel Inc. (USA); data is stored in a database at Supabase Inc. We send emails to prospective and existing customers (with consent or in the context of a contract) via Resend (USA), and initial business contacts via our own mailbox at STRATO AG (Germany). Payments are processed by Stripe Payments Europe Ltd. (Ireland). Data processing agreements are in place or are being concluded with these providers; transfers to the USA are based on the EU-US Data Privacy Framework or standard contractual clauses.
Legal basis: Art. 6(1)(b) GDPR (contract / pre-contractual steps) and Art. 6(1)(f) GDPR (secure, efficient provision).

4. Server log files
When you access the website, our host processes technically necessary data (including IP address, time, browser, operating system, referrer) in server logs in order to deliver and secure the site (Art. 6(1)(f) GDPR). We do not combine this data with other sources.

5. Audience measurement without cookies
Our landing pages do not set cookies and do not store IP addresses. We only count anonymously how often a page variant was viewed or a button was clicked (page variant, event type, time). No link to any individual is made.

6. Requesting a free sample
If you request a sample via the form, we process the company name, business email address, requested region and the wording and time of your consent in order to send you the sample and one follow-up message about it (Art. 6(1)(a) and (b) GDPR). You can withdraw your consent at any time, for example by replying "unsubscribe"; your address will then be permanently blocked.

7. Customers and payments
For subscriptions we process the company name, billing and contact details and your delivery preferences (regions, signals). Stripe does not pass payment data on to us. Legal basis: Art. 6(1)(b) and (c) GDPR (contract, retention for tax purposes).

8. Content of our leads
Our leads contain company data from publicly available sources (official registers and notices, company websites and their legal notices, open data sets): company name, legal form, address, website, phone number, email address, the event with its date and source. Where these sources publish them, the leads also contain the name and role of owners, directors or other authorised representatives and the contact details stated there (including mobile numbers and email addresses with free email providers, for example for sole traders). We do not collect data of other employees. The purpose is passing the data on to our customers, who offer suitable services to these companies; the legal basis is our and our customers' legitimate interest in business contact (Art. 6(1)(f) GDPR). Recipients are our customers (B2B service providers in the respective country). We keep the data as long as it is current for deliveries to our customers. Data subjects have the rights under Art. 15 to 21 GDPR, in particular the right to object: a short message to the contact address above is enough, and we will permanently block the entry and no longer pass it on.

9. Initial business contact
We contact companies in selected countries by email at general business addresses. Every message contains a simple way to opt out; opt-outs are blocked permanently.

10. Storage period and your rights
Data is deleted as soon as the purpose ceases to apply, unless statutory retention periods (e.g. 10 years for tax records) prevent this. You have the right of access, rectification, erasure, restriction, data portability, objection and withdrawal of consent given, as well as the right to lodge a complaint with a data protection supervisory authority (for Hamburg: the Hamburg Commissioner for Data Protection and Freedom of Information).`,
    },
    agb: {
      title: "Terms and conditions",
      placeholder: false,
      body: `1. Scope
These terms and conditions apply to all contracts between Justin Koch, trading as NextGen Profit (sole proprietorship), ${ADDRESS} ("Provider"), and its customers for the supply of company leads ("lead subscription"). The offer is aimed exclusively at businesses within the meaning of § 14 of the German Civil Code (BGB), not at consumers. Deviating terms of the customer apply only if the Provider expressly agrees to them in writing.

2. Conclusion of contract
The presentation on the website is not a binding offer. The contract is concluded when the customer completes the ordering process (Stripe Checkout) and authorises the payment, or by written order confirmation from the Provider.

3. Service
The Provider delivers a weekly list of companies for which an event (e.g. new registration, roles open for a longer period) may offer an occasion for sales, each with source and date, filtered by the regions and signals chosen by the customer. Scope and package result from the order. The leads contain company data from publicly available sources and, where published there, the name, role and contact details of owners or directors. The Provider owes careful research, not a particular economic success; a specific minimum number per week is only owed if expressly agreed. The first delivery takes place after a short manual review.

4. Use of the leads by the customer
The customer may use the leads for its own sales purposes, but may not resell or publish them. The customer is solely responsible for lawful contact (in particular under the German Act Against Unfair Competition (UWG), the GDPR and the rules of the respective target country).

5. Prices and payment
The price shown at the time of order in the currency shown applies. Prices are exclusive of statutory VAT where applicable; for customers abroad the reverse charge procedure may apply. Payment is made monthly in advance via Stripe. In the event of late payment, the Provider may suspend deliveries until the amount is settled.

6. Term and termination
The subscription runs monthly and is extended by one month at a time unless it is cancelled before the end of the current month. Cancellation is possible at any time by email to info@nextgen-profit.de and takes effect at the end of the paid period.

7. Liability
The Provider is liable without limitation for intent, gross negligence and injury to life, body or health. In the case of slight negligence, the Provider is only liable for breach of essential contractual obligations, limited to the foreseeable damage typical for the contract and at most to the fees of the last three months.

8. Final provisions
The law of the Federal Republic of Germany applies, excluding the UN Convention on Contracts for the International Sale of Goods. The place of jurisdiction, where permissible, is Hamburg. Should individual provisions be invalid, the remainder of the contract remains valid.`,
    },
  },
  fr: {
    impressum: {
      title: "Mentions légales",
      placeholder: false,
      body: `Informations conformément au § 5 DDG (loi allemande sur les services numériques)

Justin Koch
NextGen Profit (entreprise individuelle)
${ADRESSE}

${CONTACT_FR}

Responsable de la rédaction
Justin Koch, ${ADRESSE}

Règlement des litiges de consommation
Nous ne sommes ni disposés ni tenus de participer à une procédure de règlement des litiges devant un organisme de médiation de la consommation.`,
    },
    datenschutz: {
      title: "Politique de confidentialité",
      placeholder: false,
      body: `1. La protection des données en bref
Les informations suivantes donnent un aperçu de ce qu'il advient de vos données personnelles lorsque vous consultez ce site ou utilisez nos services. Les données personnelles sont toutes les données permettant de vous identifier personnellement.

2. Responsable du traitement
Justin Koch, NextGen Profit (entreprise individuelle)
${ADRESSE}
${CONTACT_FR}

3. Hébergement et prestataires
Ce site est hébergé par Vercel Inc. (États-Unis) ; les données sont stockées dans une base de données chez Supabase Inc. Nous envoyons les e-mails aux prospects et aux clients (avec leur consentement ou dans le cadre d'un contrat) via Resend (États-Unis), et les premières prises de contact professionnelles via notre propre boîte aux lettres chez STRATO AG (Allemagne). Les paiements sont traités par Stripe Payments Europe Ltd. (Irlande). Des contrats de sous-traitance sont conclus ou en cours de conclusion avec ces prestataires ; les transferts vers les États-Unis reposent sur le EU-US Data Privacy Framework ou sur des clauses contractuelles types.
Base juridique : art. 6, par. 1, point b) du RGPD (contrat / mesures précontractuelles) et point f) du RGPD (mise à disposition sûre et efficace).

4. Fichiers journaux du serveur
Lors de la consultation, notre hébergeur traite des données techniquement nécessaires (notamment adresse IP, heure, navigateur, système d'exploitation, référent) dans des journaux serveur afin de fournir et de sécuriser le site (art. 6, par. 1, point f) du RGPD). Nous ne recoupons pas ces données avec d'autres sources.

5. Mesure d'audience sans cookies
Nos pages d'atterrissage ne déposent aucun cookie et n'enregistrent aucune adresse IP. Nous comptons uniquement, de manière anonyme, combien de fois une variante de page a été consultée ou un bouton cliqué (variante de page, type d'événement, horodatage). Aucun lien avec une personne n'est établi.

6. Demande d'un échantillon gratuit
Si vous demandez un échantillon via le formulaire, nous traitons le nom de l'entreprise, l'adresse e-mail professionnelle, la région souhaitée ainsi que le libellé et l'horodatage de votre consentement, afin de vous envoyer l'échantillon et un message de suivi à ce sujet (art. 6, par. 1, points a) et b) du RGPD). Vous pouvez retirer votre consentement à tout moment, par exemple en répondant « unsubscribe » ou « désinscription » ; votre adresse est alors bloquée définitivement.

7. Clients et paiements
Pour les abonnements, nous traitons le nom de l'entreprise, les coordonnées de facturation et de contact ainsi que vos préférences de livraison (régions, signaux). Stripe ne nous transmet pas les données de paiement. Base juridique : art. 6, par. 1, points b) et c) du RGPD (contrat, conservation fiscale).

8. Contenu de nos pistes
Nos pistes contiennent des données d'entreprise issues de sources accessibles au public (registres et annonces officiels, sites d'entreprises et leurs mentions légales, jeux de données ouverts) : nom de l'entreprise, forme juridique, adresse, site web, numéro de téléphone, adresse e-mail, l'événement avec sa date et sa source. Lorsque ces sources les publient, les pistes contiennent aussi le nom et la fonction des dirigeants, gérants ou représentants légaux ainsi que les coordonnées qui y figurent (y compris numéros de mobile et adresses e-mail chez des fournisseurs grand public, par exemple pour les entrepreneurs individuels). Nous ne collectons pas de données d'autres salariés. La finalité est la transmission à nos clients, qui proposent des services adaptés à ces entreprises ; la base juridique est notre intérêt légitime et celui de nos clients à la prise de contact professionnelle (art. 6, par. 1, point f) du RGPD). Les destinataires sont nos clients (prestataires B2B dans le pays concerné). Nous conservons les données tant qu'elles sont actuelles pour les livraisons à nos clients. Les personnes concernées disposent des droits prévus aux articles 15 à 21 du RGPD, en particulier du droit d'opposition : un court message à l'adresse de contact ci-dessus suffit, nous bloquons alors l'entrée définitivement et ne la transmettons plus.

9. Prise de contact professionnelle
Nous contactons des entreprises dans des pays sélectionnés par e-mail à des adresses professionnelles générales. Chaque message contient un moyen simple de se désinscrire ; les désinscriptions sont bloquées définitivement.

10. Durée de conservation et vos droits
Les données sont supprimées dès que la finalité disparaît, sauf obligation légale de conservation (par exemple 10 ans pour les documents fiscaux). Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité, d'opposition et de retrait du consentement donné, ainsi que du droit d'introduire une réclamation auprès d'une autorité de contrôle de la protection des données (pour Hambourg : le commissaire hambourgeois à la protection des données et à la liberté d'information).`,
    },
    agb: {
      title: "Conditions générales de vente",
      placeholder: false,
      body: `1. Champ d'application
Les présentes conditions générales s'appliquent à tous les contrats conclus entre Justin Koch, exerçant sous le nom NextGen Profit (entreprise individuelle), ${ADRESSE} (« le Prestataire »), et ses clients pour la fourniture de pistes d'entreprises (« abonnement de pistes »). L'offre s'adresse exclusivement aux professionnels au sens du § 14 du Code civil allemand (BGB), et non aux consommateurs. Les conditions divergentes du client ne s'appliquent que si le Prestataire les accepte expressément par écrit.

2. Conclusion du contrat
La présentation sur le site ne constitue pas une offre ferme. Le contrat est conclu lorsque le client finalise la commande (Stripe Checkout) et autorise le paiement, ou par confirmation écrite de commande du Prestataire.

3. Prestation
Le Prestataire livre chaque semaine une liste d'entreprises pour lesquelles un événement (par exemple création, postes ouverts depuis longtemps) peut constituer une occasion commerciale, chacune avec sa source et sa date, filtrée selon les régions et signaux choisis par le client. L'étendue et la formule résultent de la commande. Les pistes contiennent des données d'entreprise issues de sources accessibles au public et, lorsqu'ils y sont publiés, le nom, la fonction et les coordonnées des dirigeants. Le Prestataire est tenu à une recherche soigneuse, et non à un résultat économique déterminé ; un nombre minimal par semaine n'est dû que s'il a été expressément convenu. La première livraison intervient après une courte vérification manuelle.

4. Utilisation des pistes par le client
Le client peut utiliser les pistes pour ses propres besoins commerciaux, mais ne peut ni les revendre ni les publier. Le client est seul responsable de la licéité de la prise de contact (notamment au regard de la loi allemande contre la concurrence déloyale (UWG), du RGPD et des règles du pays cible concerné).

5. Prix et paiement
Le prix affiché lors de la commande, dans la devise affichée, s'applique. Les prix s'entendent hors TVA légale lorsqu'elle est applicable ; pour les clients à l'étranger, le mécanisme d'autoliquidation peut s'appliquer. Le paiement s'effectue mensuellement et d'avance via Stripe. En cas de retard de paiement, le Prestataire peut suspendre les livraisons jusqu'au règlement.

6. Durée et résiliation
L'abonnement est mensuel et se prolonge d'un mois à chaque échéance s'il n'est pas résilié avant la fin du mois en cours. La résiliation est possible à tout moment par e-mail à info@nextgen-profit.de et prend effet à la fin de la période payée.

7. Responsabilité
Le Prestataire est responsable sans limitation en cas de faute intentionnelle, de négligence grave ainsi qu'en cas d'atteinte à la vie, à l'intégrité physique ou à la santé. En cas de négligence légère, il n'est responsable qu'en cas de manquement à des obligations contractuelles essentielles, dans la limite du dommage prévisible et typique du contrat, et au maximum à hauteur de la rémunération des trois derniers mois.

8. Dispositions finales
Le droit de la République fédérale d'Allemagne s'applique, à l'exclusion de la Convention des Nations unies sur les contrats de vente internationale de marchandises. Le tribunal compétent est, dans la mesure où cela est permis, celui de Hambourg. Si certaines dispositions devaient être invalides, le reste du contrat demeure valable.`,
    },
  },
};

/** Pfade der Rechtstexte je Sprache (Deutsch bleibt unter den bisherigen Adressen). */
export const LEGAL_PATHS: Record<"de" | LegalLang, Record<LegalKey, string>> = {
  de: { impressum: "/impressum", datenschutz: "/datenschutz", agb: "/agb" },
  en: { impressum: "/legal-notice", datenschutz: "/privacy", agb: "/terms" },
  fr: { impressum: "/mentions-legales", datenschutz: "/confidentialite", agb: "/cgv" },
};

export const LEGAL_LABELS: Record<"de" | LegalLang, [string, string, string]> = {
  de: ["Impressum", "Datenschutz", "AGB"],
  en: ["Legal notice", "Privacy policy", "Terms"],
  fr: ["Mentions légales", "Confidentialité", "CGV"],
};
