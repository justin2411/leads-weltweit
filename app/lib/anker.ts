/**
 * Sprungziele auf Dashboard-Seiten (Inhaber 04.10.2026: „man soll auch oben draufklicken können und automatisch öffnet
 * sich die richtige sektion und man wird dort hingesprungen“). Reine Funktionen ohne React/DOM; das Öffnen, Scrollen und
 * Aufleuchten macht der Hook useAnker (app/dashboard/use-anker.ts), der für jeden klappbaren Abschnitt genutzt werden kann.
 */

/** Dauer des kurzen Aufleuchtens nach dem Sprung (ms). */
export const FLASH_MS = 1600;

/** Abschnittsname → Anker-ID: klein, Umlaute ausgeschrieben, nur a–z, 0–9 und Bindestrich („Vorschläge“ → „vorschlaege“). */
export function ankerId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Ziel aus einem URL-Hash („#Vorschl%C3%A4ge“ → „vorschlaege“); leerer Hash → null. */
export function hashZiel(hash: string | null | undefined): string | null {
  if (!hash) return null;
  let h = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    h = decodeURIComponent(h);
  } catch {}
  const id = ankerId(h);
  return id || null;
}

/** Ziel aus einem Link („#seiten“, „/dashboard/gehirn#seiten“) – nur, wenn er auf die aktuelle Seite zeigt. */
export function linkZiel(href: string | null | undefined, currentPath: string): string | null {
  if (!href) return null;
  const i = href.indexOf("#");
  if (i < 0) return null;
  const path = href.slice(0, i).split("?")[0];
  if (path && path !== currentPath) return null;
  return hashZiel(href.slice(i));
}

/** Trifft ein Ziel diesen Abschnitt (eigene ID oder ein Alias, z. B. alter Name „entscheidungen“ → „vorschlaege“)? */
export function trifft(ziel: string | null, id: string, aliases: readonly string[] = []): boolean {
  if (!ziel) return false;
  return ziel === ankerId(id) || aliases.some((a) => ankerId(a) === ziel);
}
