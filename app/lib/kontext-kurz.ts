/**
 * Helfer für den kompakten JARVIS-Kontext (lib/jarvis-context.ts): leere Felder weg, Wiederholungen zusammenfassen.
 * Rein, ohne Datenbank – damit die Kürzung testbar ist und nie Zahlen verändert.
 */

/** Entfernt null/undefined, leere Zeichenketten, leere Listen und leere Objekte (rekursiv); Nullen bleiben. */
export function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean).filter((x) => !isEmpty(x));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const c = clean(x);
      if (!isEmpty(c)) out[k] = c;
    }
    return out;
  }
  return v;
}
function isEmpty(x: unknown) {
  return x === null || x === undefined || x === "" || (Array.isArray(x) && !x.length) || (typeof x === "object" && x !== null && !Array.isArray(x) && !Object.keys(x).length);
}

/** Eine Kontextzeile „Name: Wert“; Objekte ohne leere Felder als JSON. */
export const line = (k: string, v: unknown) => `${k}: ${typeof v === "string" ? v : JSON.stringify(clean(v))}`;

/** Website-Hinweise: nur „noch zu wenig Daten/keine Messung“ → ein kurzer Satz statt drei Erklärungen. */
export function hintsKurz(h: string[] | string): string[] | string {
  if (typeof h === "string") return h;
  const real = h.filter((x) => !/noch (zu wenig Daten|keine Messung)/.test(x));
  if (real.length) return real;
  return h.length ? "noch zu wenig Besucher für Hinweise" : "keine";
}

export type ProbeSeite = { seite: string; bereit: number; soll: number; raus_24h: number };

/** Proben: Fokus-Seiten einzeln, übrige nur mit Lücke (bereit < soll) einzeln, Rest als Zahl. */
export function probenKurz(seiten: ProbeSeite[], fokus: string): { fokus: string[]; luecken: string[]; uebrige_voll: number } {
  const txt = (r: ProbeSeite) => `${r.seite} ${r.bereit}/${r.soll}${r.raus_24h ? ` (24 h raus ${r.raus_24h})` : ""}`;
  const f = seiten.filter((r) => r.seite.startsWith(`${fokus}/`));
  const rest = seiten.filter((r) => !r.seite.startsWith(`${fokus}/`));
  const gap = rest.filter((r) => r.bereit < r.soll);
  return { fokus: f.map(txt), luecken: gap.map(txt), uebrige_voll: rest.length - gap.length };
}
