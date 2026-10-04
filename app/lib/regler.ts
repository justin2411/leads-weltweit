/**
 * Regler (Inhaber 03.10.2026: „einfache anpassungen direkt einstellen … immer mit einem button, dass die änderungen
 * auch übernommen werden“). Reines Modell ohne Next/React/Supabase (testbar): Karten je Werk, Knöpfe als Entwurf
 * (`Draft`), Unterschiede zum Gespeicherten (`diff`), neue Werte je owner_settings-Schlüssel (`toSettings`) und der
 * Zustand „eingestellt → übernommen → angewandt“ aus den Quittungen der Werke (signalwerk.settings_ack).
 * Grenzen kommen aus lib/owner-settings.ts (nie lockerer). Versand ist hier nur Pause/Status – nie einschaltbar.
 */
import {
  DEFAULTS, InputError, WERK_SWITCHES, slotCounts, validateFollowupDays, validateMaxAge, validateSampleTargets, validateSlotPlan, werkOn,
  type Lane, type LaneRegistry, type OwnerSettings, type SettingKey, type WerkKey,
} from "./owner-settings.ts";
import { START_MAX_AGE_MIN, fmtBerlin, nextPickup, type StartKey, type StartRequest } from "./start-queue.ts";
import type { IconName } from "../app/icons.tsx";
import { nextSendStart } from "./versandzeit.ts";

export { fmtBerlin };

// ------------------------------------------------------------------------------------------------ Karten
export type CardKey = WerkKey;
export type Card = {
  /** Linien-Icon (Name aus app/icons.tsx), gerendert in der Komponente – keine Emojis */
  key: CardKey; icon: IconName; name: string;
  /** owner_settings-Schlüssel, die diese Karte stellt (und die das Werk quittiert) */
  keys: SettingKey[];
  /** Werk-Name in signalwerk.settings_ack */
  werk: string;
  /** Direktstart (nur die Liste aus start_requests, nie Versand) */
  start: StartKey | null;
  /** Zeitplan (UTC) aus .github/workflows/<file> */
  cron: string; file: string;
  note?: string;
};

export const CARDS: readonly Card[] = [
  { key: "lead-werk", icon: "lead-werk", name: "Lead-Werk", keys: ["werke_paused", "slot_plan", "slot_autopilot"], werk: "lead-werk", start: "lead-werk", cron: "23 */3 * * *", file: "lead-werk.yml" },
  { key: "kunden-werk", icon: "kunden-werk", name: "Kunden-Werk", keys: ["werke_paused", "slot_plan", "buyer_countries_off"], werk: "kunden-werk", start: "kunden-werk", cron: "41 */2 * * *", file: "kunden-werk.yml" },
  { key: "proben-vorrat", icon: "proben", name: "Proben-Vorrat", keys: ["werke_paused", "sample_targets", "sample_max_age_hours"], werk: "proben-vorrat", start: "proben-vorrat", cron: "23 * * * *", file: "proben-vorrat.yml" },
  { key: "antworten", icon: "antworten", name: "Antwort-Assistent", keys: ["werke_paused"], werk: "antworten", start: null, cron: "*/10 * * * *", file: "antworten.yml", note: WERK_SWITCHES.antworten.note },
  { key: "nachfass", icon: "nachfass", name: "Nachfassmails", keys: ["followup_enabled", "followup_days"], werk: "nachfass", start: null, cron: "17 12 * * *", file: "taeglich.yml" },
  // Versand nur Di–Do (Inhaber 04.10.2026): nächster Lauf aus lib/versandzeit.ts (cardNext), Cron nur zur Info
  { key: "versand", icon: "versand", name: "Versand", keys: ["send_paused"], werk: "versand", start: null, cron: "37 6 * * 2-4", file: "send.yml" },
  { key: "kundenlieferung", icon: "lieferung", name: "Kundenlieferung", keys: ["werke_paused"], werk: "kundenlieferung", start: null, cron: "53 4 * * 1", file: "kundenlieferung.yml" },
  { key: "tagescheck", icon: "tagescheck", name: "Tagescheck", keys: ["werke_paused"], werk: "tagescheck", start: null, cron: "37 17 * * *", file: "tagescheck.yml" },
  { key: "agenten", icon: "agent", name: "Agenten-Werk", keys: ["werke_paused"], werk: "agenten", start: null, cron: "29 * * * *", file: "agenten-werk.yml" },
];
export const cardOf = (k: CardKey): Card => CARDS.find((c) => c.key === k)!;
export const isCardKey = (x: unknown): x is CardKey => typeof x === "string" && CARDS.some((c) => c.key === x);

/** Hinweis am Versand, wenn config/versand.yaml ihn gestoppt hat (Schalter dort bleibt Inhaber-Entscheidung). */
export const versandStopText = (cfg: { versand?: { aktiv?: boolean } }): string | null =>
  cfg.versand?.aktiv === false ? "gestoppt (config/versand.yaml, deine Entscheidung 28.09.)" : null;
/** Proben-Verfall gilt nicht für Webagenturen (S2) – dort Drei-Stufen-Nachprüfung statt Verfall. */
export const MAX_AGE_NOTE = "S2 (Webagenturen) hat keinen Verfall – dort werden die Leads alle 20 h neu geprüft.";
export const NO_EXPIRY_SEGMENTS = ["S2"];
/** Verfall wirkt nur, wenn eine Live-Seite außerhalb von S2 Proben hält – sonst kein Regler (würde nichts ändern). */
export const maxAgeMatters = (pages: string[]) => pages.some((k) => !NO_EXPIRY_SEGMENTS.includes(k.split("/")[0]));

// ------------------------------------------------------------------------------------------------ Zeitplan
function field(spec: string, lo: number, hi: number): number[] | null {
  if (spec === "*") return null; // alles
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`cron: ${spec}`);
    const a = m[1] === "*" ? lo : Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : m[1] === "*" || m[3] ? hi : a;
    const step = m[3] ? Number(m[3]) : 1;
    if (a < lo || b > hi || a > b || step < 1) throw new Error(`cron: ${spec}`);
    for (let i = a; i <= b; i += step) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** Nächster Lauf eines GitHub-Zeitplans (UTC) nach `now` (Minute, Stunde, Tag, Monat, Wochentag; Stern, Stern/n, a-b, Listen). */
export function nextRun(cron: string, now: Date): Date {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron: ${cron}`);
  const min = field(f[0], 0, 59) ?? Array.from({ length: 60 }, (_, i) => i);
  const [hour, dom, mon] = [field(f[1], 0, 23), field(f[2], 1, 31), field(f[3], 1, 12)];
  const dow = field(f[4].replace(/\b7\b/g, "0"), 0, 6);
  const h0 = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  for (let i = 0; i <= 24 * 366; i++) {
    const d = new Date(h0 + i * 3_600_000);
    if (hour && !hour.includes(d.getUTCHours())) continue;
    if (dom && !dom.includes(d.getUTCDate())) continue;
    if (mon && !mon.includes(d.getUTCMonth() + 1)) continue;
    if (dow && !dow.includes(d.getUTCDay())) continue;
    for (const m of min) {
      const c = new Date(d.getTime() + m * 60_000);
      if (c.getTime() > now.getTime()) return c;
    }
  }
  throw new Error(`cron ohne Lauf: ${cron}`);
}

/** Nächster Lauf einer Karte: Versand aus dem Versandplan (Di–Do, deutsche Zeit, Sommer-/Winterzeit), sonst Cron. */
export function cardNext(c: Pick<Card, "key" | "cron">, now: Date): Date {
  if (c.key === "versand") return nextSendStart(now)?.at ?? nextRun(c.cron, now);
  return nextRun(c.cron, now);
}

/** Letzter planmäßiger Lauf vor `now` (gleiches Muster wie nextRun). */
export function prevRun(cron: string, now: Date): Date {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron: ${cron}`);
  const min = field(f[0], 0, 59) ?? Array.from({ length: 60 }, (_, i) => i);
  const [hour, dom, mon] = [field(f[1], 0, 23), field(f[2], 1, 31), field(f[3], 1, 12)];
  const dow = field(f[4].replace(/\b7\b/g, "0"), 0, 6);
  const h0 = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  for (let i = 0; i <= 24 * 366; i++) {
    const d = new Date(h0 - i * 3_600_000);
    if (hour && !hour.includes(d.getUTCHours())) continue;
    if (dom && !dom.includes(d.getUTCDate())) continue;
    if (mon && !mon.includes(d.getUTCMonth() + 1)) continue;
    if (dow && !dow.includes(d.getUTCDay())) continue;
    for (const m of [...min].reverse()) {
      const c = new Date(d.getTime() + m * 60_000);
      if (c.getTime() < now.getTime()) return c;
    }
  }
  throw new Error(`cron ohne Lauf: ${cron}`);
}

const berlinDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }); // JJJJ-MM-TT
/** „21:41“, „morgen 06:53“ oder „Mo 06:53“ – immer deutsche Zeit (MEZ/MESZ). */
export function fmtWhen(d: Date | string | null | undefined, now: Date): string {
  if (!d) return "–";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "–";
  const day = berlinDay(x), today = berlinDay(now);
  if (day === today) return fmtBerlin(x);
  const [y, m, dd] = today.split("-").map(Number);
  if (day === new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)) return `morgen ${fmtBerlin(x)}`;
  const wd = x.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "short" }).replace(".", "");
  return `${wd} ${fmtBerlin(x)}`;
}

// ------------------------------------------------------------------------------------------------ Plätze
export type LeadCountry = "US" | "UK" | "FR" | "Nord" | "Neu";
export const LEAD_COUNTRIES: { id: LeadCountry; label: string; title: string }[] = [
  { id: "US", label: "US", title: "USA" }, { id: "UK", label: "UK", title: "Großbritannien" },
  { id: "FR", label: "FR", title: "Frankreich" }, { id: "Nord", label: "Nord", title: "IE · NL · BE · SE" },
  { id: "Neu", label: "Neu", title: "FI · SG · HK · MX · BR" },
];
/** Land-Chip einer Lead-Linie: mehrere Länder (IE,NL,BE,SE) = „Nord“, neue Mail-Länder (FI,SG,HK,MX,BR, 04.10.2026) = „Neu“. */
export const countryOf = (l: Lane): LeadCountry =>
  (l.country.split(",").includes("FI") ? "Neu" : l.country.includes(",") ? "Nord" : (l.country as LeadCountry));
export const leadLanes = (reg: LaneRegistry) => reg.lanes.filter((l) => l.werk === "lead-werk");
export const capOf = (reg: LaneRegistry) => reg.total_slots - reg.reserve;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const at = (plan: Record<string, number>, id: string) => Math.max(0, Math.floor(Number(plan[id] ?? 0)) || 0);
export const leadTotal = (plan: Record<string, number>, reg: LaneRegistry) => sum(leadLanes(reg).map((l) => at(plan, l.id)));
const otherTotal = (plan: Record<string, number>, reg: LaneRegistry) => sum(reg.lanes.filter((l) => l.werk !== "lead-werk").map((l) => at(plan, l.id)));

/** Verteilt `total` ganzzahlig nach Gewichten (größter Rest), keine Linie über ihr max; Gewicht 0 bleibt 0. */
function distribute(lanes: Lane[], weight: Record<string, number>, total: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(lanes.map((l) => [l.id, 0]));
  let free = lanes.filter((l) => (weight[l.id] ?? 0) > 0);
  let rest = Math.max(0, Math.min(Math.round(total), sum(free.map((l) => l.max))));
  // Linien, deren Anteil über max läge, voll belegen und den Rest neu verteilen
  for (;;) {
    const w = sum(free.map((l) => weight[l.id]));
    const full = free.filter((l) => (rest * weight[l.id]) / w >= l.max);
    if (!full.length || !w) break;
    for (const l of full) { out[l.id] = l.max; rest -= l.max; }
    free = free.filter((l) => !full.includes(l));
  }
  const w = sum(free.map((l) => weight[l.id]));
  if (!free.length || !w || rest <= 0) return out;
  const q = free.map((l, i) => ({ l, i, q: (rest * weight[l.id]) / w }));
  for (const x of q) out[x.l.id] = Math.min(x.l.max, Math.floor(x.q + 1e-9));
  let left = rest - sum(q.map((x) => out[x.l.id]));
  for (const x of [...q].sort((a, b) => (b.q - Math.floor(b.q + 1e-9)) - (a.q - Math.floor(a.q + 1e-9)) || a.i - b.i)) {
    if (left <= 0) break;
    if (out[x.l.id] < x.l.max) { out[x.l.id] += 1; left -= 1; }
  }
  return out;
}

/** Gewichte des aktuellen Plans für die Lead-Linien; alles 0 -> Standardwerte. */
function leadWeights(plan: Record<string, number>, reg: LaneRegistry): Record<string, number> {
  const cur = Object.fromEntries(leadLanes(reg).map((l) => [l.id, at(plan, l.id)]));
  return sum(Object.values(cur)) > 0 ? cur : Object.fromEntries(leadLanes(reg).map((l) => [l.id, l.default]));
}

/** Höchstes erreichbares Tempo: max der aktiven Linien, höchstens Platz neben den übrigen Linien (Kunden-Werk). */
export function leadMax(plan: Record<string, number>, reg: LaneRegistry): number {
  const w = leadWeights(plan, reg);
  return Math.max(0, Math.min(capOf(reg) - otherTotal(plan, reg), sum(leadLanes(reg).filter((l) => w[l.id] > 0).map((l) => l.max))));
}

/**
 * „Tempo“: Lead-Werk auf `total` Plätze skalieren – anteilig nach dem aktuellen Plan (sonst Standard), größter Rest,
 * jede Linie ≤ max, Summe aller Linien ≤ total_slots − reserve (inkl. Kunden-Linie, die bleibt). Abgeschaltete Länder
 * (0 Plätze) bleiben aus. „Langsamer“ schaltet nie ein Land ab: jede aktive Linie behält mindestens 1 Platz, solange
 * das Tempo reicht (sonst wenigstens jedes aktive Land). Ergebnis: vollständiger Plan für alle Linien.
 */
export function scalePlan(plan: Record<string, number>, reg: LaneRegistry, total: number): Record<string, number> {
  const out = Object.fromEntries(reg.lanes.map((l) => [l.id, Math.min(at(plan, l.id), l.max)]));
  const t = Math.max(0, Math.min(Math.round(Number(total) || 0), leadMax(out, reg)));
  const w = leadWeights(out, reg);
  const p = distribute(leadLanes(reg), w, t);
  const active = leadLanes(reg).filter((l) => w[l.id] > 0);
  const top = new Map<LeadCountry, Lane>(); // je Land die Linie mit dem größten Gewicht
  for (const l of active) { const b = top.get(countryOf(l)); if (!b || w[l.id] > w[b.id]) top.set(countryOf(l), l); }
  const need = t >= active.length ? active : t >= top.size ? [...top.values()] : [];
  const otherOn = (x: Lane) => leadLanes(reg).some((y) => y !== x && countryOf(y) === countryOf(x) && p[y.id] > 0);
  for (const l of need) {
    if (p[l.id] > 0 || (need !== active && otherOn(l))) continue;
    // 1 Platz von der größten Linie, die ihn abgeben kann, ohne selbst eine gebrauchte Linie oder ihr Land abzuschalten
    const donor = leadLanes(reg).filter((x) => p[x.id] > 1 || (p[x.id] === 1 && !need.includes(x) && otherOn(x))).sort((a, b) => p[b.id] - p[a.id])[0];
    if (!donor) break;
    p[donor.id] -= 1;
    p[l.id] += 1;
  }
  return { ...out, ...p };
}

export const countryOn = (plan: Record<string, number>, reg: LaneRegistry, c: LeadCountry) =>
  leadLanes(reg).some((l) => countryOf(l) === c && at(plan, l.id) > 0);

/** Zahl der eingeschalteten Lead-Länder (Untergrenze fürs Tempo: weniger Plätze würden Länder abschalten). */
export const countriesOn = (plan: Record<string, number>, reg: LaneRegistry) => LEAD_COUNTRIES.filter((c) => countryOn(plan, reg, c.id)).length;

/** Land an/aus: aus -> seine Linien 0; an -> Standardwerte, andere Lead-Linien rücken anteilig zusammen, falls es eng wird. */
export function setCountry(plan: Record<string, number>, reg: LaneRegistry, c: LeadCountry, on: boolean): Record<string, number> {
  const out = Object.fromEntries(reg.lanes.map((l) => [l.id, Math.min(at(plan, l.id), l.max)]));
  const mine = leadLanes(reg).filter((l) => countryOf(l) === c);
  if (!mine.length) throw new InputError("unbekanntes Land");
  if (!on) { for (const l of mine) out[l.id] = 0; return out; }
  for (const l of mine) out[l.id] = l.default;
  if (!sum(mine.map((l) => out[l.id]))) out[mine[0].id] = 1;
  const room = capOf(reg) - otherTotal(out, reg);
  const own = sum(mine.map((l) => out[l.id]));
  if (own > room) return { ...out, ...Object.fromEntries(leadLanes(reg).filter((l) => !mine.includes(l)).map((l) => [l.id, 0])), ...distribute(mine, Object.fromEntries(mine.map((l) => [l.id, out[l.id]])), room) };
  const others = leadLanes(reg).filter((l) => !mine.includes(l));
  if (own + sum(others.map((l) => out[l.id])) <= room) return out;
  return { ...out, ...distribute(others, Object.fromEntries(others.map((l) => [l.id, out[l.id]])), room - own) };
}

/** Plätze einer einzelnen Linie (z. B. Kunden-Werk): 0 … min(max, frei neben den anderen Linien). */
export function laneRoom(plan: Record<string, number>, reg: LaneRegistry, id: string): number {
  const l = reg.lanes.find((x) => x.id === id);
  if (!l) throw new InputError("unbekannte Linie");
  return Math.max(0, Math.min(l.max, capOf(reg) - (sum(reg.lanes.map((x) => at(plan, x.id))) - at(plan, id))));
}
export function setLane(plan: Record<string, number>, reg: LaneRegistry, id: string, n: number): Record<string, number> {
  const out = Object.fromEntries(reg.lanes.map((l) => [l.id, Math.min(at(plan, l.id), l.max)]));
  out[id] = Math.max(0, Math.min(Math.round(Number(n) || 0), laneRoom(out, reg, id)));
  return out;
}

/** Hinweis am Anschlag: alle Plätze (total_slots − reserve) belegt – Lead- und Kunden-Werk teilen sie sich. */
export function capHint(plan: Record<string, number>, reg: LaneRegistry, card: "lead-werk" | "kunden-werk"): string | null {
  if (sum(reg.lanes.map((l) => at(plan, l.id))) < capOf(reg)) return null;
  return `Maximum – alle ${capOf(reg)} Plätze belegt. Mehr hier = ${card === "lead-werk" ? "Kunden-Werk" : "Lead-Werk-Tempo"} senken`;
}

/** Vorschau am Schalter, solange an/aus noch nicht übernommen ist (eine Zeile). */
export function switchPreview(card: CardKey, on: boolean): string {
  if (on) return card === "versand" ? "läuft wieder ab Übernehmen (Limits bleiben)" : "läuft wieder ab Übernehmen";
  if (card === "versand") return "wird pausiert – keine Kalt-/Nachfassmails";
  if (card === "nachfass") return "wird pausiert – keine Nachfassmails";
  if (card === "antworten") return "wird pausiert – Abmeldungen werden weiter gesperrt";
  return "wird pausiert ab Übernehmen";
}

export type Preset = { id: "sparsam" | "standard" | "voll"; label: string; total: number };
/** Tempo-Vorgaben: Standard = Summe der Standardwerte, Sparsam ≈ ein Drittel, Voll = höchstes erreichbares Tempo. */
export function presets(plan: Record<string, number>, reg: LaneRegistry): Preset[] {
  const max = leadMax(plan, reg);
  const std = Math.min(max, sum(leadLanes(reg).map((l) => l.default)));
  return [
    { id: "sparsam", label: "Sparsam", total: Math.min(max, Math.max(1, Math.round(std / 3))) },
    { id: "standard", label: "Standard", total: std },
    { id: "voll", label: "Voll", total: max },
  ];
}

/** Vorgaben für die Chips: gleiche Zahl nur einmal; ist Standard schon das Maximum, heißt der Chip „Standard = Voll“. */
export function presetChips(plan: Record<string, number>, reg: LaneRegistry): Preset[] {
  const [sp, std, voll] = presets(plan, reg);
  const out = std.total === voll.total ? [sp, { ...std, label: "Standard = Voll" }] : [sp, std, voll];
  return out.filter((p, i, a) => a.findIndex((q) => q.total === p.total) === i);
}

/**
 * Vorgabe anwenden. „Standard“ setzt die Standardbelegung der eingeschalteten Länder (statt einen vorher verkleinerten
 * Plan hochzurechnen) – so kommt jede Linie zurück; Sparsam/Voll skalieren den aktuellen Plan.
 */
export function presetPlan(plan: Record<string, number>, reg: LaneRegistry, p: Preset): Record<string, number> {
  if (p.id !== "standard") return scalePlan(plan, reg, p.total);
  const on = LEAD_COUNTRIES.filter((c) => countryOn(plan, reg, c.id)).map((c) => c.id);
  const base = { ...plan };
  for (const l of leadLanes(reg)) base[l.id] = !on.length || on.includes(countryOf(l)) ? l.default : 0;
  return scalePlan(base, reg, p.total);
}

// ------------------------------------------------------------------------------------------------ Entwurf
export type ReglerCtx = {
  reg: LaneRegistry;
  /** Live-Seiten „S2/US“ (Proben-Soll je Seite) */
  pages: string[];
  /** Länder des Kunden-Werks (wie toggleBuyerCountry: COUNTRIES aus dashboard-data) */
  buyerCountries: string[];
  /** config/proben.yaml (CONFIG.proben) und Fokus-Seiten (CONFIG.fokus) für Standardwerte */
  proben: { fokus_je_seite: number; andere_je_seite: number; max_alter_stunden: number };
  fokus: string[];
  /** Tage bis Nachfass ohne Einstellung (scripts/followups.py: 4) */
  followupDefault?: number;
};
export type Draft = {
  on: Record<CardKey, boolean>;
  /** Autopilot der Plätze (Inhaber 03.10.2026: an): verteilt bei jedem Start innerhalb der Grundbelegung um */
  autopilot: boolean;
  slot_plan: Record<string, number>;
  buyer_countries_off: string[];
  sample_targets: Record<string, number>;
  sample_max_age_hours: number;
  followup_days: number;
};

export const sampleDefault = (key: string, ctx: ReglerCtx) => (ctx.fokus.includes(key) ? ctx.proben.fokus_je_seite : ctx.proben.andere_je_seite);

/** Entwurf = wirksame Werte des Gespeicherten (Standardwerte ausgefüllt). */
export function draftFrom(s: OwnerSettings, ctx: ReglerCtx): Draft {
  return {
    on: Object.fromEntries(CARDS.map((c) => [c.key, werkOn(s, c.key).on])) as Record<CardKey, boolean>,
    autopilot: s.slot_autopilot?.on !== false,
    slot_plan: slotCounts(ctx.reg, s.slot_plan),
    buyer_countries_off: [...(s.buyer_countries_off ?? [])].sort(),
    sample_targets: Object.fromEntries(ctx.pages.map((k) => [k, s.sample_targets?.[k] ?? sampleDefault(k, ctx)])),
    sample_max_age_hours: s.sample_max_age_hours ?? ctx.proben.max_alter_stunden,
    followup_days: s.followup_days ?? ctx.followupDefault ?? 4,
  };
}

export type Val = boolean | number | string | null;
export type Change = {
  card: CardKey; key: SettingKey; part: string; label: string; from: Val; to: Val;
  /** „Tempo 24 → 38 Plätze“ */
  text: string;
  /** neuer Wert des Schlüssels (bei werke_paused: unbenutzt, toSettings führt zusammen) */
  value: unknown;
};

const onOff = (b: boolean) => (b ? "an" : "aus");
const viaKey = (k: CardKey): SettingKey => WERK_SWITCHES[k].via as SettingKey;

/** Unterschiede Gespeichert -> Entwurf, in Karten-Reihenfolge. */
export function diff(saved: OwnerSettings, draft: Draft, ctx: ReglerCtx): Change[] {
  const base = draftFrom(saved, ctx);
  const out: Change[] = [];
  const add = (c: Omit<Change, "text"> & { text?: string }) => out.push({ ...c, text: c.text ?? `${c.label} ${c.from} → ${c.to}` });
  const reg = ctx.reg;
  const planChanged = (lanes: Lane[]) => lanes.some((l) => at(base.slot_plan, l.id) !== at(draft.slot_plan, l.id));
  const plan = { ...draft.slot_plan };
  for (const c of CARDS) {
    if (base.on[c.key] !== draft.on[c.key]) {
      const via = viaKey(c.key);
      const value = via === "send_paused" ? !draft.on[c.key] : via === "followup_enabled" ? draft.on[c.key] : null;
      add({ card: c.key, key: via, part: "an", label: c.name, from: base.on[c.key], to: draft.on[c.key], text: `${c.name} ${onOff(base.on[c.key])} → ${onOff(draft.on[c.key])}`, value });
    }
    if (c.key === "lead-werk" && base.autopilot !== draft.autopilot) {
      add({ card: c.key, key: "slot_autopilot", part: "autopilot", label: "Autopilot", from: base.autopilot, to: draft.autopilot,
        text: `Autopilot ${onOff(base.autopilot)} → ${onOff(draft.autopilot)}`, value: { on: draft.autopilot, locks: saved.slot_autopilot?.locks ?? {} } });
    }
    if (c.key === "lead-werk" && planChanged(leadLanes(reg))) {
      const n0 = leadTotal(base.slot_plan, reg), n1 = leadTotal(draft.slot_plan, reg);
      const before = out.length;
      if (n0 !== n1) add({ card: c.key, key: "slot_plan", part: "tempo", label: "Tempo", from: n0, to: n1, text: `Tempo ${n0} → ${n1} Plätze`, value: plan });
      for (const lc of LEAD_COUNTRIES) {
        const a = countryOn(base.slot_plan, reg, lc.id), b = countryOn(draft.slot_plan, reg, lc.id);
        if (a !== b) add({ card: c.key, key: "slot_plan", part: `land:${lc.id}`, label: `Leads ${lc.label}`, from: a, to: b, text: `Leads ${lc.label} ${onOff(a)} → ${onOff(b)}`, value: plan });
      }
      if (out.length === before) add({ card: c.key, key: "slot_plan", part: "belegung", label: "Belegung", from: null, to: null, text: "Belegung der Linien angepasst", value: plan });
    }
    if (c.key === "kunden-werk") {
      for (const l of reg.lanes.filter((x) => x.werk === "kunden-werk")) {
        const a = at(base.slot_plan, l.id), b = at(draft.slot_plan, l.id);
        if (a !== b) add({ card: c.key, key: "slot_plan", part: `linie:${l.id}`, label: "Plätze", from: a, to: b, text: `Plätze ${a} → ${b}`, value: plan });
      }
      const off = [...draft.buyer_countries_off].sort();
      for (const cc of ctx.buyerCountries) {
        const a = !base.buyer_countries_off.includes(cc), b = !off.includes(cc);
        if (a !== b) add({ card: c.key, key: "buyer_countries_off", part: `land:${cc}`, label: `Käufer ${cc}`, from: a, to: b, text: `Käufer ${cc} ${onOff(a)} → ${onOff(b)}`, value: off });
      }
    }
    if (c.key === "proben-vorrat") {
      const changed = ctx.pages.filter((k) => base.sample_targets[k] !== draft.sample_targets[k]);
      const value = { ...(saved.sample_targets ?? {}), ...Object.fromEntries(changed.map((k) => [k, draft.sample_targets[k]])) };
      for (const k of changed) add({ card: c.key, key: "sample_targets", part: `soll:${k}`, label: `Soll ${k}`, from: base.sample_targets[k], to: draft.sample_targets[k], value });
      if (base.sample_max_age_hours !== draft.sample_max_age_hours) {
        add({ card: c.key, key: "sample_max_age_hours", part: "verfall", label: "Verfall", from: base.sample_max_age_hours, to: draft.sample_max_age_hours, text: `Verfall ${base.sample_max_age_hours} → ${draft.sample_max_age_hours} h`, value: draft.sample_max_age_hours });
      }
    }
    if (c.key === "nachfass" && base.followup_days !== draft.followup_days) {
      add({ card: c.key, key: "followup_days", part: "tage", label: "Tage", from: base.followup_days, to: draft.followup_days, text: `Nachfass nach ${base.followup_days} → ${draft.followup_days} Tagen`, value: draft.followup_days });
    }
  }
  return out;
}

/** Neue Werte je owner_settings-Schlüssel. werke_paused: Gespeichertes bleibt (mit Zeitstempel), Ausschalten = jetzt. */
export function toSettings(changes: Change[], saved: OwnerSettings, nowIso: string): Partial<OwnerSettings> {
  const out: Partial<Record<SettingKey, unknown>> = {};
  let wp: Record<string, string> | null = null;
  for (const c of changes) {
    if (c.key === "werke_paused") {
      wp ??= { ...(saved.werke_paused ?? {}) };
      if (c.to) delete wp[c.card];
      else wp[c.card] = nowIso;
    } else out[c.key] = c.value;
  }
  if (wp) out.werke_paused = wp;
  return out as Partial<OwnerSettings>;
}

/**
 * Prüft einen Wert vor dem Speichern – gleiche Grenzen wie lib/owner-settings.ts. Wirft InputError.
 * sample_targets: wie saveSampleTargets nur die Regler-Seiten (ctx.pages); andere Seiten müssen unverändert aus
 * `saved` kommen (nie neue Seiten-Ziele über den Regler).
 */
export function validateValue(key: SettingKey, value: unknown, ctx: ReglerCtx, saved?: OwnerSettings): unknown {
  const obj = (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new InputError(`${key}: ungültig`);
    return v as Record<string, unknown>;
  };
  switch (key) {
    case "send_paused": case "followup_enabled":
      if (typeof value !== "boolean") throw new InputError(`${key}: an/aus`);
      return value;
    case "werke_paused": {
      const v = obj(value);
      for (const [k, t] of Object.entries(v)) {
        if (!(k in WERK_SWITCHES) || WERK_SWITCHES[k as WerkKey].via !== "werke_paused") throw new InputError("unbekanntes Werk");
        if (typeof t !== "string" || Number.isNaN(Date.parse(t))) throw new InputError(`${k}: Zeit ungültig`);
      }
      return v;
    }
    case "slot_plan": return validateSlotPlan(obj(value), ctx.reg);
    case "slot_autopilot": {
      const v = obj(value);
      if (typeof v.on !== "boolean") throw new InputError("Autopilot: an/aus");
      const locks = v.locks === undefined ? {} : obj(v.locks);
      const out: Record<string, number> = {};
      for (const [k, n] of Object.entries(locks)) {
        const lane = ctx.reg.lanes.find((l) => l.id === k);
        if (!lane || typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > lane.max) throw new InputError(`Autopilot: ${k} ungültig`);
        out[k] = n;
      }
      return { on: v.on, locks: out };
    }
    case "sample_targets": {
      const v = obj(value), old = saved?.sample_targets ?? {};
      const rest = Object.keys(v).filter((k) => !ctx.pages.includes(k));
      if (rest.some((k) => !(k in old) || old[k] !== v[k])) throw new InputError("Seite ungültig");
      return { ...Object.fromEntries(rest.map((k) => [k, old[k]])), ...validateSampleTargets(v, ctx.pages.filter((k) => k in v)) };
    }
    case "sample_max_age_hours": return validateMaxAge(value);
    case "followup_days": return validateFollowupDays(value);
    case "buyer_countries_off": {
      if (!Array.isArray(value) || value.some((c) => typeof c !== "string" || !ctx.buyerCountries.includes(c))) throw new InputError("unbekanntes Land");
      return [...new Set(value as string[])].sort();
    }
    default: throw new InputError(`${key}: nicht im Regler`);
  }
}

// ------------------------------------------------------------------------------------------------ Zustand
export type Ack = { werk: string; key: string; seen_at: string; value: unknown };
export type StatusKind = "angewandt" | "erreicht" | "wartet" | "start angefordert" | "noch nie geändert";
export type CardStatus = {
  kind: StatusKind; text: string;
  /** ② übernommen: letzte Speicherung eines Schlüssels der Karte */
  savedAt: string | null;
  /** ③ angewandt: Quittung des Werks */
  at: string | null; werk: string;
  /** erwartete Anwendung (nächster Lauf bzw. Wachhund) */
  next: string | null;
};

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/** Teil eines Schlüssels, der dieses Werk betrifft (gemeinsame Schlüssel: werke_paused, slot_plan). */
function slice(card: Card, key: SettingKey, v: unknown, reg?: LaneRegistry): string {
  if (key === "werke_paused") return String(!!(v as Record<string, string> | null)?.[card.key]);
  if (key === "slot_plan" && reg) {
    const n = slotCounts(reg, v as Record<string, number> | null);
    return stable(reg.lanes.filter((l) => l.werk === card.key).map((l) => n[l.id]));
  }
  return stable(v ?? null);
}

/**
 * Zustand einer Karte: „angewandt“ (Werk hat jeden geänderten Schlüssel nach der Speicherung gelesen – oder liest
 * schon denselben Wert), „start angefordert“ (offener Direktstart -> nächster Wachhund), „wartet“ (nächster Lauf
 * nach Zeitplan) oder „noch nie geändert“ (Standard).
 */
export function status(cardKey: CardKey, o: {
  updatedAt: Partial<Record<SettingKey, string | null>>; acks: Ack[]; startRequests: Pick<StartRequest, "workflow" | "status" | "created_at" | "started_at">[];
  now: Date; saved?: OwnerSettings; reg?: LaneRegistry;
  /** gemessen erreicht (Proben-Vorrat: jede Seite hat ihr Soll) – zählt nur nach einem planmäßigen Lauf seit dem Speichern */
  reached?: boolean;
}): CardStatus {
  const c = cardOf(cardKey);
  const ackOf = (k: SettingKey) => o.acks.filter((a) => a.werk === c.werk && a.key === k).sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1))[0];
  // gemeinsamer Schlüssel ohne Quittung, dessen Teil für dieses Werk noch Standard ist: für diese Karte nie geändert
  const untouched = (k: SettingKey) => (k === "werke_paused" || k === "slot_plan") && !ackOf(k) && !!o.saved
    && slice(c, k, o.saved[k], o.reg) === slice(c, k, DEFAULTS[k], o.reg);
  const keys = c.keys.filter((k) => o.updatedAt[k] && !untouched(k));
  const base = { werk: c.name, at: null, next: null };
  if (!keys.length) return { ...base, kind: "noch nie geändert", text: "Standard", savedAt: null };
  const savedAt = keys.map((k) => o.updatedAt[k]!).sort().at(-1)!;
  const applied = (k: SettingKey) => {
    const a = ackOf(k);
    if (!a) return false;
    const same = !o.saved || slice(c, k, a.value, o.reg) === slice(c, k, o.saved[k], o.reg);
    // Quittung nach dem Speichern zählt nur mit dem gespeicherten Wert (sonst hat das Werk noch den alten gelesen)
    if (Date.parse(a.seen_at) >= Date.parse(o.updatedAt[k]!)) return same;
    return !!o.saved && same;
  };
  const pending = keys.filter((k) => !applied(k));
  if (!pending.length) {
    const at = keys.map((k) => ackOf(k)!.seen_at).sort().at(-1)!;
    return { ...base, kind: "angewandt", text: `angewandt ${fmtWhen(at, o.now)} (${c.name})`, savedAt, at };
  }
  if (o.reached && pending.every((k) => k === "sample_targets") && (!o.saved || werkOn(o.saved, c.key).on)
    && Date.parse(savedAt) < prevRun(c.cron, o.now).getTime()) {
    return { ...base, kind: "erreicht", text: "erreicht – Vorrat hat das Soll", savedAt };
  }
  const t = o.now.getTime();
  if (c.start) {
    const mine = o.startRequests.filter((r) => r.workflow === c.start).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const open = mine.find((r) => r.status === "offen" && t - Date.parse(r.created_at) < START_MAX_AGE_MIN * 60_000);
    if (open) {
      const next = nextPickup(o.now);
      return { ...base, kind: "start angefordert", text: `Start angefordert – spätestens ${fmtWhen(next, o.now)}`, savedAt, next: next.toISOString() };
    }
    const started = mine.find((r) => r.status === "gestartet" && Date.parse(r.started_at ?? r.created_at) >= Date.parse(savedAt));
    if (started) return { ...base, kind: "wartet", text: `gestartet ${fmtWhen(started.started_at ?? started.created_at, o.now)} – wird gerade angewandt`, savedAt };
  }
  if (o.saved && !werkOn(o.saved, c.key).on && pending.some((k) => k !== viaKey(c.key))) {
    return { ...base, kind: "wartet", text: "pausiert – greift nach dem Einschalten", savedAt };
  }
  const next = cardNext(c, o.now);
  return { ...base, kind: "wartet", text: `wird angewandt um ca. ${fmtWhen(next, o.now)}`, savedAt, next: next.toISOString() };
}
