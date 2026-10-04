/**
 * Leitstand (Inhaber 03.10.2026: „die werke wie maschinen steuern … wv plätze werden belegt … sei mein coach“).
 * Reine Funktionen ohne Next/Supabase (testbar): Plätze (GitHub-Jobs) aus Herzschlägen, Ertrag je Linie aus run_stats,
 * Auslastung über die Zeit und ehrliche Empfehlungen aus echten Zahlen (keine Schätzungen ohne Hinweis).
 */
import type { LaneRegistry } from "./owner-settings";
import { inferTask, mailMarkets, marketsIn } from "./agents.ts";

export type RunRow = { werk: string; part: string | null; country: string | null; started_at: string | null; finished_at: string; processed: number; green: number; yellow?: number; red?: number; run_id?: string | null; candidates?: number };

/**
 * Ein Eintrag je Teil und Lauf: Werke schreiben mehrere run_stats-Zeilen je Teil (eine je Zielgruppe/Land – Lead-Werk
 * 4, Kunden-Werk bis ~25). Ohne Zusammenfassen zählten Laufzeit und Auslastung mehrfach (Nachtschicht 04.10.2026).
 */
export function partRuns(rows: RunRow[]): RunRow[] {
  const by = new Map<string, RunRow>();
  for (const r of rows) {
    const k = `${r.werk}|${r.run_id ?? r.started_at ?? ""}|${r.part ?? ""}`;
    const o = by.get(k);
    if (!o) { by.set(k, { ...r, processed: r.processed || 0, green: r.green || 0, candidates: r.candidates ?? undefined }); continue; }
    o.processed += r.processed || 0;
    o.green += r.green || 0;
    if (r.candidates !== undefined) o.candidates = (o.candidates ?? 0) + (r.candidates || 0);
    if (r.started_at && (!o.started_at || r.started_at < o.started_at)) o.started_at = r.started_at;
    if (r.finished_at > o.finished_at) o.finished_at = r.finished_at;
  }
  return [...by.values()];
}
export type Beat = { werk: string; part: string; started_at: string | null; beat_at: string; processed: number; green: number; note: string | null };

const MIN = 60_000;
const mins = (a: string | null | undefined, b: number) => (a ? (b - Date.parse(a)) / MIN : Infinity);

/** Linie eines Teils: lead-werk „web-us-3“ -> web-us; kunden-werk „pruefen 2/8“ -> kunden; sonst null. */
export function laneOf(werk: string, part: string | null | undefined): string | null {
  if (!part) return null;
  if (werk === "lead-werk") return /-\d+$/.test(part) ? part.replace(/-\d+$/, "") : part;
  // Kunden-Werk: Herzschlag „pruefen 2/8“, Laufzähler „run --shard 2/8 …“ (nachpruefen ist kein Teil einer Linie)
  if (werk === "kunden-werk") return /^pruefen\b|^run --shard/.test(part) ? "kunden" : null;
  // Prüfer-Werk (05.10.2026): Herzschlag/Laufzähler „pruefer-2“ (wie scripts/werk_plan.py lane_of)
  if (werk === "pruefer-werk") return /^(pruefer\b|pruefer-\d+|run --shard)/.test(part) ? "pruefer" : null;
  // Kontakt-Werk (05.10.2026): „kontakt-1“ bzw. „run --shard …“
  if (werk === "kontakt-werk") return /^(kontakt\b|kontakt-\d+|run --shard)/.test(part) ? "kontakt" : null;
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

export type LaneStat = { id: string; runs: number; processed: number; green: number; slotMin: number; perSlotH: number | null; avgRunMin: number | null; perRun: number | null; last: string | null; exhausted: boolean; empty?: boolean };

/** Anfang des Autopilot-Grundes für Linien ohne Kandidaten-Vorrat (scripts/werk_plan.py EMPTY_WHY). */
export const EMPTY_WHY = "Vorrat leer";

/**
 * Linien, die der Autopilot zuletzt als „Vorrat leer“ geführt hat (Scout 04.10.2026: web-uk/web-fr liefen mit
 * 0 Kandidaten): markiert sie in den Ertragszahlen (empty = true). Gründe aus werk_plan_log je Werk.
 */
export function markEmpty(stats: Record<string, LaneStat>, reasons: (Record<string, string> | null | undefined)[]): Record<string, LaneStat> {
  for (const r of reasons) for (const [id, why] of Object.entries(r ?? {})) if (stats[id] && String(why ?? "").startsWith(EMPTY_WHY)) stats[id].empty = true;
  return stats;
}

/** Ertrag je Linie im Fenster (Standard 24 h): grüne Leads bzw. Käufer je Platz-Stunde, Laufzeit je Teil. */
export function laneStats(reg: LaneRegistry, rows: RunRow[], now: number, hours = 24): Record<string, LaneStat> {
  const out: Record<string, LaneStat> = {};
  for (const l of reg.lanes) out[l.id] = { id: l.id, runs: 0, processed: 0, green: 0, slotMin: 0, perSlotH: null, avgRunMin: null, perRun: null, last: null, exhausted: false };
  for (const r of partRuns(rows)) {
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
  for (const r of partRuns(rows)) if (r.started_at && (r.werk === "lead-werk" || r.werk === "kunden-werk" || r.werk === "pruefer-werk" || r.werk === "kontakt-werk")) iv.push([Date.parse(r.started_at), Date.parse(r.finished_at)]);
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

/** Fertiger Auftrag zu einem Hinweis (Inhaber 03.10.2026: „die gelben sachen … ziehen können und dieses problem agents
 *  geben, das die das ausführen“): Art, Markt und Auftragstext für agent_tasks (Grenzen wie validateTask). */
export type TipTask = { kind: "leads" | "kaeufer" | "quelle" | "pruefen" | "frage"; market: string | null; brief: string };
export type Tip = { level: "rot" | "gelb" | "gruen" | "info"; title: string; text: string; href?: string; task?: TipTask };

const MARKET = new Set(["US", "UK", "FR", "IE", "NL", "BE", "SE", "FI", "SG", "HK", "MX", "BR"]);
const marketOf = (c: string | null | undefined) => (c && MARKET.has(c) ? c : null);

/** Alarme vor den Werk-Hinweisen (Nachtschicht 04.10.2026, Plan Paket 5 „Alarmleiste“): offene Antworten von
 *  Interessenten und ein leerer Proben-Vorrat. null/unbekannt = kein Alarm (nie aus fehlenden Zahlen warnen). */
export function alarmTips(o: { openReplies: number | null; samplesReady: number | null; samplesTarget: number }): Tip[] {
  const tips: Tip[] = [];
  if (o.openReplies && o.openReplies > 0) {
    const n = o.openReplies;
    tips.push({ level: "gelb", title: n === 1 ? "1 Antwort offen" : `${n} Antworten offen`, text: "Interessenten haben geantwortet – im Antworten-Cockpit lesen und mit einem Klick antworten.", href: "/dashboard/antworten" });
  }
  if (o.samplesReady === 0 && o.samplesTarget > 0) {
    tips.push({ level: "gelb", title: "Proben-Vorrat leer", text: `0 von ${o.samplesTarget} Proben bereit. Eine Probe-Anfrage wartet dann bis zum nächsten Bau (stündlich) – oder Station Proben → Jetzt starten.`, href: "/dashboard/proben" });
  }
  return tips;
}

const LEVEL_RANK: Record<Tip["level"], number> = { rot: 0, gelb: 1, gruen: 2, info: 3 };

/** Wichtigstes zuerst: rot vor gelb vor grün vor Info, bei gleicher Stufe in der gegebenen Reihenfolge. */
export function rankTips<T extends Pick<Tip, "level">>(tips: T[]): T[] {
  return tips.map((x, i) => ({ x, i })).sort((a, b) => LEVEL_RANK[a.x.level] - LEVEL_RANK[b.x.level] || a.i - b.i).map(({ x }) => x);
}

/** Auftrag zum Engpass der Kette (Ampel „Engpass“): nur auswerten und vorschlagen, nie senden. */
export function neckTask(label: string): TipTask {
  return { kind: "frage", market: null, brief: `Engpass „${label}“: Ursachen aus echten Zahlen finden und 2–3 konkrete Verbesserungen vorschlagen, die nichts kosten. Nichts senden, keine Prüfregeln ändern.` };
}

/**
 * Coach: Empfehlungen aus echten Zahlen. Jede nennt den Messwert, auf dem sie beruht. Keine Garantien, keine
 * erfundenen Werte – wo Daten fehlen (z. B. erst wenige Läufe gezählt), sagt sie das.
 */
export function coach(o: {
  reg: LaneRegistry; plan: Record<string, number>; stats: Record<string, LaneStat>; util: number;
  queue: Record<string, number>; freeBuyers: Record<string, number>; leads: Record<string, number>; capPerDay: number;
  kundenNew24h: number | null; failed: string[]; countedHours?: number;
  /** false, solange der Bestand (Leads/Käufer) noch nicht geladen ist – dann keine Hinweise aus fehlenden Zahlen */
  stockKnown?: boolean;
  /** Autopilot verteilt die Plätze selbst (Nachtschicht 04.10.2026): Platz-Hinweise nur zur Info, ohne Auftrag */
  autopilot?: boolean;
}): Tip[] {
  const tips: Tip[] = [];
  const pct = Math.round(o.util * 100);
  const measured = Object.values(o.stats).filter((s) => s.runs > 0);
  const span = o.countedHours ?? 24;
  if (measured.length && pct < 50 && span >= 2 && o.autopilot) {
    tips.push({ level: "info", title: `Plätze ${100 - pct} % der Zeit leer`, text: `In den letzten ${span >= 23.5 ? "24 h" : `${Math.round(span)} h`} waren im Schnitt nur ${pct} % der ${o.reg.total_slots} Plätze belegt. Der Autopilot verteilt die Plätze bei jedem Start neu nach dem Ertrag der letzten Läufe – nichts zu tun.`, href: "#pult" });
  } else if (measured.length && pct < 50 && span >= 2) {
    tips.push({ level: "gelb", title: `Plätze ${100 - pct} % der Zeit leer`, text: `In den letzten ${span >= 23.5 ? "24 h" : `${Math.round(span)} h (seit Beginn der Zählung)`} waren im Schnitt nur ${pct} % der ${o.reg.total_slots} Plätze belegt. Ein Werk startet erst neu, wenn sein langsamster Teil fertig ist – kurze Teile warten so auf lange. Plätze aus erschöpften Linien abziehen und an ergiebige geben.`, href: "#pult",
      task: { kind: "leads", market: null, brief: `Plätze ${100 - pct} % der Zeit leer: Belegung umstellen – erschöpfte Linien auf 1–2 Plätze, freie Plätze an die ergiebigsten Linien, dann Lead-Werk starten. Ergebnis: Auslastung und grüne Leads vorher/nachher.` } });
  }
  for (const s of Object.values(o.stats).filter((x) => x.empty)) {
    const lane = o.reg.lanes.find((l) => l.id === s.id);
    if (!lane) continue;
    tips.push({ level: "info", title: `${lane.label}: Vorrat leer`, text: "Keine Kandidaten mehr. Der Autopilot gibt die Plätze an ertragreiche Linien und prüft alle 4 h mit einem Platz nach.", href: "#pult",
      task: { kind: "quelle", market: marketOf(lane.country), brief: `${lane.label}: Vorrat leer. Neue kostenlose, erlaubte Quelle für diese Linie finden, mit mindestens 10 grünen Leads testen und ins Lead-Werk einbauen.` } });
  }
  for (const s of measured) {
    const lane = o.reg.lanes.find((l) => l.id === s.id)!;
    if (s.empty) continue;
    if (s.exhausted && (o.plan[s.id] ?? 0) > 1 && o.autopilot) {
      tips.push({ level: "info", title: `${lane.label}: Vorrat erschöpft`, text: `Teile sind im Schnitt nach ${Math.round(s.avgRunMin ?? 0)} min fertig, ${Math.round(s.perRun ?? 0)} grüne je Teil. Der Autopilot lässt der Linie beim nächsten Start einen Wachplatz. Mehr Leads gibt es hier nur mit einer neuen Quelle.`, href: "#pult",
        task: { kind: "quelle", market: marketOf(lane.country), brief: `${lane.label}: Vorrat erschöpft. Neue kostenlose, erlaubte Quelle oder mehr Kandidaten für diese Linie finden, mit mindestens 10 grünen Leads testen und ins Lead-Werk einbauen.` } });
    } else if (s.exhausted && (o.plan[s.id] ?? 0) > 1) {
      tips.push({ level: "gelb", title: `${lane.label}: Vorrat erschöpft`, text: `Teile sind im Schnitt nach ${Math.round(s.avgRunMin ?? 0)} min fertig (Zeitfenster 75 min), ${Math.round(s.perRun ?? 0)} grüne je Teil. ${o.plan[s.id]} Plätze sind hier zu viel – 1–2 reichen für Neuzugänge.`, href: "#pult",
        task: { kind: "quelle", market: marketOf(lane.country), brief: `${lane.label}: Vorrat erschöpft. Neue kostenlose, erlaubte Quelle oder mehr Kandidaten für diese Linie finden, mit mindestens 10 grünen Leads testen und ins Lead-Werk einbauen; Plätze dieser Linie bis dahin auf 1–2 setzen.` } });
    }
  }
  const best = measured.filter((s) => s.perSlotH !== null && !s.exhausted && !s.empty).sort((a, b) => (b.perSlotH ?? 0) - (a.perSlotH ?? 0))[0];
  if (best) {
    const lane = o.reg.lanes.find((l) => l.id === best.id)!;
    if ((o.plan[best.id] ?? 0) < lane.max && o.autopilot) tips.push({ level: "gruen", title: `Ergiebigste Linie: ${lane.label}`, text: `${Math.round(best.perSlotH ?? 0)} grüne je Platz-Stunde in den letzten 24 h (${o.plan[best.id] ?? 0} von max. ${lane.max} Plätzen). Der Autopilot gibt ihr freie Plätze.`, href: "#pult" });
    else if ((o.plan[best.id] ?? 0) < lane.max) tips.push({ level: "gruen", title: `Ergiebigste Linie: ${lane.label}`, text: `${Math.round(best.perSlotH ?? 0)} grüne je Platz-Stunde in den letzten 24 h. Freie Plätze bringen hier am meisten (${o.plan[best.id] ?? 0} von max. ${lane.max} belegt).`, href: "#pult",
      task: { kind: "leads", market: marketOf(lane.country), brief: `Ergiebigste Linie ${lane.label}: mehr Plätze geben (bis max. ${lane.max}), dafür aus erschöpften Linien abziehen, Lead-Werk starten. Ergebnis: grüne Leads je Stunde vorher/nachher.` } });
  }
  for (const [c, q] of Object.entries(o.stockKnown === false ? {} : o.queue)) {
    const free = o.freeBuyers[c] ?? 0;
    if (q > 0 && free < q) tips.push({ level: "gelb", title: `${c}: Käufer werden knapp`, text: `${q.toLocaleString("de-DE")} Mails warten, aber nur ${free.toLocaleString("de-DE")} mail-fähige Käufer sind noch ohne Mail. Nachschub kommt nur noch aus der Nachprüfung – neue Käuferquelle für ${c} nötig.`, href: "/dashboard/bestand",
      task: { kind: "kaeufer", market: marketOf(c), brief: `${c}: Käufer werden knapp (${q.toLocaleString("de-DE")} Mails warten, ${free.toLocaleString("de-DE")} freie Käufer). Neue kostenlose Käuferquelle für Webagenturen in ${c} finden, testen und ins Kunden-Werk einbauen.` } });
  }
  const totalQ = Object.values(o.queue).reduce((a, b) => a + b, 0);
  if (o.capPerDay > 0 && totalQ > 0) {
    const days = Math.round(totalQ / o.capPerDay);
    tips.push({ level: days > 14 ? "info" : "gelb", title: `Versand: Warteschlange reicht ${days} Tage`, text: `${totalQ.toLocaleString("de-DE")} geprüfte Mails warten bei ${o.capPerDay} Mails/Tag Kapazität (alle Postfächer). ${days > 14 ? "Engpass ist der Versand, nicht die Käufer – mehr Postfächer würden schneller Antworten bringen (kostet Geld, nur mit deinem Ja)." : "Bald neue Käufer nötig."}`, href: "/dashboard/versand",
      task: { kind: "frage", market: null, brief: `Versand-Warteschlange reicht ${days} Tage (${totalQ.toLocaleString("de-DE")} Mails, ${o.capPerDay}/Tag). Kostenlose Wege zeigen, wie die besten Mails zuerst rausgehen (Reihenfolge nach Land/Zielgruppe). Nichts senden, nichts kaufen.` } });
  }
  const leadsAll = Object.values(o.leads).reduce((a, b) => a + b, 0);
  const freeAll = Object.values(o.freeBuyers).reduce((a, b) => a + b, 0);
  if (o.stockKnown !== false && leadsAll > 0 && freeAll > 0 && leadsAll / freeAll > 10) {
    tips.push({ level: "info", title: "Leads reichen weit, Käufer sind der Hebel", text: `${leadsAll.toLocaleString("de-DE")} lieferbare Leads stehen ${freeAll.toLocaleString("de-DE")} freien Käufern gegenüber. Mehr Leads bringen gerade keinen Umsatz – Umsatz entsteht über Antworten der Käufer.`,
      task: { kind: "kaeufer", market: null, brief: "Leads reichen weit, Käufer sind der Hebel: neue kostenlose Käuferquellen für Webagenturen in den Mail-Ländern finden, testen und ins Kunden-Werk einbauen." } });
  }
  if (o.kundenNew24h === 0) tips.push({ level: "gelb", title: "Kunden-Werk findet keine neuen Käufer", text: "In 24 h kein neuer Käufer – die Overture-Liste ist durchgeprüft. Plätze im Kunden-Werk bringen erst mit einer neuen Quelle wieder etwas (Auftrag an den Quellen-Scout).", href: "#pult",
    task: { kind: "kaeufer", market: null, brief: "Kunden-Werk findet keine neuen Käufer (Overture-Liste durchgeprüft): neue kostenlose Käuferquelle für Webagenturen finden, testen und einbauen." } });
  for (const f of o.failed) tips.push({ level: "rot", title: "Teil abgebrochen", text: f, task: { kind: "pruefen", market: null, brief: `Abgebrochenen Teil untersuchen und beheben (Ursache, Fix mit Test, PR): ${f}`.slice(0, 1000) } });
  if (!measured.length) tips.push({ level: "info", title: "Noch keine Laufzahlen", text: "Ertrag je Linie wird seit dem 03.10.2026 je Lauf gezählt – nach den nächsten Läufen erscheinen hier Empfehlungen." });
  const rank = { rot: 0, gelb: 1, gruen: 2, info: 3 } as const;
  return tips.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Erster Satz, höchstens `max` Zeichen (an Wortgrenze, mit „…“). */
export function shortText(text: string, max = 90): string {
  const first = (text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text).trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.6))).replace(/[\s,;:–-]+$/, "")}…`;
}

export type Rec = { level: Tip["level"]; title: string; short: string; href?: string; task?: TipTask };

/**
 * „JARVIS empfiehlt“ (Inhaber 04.10.2026: „das jarvis mir immer auch sagt was er optimieren würde … am anfang … kurzen
 * knappen text“): bis zu `max` Hinweise mit fertigem Auftrag (wichtigste zuerst), aufgefüllt mit Hinweisen mit Ziel.
 * Reine Info ohne Auftrag/Ziel (z. B. „Noch keine Laufzahlen“) zählt nicht. `rest` = übrige Hinweise für die Chips.
 */
export function recommend<T extends Tip>(tips: T[], max = 3): { recs: Rec[]; rest: T[] } {
  const ranked = rankTips(tips);
  const pick = [...ranked.filter((x) => x.task), ...ranked.filter((x) => !x.task && x.href)].slice(0, max);
  const recs: Rec[] = ranked.filter((x) => pick.includes(x)).map((x) => ({ level: x.level, title: x.title, short: shortText(x.text), href: x.href, task: x.task }));
  return { recs, rest: ranked.filter((x) => !pick.includes(x)) };
}

/** Ziel je Art für Hinweise ohne eigenen Auftrag (kurz, nie senden/kaufen). */
const TIP_GOAL: Record<TipTask["kind"], string> = {
  leads: "Prüfen und umsetzen, was hier mehr grüne Leads bringt; Ergebnis vorher/nachher.",
  kaeufer: "Mehr mail-fähige Käufer daraus machen; Ergebnis vorher/nachher.",
  quelle: "Neue kostenlose, erlaubte Quelle finden, mit mindestens 10 grünen Leads testen und einbauen.",
  pruefen: "Ursache prüfen und beheben, mit Test.",
  frage: "Aus echten Zahlen auswerten und 2–3 kostenlose Verbesserungen vorschlagen. Nichts senden, nichts kaufen.",
};
const TIP_KINDS = new Set<string>(["leads", "kaeufer", "quelle", "pruefen", "frage"]);
/** Art aus dem Ziel des Hinweises (Station), wenn der Text nichts verrät. */
function kindOfHref(href: string | undefined, level: Tip["level"]): TipTask["kind"] {
  if (href === "#pult" || href?.includes("s=lead")) return "leads";
  if (href?.includes("bestand") || href?.includes("kaeufer")) return "kaeufer";
  if (href?.includes("proben") || href?.includes("gate")) return "pruefen";
  return level === "rot" ? "pruefen" : "frage";
}

/**
 * Jeder Hinweis unter „JARVIS empfiehlt“ als fertiger Auftrag (Inhaber 04.10.2026: „wieso kann ich das grüne element
 * nicht per drag und drop … einem agenten geben“): eigener Auftrag, sonst Art aus Titel/Ziel/Text. Markt aus dem Auftrag,
 * sonst aus Titel und Text (mehrere Länder als Liste, z. B. „FI·SG·HK“ → „FI,SG,HK“); IE/NL/BE nie.
 */
export function tipTask(t: { level: Tip["level"]; title: string; text?: string; short?: string; href?: string; task?: TipTask }): TipTask {
  const about = `${t.title}. ${t.text ?? t.short ?? ""}`;
  if (t.task) return { ...t.task, market: mailMarkets(t.task.market) ?? marketsIn(t.title) };
  const said = inferTask(t.title).kind;
  const kind = (said && TIP_KINDS.has(said) ? said : null) as TipTask["kind"] | null;
  const k = kind ?? (t.href ? kindOfHref(t.href, t.level) : (inferTask(about).kind as TipTask["kind"] | null) ?? kindOfHref(undefined, t.level));
  // ganzer Hinweistext (shortText schneidet an Abkürzungen wie „max.“), höchstens 400 Zeichen
  const raw = (t.text ?? t.short ?? "").replace(/\s+/g, " ").trim();
  const text = raw.length > 400 ? `${raw.slice(0, 399).replace(/\s+\S*$/, "")}…` : raw;
  const brief = `${t.title}: ${text} ${TIP_GOAL[k]}`.replace(/\s+/g, " ").trim();
  return { kind: k, market: marketsIn(about), brief: brief.slice(0, 1000) };
}
