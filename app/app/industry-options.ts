import { wishesFor } from "@/content/sample-wishes";
import { publicPages, type PublicPage } from "@/lib/site-pages";
import { segKey, type CountryCode } from "@/lib/country";
import { HOME, type HomeLang } from "./home-i18n";
import type { IndustryOption } from "./sample-form";

/** Gleiche Reihenfolge der Branchen in jedem Land (Vorlage Inhaber 03.10.2026). */
export const INDUSTRY_ORDER = ["accountants", "financial-advisers", "insurance-brokers", "recruitment", "web-agencies", "it-services"];

/**
 * Branchen-Auswahl des Probe-Formulars der Startseite (Inhaber 03.10.2026), auch im Kontaktformular:
 * eine Option je Branche mit öffentlicher Landingpage, Beschriftung aus HOME[lang].industries.
 */
export function industryOptions(lang: HomeLang, pages: PublicPage[]): IndustryOption[] {
  const t = HOME[lang];
  const bySeg = new Map<string, Partial<Record<CountryCode, string>>>();
  for (const p of pages) {
    const k = segKey(p.slug);
    bySeg.set(k, { ...(bySeg.get(k) ?? {}), [p.country as CountryCode]: p.slug });
  }
  const segs = [...bySeg.keys()].sort((a, b) => INDUSTRY_ORDER.indexOf(a) - INDUSTRY_ORDER.indexOf(b));
  return segs.map((k) => ({
    value: k, label: t.industries[k]?.[0] ?? k,
    pages: Object.fromEntries(Object.entries(bySeg.get(k) ?? {}).map(([cc, slug]) => [cc, String(slug)])),
    wishes: wishesFor(k).map((w) => ({ key: w.key, label: w[lang] })),
  }));
}

/** Kontaktformular: dieselben Branchen wie die Startseite; ohne Datenbank die festen Branchen der Startseite. */
export async function contactIndustries(lang: HomeLang): Promise<IndustryOption[]> {
  const pages = await publicPages().catch(() => [] as PublicPage[]);
  const opts = industryOptions(lang, pages);
  if (opts.length) return opts;
  return INDUSTRY_ORDER.filter((k) => HOME[lang].industries[k]).map((k) => ({
    value: k, label: HOME[lang].industries[k][0], pages: {},
    wishes: wishesFor(k).map((w) => ({ key: w.key, label: w[lang] })),
  }));
}

/** Gültige Branchen-Schlüssel für die Kontakt-API (alle Branchen der Startseite). */
export const CONTACT_INDUSTRY_KEYS: string[] = [...new Set([...INDUSTRY_ORDER, ...Object.keys(HOME.en.industries)])];
