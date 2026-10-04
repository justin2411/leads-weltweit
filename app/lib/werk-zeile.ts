/**
 * Unterzeile der Werk-Kreise in JARVIS (Inhaber 04.10.2026: „verstehe hier das 0 läuft - 26 nicht … bei den anderen
 * … nur eine zeile drunter“). Genau eine kurze Zeile über die Plätze des Werks; der Autopilot steht als eigenes
 * Abzeichen am Kreis, Details im Tooltip.
 *
 * running = Plätze dieses Werks, die gerade arbeiten (Herzschläge), planned = eingeplante Plätze des Werks
 * (zuletzt wirklich gestartete Belegung bzw. Einstellung des Inhabers).
 */
export function werkLine({ running, planned, paused = false }: { running: number; planned: number; paused?: boolean }): string {
  const r = Math.max(0, Math.round(running || 0)), p = Math.max(0, Math.round(planned || 0));
  if (paused) return "pausiert";
  if (r > 0 && r < p) return `${r}/${p} Plätze aktiv`;
  if (r > 0) return `${r} ${r === 1 ? "Platz" : "Plätze"} aktiv`;
  if (p === 0) return "keine Plätze";
  return `${p} ${p === 1 ? "Platz" : "Plätze"} bereit`;
}

/** Tooltip zum Kreis: was die Zahl oben und die Zeile bedeuten. */
export function werkTip(value: string, { running, planned, paused = false }: { running: number; planned: number; paused?: boolean }): string {
  const r = Math.max(0, Math.round(running || 0)), p = Math.max(0, Math.round(planned || 0));
  const now = paused ? "pausiert" : r > 0 ? `${r} arbeiten gerade` : "keiner arbeitet gerade (wartet auf den nächsten Start)";
  return `${value} · Plätze: ${p} eingeplant, ${now}`;
}

/** Text für das Autopilot-Abzeichen (Tooltip und aria-label). */
export function autoTip(on: boolean): string {
  return on ? "Autopilot an – verteilt die Plätze nach Ertrag · Klick: aus" : "Autopilot aus – deine Belegung gilt · Klick: an";
}
