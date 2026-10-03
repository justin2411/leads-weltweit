/**
 * Leitstand (Inhaber 03.10.2026: „die werke wie maschinen steuern … wv plätze werden belegt … sei mein coach“).
 * Reine Funktionen ohne Next/Supabase (testbar): Plätze (GitHub-Jobs) aus Herzschlägen, Ertrag je Linie aus run_stats,
 * Auslastung über die Zeit und ehrliche Empfehlungen aus echten Zahlen (keine Schätzungen ohne Hinweis).
 */
import type { LaneRegistry } from "./owner-settings";

export type RunRow = { werk: string; part: string | null; country: string | null; started_at: string | null; finished_at: string; processed: number; green: number; yellow?: number; red?: number };
export type Beat = { werk: string; part: string; started_at: string | null; beat_at: string; processed: number; green: number; note: string | null };

const MIN = 60_000;
const mins = (a: string | null | undefined, b: number) => (a ? (b - Date.parse(a)) / MIN : Infinity);

/** Linie eines Teils: lead-werk „web-us-3“ -> web-us; kunden-werk „pruefen 2/8“ -> kunden; sonst null. */
export function laneOf(werk: string, part: string | null | undefined): string | null {
  if (!part) return null;
  if (werk === "lead-werk") return /-\d+$/.test(part) ? part.replace(/-\d+$/, "") : part;
  // Kunden-Werk: Herzschlag „pruefen 2/8“, Laufzähler „run --shard 2/8 …“ (nachpruefen ist kein Teil einer Linie)
  if (werk === "kunden-werk") return /^pruefen\b|^run --shard/.test(part) ? "kunden" : null;
  return null;
}

/** Läuft der Teil gerade? (Herzschlag jünger als 6 min und nicht „fertig/abgebrochen“) */
export function running(b: Beat, now: number): boolean {
  return mins(b.beat_at, now) <= 6 && !/^(fertig|abgebrochen)/.test(b.note ?? "");
}

export type Bay = { n: number; state: "run" | "plan" | "free" | "reserve" | "other"; lane: string | null; part: string | null; werk: string | null; processed: number; green: number; runMin: number | null };

/**
 * Die 40 Plätze als Halle: zuerst laufende Teile (nach Linie sortiert), dann eingeplante, aber gerade leere Plätze
 * je Linie, dann freie Plätze; die letzten `reserve` Plätze sind für Versand, Tagescheck und Wachhund reserviert
 * (dort zeigen laufende andere Werke wie Proben-Vorrat ihre Belegung).
 */
export function hall(reg: LaneRegistry, plan: Record<string, number>, beats: Beat[], now: number): Bay[] {
  const order = reg.lanes.map((l) => l.id);
  const live = beats.filter((b) => running(b, now));
  const laneLive = live.filter((b) => laneOf(b.werk, b.part)).sort((a, b) =>
    order.indexOf(laneOf(a.werk, a.part)!) - order.indexOf(laneOf(b.werk, b.part)!) || a.part.localeCompare(b.part, "de", { numeric: true }));
  const other = live.filter((b) => !laneOf(b.werk, b.part));
  const bays: Bay[] = [];
  const cap = reg.total_slots - reg.reserve;
  for (const b of laneLive.slice(0, reg.total_slots)) {
    bays.push({ n: 0, state: "run", lane: laneOf(b.werk, b.part), part: b.part, werk: b.werk, processed: b.processed, green: b.green, runMin: b.started_at ? Math.max(0, Math.round(mins(b.started_at, now))) : null });
  }
  for (const id of order) {
    const used = laneLive.filter((b) => laneOf(b.werk, b.part) === id).length;
    const lane = reg.lanes.find((l) => l.id === id)!;
    for (let i = used; i < (plan[id] ?? 0) && bays.length < cap; i++) bays.push({ n: 0, state: "plan", lane: id, part: null, werk: lane.werk, processed: 0, green: 0, runMin: null });
  }
  while (bays.length < cap) bays.push({ n: 0, state: "free", lane: null, part: null, werk: null, processed: 0, green: 0, runMin: null });
  for (const b of other.slice(0, reg.reserve)) bays.push({ n: 0, state: "other", lane: null, part: b.part, werk: b.werk, processed: b.processed, green: b.green, runMin: b.started_at ? Math.round(mins(b.started_at, now)) : null });
  while (bays.length < reg.total_slots) bays.push({ n: 0, state: "reserve", lane: null, part: null, werk: null, processed: 0, green: 0, runMin: null });
  return bays.slice(0, reg.total_slots).map((b, i) => ({ ...b, n: i + 1 }));
}

export type LaneStat = { id: string; runs: number; processed: number; green: number; slotMin: number; perSlotH: number | null; avgRunMin: number | null; perRun: number | null; last: string | null; exhausted: boolean };

/** Ertrag je Linie im Fenster (Standard 24 h): grüne Leads bzw. Käufer je Platz-Stunde, Laufzeit je Teil. */
export function laneStats(reg: LaneRegistry, rows: RunRow[], now: number, hours = 24): Record<string, LaneStat> {
  const out: Record<string, LaneStat> = {};
  for (const l of reg.lanes) out[l.id] = { id: l.id, runs: 0, processed: 0, green: 0, slotMin: 0, perSlotH: null, avgRunMin: null, perRun: null, last: null, exhausted: false };
  for (const r of rows) {
    if (mins(r.finished_at, now) > hours * 60) continue;
    const id = laneOf(r.werk, r.part);
    const s = id ? out[id] : null;
    if (!s) continue;
    s.runs += 1;
    s.processed += r.processed || 0;
    s.green += r.green || 0;
    if (r.started_at) s.slotMin += Math.max(0, (Date.parse(r.finished_at) - Date.parse(r.started_at)) / MIN);
    if (!s.last || r.finished_at > s.last) s.last = r.finished_at;
  }
  for (const s of Object.values(out)) {
    if (!s.runs) continue;
    s.avgRunMin = s.slotMin / s.runs;
    s.perRun = s.green / s.runs;
    s.perSlotH = s.slotMin >= 1 ? (s.green / s.slotMin) * 60 : null;
    // erschöpft: Teile sind im Schnitt nach < 10 min fertig (Werk hat Zeit für 75–90 min) – der Vorrat reicht nicht
    s.exhausted = s.avgRunMin < 10;
  }
  return out;
}

/**
 * Belegte Plätze über die Zeit (Mittel je Abschnitt) aus run_stats (Start–Ende je Teil) und laufenden Herzschlägen.
 * Ergebnis: je Abschnitt Plätze im Mittel und die Auslastung gesamt (belegte Platz-Minuten / verfügbare).
 */
export function utilization(rows: RunRow[], beats: Beat[], now: number, total: number, hours = 24, stepMin = 30, countedSince: number | null = null) {
  const t0 = now - hours * 60 * MIN;
  // Auslastung nur über die Zeit, in der schon gezählt wird (run_stats seit 03.10.2026) – sonst wirkt sie zu niedrig
  const c0 = Math.max(t0, countedSince ?? t0);
  const n = Math.round((hours * 60) / stepMin);
  const buckets = Array.from({ length: n }, (_, i) => ({ from: new Date(t0 + i * stepMin * MIN).toISOString(), slots: 0 }));
  const iv: [number, number][] = [];
  for (const r of rows) if (r.started_at && (r.werk === "lead-werk" || r.werk === "kunden-werk")) iv.push([Date.parse(r.started_at), Date.parse(r.finished_at)]);
  for (const b of beats) if (b.started_at && running(b, now)) iv.push([Date.parse(b.started_at), now]);
  let used = 0;
  for (const [a, b] of iv) {
    const s = Math.max(a, t0), e = Math.min(b, now);
    if (e <= s) continue;
    used += (e - s) / MIN;
    for (let i = Math.floor((s - t0) / (stepMin * MIN)); i < n && t0 + i * stepMin * MIN < e; i++) {
      const bs = t0 + i * stepMin * MIN, be = bs + stepMin * MIN;
      buckets[i].slots += Math.max(0, Math.min(e, be) - Math.max(s, bs)) / (stepMin * MIN);
    }
  }
  const span = Math.max(stepMin, (now - c0) / MIN);
  return { buckets: buckets.map((b) => ({ ...b, slots: Math.round(b.slots * 10) / 10, counted: Date.parse(b.from) + stepMin * MIN > c0 })), rate: Math.min(1, used / (span * total)), since: new Date(c0).toISOString() };
}

export type Tip = { level: "rot" | "gelb" | "gruen" | "info"; title: string; text: string; href?: string };

/**
 * Coach: Empfehlungen aus echten Zahlen. Jede nennt den Messwert, auf dem sie beruht. Keine Garantien, keine
 * erfundenen Werte – wo Daten fehlen (z. B. erst wenige Läufe gezählt), sagt sie das.
 */
export function coach(o: {
  reg: LaneRegistry; plan: Record<string, number>; stats: Record<string, LaneStat>; util: number;
  queue: Record<string, number>; freeBuyers: Record<string, number>; leads: Record<string, number>; capPerDay: number;
  kundenNew24h: number | null; failed: string[]; countedHours?: number;
}): Tip[] {
  const tips: Tip[] = [];
  const pct = Math.round(o.util * 100);
  const measured = Object.values(o.stats).filter((s) => s.runs > 0);
  const span = o.countedHours ?? 24;
  if (measured.length && pct < 50 && span >= 2) {
    tips.push({ level: "gelb", title: `Plätze ${100 - pct} % der Zeit leer`, text: `In den letzten ${span >= 23.5 ? "24 h" : `${Math.round(span)} h (seit Beginn der Zählung)`} waren im Schnitt nur ${pct} % der ${o.reg.total_slots} Plätze belegt. Ein Werk startet erst neu, wenn sein langsamster Teil fertig ist – kurze Teile warten so auf lange. Plätze aus erschöpften Linien abziehen und an ergiebige geben.`, href: "#pult" });
  }
  for (const s of measured) {
    const lane = o.reg.lanes.find((l) => l.id === s.id)!;
    if (s.exhausted && (o.plan[s.id] ?? 0) > 1) {
      tips.push({ level: "gelb", title: `${lane.label}: Vorrat erschöpft`, text: `Teile sind im Schnitt nach ${Math.round(s.avgRunMin ?? 0)} min fertig (Zeitfenster 75 min), ${Math.round(s.perRun ?? 0)} grüne je Teil. ${o.plan[s.id]} Plätze sind hier zu viel – 1–2 reichen für Neuzugänge.`, href: "#pult" });
    }
  }
  const best = measured.filter((s) => s.perSlotH !== null && !s.exhausted).sort((a, b) => (b.perSlotH ?? 0) - (a.perSlotH ?? 0))[0];
  if (best) {
    const lane = o.reg.lanes.find((l) => l.id === best.id)!;
    if ((o.plan[best.id] ?? 0) < lane.max) tips.push({ level: "gruen", title: `Ergiebigste Linie: ${lane.label}`, text: `${Math.round(best.perSlotH ?? 0)} grüne je Platz-Stunde in den letzten 24 h. Freie Plätze bringen hier am meisten (${o.plan[best.id] ?? 0} von max. ${lane.max} belegt).`, href: "#pult" });
  }
  for (const [c, q] of Object.entries(o.queue)) {
    const free = o.freeBuyers[c] ?? 0;
    if (q > 0 && free < q) tips.push({ level: "gelb", title: `${c}: Käufer werden knapp`, text: `${q.toLocaleString("de-DE")} Mails warten, aber nur ${free.toLocaleString("de-DE")} mail-fähige Käufer sind noch ohne Mail. Nachschub kommt nur noch aus der Nachprüfung – neue Käuferquelle für ${c} nötig.`, href: "/dashboard/bestand" });
  }
  const totalQ = Object.values(o.queue).reduce((a, b) => a + b, 0);
  if (o.capPerDay > 0 && totalQ > 0) {
    const days = Math.round(totalQ / o.capPerDay);
    tips.push({ level: days > 14 ? "info" : "gelb", title: `Versand: Warteschlange reicht ${days} Tage`, text: `${totalQ.toLocaleString("de-DE")} geprüfte Mails warten bei ${o.capPerDay} Mails/Tag Kapazität (alle Postfächer). ${days > 14 ? "Engpass ist der Versand, nicht die Käufer – mehr Postfächer würden schneller Antworten bringen (kostet Geld, nur mit deinem Ja)." : "Bald neue Käufer nötig."}`, href: "/dashboard/versand" });
  }
  const leadsAll = Object.values(o.leads).reduce((a, b) => a + b, 0);
  const freeAll = Object.values(o.freeBuyers).reduce((a, b) => a + b, 0);
  if (leadsAll > 0 && freeAll > 0 && leadsAll / freeAll > 10) {
    tips.push({ level: "info", title: "Leads reichen weit, Käufer sind der Hebel", text: `${leadsAll.toLocaleString("de-DE")} lieferbare Leads stehen ${freeAll.toLocaleString("de-DE")} freien Käufern gegenüber. Mehr Leads bringen gerade keinen Umsatz – Umsatz entsteht über Antworten der Käufer.` });
  }
  if (o.kundenNew24h === 0) tips.push({ level: "gelb", title: "Kunden-Werk findet keine neuen Käufer", text: "In 24 h kein neuer Käufer – die Overture-Liste ist durchgeprüft. Plätze im Kunden-Werk bringen erst mit einer neuen Quelle wieder etwas (Auftrag an den Quellen-Scout).", href: "#pult" });
  for (const f of o.failed) tips.push({ level: "rot", title: "Teil abgebrochen", text: f });
  if (!measured.length) tips.push({ level: "info", title: "Noch keine Laufzahlen", text: "Ertrag je Linie wird seit dem 03.10.2026 je Lauf gezählt – nach den nächsten Läufen erscheinen hier Empfehlungen." });
  const rank = { rot: 0, gelb: 1, gruen: 2, info: 3 } as const;
  return tips.sort((a, b) => rank[a.level] - rank[b.level]);
}
