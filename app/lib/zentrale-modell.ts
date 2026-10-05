/**
 * JARVIS-Zentrale: aus den Live-Daten (zentrale-typen) wird das Bild – je Werk Puls, Zahl, Plätze; je Kante
 * Durchsatz/Partikel/Stau; Gehirn-Zustand und Lernring; Bereiche mit Ampel und Agenten; Leitplanken; Ticker.
 * Reine Funktion (kein React, keine Datenbank), damit dieselben Regeln getestet und überall gleich gezeigt werden.
 */
import { AGENTEN, BEREICHE, WERKE, aeste, bahn, bereichVon, werkeVonBereich, type Werk } from "./firma-karte.ts";
import {
  BEAT_NAME, ampelLuecke, freigabeTon, kurz, lernPhase, lernSegmente, notbremseAnzeige, plaetzeDiff, pulsStatus, speicherTon, staus, uhr,
  veraltet, zahl, zielRing, type LernPhase, type Puls, type Ton,
} from "./zentrale-logik.ts";
import { agentStartLabel } from "./agents.ts";
import type { Langsam, Schnell, ZTask } from "./zentrale-typen.ts";
import LINIEN from "./werk-linien.json" with { type: "json" };

const MIN = 60_000;
const GB = 1024 ** 3;
type Lane = { id: string; werk: string; default: number; max: number };
const LANES = (LINIEN as unknown as { total_slots: number; lanes: Lane[] }).lanes;
export const SLOTS_GESAMT = (LINIEN as unknown as { total_slots: number }).total_slots;

export type WerkBild = {
  id: string; name: string; puls: Puls; zahl: string; unter: string; gold: boolean; grau: boolean; status: string | undefined;
  plaetze: { ist: number; soll: number; max: number } | null; station: string | null; fehlt: boolean; auftrag?: string; tip: string;
  agenten: number[];
};
export type KanteBild = { id: string; von: string; an: string; proStunde: number; was: string; stau: boolean };
export type BereichBild = { slug: string; name: string; icon: string; gold: boolean; ton: Ton; rang: number | null; titel: string; grund: string;
  ist: number | null; soll: number | null; luecke: number | null; agenten: { id: string; name: string; laeuft: boolean }[]; laeuft: number; offen: number };
export type PlankeBild = { id: string; name: string; ton: Ton; wort: string; zahl: string; unter: string; greift: boolean; regel: string; tip: string };
export type GehirnBild = { wort: "ARBEITET" | "WARTET" | "BEREIT" | "AUS"; takt: number | null; score: string; runde: string; still: string | null };
export type ZielBild = { key: string; titel: string; ist: string; soll: string; anteil: number; unbestaetigt: boolean; leer: boolean; gold: boolean; spark: number[] | null };

const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x ?? 0) || 0);
const runs = (l: Langsam | null, w: string) => l?.runs?.[w];

/** Werk-Name im Herzschlag/Lauf (werk_heartbeat, run_stats). */
const RUN_NAME: Record<string, string> = { lead: "lead-werk", pruefer: "pruefer-werk", proben: "proben-vorrat", kunden: "kunden-werk", stichprobe: "stichprobe" };

export function nowMs(s: Schnell | null, abruf: string): number {
  const t = Date.parse(s?.now ?? abruf);
  return Number.isNaN(t) ? Date.now() : t;
}

/** Laufende Aufträge je Werk (nutzt_werke des Agenten bzw. des Bereichs der Rolle). */
export function agentenAmWerk(tasks: ZTask[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const t of tasks) {
    if (t.status !== "laeuft" || !t.agent) continue;
    const rid = t.rolle ? (t.rolle.includes(":") ? t.rolle : `rolle:${t.rolle}`) : null;
    const ag = rid ? AGENTEN.find((a) => a.id === rid) : null;
    const werke = ag && Array.isArray(ag.nutzt_werke) ? ag.nutzt_werke : werkeVonBereich(bereichVon(t.rolle));
    for (const w of werke) (out[w] ??= []).includes(t.agent) || out[w].push(t.agent);
  }
  return out;
}

export function werkeBild(s: Schnell | null, l: Langsam | null, now: number): Record<string, WerkBild> {
  const beats = Object.fromEntries((s?.beats ?? []).map((b) => [b.werk, b.last_beat]));
  const runsLast = Object.fromEntries(Object.entries(l?.runs ?? {}).map(([k, v]) => [k, v.last]));
  const plan = new Map<string, Record<string, number>>();
  for (const p of s?.plan_log ?? []) if (!plan.has(p.werk)) plan.set(p.werk, p.plan ?? {});
  const am = agentenAmWerk(s?.tasks ?? []);
  const out: Record<string, WerkBild> = {};
  for (const w of WERKE) {
    const puls = pulsStatus(w, now, { beats, lastSent: s?.msg.last_sent_at, acks: s?.acks, cacheAt: l?.stand, runsLast, mrr: l?.mrr });
    let z = "–", unter = "";
    const r = runs(l, RUN_NAME[w.id] ?? "");
    switch (w.id) {
      case "lead": z = r ? zahl(r.green_24h) : "–"; unter = "grün 24 h"; break;
      case "kunden": z = r ? zahl(r.green_24h) : "–"; unter = "ok 24 h"; break;
      case "pruefer": { const p = runs(l, "pruefer-werk"); z = p ? zahl(p.processed_24h) : "–"; unter = "geprüft 24 h"; break; }
      case "stichprobe": { const a = runs(l, "stichprobe"), b = runs(l, "dauerpruefung"); z = a || b ? zahl(n(a?.processed_24h) + n(b?.processed_24h)) : "–"; unter = "Stichprobe 24 h"; break; }
      case "proben": {
        const t = l?.tank ?? null;
        z = t ? ["US", "UK", "FR"].map((c) => n(t[c])).join("·") : "–";
        const soll = l?.tank_soll ?? {};
        unter = Object.keys(soll).length ? `Soll ${["US", "UK", "FR"].map((c) => n(soll[c])).join("·")}` : "bereit US·UK·FR";
        break;
      }
      case "versand": z = s ? `${zahl(s.msg.sent_heute)}${l?.kap ? `/${zahl(l.kap)}` : ""}` : "–"; unter = "heute / Tagesziel"; break;
      case "antworten": z = s ? zahl(s.replies.offen) : "–"; unter = "offen"; break;
      case "lieferung": z = "Mo 06:53"; unter = "nächste"; break;
      case "umsatz": z = l?.mrr === null || l?.mrr === undefined ? "–" : zahl(l.mrr); unter = "MRR · Soll 1.290"; break;
      case "wachhund": z = l?.stand ? uhr(l.stand, now) : "–"; unter = "alle 15 min"; break;
      case "radar": case "premium": z = ""; unter = w.id === "radar" ? "Linie im Lead-Werk" : "Schritt im Proben-Vorrat"; break;
    }
    let plaetze: WerkBild["plaetze"] = null;
    if (w.linien_werk) {
      const lanes = LANES.filter((x) => x.werk === w.linien_werk);
      const sollPlan = s?.owner.slot_plan ?? {};
      const ist = plan.get(w.linien_werk);
      plaetze = {
        ist: ist ? lanes.reduce((a, x) => a + n(ist[x.id]), 0) : lanes.reduce((a, x) => a + x.default, 0),
        soll: lanes.reduce((a, x) => a + (sollPlan[x.id] ?? x.default), 0),
        max: lanes.reduce((a, x) => a + x.max, 0),
      };
    }
    const fehlt = w.status === "fehlt";
    out[w.id] = {
      id: w.id, name: w.name, puls, zahl: z, unter, gold: !!w.gold, grau: fehlt || puls === "grau", status: w.status, plaetze,
      station: w.station ?? null, fehlt, auftrag: w.auftrag, agenten: (am[w.id] ?? []).sort((a, b) => a - b),
      tip: fehlt ? `${w.name}: noch nicht gebaut · ${w.auftrag ?? ""}` : `${w.name} · ${w.takt ?? ""}${puls === "live~" ? " · Puls aus Ersatzquelle (~)" : ""}`,
    };
  }
  return out;
}

export function kantenBild(s: Schnell | null, l: Langsam | null): KanteBild[] {
  const g60 = (w: string) => n(runs(l, w)?.green_60m) || n(s?.beats.find((b) => b.werk === w)?.green_60m);
  const k: KanteBild[] = [
    { id: "lead-pruefer", von: "lead", an: "pruefer", proStunde: g60("lead-werk"), was: "neue Leads", stau: false },
    { id: "pruefer-proben", von: "pruefer", an: "proben", proStunde: g60("pruefer-werk"), was: "freigegebene Leads", stau: false },
    { id: "proben-lieferung", von: "proben", an: "lieferung", proStunde: n(l?.tank_24h) / 24, was: "Proben raus", stau: false },
    { id: "kunden-versand", von: "kunden", an: "versand", proStunde: g60("kunden-werk"), was: "mail-fähige Käufer", stau: false },
    { id: "versand-antworten", von: "versand", an: "antworten", proStunde: n(s?.msg.sent_60m), was: "Erstmails", stau: false },
    { id: "antworten-lieferung", von: "antworten", an: "lieferung", proStunde: 0, was: "Kunden", stau: false },
    { id: "lieferung-umsatz", von: "lieferung", an: "umsatz", proStunde: 0, was: "MRR", stau: false },
  ];
  const jam = new Set(staus([
    { id: "kunden-versand", ein: n(s?.msg.freigegeben), aus: n(s?.msg.sent_24h) },
    { id: "lead-pruefer", ein: n(runs(l, "lead-werk")?.green_24h), aus: n(runs(l, "pruefer-werk")?.processed_24h) },
  ]));
  return k.map((x) => ({ ...x, stau: jam.has(x.id) }));
}

export function gehirnBild(s: Schnell | null, l: Langsam | null, now: number): GehirnBild {
  const tasks = s?.tasks ?? [];
  const score = [...(l?.kpi ?? [])].filter((k) => k.metric === "gehirn_score").pop();
  const last = l?.lern.last_decision ?? null;
  const runde = agentStartLabel(new Date(now));
  if (s?.brain_enabled === false) return { wort: "AUS", takt: null, score: score ? n(score.value).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–", runde, still: "Gehirn aus" };
  if (last && now - Date.parse(last) > 3 * 60 * MIN) return { wort: "AUS", takt: null, score: score ? n(score.value).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–", runde, still: `seit ${uhr(last, now)} still` };
  const wort = tasks.some((t) => t.status === "laeuft") ? "ARBEITET" : tasks.some((t) => t.status === "offen") ? "WARTET" : "BEREIT";
  return { wort, takt: wort === "ARBEITET" ? 1.2 : 3, score: score ? n(score.value).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–", runde, still: null };
}

export function lernBild(s: Schnell | null, l: Langsam | null, now: number) {
  const tasks = s?.tasks ?? [];
  const heute = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const kpiHeute = (l?.kpi ?? []).filter((k) => k.day === heute).map((k) => k.updated_at).sort().pop() ?? null;
  const gaps = (s?.gaps ?? []).filter((g) => g.luecke !== null && n(g.luecke) >= 0.05);
  const offen = tasks.filter((t) => t.status === "offen"), laeuft = tasks.filter((t) => t.status === "laeuft");
  const segmente = lernSegmente({
    zahlen: kpiHeute ? uhr(kpiHeute, now) : null, luecke: s ? gaps.length : null, auftrag: s ? offen.length : null, umsetzen: s ? laeuft.length : null,
    messen: l ? n(l.lern.messen) : null, lehre: l ? n(l.lern.lehre) : null,
  });
  const neu = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort().pop() ?? null;
  const ev: { phase: LernPhase; at: string | null }[] = [
    { phase: "zahlen", at: kpiHeute },
    { phase: "luecke", at: neu(gaps.map((g) => g.updated_at)) },
    { phase: "auftrag", at: neu(offen.map((t) => t.created_at)) },
    { phase: "umsetzen", at: neu(laeuft.map((t) => t.started_at ?? t.created_at)) },
    { phase: "messen", at: l?.lern.messen ? l.lern.messen_liste[0]?.at ?? null : null },
    { phase: "lehre", at: l?.lern.lehre ? l.lern.lehre_liste[0]?.at ?? null : null },
  ];
  const aktiv = lernPhase(ev, now);
  const liste: Record<LernPhase, { titel: string; grund: string; at: string | null }[]> = {
    zahlen: (l?.kpi ?? []).filter((k) => k.day === heute).slice(-5).map((k) => ({ titel: `${k.metric.replace(/_/g, " ")}: ${zahl(n(k.value))}`, grund: "", at: k.updated_at })),
    luecke: gaps.slice(0, 5).map((g) => ({ ...kurz(g.titel ?? g.slug, g.grund), at: g.updated_at })),
    auftrag: offen.slice(0, 5).map((t) => ({ ...kurz(`A${t.agent ?? "?"} · ${t.brief}`, t.grund), at: t.created_at })),
    umsetzen: laeuft.slice(0, 5).map((t) => ({ ...kurz(`A${t.agent ?? "?"} · ${t.step ?? t.brief}`, `${n(t.progress)} %`), at: t.started_at })),
    messen: (l?.lern.messen_liste ?? []).slice(0, 5).map((x) => ({ ...kurz(x.titel, x.grund), at: x.at })),
    lehre: (l?.lern.lehre_liste ?? []).slice(0, 5).map((x) => ({ ...kurz(x.titel, `Vertrauen ${n(x.vertrauen).toLocaleString("de-DE")}`), at: x.at })),
  };
  return { segmente, aktiv, liste };
}

/** Taskgruppe eines Bereichs: über die Rolle, sonst Strategie (A1–A8 ohne Rolle laufen ehrlich dort). */
export function bereicheBild(s: Schnell | null): BereichBild[] {
  const gaps = new Map((s?.gaps ?? []).map((g) => [g.slug, g]));
  const tasks = s?.tasks ?? [];
  return BEREICHE.map((b) => {
    const g = gaps.get(b.slug);
    const meine = tasks.filter((t) => bereichVon(t.rolle) === b.slug);
    const laeuftRollen = new Set(meine.filter((t) => t.status === "laeuft").map((t) => (t.rolle?.includes(":") ? t.rolle : `rolle:${t.rolle}`)));
    const k = kurz(g?.titel ?? (g ? "Ziel erreicht" : "keine Messung"), g?.grund ?? "");
    return {
      slug: b.slug, name: b.name, icon: b.icon, gold: !!b.gold, ton: g ? ampelLuecke(g.rang, g.luecke) : "grau", rang: g?.rang ?? null,
      titel: k.titel, grund: k.grund, ist: g?.ist ?? null, soll: g?.soll ?? null, luecke: g?.luecke ?? null,
      agenten: b.agenten.map((id) => ({ id, name: AGENTEN.find((a) => a.id === id)?.name ?? (id === "gehirn" ? "Gehirn" : id.split(":").pop() ?? id),
        laeuft: laeuftRollen.has(id) || (id === "jarvis:1-8" && meine.some((t) => !t.rolle && t.status === "laeuft")) })),
      laeuft: meine.filter((t) => t.status === "laeuft").length, offen: meine.filter((t) => t.status === "offen").length,
    };
  });
}

export function leitplankenBild(s: Schnell | null, l: Langsam | null, recht: { c: string; allowed: boolean }[]): PlankeBild[] {
  const fehler = s?.gaps.find((g) => g.ziel_key === "lead_fehler")?.ist ?? null;
  const fTon = freigabeTon(fehler === null ? null : n(fehler));
  const nb = notbremseAnzeige(n(s?.ev24.bounced), n(s?.ev24.sent), l?.bremse ?? null);
  const gb = l?.storage?.db_bytes ? n(l.storage.db_bytes) / GB : null;
  const sTon = speicherTon(gb);
  const offen = recht.filter((r) => r.allowed).map((r) => r.c);
  return [
    { id: "freigabe", name: "Freigabe", ton: fTon, wort: fTon === "grau" ? "keine Daten" : "an", zahl: fehler === null ? "–" : `${n(fehler).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`,
      unter: "Fehler · Soll ≤ 2 %", greift: false, regel: "Jeder Lead besteht 3 Stufen vor Probe und Lieferung – nie abschaltbar.", tip: "Stichprobe: gelb über 2 %, rot über 5 %" },
    { id: "notbremse", name: "Notbremse", ton: nb.statusTon, wort: nb.status, zahl: nb.zahl, unter: "Bounce 24 h", greift: nb.greift,
      regel: "Stoppt den Versand bei Spam-Beschwerde oder über 5 % Bounces (ab 100 Mails). Neustart nur mit dir.",
      tip: `Status = Bewertung wie deliverability · Zahl: gelb ab 4 %, rot ab 5 % bei ≥ 100 Mails${nb.zahlTon !== "grau" ? "" : " (noch zu wenig Mails)"}`, },
    { id: "sperrliste", name: "Sperrliste", ton: n(s?.ev24.complained) ? "rot" : l ? "gruen" : "grau", wort: "an", zahl: l ? zahl(l.sperre.gesamt) : "–",
      unter: `+${zahl(n(l?.sperre.neu_24h))} / 24 h · Spam ${zahl(n(s?.ev24.complained))}`, greift: false,
      regel: "Abmeldung, Bounce und Beschwerde sperren für immer. Nie aufhebbar.", tip: "nur Anzeige" },
    { id: "recht", name: "Kaltmail-Recht", ton: "gruen", wort: offen.join(" ") || "–", zahl: `${offen.length}`, unter: "Länder frei",
      greift: false, regel: "Kaltmails nur in erlaubte Länder (countries.yaml); IE, BE, NL nie.", tip: recht.map((r) => `${r.c} ${r.allowed ? "frei" : "gesperrt"}`).join(" · ") },
    { id: "speicher", name: "Speicher", ton: sTon, wort: sTon === "rot" ? "Stopp" : sTon === "gelb" ? "Bremse" : sTon === "grau" ? "keine Daten" : "ok",
      zahl: gb === null ? "–" : `${gb.toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB`, unter: "Bremse 6 · Stopp 7,5", greift: sTon === "rot",
      regel: "Ab 6 GB bremst das Lead-Werk, ab 7,5 GB stoppt es. Aufräumen entscheidest du.", tip: "Supabase Pro: 8 GB inklusive" },
    { id: "geld", name: "Geld", ton: "gruen", wort: "nur mit dir", zahl: l ? `${n(l.llm_heute).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "–",
      unter: "LLM heute", greift: false, regel: "Ausgaben nur mit dir · Tests nur S2 × US/UK/FR.", tip: "Kosten der Sofort-Antworten heute" },
  ];
}

export function zieleBild(s: Schnell | null, l: Langsam | null): ZielBild[] {
  const goals = new Map((l?.goals ?? []).map((g) => [g.key, g]));
  const gap = (k: string) => s?.gaps.find((g) => g.ziel_key === k)?.ist ?? null;
  const sparkOf = (metric: string, f = 1) => {
    const pts = (l?.kpi ?? []).filter((k) => k.metric === metric).map((k) => n(k.value) / f);
    return pts.length >= 3 ? pts.slice(-14) : null;
  };
  const def: { key: string; titel: string; ist: number | null; fmt: (v: number) => string; gold?: boolean; spark?: number[] | null }[] = [
    { key: "mrr", titel: "Umsatz/Monat", ist: l?.mrr ?? gap("mrr"), fmt: (v) => zahl(v), gold: true, spark: sparkOf("mrr_cents", 100) },
    { key: "kunden", titel: "Kunden", ist: l?.kunden ?? gap("kunden"), fmt: (v) => zahl(v) },
    { key: "antwortquote", titel: "Antwortquote", ist: gap("antwortquote"), fmt: (v) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %` },
    { key: "lead_fehler", titel: "Fehlerquote", ist: gap("lead_fehler"), fmt: (v) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %` },
  ];
  return def.map((d) => {
    const g = goals.get(d.key) ?? null;
    const r = zielRing(g ? { soll: n(g.soll), richtung: g.richtung, quelle: g.quelle } : null, d.ist === null ? null : n(d.ist));
    return { key: d.key, titel: d.titel, ist: d.ist === null ? "–" : d.fmt(n(d.ist)), soll: g ? d.fmt(n(g.soll)) : "–", anteil: r.anteil,
      unbestaetigt: r.unbestaetigt, leer: r.leer, gold: !!d.gold, spark: d.spark ?? null };
  });
}

/** Plätze-Klötzchen: laufende Plätze (Herzschlag) und die letzte Umverteilung des Autopiloten. */
export function plaetzeBild(s: Schnell | null) {
  const laufend = (s?.beats ?? []).reduce((a, b) => a + n(b.plaetze), 0);
  const byWerk = new Map<string, { plan: Record<string, number>; reasons: Record<string, string> | null; at: string }[]>();
  for (const p of s?.plan_log ?? []) byWerk.set(p.werk, [...(byWerk.get(p.werk) ?? []), { plan: p.plan, reasons: p.reasons, at: p.at }]);
  const diffs = [...byWerk.entries()].flatMap(([werk, xs]) => (xs.length >= 2 ? plaetzeDiff(xs[1].plan, xs[0].plan).map((d) => ({ ...d, werk, grund: xs[0].reasons?.[d.linie] ?? null, at: xs[0].at })) : []));
  const geplant = [...byWerk.values()].reduce((a, xs) => a + Object.values(xs[0]?.plan ?? {}).reduce((x, y) => x + n(y), 0), 0);
  return { laufend, geplant, gesamt: SLOTS_GESAMT, diffs, schluessel: diffs.map((d) => `${d.werk}:${d.linie}:${d.at}`).join("|") };
}

/** Aufträge Gehirn → Agent der letzten 15 min (Partikel); Gold bei Umsatz/Premium. */
export function neueAuftraege(s: Schnell | null, now: number) {
  const VON = /^(Gehirn|Gehirn-Routine|Abteilungs-Motor|Wachhund|Übergabe)$/;
  return (s?.tasks ?? []).filter((t) => t.agent && now - Date.parse(t.created_at) < 15 * MIN && VON.test(t.created_by ?? ""))
    .map((t) => ({ agent: t.agent!, gold: t.rolle === "premium" || /umsatz|premium|kunde|preis|mrr/i.test(`${t.brief} ${t.grund ?? ""}`) }));
}

/** Kopfzeile: Lage in einem Satz aus department_gaps Rang 1. */
export function lage(s: Schnell | null) {
  const g = (s?.gaps ?? []).find((x) => x.rang === 1 && x.luecke !== null && n(x.luecke) >= 0.05);
  if (!g) return s ? kurz("Alle Ziele im Plan", "Keine Lücke über 5 %.") : kurz("Keine Live-Daten", "Die Lage ist gerade nicht lesbar.");
  const run = (s?.tasks ?? []).some((t) => t.status === "laeuft" && bereichVon(t.rolle) === g.slug);
  return kurz(`${g.titel ?? g.slug}${run ? " – Auftrag läuft" : ""}`, g.grund);
}

export const istVeraltet = (l: Langsam | null, now: number) => !l || veraltet(l.stand, now);
export { bahn, aeste, BEAT_NAME };
export type { Werk };
