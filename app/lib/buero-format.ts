/** Formatierung der Büro-Kacheln (klein, auch im Browser genutzt: Hochzählen, Countdown). */
/** Text für die Zahl (gleiche Formatierung wie die Hochzähl-Animation); ab 100.000 kurz („241 Tsd.“, „2,6 Mio.“). */
export function zahlText(v: number | null, dez = 0, vor = "", nach = ""): string {
  if (v === null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return `${vor}${(v / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio.${nach}`;
  if (a >= 1e5) return `${vor}${Math.round(v / 1000).toLocaleString("de-DE")} Tsd.${nach}`;
  return `${vor}${v.toLocaleString("de-DE", { minimumFractionDigits: dez, maximumFractionDigits: dez })}${nach}`;
}

/** „in 37 min“ / „in 1 h 05“ / „jetzt“ */
export function countdown(bis: string | null | undefined, now: number): string {
  if (!bis) return "–";
  const min = Math.ceil((Date.parse(bis) - now) / 60_000);
  if (!(min > 0)) return "jetzt";
  if (min < 60) return `in ${min} min`;
  return `in ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}
