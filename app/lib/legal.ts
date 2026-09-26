import { LEGAL } from "../content/legal.ts";

/** true, wenn Impressum, Datenschutz und AGB keine Platzhalter mehr sind. */
export function legalTextsReady(): boolean {
  return Object.values(LEGAL).every((d) => !d.placeholder && d.body.trim().length > 200);
}

/** Landingpages dürfen nur öffentlich sein, wenn Texte fertig UND vom Inhaber freigegeben (settings.legal_ready). */
export function canPublish(settingsLegalReady: boolean | null | undefined): boolean {
  return legalTextsReady() && !!settingsLegalReady;
}
