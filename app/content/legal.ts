/**
 * Rechtstexte. PLATZHALTER – der Inhaber liefert Impressum, Datenschutz und AGB nach.
 * Solange `placeholder: true` gilt, bleiben alle Landingpages offline (siehe lib/legal.ts und settings.legal_ready).
 * Beim Einsetzen der echten Texte: `placeholder: false` setzen und body ersetzen.
 */
export type LegalDoc = { title: string; placeholder: boolean; body: string };

export const LEGAL: Record<"impressum" | "datenschutz" | "agb", LegalDoc> = {
  impressum: {
    title: "Impressum",
    placeholder: true,
    body: "PLATZHALTER – NOCH NICHT VERÖFFENTLICHEN.\n\nHier kommt das Impressum des Inhabers hin (Name, Anschrift, Kontakt, ggf. Registereintrag und USt-IdNr.).",
  },
  datenschutz: {
    title: "Datenschutzerklärung",
    placeholder: true,
    body:
      "PLATZHALTER – NOCH NICHT VERÖFFENTLICHEN.\n\nHier kommt die Datenschutzerklärung hin. Technische Fakten für den Text:\n" +
      "- Landingpages setzen keine Cookies und speichern keine IP-Adressen; gezählt werden nur anonyme Ereignisse (Aufruf, Klick).\n" +
      "- Hosting: Vercel. Datenbank: Supabase. E-Mail-Versand an Interessenten mit Einwilligung: Resend. Zahlungen: Stripe.\n" +
      "- Probe-Formular: Firma, geschäftliche E-Mail, Region, Einwilligung mit Zeitstempel und Wortlaut.",
  },
  agb: {
    title: "Allgemeine Geschäftsbedingungen",
    placeholder: true,
    body: "PLATZHALTER – NOCH NICHT VERÖFFENTLICHEN.\n\nHier kommen die AGB für das Lead-Abo hin (Leistung, Laufzeit, Kündigung, Zahlung, Haftung).",
  },
};
