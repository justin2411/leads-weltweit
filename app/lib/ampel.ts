/**
 * Feste Farbbedeutung im ganzen JARVIS-Dashboard (Inhaber 04.10.2026): grün = gut, gelb = knapp, rot = schlecht,
 * grau = keine Basis (zu wenig Daten, noch kein Ziel, läuft noch). Eine Quelle für Hex-Werte, Texte und CSS-Variablen –
 * Komponenten nutzen `var(--amp-…)` bzw. die Klassen `t-green|t-gold|t-red|t-grey` statt eigener Farbwerte.
 * Die Tonnamen bleiben die bisherigen (gold = gelb), damit bestehende Klassen weiter passen.
 */
export type Ampel = "green" | "gold" | "red" | "grey";
export const AMPELN: Ampel[] = ["green", "gold", "red", "grey"];

/** Gegen den dunklen HUD-Grund (#02060f) geprüft: alle ≥ 7:1, grau bewusst gedämpft. */
export const AMPEL_HEX: Record<Ampel, string> = { green: "#3ddc97", gold: "#ffb547", red: "#ff5e73", grey: "#8ba6c9" };
export const AMPEL_BG: Record<Ampel, string> = {
  green: "rgba(61,220,151,.16)", gold: "rgba(255,181,71,.16)", red: "rgba(255,94,115,.16)", grey: "rgba(139,166,201,.08)",
};
export const AMPEL_TEXT: Record<Ampel, string> = { green: "gut", gold: "knapp", red: "schlecht", grey: "keine Basis" };

/** CSS-Variablen für :root/.dash (in hud-css.ts eingebunden). */
export const AMPEL_VARS = AMPELN.map((a) => `--amp-${a}:${AMPEL_HEX[a]};--amp-${a}-bg:${AMPEL_BG[a]}`).join(";");

/** Schwellen einer Quote: ab `gut` grün, ab `knapp` gelb, darunter rot; unter `min` Basis grau. */
export type Schwelle = { gut: number; knapp: number; min: number };

export function ampelVon(k: number, n: number, s: Schwelle): Ampel {
  if (!(n >= s.min) || n <= 0) return "grey";
  const q = k / n;
  return q >= s.gut ? "green" : q >= s.knapp ? "gold" : "red";
}
