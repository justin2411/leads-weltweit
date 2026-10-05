/**
 * JARVIS-Zentrale: reine Regeln für Bewegung und Farben (keine Datenbank, kein React). Grundsatz: „Was sich nicht
 * bewegt, läuft nicht.“ Grau = keine Daten oder nicht gebaut; „~“ = Puls aus einer Ersatzquelle (kein Herzschlag).
 * Bedeutungstabelle in docs/JARVIS.md („Zentrale“), Formeln in docs/DESIGN-KOMMANDOZENTRALE.md.
 */
import type { Werk } from "./firma-karte.ts";

const MIN = 60_000;
export const LIVE_BEAT_MIN = 6;     // Herzschlag jünger als 6 min = lebt (wie lib/werke-live.ts)
export const SENT_MIN = 70;         // Versand: letzte Mail < 70 min
export const ACK_ANTWORTEN_MIN = 15;
export const LIEFERUNG_TAGE = 8;
export const CACHE_MIN = 20;        // Wachhund: Zwischenspeicher < 20 min
export const STICHPROBE_H = 26;
export const STAU_FAKTOR = 50;
export const KANTE_MAX = { rechner: 3, handy: 2 } as const;
export const PARTIKEL_MAX = { rechner: 40, handy: 20 } as const;
export const TITEL_MAX = 60;
export const GRUND_MAX = 160;

// ------------------------------------------------------------------------------------------------- Puls
export type Puls = "live" | "live~" | "still" | "grau";
/** Herzschlag-Name (werk_heartbeat.werk) je Werk der Firma-Karte. */
export const BEAT_NAME: Record<string, string> = { lead: "lead-werk", pruefer: "pruefer-werk", proben: "proben-vorrat", kunden: "kunden-werk", stichprobe: "dauerpruefung", radar: "lead-werk", kontakt: "kontakt-werk" };
export type PulsDaten = {
  beats: Record<string, string | null | undefined>;
  lastSent?: string | null;
  acks?: Record<string, string | null | undefined>;
  cacheAt?: string | null;
  runsLast?: Record<string, string | null | undefined>;
  mrr?: number | null;
};
const jung = (iso: string | null | undefined, now: number, ms: number) => !!iso && now - Date.parse(iso) < ms;
const daten = (iso: string | null | undefined) => !!iso && !Number.isNaN(Date.parse(iso));

/** live = Herzschlag < 6 min · live~ = Ersatzquelle frisch · still = Daten da, aber alt · grau = keine Daten / nicht gebaut. */
export function pulsStatus(w: Pick<Werk, "id" | "status" | "puls">, now: number, d: PulsDaten): Puls {
  if (w.status === "fehlt") return "grau";
  const beat = BEAT_NAME[w.id] ? d.beats[BEAT_NAME[w.id]] : undefined;
  if (jung(beat, now, LIVE_BEAT_MIN * MIN)) return "live";
  switch (w.id) {
    case "versand": return jung(d.lastSent, now, SENT_MIN * MIN) ? "live~" : daten(d.lastSent) ? "still" : "grau";
    case "antworten": return jung(d.acks?.antworten, now, ACK_ANTWORTEN_MIN * MIN) ? "live~" : daten(d.acks?.antworten) ? "still" : "grau";
    case "lieferung": return jung(d.acks?.kundenlieferung, now, LIEFERUNG_TAGE * 1440 * MIN) ? "live~" : daten(d.acks?.kundenlieferung) ? "still" : "grau";
    case "wachhund": return jung(d.cacheAt, now, CACHE_MIN * MIN) ? "live~" : daten(d.cacheAt) ? "still" : "grau";
    case "stichprobe": {
      const last = [d.runsLast?.stichprobe, d.runsLast?.dauerpruefung].filter(daten).sort().pop();
      return jung(last, now, STICHPROBE_H * 60 * MIN) ? "live~" : daten(last) ? "still" : "grau";
    }
    case "umsatz": return d.mrr === null || d.mrr === undefined ? "grau" : d.mrr > 0 ? "live" : "still";
  }
  return daten(beat) ? "still" : "grau";
}

// ------------------------------------------------------------------------------------------------- Partikel
/** Partikel auf einer Kante aus dem echten Durchsatz je Stunde: Dauer = clamp(8 s ÷ log10(1 + n), 0,8 s, 8 s);
 *  Anzahl = ceil(log10(1 + n) × 1,5), höchstens 3 je Kante (Handy 2). 0/h → keine Partikel (Kante gedimmt). */
export function partikel(proStunde: number, handy = false): { n: number; dauer: number } | null {
  const p = Number(proStunde);
  if (!Number.isFinite(p) || p <= 0) return null;
  const l = Math.log10(1 + p);
  const dauer = Math.min(8, Math.max(0.8, 8 / l));
  const n = Math.min(handy ? KANTE_MAX.handy : KANTE_MAX.rechner, Math.max(1, Math.ceil(l * 1.5)));
  return { n, dauer: Math.round(dauer * 100) / 100 };
}

/** Gesamtgrenze: höchstens 40 Partikel (Handy 20); kürzt von hinten. */
export function begrenzePartikel<T extends { n: number }>(kanten: (T | null)[], handy = false): (T | null)[] {
  let rest = handy ? PARTIKEL_MAX.handy : PARTIKEL_MAX.rechner;
  return kanten.map((k) => {
    if (!k) return null;
    const n = Math.min(k.n, rest);
    rest -= n;
    return n > 0 ? { ...k, n } : null;
  });
}

/** Kantendicke für reduzierte Bewegung (Durchsatz ohne Partikel): 1–4 px. */
export const kantenDicke = (proStunde: number) => (proStunde > 0 ? Math.min(4, 1 + Math.log10(1 + proStunde) * 0.6) : 1);

// ------------------------------------------------------------------------------------------------- Lernring
export const LERN_PHASEN = ["zahlen", "luecke", "auftrag", "umsetzen", "messen", "lehre"] as const;
export type LernPhase = (typeof LERN_PHASEN)[number];
export const LERN_WORT: Record<LernPhase, string> = { zahlen: "Zahlen", luecke: "Lücke", auftrag: "Auftrag", umsetzen: "Umsetzen", messen: "Messen", lehre: "Lehre" };
const VORRANG: LernPhase[] = ["umsetzen", "auftrag", "messen", "lehre", "luecke", "zahlen"];

/** Aktives Segment: unter den Ereignissen der letzten 2 h gewinnt der Vorrang Umsetzen > Auftrag > Messen > Lehre >
 *  Lücke > Zahlen; ohne frisches Ereignis das jüngste überhaupt; ohne Ereignis null (kein Segment leuchtet). */
export function lernPhase(ereignisse: { phase: LernPhase; at: string | null | undefined }[], now = Date.now()): LernPhase | null {
  const mit = ereignisse.filter((e) => daten(e.at));
  if (!mit.length) return null;
  const frisch = mit.filter((e) => now - Date.parse(e.at!) < 120 * MIN);
  if (frisch.length) return VORRANG.find((p) => frisch.some((e) => e.phase === p)) ?? null;
  return [...mit].sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!))[0].phase;
}

export type LernZahlen = { zahlen: string | null; luecke: number | null; auftrag: number | null; umsetzen: number | null; messen: number | null; lehre: number | null };
export type LernSegment = { key: LernPhase; wort: string; zahl: string; grau: boolean; tip: string };

/** Sechs Segmente mit Wort und Zahl; 0 oder fehlend = schraffiert grau („0 gemessen“) – ehrlich, nie übermalt. */
export function lernSegmente(z: LernZahlen): LernSegment[] {
  const n = (v: number | null) => (v === null ? "–" : v.toLocaleString("de-DE"));
  return LERN_PHASEN.map((key) => {
    if (key === "zahlen") return { key, wort: LERN_WORT[key], zahl: z.zahlen ? `✓ ${z.zahlen}` : "–", grau: !z.zahlen, tip: z.zahlen ? `Kennzahlen heute um ${z.zahlen} gerechnet` : "heute noch keine Kennzahlen" };
    const v = z[key];
    const grau = !v;
    const tip = { luecke: "Bereiche mit Lücke zum Ziel", auftrag: "offene Aufträge", umsetzen: "laufende Aufträge", messen: "Wirkung gemessen (7 Tage)", lehre: "Lehren mit Vertrauen ≥ 0,7" }[key];
    return { key, wort: LERN_WORT[key], zahl: grau && (key === "messen" || key === "lehre") ? "0" : n(v), grau, tip };
  });
}

// ------------------------------------------------------------------------------------------------- Ampeln
export type Ton = "rot" | "gelb" | "gruen" | "grau";
/** Bereich: Rang 1 rot, Rang 2–3 gelb, sonst grün; ohne Messung (Lücke null) grau; Lücke < 5 % zählt als erreicht. */
export function ampelLuecke(rang: number | null | undefined, luecke: number | null | undefined): Ton {
  if (luecke === null || luecke === undefined) return "grau";
  if (luecke < 0.05) return "gruen";
  if (rang === 1) return "rot";
  if (rang === 2 || rang === 3) return "gelb";
  return "gruen";
}

/** Notbremse: Status ist genau die Bewertung aus deliverability (stop gesetzt = aktiv), die Zahl daneben eigene Farbe:
 *  gelb ab 4 %, rot ab 5 % – erst ab 100 gesendeten Mails gefärbt. Nichts geglättet, nichts behauptet. */
export function notbremseAnzeige(bounces: number, gesendet: number, bremse: { stop: string | null } | null) {
  const rate = gesendet > 0 ? bounces / gesendet : 0;
  const pct = Math.round(rate * 100);
  const zahlTon: Ton = gesendet < 100 ? (gesendet ? "grau" : "grau") : rate >= 0.05 ? "rot" : rate >= 0.04 ? "gelb" : "gruen";
  return {
    status: bremse === null ? "unbekannt" : bremse.stop ? "aktiv" : "nicht aktiv",
    statusTon: (bremse === null ? "grau" : bremse.stop ? "rot" : "gruen") as Ton,
    zahl: gesendet ? `${pct} % (${bounces}/${gesendet})` : "–",
    zahlTon,
    greift: !!bremse?.stop,
  };
}

/** Freigabe: Fehlerquote der Stichprobe in %, gelb über 2 %, rot über 5 %. */
export const freigabeTon = (fehlerPct: number | null | undefined): Ton =>
  fehlerPct === null || fehlerPct === undefined ? "grau" : fehlerPct > 5 ? "rot" : fehlerPct > 2 ? "gelb" : "gruen";

/** Speicher in GB: gelb ab 6 (Bremse), rot ab 7,5 (Stopp). */
export const speicherTon = (gb: number | null | undefined): Ton =>
  gb === null || gb === undefined ? "grau" : gb >= 7.5 ? "rot" : gb >= 6 ? "gelb" : "gruen";

// ------------------------------------------------------------------------------------------------- Stau, Plätze, Ziele
/** Stau: Eingang ≥ 50 × Ausgang in 24 h (z. B. 9.389 freigegebene Mails gegen 153 gesendete). */
export function staus(kanten: { id: string; ein: number; aus: number }[]): string[] {
  return kanten.filter((k) => k.ein > 0 && k.ein >= STAU_FAKTOR * Math.max(k.aus, 1)).map((k) => k.id);
}

/** Unterschied zweier Belegungen (werk_plan_log): je Linie von → nach; leer = keine Umverteilung. */
export function plaetzeDiff(alt: Record<string, number> | null | undefined, neu: Record<string, number> | null | undefined) {
  if (!alt || !neu) return [];
  const keys = [...new Set([...Object.keys(alt), ...Object.keys(neu)])].sort();
  return keys.map((linie) => ({ linie, von: alt[linie] ?? 0, nach: neu[linie] ?? 0 }))
    .filter((x) => x.von !== x.nach).map((x) => ({ ...x, delta: x.nach - x.von }));
}

/** Ziel-Ring: Anteil 0–1 (bei „runter“ = Soll ÷ Ist), unbestätigt bei Quelle „vorschlag“. */
export function zielRing(goal: { soll: number | null; richtung?: string | null; quelle?: string | null } | null | undefined, ist: number | null | undefined) {
  const unbestaetigt = !goal || !goal.quelle || goal.quelle === "vorschlag";
  if (!goal || goal.soll === null || ist === null || ist === undefined) return { anteil: 0, unbestaetigt, leer: true };
  const soll = Number(goal.soll);
  let anteil = goal.richtung === "runter" ? (ist <= 0 ? 1 : Math.min(1, soll / ist)) : soll > 0 ? Math.min(1, Math.max(0, ist / soll)) : 0;
  if (!Number.isFinite(anteil)) anteil = 0;
  return { anteil, unbestaetigt, leer: false };
}

// ------------------------------------------------------------------------------------------------- Text
/** Titel ≤ 60, Grund ≤ 160 Zeichen (Inhaber 04.10.2026: „wenig text überall“). */
export function kurz(titel: string | null | undefined, grund?: string | null): { titel: string; grund: string } {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  return { titel: cut(String(titel ?? "").trim(), TITEL_MAX), grund: cut(String(grund ?? "").trim(), GRUND_MAX) };
}

/** Uhrzeit in deutscher Zeit („01:25“), mit Datum, wenn nicht heute. */
export function uhr(iso: string | null | undefined, now = Date.now()): string {
  if (!daten(iso)) return "–";
  const d = new Date(iso!);
  const tag = (x: Date) => x.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  const t = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
  return tag(d) === tag(new Date(now)) ? t : `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d)} ${t}`;
}

/** Kurze Zahl („9.389“, „2,6 Mio.“, „241 Tsd.“). */
export function zahl(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio.`;
  if (a >= 1e5) return `${Math.round(n / 1000).toLocaleString("de-DE")} Tsd.`;
  return Math.round(n).toLocaleString("de-DE");
}

/** Ist der Stand älter als 20 min? (Oberfläche zeigt dann „Stand 01:25“.) */
export const veraltet = (iso: string | null | undefined, now = Date.now()) => !jung(iso, now, CACHE_MIN * MIN);

/** Durchsatz kurz (≤ 6 Zeichen) für die Kanten der Werke-Karte: 4.200 → „4,2k/h“, 12.500 → „13k/h“, 6 → „6/h“. */
export function rateKurz(proStunde: number): string {
  const p = Number(proStunde);
  if (!Number.isFinite(p) || p <= 0) return "0/h";
  if (p >= 1e6) return `${Math.round(p / 1e6)}M/h`;
  if (p >= 1e4) return `${Math.round(p / 1000)}k/h`;
  if (p >= 1000) return `${(p / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k/h`;
  return `${Math.round(p)}/h`;
}

// ------------------------------------------------------------------------------------------------- Takt (Cron → Berlin)
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const BERLIN_HM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const BERLIN_WT = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" });
const WT_EN: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const ganz = (x: string) => /^\d+$/.test(x);

/** Nächster Lauf eines festen Crons (Minute, Stunde und ggf. Wochentag als Zahl, UTC) nach `now`; sonst null. */
export function naechsterLauf(cron: string, now: number): Date | null {
  const [mi, h, dom, mon, dow] = cron.trim().split(/\s+/);
  if (!ganz(mi) || !ganz(h) || dom !== "*" || mon !== "*" || !(dow === "*" || ganz(dow))) return null;
  const d0 = new Date(now);
  for (let i = 0; i <= 8; i++) {
    const t = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + i, Number(h), Number(mi)));
    if (t.getTime() > now && (dow === "*" || t.getUTCDay() === Number(dow) % 7)) return t;
  }
  return null;
}

/** Takt eines Crons in Berliner Zeit (Sommer-/Winterzeit zur Laufzeit): „Mo 06:53“, „07:07“, „stündlich :47“; null = Intervall. */
export function cronBerlin(cron: string, now: number): string | null {
  const [mi, h, dom, mon, dow] = cron.trim().split(/\s+/);
  if (ganz(mi) && h === "*" && dom === "*" && mon === "*" && dow === "*") return `stündlich :${mi.padStart(2, "0")}`;
  const t = naechsterLauf(cron, now);
  if (!t) return null;
  const hm = BERLIN_HM.format(t);
  return dow === "*" ? hm : `${WT[WT_EN[BERLIN_WT.format(t)] ?? t.getUTCDay()]} ${hm}`;
}

/** Takt-Anzeige eines Werks: feste Crons in Berliner Zeit, reine Intervalle aus „takt“ (firma-karte.json). */
export function taktAnzeige(w: { cron_utc?: string[]; takt?: string }, now: number): string {
  const cs = w.cron_utc ?? [];
  // nur wenn ein Cron eine feste Stunde hat, hängt die Anzeige von der Zeitzone ab; reine Intervalle beschreibt „takt“
  if (!cs.some((c) => naechsterLauf(c, now))) return w.takt ?? "";
  const xs = cs.map((c) => cronBerlin(c, now));
  if (xs.every((x) => x !== null)) return xs.join(" · ");
  return w.takt ?? "";
}
