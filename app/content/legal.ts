/**
 * Rechtstexte. Grundlage: Texte des Inhabers (alte Website nextgen-profit.de), angepasst an das Lead-Abo
 * (Hosting Vercel/Supabase, Zahlung Stripe, Mails Resend/eigenes Postfach, Landingpages ohne Cookies).
 * Vom Inhaber bestätigt am 26.09.2026 (Anschrift Hamburg, alle Prüfpunkte).
 */
export type LegalDoc = { title: string; placeholder: boolean; body: string };

const ANSCHRIFT = "Poststraße 14-16, 20354 Hamburg";
const KONTAKT = "Telefon: +49 151 59115014\nE-Mail: info@nextgen-profit.de";

export const LEGAL: Record<"impressum" | "datenschutz" | "agb", LegalDoc> = {
  impressum: {
    title: "Impressum",
    placeholder: false,
    body: `Angaben gemäß § 5 DDG

NextGen Profit
Einzelunternehmen
Inhaber: Justin Koch
${ANSCHRIFT}

${KONTAKT}

Redaktionell verantwortlich
Justin Koch, ${ANSCHRIFT}

Verbraucherstreitbeilegung
Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.`,
  },
  datenschutz: {
    title: "Datenschutzerklärung",
    placeholder: false,
    body: `1. Datenschutz auf einen Blick
Die folgenden Hinweise geben einen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen oder unsere Leistungen nutzen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.

2. Verantwortliche Stelle
NextGen Profit, Einzelunternehmen, Inhaber Justin Koch
${ANSCHRIFT}
${KONTAKT}

3. Hosting und Dienstleister
Diese Website wird bei Vercel Inc. (USA) gehostet; Daten werden in einer Datenbank bei Supabase Inc. gespeichert. E-Mails an Interessenten und Kunden (mit Einwilligung oder im Rahmen eines Vertrags) versenden wir über Resend (USA), geschäftliche Erstansprachen über unser eigenes Postfach bei STRATO AG (Deutschland). Zahlungen wickelt Stripe Payments Europe Ltd. (Irland) ab. Mit diesen Anbietern bestehen bzw. werden Verträge zur Auftragsverarbeitung geschlossen; Übermittlungen in die USA stützen sich auf das EU-US Data Privacy Framework bzw. Standardvertragsklauseln.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag/Vertragsanbahnung) und lit. f DSGVO (sichere, effiziente Bereitstellung).

4. Server-Log-Dateien
Beim Aufruf verarbeitet unser Hoster technisch notwendige Daten (u. a. IP-Adresse, Uhrzeit, Browser, Betriebssystem, Referrer) in Server-Logs, um die Seite auszuliefern und abzusichern (Art. 6 Abs. 1 lit. f DSGVO). Wir führen diese Daten nicht mit anderen Quellen zusammen.

5. Reichweitenmessung ohne Cookies
Unsere Landingpages setzen keine Cookies und speichern keine IP-Adressen. Wir zählen lediglich anonym, wie oft eine Seitenvariante aufgerufen oder ein Button geklickt wurde (Seitenvariante, Ereignistyp, Zeitpunkt). Ein Personenbezug wird nicht hergestellt.

6. Anfrage einer kostenlosen Probe
Wenn Sie über das Formular eine Probe anfordern, verarbeiten wir Firmenname, geschäftliche E-Mail-Adresse, gewünschte Region sowie Wortlaut und Zeitpunkt Ihrer Einwilligung, um Ihnen die Probe und eine Nachfrage dazu zu senden (Art. 6 Abs. 1 lit. a und b DSGVO). Sie können die Einwilligung jederzeit widerrufen, z. B. durch Antwort „unsubscribe“ bzw. „Abmelden“; Ihre Adresse wird dann dauerhaft gesperrt.

7. Kunden und Zahlungen
Für Abonnements verarbeiten wir Firmenname, Rechnungs- und Kontaktdaten sowie Ihre Lieferwünsche (Regionen, Signale). Zahlungsdaten gibt Stripe nicht an uns weiter. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und c DSGVO (Vertrag, steuerliche Aufbewahrung).

8. Inhalte unserer Leads
Unsere Leads enthalten ausschließlich Unternehmensdaten aus öffentlichen Quellen (amtliche Register und Bekanntmachungen, Unternehmenswebsites): Firmenname, Anschrift, Website, zentrale Telefonnummer, Ereignis und Quelle. Wir erfassen keine Namen, persönlichen E-Mail-Adressen oder Telefonnummern von Beschäftigten. Soweit bei Einzelunternehmen im Firmennamen ein Personenname enthalten ist, verarbeiten wir diesen auf Grundlage unseres berechtigten Interesses (Art. 6 Abs. 1 lit. f DSGVO). Betroffene können jederzeit widersprechen; wir sperren den Eintrag dann dauerhaft.

9. Geschäftliche Erstansprache
Wir sprechen Unternehmen in ausgewählten Ländern per E-Mail an allgemeine Geschäftsadressen an. Jede Nachricht enthält eine einfache Abmeldemöglichkeit; Abmeldungen werden dauerhaft gesperrt.

10. Speicherdauer und Ihre Rechte
Daten werden gelöscht, sobald der Zweck entfällt, soweit keine gesetzlichen Aufbewahrungsfristen (z. B. 10 Jahre für steuerliche Unterlagen) entgegenstehen. Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch und Widerruf erteilter Einwilligungen sowie ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde (für Hamburg: Der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit).`,
  },
  agb: {
    title: "Allgemeine Geschäftsbedingungen",
    placeholder: false,
    body: `1. Geltungsbereich
Diese AGB gelten für alle Verträge zwischen Justin Koch, handelnd unter „NextGen Profit“, ${ANSCHRIFT} („Anbieter“), und seinen Kunden über den Bezug von Unternehmens-Leads („Lead-Abo“). Das Angebot richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB, nicht an Verbraucher. Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen ausdrücklich schriftlich zustimmt.

2. Vertragsschluss
Die Darstellung auf der Website ist kein bindendes Angebot. Der Vertrag kommt zustande, wenn der Kunde den Bestellvorgang (Stripe Checkout) abschließt und die Zahlung autorisiert, oder durch schriftliche Auftragsbestätigung des Anbieters.

3. Leistung
Der Anbieter liefert wöchentlich eine Liste mit Unternehmen, bei denen ein Ereignis (z. B. Neugründung, länger offene Stellen) einen Verkaufsanlass bieten kann, jeweils mit Quelle und Datum, gefiltert nach den vom Kunden gewählten Regionen und Signalen. Umfang und Paket ergeben sich aus der Bestellung. Die Leads enthalten ausschließlich Unternehmensdaten aus öffentlichen Quellen. Der Anbieter schuldet die sorgfältige Recherche, nicht einen bestimmten wirtschaftlichen Erfolg; eine bestimmte Mindestanzahl je Woche ist nur geschuldet, wenn sie ausdrücklich vereinbart ist. Die erste Lieferung erfolgt nach kurzer manueller Prüfung.

4. Nutzung der Leads durch den Kunden
Der Kunde darf die Leads für eigene Vertriebszwecke nutzen, nicht aber weiterverkaufen oder veröffentlichen. Für die rechtmäßige Kontaktaufnahme (insbesondere UWG, DSGVO und die Regeln des jeweiligen Ziellandes) ist der Kunde selbst verantwortlich.

5. Preise und Zahlung
Es gilt der bei der Bestellung angezeigte Preis in der angezeigten Währung. Preise verstehen sich zuzüglich gesetzlicher Umsatzsteuer, soweit diese anfällt; bei Kunden im Ausland gilt gegebenenfalls das Reverse-Charge-Verfahren. Die Zahlung erfolgt monatlich im Voraus über Stripe. Bei Zahlungsverzug darf der Anbieter Lieferungen bis zum Ausgleich aussetzen.

6. Laufzeit und Kündigung
Das Abo läuft monatlich und verlängert sich jeweils um einen Monat, wenn es nicht vor Ablauf des laufenden Monats gekündigt wird. Die Kündigung ist jederzeit per E-Mail an info@nextgen-profit.de möglich und wirkt zum Ende des bezahlten Zeitraums.

7. Haftung
Der Anbieter haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Bei leichter Fahrlässigkeit haftet er nur bei Verletzung wesentlicher Vertragspflichten, begrenzt auf den vorhersehbaren, vertragstypischen Schaden, höchstens auf die Vergütung der letzten drei Monate.

8. Schlussbestimmungen
Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist, soweit zulässig, Hamburg. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam.`,
  },
};
