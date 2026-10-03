import { createHash } from "node:crypto";
import { BRAND_CSS } from "./brand-css";
import { LANDING_CSS } from "./landing-css";
import { HOME_CSS } from "./home-css";
import { HOME_V2_CSS } from "./home-v2-css";
import { LANDING_V2_CSS } from "./landing-v2-css";
import { CONTACT_CSS } from "@/app/contact/contact-css";

/**
 * Seiten-CSS als eigene, lange zwischengespeicherte Datei statt im HTML (Ladezeit, Inhaber 03.10.2026):
 * vorher stand es zweimal in jeder Seite (Style-Tag und React-Daten), rund 400 KB je Aufruf.
 * Inhalt und Reihenfolge genau wie früher BRAND_CSS + extraCss; der Link steht an derselben Stelle im Dokument.
 */
export const CSS_FILES = {
  brand: BRAND_CSS,
  site: BRAND_CSS + LANDING_CSS + HOME_V2_CSS + HOME_CSS,
  contact: CONTACT_CSS,
  landing: LANDING_V2_CSS,
} as const;
type CssFile = keyof typeof CSS_FILES;

/** Je Seitenart die Dateien in Reihenfolge; „site“ teilen sich Startseite, Kontakt und Landingpages (einmal laden). */
export const CSS_BUNDLES = {
  brand: ["brand"],
  home: ["site"],
  contact: ["site", "contact"],
  landing: ["site", "landing"],
} as const satisfies Record<string, readonly CssFile[]>;

export type CssBundle = keyof typeof CSS_BUNDLES;

const hashes = new Map<CssFile, string>();

/** Dateiname mit Inhalts-Prüfsumme (neue Fassung = neue Adresse, daher dauerhaft cachebar). */
export function cssFile(name: CssFile): string {
  let h = hashes.get(name);
  if (!h) {
    h = createHash("sha256").update(CSS_FILES[name]).digest("hex").slice(0, 12);
    hashes.set(name, h);
  }
  return `${name}.${h}.css`;
}

/** Adressen der Dateien einer Seitenart, in der Reihenfolge der Regeln. */
export const cssHrefs = (bundle: CssBundle): string[] => CSS_BUNDLES[bundle].map((f) => `/css/${cssFile(f)}`);

export const cssFileNames = (): string[] => (Object.keys(CSS_FILES) as CssFile[]).map(cssFile);

/** Inhalt zu einem Dateinamen (nur aktuelle Prüfsummen). */
export function cssByFile(file: string): string | null {
  for (const name of Object.keys(CSS_FILES) as CssFile[]) if (cssFile(name) === file) return CSS_FILES[name];
  return null;
}
