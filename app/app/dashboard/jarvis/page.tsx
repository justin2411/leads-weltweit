import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIG, COUNTRIES, SEGMENT, canDispatch, loadActivity, loadAgentTasks, loadBoxHealth, loadBounceStats, loadDaily, loadFunnel, loadKpiDaily, loadGateChecks, loadLive, loadOwnerSettings, loadPlanLog, loadRecentSent, loadRunRows, loadStock, loadWebsite, loadFunnelCache, loadKohorten } from "@/lib/dashboard-data";
import { webLine, webNeck } from "@/lib/website-stats";
import { startLive } from "@/lib/website-funnel";
import { werkLine, werkTip } from "@/lib/werk-zeile";
import { berlin, berlinDay, brake, chain, compact, currencySign, greeting, mailboxes, monthly, nextWorkflowRun, onlySegment, realSubscriptions, sampleStock, stockSegment, BOX_MIN, COUNTRY_COLOR } from "@/lib/dashboard-logic";
import { totals } from "@/lib/dashboard-periods";
import { stationSparks } from "@/lib/spark";
import { loadPrognose } from "@/lib/prognose-data";
import { summary as prognoseSummary } from "@/lib/prognose";
import { addDays } from "@/lib/trend";
import { alarmTips, coach, hall, laneOf, laneStats, markEmpty, neckTask, rankTips, recommend, running, utilization, type Beat, type Tip } from "@/lib/leitstand";
import { agentStartLabel, freeAgent } from "@/lib/agents";
import { visibleTips } from "@/lib/tips";
import { NECK_TO_STATION, WEB_STATIONS, ticker, type Edge, type Station, type StationId, type TickerItem } from "@/lib/fluss";
import { effectiveLimit, slotCounts, werkOn, type LaneRegistry, type WerkKey } from "@/lib/owner-settings";
import { START_WORKFLOWS, startState, type StartKey, type StartRequest } from "@/lib/start-queue";
import { db } from "@/lib/supabase";
import { isLive, werkStatus } from "@/lib/werke-live";
import LANES from "@/lib/werk-linien.json";
import { requireOwner } from "../actions";
import { requestStart, saveCountryLimits, saveFollowups, saveSampleTargets, saveSlotPlan, setPaused, toggleBuyerCountry, toggleSendCountry } from "../control-actions";
import { WerkSwitch } from "../werk-switch";
import { Back } from "../v2";
import { Drawer, MiniBars, type Kpi } from "./flow";
import { Bays, LANE_COLOR, Reactor, UtilChart, laneColor } from "./hud";
import { Pult } from "./pult";
import { AgentDrawer, AgentRow } from "./agents";
import { countCustomerAgents } from "@/lib/customer-agents-data";
import { loadStartChat } from "./chat/start";
import { loadProposals } from "@/lib/vorschlaege-data";
import { AutopilotPanel } from "./autopilot";
import { GateRings, GateSteps, Reasons, type GateView } from "./freigabe";
import { JarvisView } from "./view";
import { loadBrauchtDich } from "@/lib/braucht-dich-data";
import { loadTeam } from "@/lib/fach-agenten-data";
import { karten } from "@/lib/fach-agenten";
import { loadUeberblick } from "@/lib/ueberblick-data";
import { bar, dayShare, heuteWichtig, judgeFlow, leadZiel, stillTip, switchedOff, zeitleiste } from "@/lib/ueberblick";
import { Icon, type IconName } from "@/app/icons";
import type { FunnelRow } from "@/lib/dashboard-logic";
import { anpassungTitel, gehirnScore } from "@/lib/gehirn-lernt";
import { KLASSEN, KLASSE_COLOR, KLASSE_LABEL, KLASSE_TIP, badSources } from "@/lib/bounce-stats";

export const metadata = { title: "JARVIS" };
const REG = LANES as unknown as LaneRegistry;
type SP = Promise<Record<string, string | string[] | undefined>>;
const IDS: StationId[] = ["lead", "gate", "bestand", "proben", "kwerk", "kaeufer", "versand", "antworten", "kunden"];

/** Startwünsche der letzten 3 h (Direktstart, start_requests); Fehler/fehlende Tabelle -> leer. */
async function loadStarts(): Promise<StartRequest[]> {
  try {
    const since = new Date(new Date().getTime() - 3 * 3_600_000).toISOString();
    const { data, error } = await db().from("start_requests").select("id, created_at, workflow, status, started_at, note")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(30).abortSignal(AbortSignal.timeout(4000));
    if (error) throw new Error(error.message);
    return (data ?? []) as StartRequest[];
  } catch {
    return [];
  }
}

/**
 * JARVIS – Fluss-Karte des ganzen Geschäfts (Inhaber 03.10.2026: „besser strukturieren … informiert werden,
 * einstellen und überprüfen … wenig text … grafiken die anklickbar sind … sehen was läuft und was wohin läuft“).
 * Oben 4 Ampeln, in der Mitte der Fluss (Ware oben, Käufer unten, Kunden rechts), unten der Live-Ticker.
 * Klick auf eine Station öffnet ihr Seitenfenster: Info · Einstellen · Prüfen.
 */
export default async function Jarvis({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const s = (typeof sp.s === "string" && IDS.includes(sp.s as StationId) ? sp.s : null) as StationId | null;
  const tab = (sp.t === "set" || sp.t === "check" ? sp.t : "info") as "info" | "set" | "check";
  // Agenten: ?a=1…8 oder ?a=neu öffnet das Agenten-Fenster (statt einer Station)
  const ag = typeof sp.a === "string" && /^([1-9]|neu)$/.test(sp.a) ? sp.a : null;
  const kaP = countCustomerAgents();
  const chatP = loadStartChat();
  const propP = loadProposals();
  const bdP = loadBrauchtDich();
  // Station „Startseite“ aus dem Website-Trichter (web_funnel_refresh); fehlt die Messung, bleibt sie bei 0
  const webP = Promise.all([loadWebsite(), loadFunnelCache(5 * 60_000)]).then(([w, f]) => ({ ...w, ...startLive(f) }));
  const stockP = loadStock();
  stockP.catch(() => {});
  const today = berlinDay(new Date());
  const from7 = new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  // Überblick (Heute wichtig, Ziel-vs-Ist, Entscheidungen, Datenfluss-Alarm): parallel, jede Quelle einzeln fehlertolerant
  const ubP = loadUeberblick(SEGMENT, COUNTRIES, today);
  // Kohorten-Trichter je Versandwoche × Land (cohort_funnel, ~0,5 s; Fehler → null = „nicht lesbar“)
  const khP = loadKohorten(8);
  // Team: Fach-Agenten mit Kennzahl, Trend, letztem Auftrag (agent_roles, agent_role_kpi; Fehler → Abschnitt aus)
  const teamP = loadTeam().catch(() => null);
  // Sparklines und Trend (7 T vs. Vor-7 T): 15 Tage bis heute, kpi_daily parallel (Fehler → leer)
  const from15 = addDays(today, -14);
  const kpiP = loadKpiDaily(from15, today);
  // Prognose 30 Tage (lib/prognose.ts): Trichter-Hochrechnung je Land, ohne Antworten „keine Basis“; Fehler → null
  const progP = loadPrognose(new Date()).catch(() => null);
  // Gehirn lernt: letzte 3 Selbstanpassungen (decisions „Meta: …“) und offene Verbesserungsvorschläge; Fehler → null
  const metaP = db().from("decisions").select("kurz_titel, subject").like("subject", "Meta: %").order("created_at", { ascending: false }).limit(3)
    .then((r) => (r.error ? null : (r.data ?? []).map(anpassungTitel)), () => null);
  const impP = db().from("brain_improvements").select("id", { count: "exact", head: true }).eq("status", "offen")
    .then((r) => (r.error ? null : r.count ?? 0), () => null);
  const [liveAll, own, act, rows, stockAll, daily, sent, checks, agentTasks, starts, planLog, openReplies, health, funnel, bounceSt] = await Promise.all([
    loadLive(), loadOwnerSettings(), loadActivity(), loadRunRows(24),
    // Bestand: höchstens 5 s warten (Abfrage ~3,5 s, 10 min zwischengespeichert); sonst „…“ statt falscher Nullen
    Promise.race([stockP.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 5000))]),
    loadDaily(from15, today), loadRecentSent(12), s === "lead" || s === "gate" ? loadGateChecks(14, s === "gate" && tab === "check" && sp.f === "rot") : Promise.resolve([]),
    loadAgentTasks(), s === "lead" || s === "kwerk" || s === "proben" ? loadStarts() : Promise.resolve([] as StartRequest[]),
    loadPlanLog(),
    // offene Antworten im Cockpit (null = nicht lesbar, dann bleibt die Ampel wie bisher)
    db().from("inbound_replies").select("id", { count: "exact", head: true }).eq("status", "offen")
      .then((r) => (r.error ? null : r.count ?? 0), () => null),
    // Bounce-Quote je Postfach nur für die Station Versand
    s === "versand" ? loadBoxHealth(14) : Promise.resolve(null),
    // Trichter je Land (US/UK/FR im Vergleich) nur für die Station Antworten
    s === "antworten" ? loadFunnel() : Promise.resolve(null),
    // Bounce-Klassen 7 Tage (hart/weich/Richtlinie/unbekannt) nur für die Station Versand
    s === "versand" ? loadBounceStats(7) : Promise.resolve(null),
  ]);
  const live = onlySegment(liveAll, SEGMENT);
  const stock = stockSegment(stockAll, SEGMENT);
  const now = new Date(live.now);
  const t = now.getTime();
  const countries = COUNTRIES;
  const cfg = { ...CONFIG, sample_overrides: own.sample_targets };

  // ---------------------------------------------------------------- Zahlen
  const beats = act.heartbeats as Beat[];
  // Belegung: die zuletzt wirklich gestartete (Autopilot/Inhaber, werk_plan_log), sonst die Einstellung des Inhabers
  const plan = { ...slotCounts(REG, own.slot_plan), ...(planLog["lead-werk"]?.plan ?? {}), ...(planLog["kunden-werk"]?.plan ?? {}) };
  const autopilotOn = own.slot_autopilot?.on !== false;
  const leadPlanned = REG.lanes.filter((l) => l.werk === "lead-werk").reduce((a, l) => a + (plan[l.id] ?? 0), 0);
  const bays = hall(REG, plan, beats, t);
  const busy = bays.filter((b) => b.state === "run" || b.state === "other").length;
  // Plätze je Werk für die Kreis-Zeile: arbeitend (Herzschlag) / eingeplant (Belegung) – nur dieses Werk
  const leadRun = bays.filter((b) => b.state === "run" && b.werk === "lead-werk").length;
  const leadPaused = !werkOn(own, "lead-werk").on;
  const stats = markEmpty(laneStats(REG, rows, t), [planLog["lead-werk"]?.reasons, planLog["kunden-werk"]?.reasons]);
  const firstRun = rows.reduce<number | null>((a, r) => (r.started_at && (a === null || Date.parse(r.started_at) < a) ? Date.parse(r.started_at) : a), null);
  const util = utilization(rows, beats, t, REG.total_slots, 24, 30, firstRun);
  const n = (x: number | string | null | undefined) => Number(x ?? 0);
  const leadsNew = Object.fromEntries(countries.map((c) => [c, stock ? stock.leads.filter((l) => l.country === c && l.status === "new").reduce((a, l) => a + n(l.n), 0) : 0]));
  const leads24 = stockAll ? stockAll.leads_24h.filter((l) => l.segment_id === SEGMENT).reduce((a, l) => a + n(l.n), 0) : 0;
  const ok = (c: string) => stock?.prospects.find((p) => p.country === c && p.check_status === "ok");
  const freeBuyers = Object.fromEntries(countries.map((c) => [c, n(ok(c)?.unused)]));
  const queue = Object.fromEntries(countries.map((c) => [c, live.msg.filter((m) => m.country === c && m.kind === "initial" && m.status === "approved").reduce((a, m) => a + n(m.n), 0)]));
  const boxes = mailboxes(liveAll, CONFIG);
  const cap = boxes.reduce((a, b) => a + b.cap, 0), sentToday = boxes.reduce((a, b) => a + b.today, 0);
  const newBuyers24 = stockAll ? stockAll.prospects_24h.filter((p) => p.check_status === "ok" && p.segment_id === SEGMENT).reduce((a, p) => a + n(p.n), 0) : 0;
  const w = totals(daily, from7, today, countries);
  const subs = realSubscriptions(live).filter((x) => countries.includes(x.customer?.country ?? ""));
  const rev = new Map<string, number>();
  for (const x of subs) rev.set(currencySign(x.currency, x.customer?.country), (rev.get(currencySign(x.currency, x.customer?.country)) ?? 0) + monthly(x));
  const revenue = [...rev].map(([c, v]) => `${compact(v)} ${c}`).join(" + ") || "0";
  const st = sampleStock(live, cfg, now).filter((r) => countries.some((c) => r.key.endsWith(`/${c}`)));
  const ready = st.reduce((a, r) => a + r.ready, 0), target = st.reduce((a, r) => a + r.target, 0);
  const sp7 = act.stichprobe ?? [];
  const spC = sp7.reduce((a, r) => a + r.candidates, 0), spG = sp7.reduce((a, r) => a + r.green, 0);
  const gatePct = spC ? Math.round((spG / spC) * 1000) / 10 : null;
  const gateOk = n(act.gate_60m?.released), gateBad = n(act.gate_60m?.failed);
  const neck = NECK_TO_STATION[chain(live, stock, cfg, countries).bottleneck ?? ""] ?? null;
  // Linie „Website“ (Inhaber 04.10.2026): Zahlen aus dashboard_cache, eigener Engpass nach festen Schwellen (webNeck)
  const web = await webP;
  const wNeck = webNeck(web);
  const wLine = webLine(web, compact);

  // ---------------------------------------------------------------- Stationen
  // 7-Tage-Linie je Station (JARVIS-Plan W1-3): kpi_daily, wo es ≥ 2 Punkte hat, sonst dashboard_daily
  const sparks = stationSparks(daily, await kpiP, today, countries);
  const sw = (k: Parameters<typeof werkOn>[1]) => werkOn(own, k);
  const state = (key: Parameters<typeof werkOn>[1], werk: Parameters<typeof isLive>[1] | null, maxH: number): Station["state"] => {
    const o = sw(key);
    if (!o.on) return "off";
    if (!werk) return "idle";
    const x = werkStatus({ werk, a: act, now, maxH, pausedSince: o.since });
    return x.live ? "live" : x.cls === "t-red" ? "bad" : "idle";
  };
  // Notbremse (wie deliverability.emergency_stop, über alle Zielgruppen): steht sie, ganz oben und rot
  const nb = brake(liveAll, CONFIG);
  // Versand rund um die Uhr (Inhaber 04.10.2026: „ich will es bei jarvis auch in der grafik sehen das es an ist“):
  // grün „an · 24/7“, Ring dreht, wenn in der letzten Stunde gesendet wurde; rot „aus“ nur bei Pause/Notbremse/Datei-Stopp
  const sendOff = own.send_paused ? "Pause" : nb.stop ? "Notbremse" : !CONFIG.versand.aktiv ? "aus" : null;
  const stations: Station[] = ([
    { id: "lead", label: "Lead-Werk", icon: "lead-werk", value: stockAll ? compact(leads24) : "…", sub: werkLine({ running: leadRun, planned: leadPlanned, paused: leadPaused }), state: state("lead-werk", "lead-werk", 4), tip: werkTip("neue Leads in 24 h", { running: leadRun, planned: leadPlanned, paused: leadPaused }), auto: autopilotOn },
    { id: "gate", label: "Freigabe", icon: "freigabe", value: gatePct === null ? "–" : `${gatePct}`, unit: gatePct === null ? "" : "%", sub: gateOk + gateBad > 0 ? `${compact(gateOk + gateBad)} geprüft/h` : "prüft vor Probe", state: act.last_gate_at && t - Date.parse(act.last_gate_at) < 15 * 60_000 ? "live" : "idle", tip: "Stichprobe bestanden (7 Tage) · jeder Lead wird vor Probe und Lieferung einzeln geprüft" },
    { id: "bestand", label: "Bestand", icon: "bestand", value: stock ? compact(Object.values(leadsNew).reduce((a, b) => a + b, 0)) : "…", sub: stock ? "Leads" : "lädt", state: "idle", tip: "lieferbare Leads US/UK/FR" },
    { id: "proben", label: "Proben", icon: "proben", value: `${ready}/${target}`, sub: "bereit", state: state("proben-vorrat", "proben-vorrat", 26), tip: "fertige, geprüfte Proben / Soll" },
    { id: "kwerk", label: "Kunden-Werk", icon: "kunden-werk", value: stockAll ? compact(newBuyers24) : "…", sub: "neu 24 h", state: state("kunden-werk", "kunden-werk", 5), tip: "neue mail-fähige Webagenturen in 24 h", auto: autopilotOn },
    { id: "kaeufer", label: "Käufer", icon: "kaeufer", value: stock ? compact(Object.values(freeBuyers).reduce((a, b) => a + b, 0)) : "…", sub: stock ? "frei" : "lädt", state: "idle", tip: "mail-fähige Käufer ohne Mail" },
    { id: "versand", label: "Versand", icon: "versand", value: `${sentToday}`, unit: `/${cap}`, sub: sendOff ? `aus · ${sendOff}` : "an · 24/7",
      state: sendOff ? "bad" : act.sent_60m > 0 || isLive(act, "versand", now) ? "live" : "idle",
      tip: sendOff ? `Versand aus (${sendOff}) · Mails heute / Kapazität` : "Versand an, rund um die Uhr · Mails heute / Kapazität",
      badge: sendOff ? { text: "aus", on: false, tip: `Versand aus: ${sendOff}` } : { text: "24/7", on: true, tip: "Versand an: jeden Tag, stündlich" } },
    { id: "antworten", label: "Antworten", icon: "antworten", value: `${w.replies}`, sub: `${w.positive} positiv`, state: state("antworten", "antworten", 30), tip: "echte Antworten 7 Tage (ohne Abwesenheit)" },
    { id: "kunden", label: "Kunden", icon: "kunden", value: `${subs.length}`, sub: `${revenue}/Mon.`, state: subs.length ? "live" : "idle", tip: "zahlende Kunden · Umsatz pro Monat" },
    ...wLine.stations,
  ] as Station[]).map((x) => ({ ...x, neck: x.id === neck || x.id === wNeck, spark: sparks[x.id] }));
  const edges: Edge[] = [
    { from: "lead", to: "gate", perHour: act.leads_60m, label: "neue Leads" },
    // grüne Leads gehen direkt in den Bestand; die Drei-Stufen-Freigabe prüft jeden Lead erst vor Probe/Lieferung
    // (Inhaber 04.10.2026: „warum läuft nichts von freigabe zu bestand?“ – vorher stand hier die Prüf-Rate, bei vollem Vorrat 0)
    { from: "gate", to: "bestand", perHour: act.leads_60m, label: "in den Bestand" },
    { from: "bestand", to: "proben", perHour: act.stock_built_60m, label: "Proben gebaut" },
    { from: "proben", to: "kunden", perHour: act.stock_sent_60m, label: "Proben raus" },
    { from: "kwerk", to: "kaeufer", perHour: act.buyers_ok_60m, label: "Käufer geprüft" },
    { from: "kaeufer", to: "versand", perHour: act.sent_60m, label: "Mails" },
    { from: "versand", to: "antworten", perHour: act.replies_60m, label: "Antworten" },
    { from: "antworten", to: "kunden", perHour: 0, label: "Kunden" },
    ...(wLine.edges as Edge[]),
  ];

  // ---------------------------------------------------------------- JARVIS, Ampeln, Ticker
  // Wichtigstes zuerst (Nachtschicht 04.10.2026): Notbremse, offene Antworten, leerer Proben-Vorrat vor den Werk-Hinweisen
  // Datenfluss-Alarm (PR #329, wie scripts/datenfluss.py stillstand): Stationen ohne Zuwachs seit > 3× üblich
  const ub = await ubP;
  const stillRows = ub.flow ?? [];
  const still = judgeFlow(stillRows, now, switchedOff({ lead_suche: CONFIG.lead_suche, kunden_suche: CONFIG.kunden_suche, versand_aktiv: CONFIG.versand.aktiv,
    werke_paused: own.werke_paused, send_paused: own.send_paused }, stillRows));
  const stillTips: Tip[] = still.filter((a) => a.stufe === "rot" || a.stufe === "gelb").map(stillTip);
  const tips = rankTips([
    ...(nb.stop ? [{ level: "rot" as const, title: "Notbremse: Versand gestoppt", text: `${nb.stop}. Neustart nur nach deiner Entscheidung.`, href: "/dashboard/versand" }] : []),
    ...stillTips,
    ...alarmTips({ openReplies, samplesReady: st.length ? ready : null, samplesTarget: target }),
    // Offene Probe-Anfragen der Website (alle Zielgruppen/Länder): sofort sichtbar, ab 15 min rot
    ...(() => {
      const open = liveAll.sample_requests.filter((r) => r.status === "new" && !r.is_test);
      if (!open.length) return [];
      const late = open.some((r) => t - Date.parse(r.created_at) > 15 * 60_000);
      const names = open.slice(0, 3).map((r) => `${r.company_name} (${r.segment_id}/${r.country}${/Warteliste/.test(r.note ?? "") ? ", nicht lieferbar" : ""})`).join(", ");
      return [{ level: late ? "rot" as const : "gelb" as const, title: open.length === 1 ? "1 Probe-Anfrage offen" : `${open.length} Probe-Anfragen offen`,
        text: `${names}. Proben gehen normalerweise sofort raus – offen heißt: noch keine passende fertige Probe.`, href: "/dashboard/proben" } as Tip];
    })(),
    ...coach({ reg: REG, plan, stats, util: util.rate, queue, freeBuyers, leads: leadsNew, capPerDay: cap, kundenNew24h: stockAll ? newBuyers24 : null, stockKnown: !!stock, autopilot: autopilotOn,
    failed: beats.filter((b) => /^abgebrochen/.test(b.note ?? "") && t - Date.parse(b.beat_at) < 6 * 3_600_000).map((b) => `${b.werk} ${b.part} · ${berlin(b.beat_at)}`),
    countedHours: firstRun ? Math.min(24, (t - firstRun) / 3_600_000) : 0 }),
  ]);
  const tipStation = (href?: string): StationId => (href === "#pult" ? "lead" : href?.includes("bestand") ? "kaeufer" : href?.includes("versand") ? "versand" : href?.includes("proben") ? "proben" : "lead");
  const base = (id: StationId) => `/dashboard/jarvis?s=${id}`;
  // Antworten öffnen direkt das Cockpit, alles andere die passende Station
  const tipHref = (x: { href?: string }) => (x.href === "/dashboard/antworten" || x.href?.startsWith("/dashboard/jarvis") ? x.href! : `${base(tipStation(x.href))}${x.href === "#pult" || x.href?.includes("proben") ? "&t=set" : ""}`);
  const href = (id: StationId) => (WEB_STATIONS.includes(id) ? "/dashboard/website/auswertung" : s === id ? "/dashboard/jarvis" : base(id));
  const hello = greeting(now);
  // JARVIS empfiehlt (Inhaber 04.10.2026): 2–3 Optimierungen mit fertigem Auftrag, dazu der Engpass der Kette
  const neckLabel = neck ? stations.find((x) => x.id === neck)!.label : null;
  const neckTip: Tip[] = neck && neckLabel ? [{ level: "gelb", title: `Engpass: ${neckLabel}`, text: "Hier verliert die Kette am meisten – Ursachen finden und kostenlose Verbesserungen vorschlagen.", href: base(neck), task: neckTask(neckLabel) }] : [];
  // Per X ausgeblendete Hinweise (Inhaber 04.10.2026, lib/tips.ts): 7 Tage, rote Alarme höchstens 24 h
  const shown = visibleTips([...tips, ...neckTip], own.dismissed_tips, now);
  const { recs, rest } = recommend(shown);
  const say = shown[0]?.level === "rot" ? shown[0].title : recs[0] ? `Mein Vorschlag: ${recs[0].title}` : shown[0]?.title ?? "alles im grünen Bereich";
  // Kern-Kennzahlen (Inhaber 04.10.2026: Kopf mit Umsatz, Kunden, Proben, Antworten); Versand und Engpass zeigt die Fluss-Karte
  const sent24 = st.reduce((a, r) => a + r.sent24, 0);
  const kpis: Kpi[] = [
    { label: "Umsatz / Monat", value: revenue, sub: "netto aus Abos", tone: subs.length ? "green" : "grey", href: base("kunden"), icon: "trend-hoch" },
    { label: "Kunden", value: `${subs.length}`, sub: subs.length ? "zahlend" : "noch keine", tone: subs.length ? "green" : "grey", href: base("kunden"), icon: "kunden" },
    { label: "Proben bereit", value: `${ready}/${target}`, sub: `${sent24} raus in 24 h`, tone: !target ? "grey" : ready >= target ? "green" : ready ? "gold" : "red", href: base("proben"), icon: "proben" },
    openReplies
      ? { label: "Antworten offen", value: `${openReplies}`, sub: "jetzt beantworten", tone: "gold", href: "/dashboard/antworten", icon: "antworten" }
      : { label: "Antworten 7 Tage", value: `${w.replies}`, sub: `${w.positive} positiv`, tone: w.positive ? "green" : w.replies ? "cyan" : "grey", href: base("antworten"), icon: "antworten" },
    ((ps) => {
      if (!ps) return { label: "Prognose 30 Tage", value: "–", sub: "nicht lesbar", tone: "grey" as const, href: base("antworten"), icon: "tempo" as IconName };
      const x = prognoseSummary(ps);
      return { label: "Prognose 30 Tage", value: x.value, sub: x.sub, tone: x.tone, href: base("antworten"), icon: "tempo" as IconName, tip: x.tip };
    })(await progP),
  ];
  const startAt = agentStartLabel(now);
  // ---------------------------------------------------------------- Überblick
  const stichBy = new Map<string, { country: string; candidates: number; green: number }>();
  for (const r of sp7) { const x = stichBy.get(r.country) ?? { country: r.country, candidates: 0, green: 0 }; x.candidates += r.candidates; x.green += r.green; stichBy.set(r.country, x); }
  const heute = heuteWichtig({
    brake: nb.stop ?? null,
    deliver: ub.deliver,
    openReplies,
    stich: [...stichBy.values()].filter((r) => countries.includes(r.country)),
    bad: stations.filter((x) => x.state === "bad" && x.id !== "versand").map((x) => ({ id: x.id, label: x.label })),
    neck: neck && neckLabel ? { id: neck, label: neckLabel } : null,
    still,
  });
  // Mails: Tagesziel je Land = Anteil an der Postfach-Kapazität heute, höchstens das Länder-Limit (countries.yaml/Regler)
  const share = dayShare(now);
  const lim = Object.fromEntries(countries.map((c) => [c, effectiveLimit(CONFIG.countries[c]?.daily_limit ?? 0, own, c)]));
  const limSum = Object.values(lim).reduce((a, b) => a + b, 0);
  const sentBy = (c: string) => liveAll.sent_days.filter((x) => x.day === liveAll.today && x.country === c).reduce((a, x) => a + n(x.n), 0);
  const mailBars = countries.map((c) => bar(c, sentBy(c), limSum ? Math.min(lim[c], Math.round((cap * lim[c]) / limSum)) : 0, share));
  // Grüne Leads: Ist = kpi_daily leads_neu heute (Stand der letzten Messung), Ziel = Ø der Vortage
  const leadBars = ub.leads ? countries.map((c) => bar(c, ub.leads!.find((r) => r.country === c && r.day === today)?.value ?? 0, leadZiel(ub.leads!, c, today), share)) : null;
  const zeit = ub.decisions ? zeitleiste(ub.decisions, 20) : null;
  const gateView: GateView = {
    pct: gatePct, ok: gateOk, bad: gateBad, href: base("gate"), reasonsHref: `${base("gate")}&t=check&f=rot`,
    countries: countries.map((c) => { const r = sp7.find((x) => x.country === c); return { c, pct: r && r.candidates ? Math.round((r.green / r.candidates) * 1000) / 10 : null }; }),
  };
  const items: TickerItem[] = [
    // Probe-Anfragen der Website live (Inhaber 04.10.2026: „muss immer auch live eingetragen werden im dashboard“) –
    // alle Zielgruppen und Länder, nicht nur der gewählte Fokus
    ...liveAll.sample_requests.filter((r) => !r.is_test && t - Date.parse(r.created_at) < 48 * 3_600_000).slice(0, 10).map((r) => ({
      at: r.status === "sent" && r.sent_at ? r.sent_at : r.created_at, icon: "proben" as IconName,
      text: `${r.company_name} · Probe ${r.segment_id}/${r.country}${r.status === "sent" ? " gesendet" : /Warteliste/.test(r.note ?? "") ? " · nicht lieferbar" : " · offen"}`,
      tone: (r.status === "sent" ? "green" : "red") as TickerItem["tone"], href: "/dashboard/antworten" })),
    ...sent.map((m) => ({ at: m.sent_at, icon: "mail" as IconName, text: `${m.prospects?.company_name ?? "?"} ${m.prospects?.country ?? ""}`, tone: "cyan" as const, href: m.prospects ? `/dashboard/kontakte/${m.prospects.id}` : undefined })),
    ...live.events.filter((e) => ["reply", "reply_positive", "reply_negative", "sample_requested", "unsubscribed", "bounced"].includes(e.type)).slice(0, 10).map((e) => ({
      at: e.occurred_at, icon: ({ reply: "antwort", reply_positive: "stern", reply_negative: "antwort", sample_requested: "proben", unsubscribed: "abmeldung", bounced: "bounce" } as Record<string, IconName>)[e.type] ?? "info",
      text: `${e.company_name ?? "?"}${e.type === "unsubscribed" ? " abgemeldet" : e.type === "bounced" ? " Bounce" : e.type === "sample_requested" ? " Probe" : ""}`,
      tone: (e.type === "reply_positive" || e.type === "sample_requested" ? "green" : e.type === "bounced" || e.type === "unsubscribed" ? "red" : "gold") as TickerItem["tone"],
      href: e.prospect_id ? `/dashboard/kontakte/${e.prospect_id}` : undefined })),
    // Werke im Ticker: nur Teile mit Ergebnis (grüne Leads/Käufer) oder Abbruch – „0 grün“ wäre nur Rauschen
    ...beats.filter((b) => b.started_at && t - Date.parse(b.started_at) < 3 * 3_600_000 && (b.green > 0 || /^abgebrochen/.test(b.note ?? ""))).slice(0, 8).map((b) => ({
      at: /^(fertig|abgebrochen)/.test(b.note ?? "") ? b.beat_at : b.started_at!, icon: (/^abgebrochen/.test(b.note ?? "") ? "fehler" : /^fertig/.test(b.note ?? "") ? "stopp" : "start") as IconName,
      text: `${b.werk === "lead-werk" ? "Lead" : b.werk === "kunden-werk" ? "Kunden" : b.werk} ${b.part.split(" ")[0]}${/^fertig/.test(b.note ?? "") ? ` ${compact(b.green)} grün` : ""}`,
      tone: (/^abgebrochen/.test(b.note ?? "") ? "red" : "grey") as TickerItem["tone"] })),
  ];

  // ---------------------------------------------------------------- Seitenfenster
  const back = s ? `/dashboard/jarvis?s=${s}&t=${tab}` : "/dashboard/jarvis";
  const nx = (file: string) => { const d = nextWorkflowRun(CONFIG.workflows.find((y) => y.file === file), now); return d ? berlin(d, file === "send.yml") : "–"; };  // Versand: mit Datum
  const dispatch = canDispatch();
  // Direktstart (03.10.2026): mit Token sofort, sonst startet der Wachhund spätestens beim nächsten Lauf; Pausen gelten
  const Start = ({ wf }: { wf: StartKey }) => {
    const pk = START_WORKFLOWS[wf].pause as WerkKey | null;
    const paused = !!pk && !sw(pk).on;
    const st = startState(starts, wf, now);
    return (<>
      <form action={requestStart} className="row-go"><Back to={back} /><input type="hidden" name="wf" value={wf} />
        <button disabled={paused} title={paused ? "pausiert – erst einschalten" : dispatch ? "startet sofort" : "Wachhund startet spätestens in 15 min"}><Icon name="start" size={16} /> Jetzt starten</button></form>
      {st && <span className={st.tone === "bad" ? "warn" : "lock"} aria-live="polite">{st.text}</span>}
    </>);
  };
  const tokenHint = !dispatch && <p className="lock">Sofort statt in ≤ 15 min: GH_DISPATCH_TOKEN einmal in Vercel setzen (Anleitung: <Link href="/dashboard/hilfe">Hilfe</Link>)</p>;
  const Big = ({ items: k }: { items: [string, string][] }) => <div className="bigs">{k.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>;
  const byCountry = (o: Record<string, number>) => countries.map((c) => ({ key: c, label: c, n: o[c] ?? 0, color: COUNTRY_COLOR[c] }));
  const liveByLane: Record<string, number> = {};
  for (const b of beats) if (running(b, t)) { const l = laneOf(b.werk, b.part); if (l) liveByLane[l] = (liveByLane[l] ?? 0) + 1; }
  const pultLanes = REG.lanes.map((l) => ({ id: l.id, werk: l.werk, label: l.label, short: l.short, what: l.what, max: l.max, def: l.default, cur: plan[l.id] ?? 0, color: laneColor(l.id),
    stat: { runs: stats[l.id].runs, green: stats[l.id].green, perSlotH: stats[l.id].perSlotH, avgRunMin: stats[l.id].avgRunMin, perRun: stats[l.id].perRun, exhausted: stats[l.id].exhausted, empty: !!stats[l.id].empty, live: liveByLane[l.id] ?? 0 } }));
  const nextStart = { "lead-werk": `spätestens ${nx("lead-werk.yml")}`, "kunden-werk": `spätestens ${nx("kunden-werk.yml")}` };
  const custom = Object.keys(own.slot_plan ?? {}).length > 0;
  const checkList = (
    <ul className="chk">
      {checks.map((c, i) => (
        <li key={i} className={c.result === "released" ? "ok" : "bad"} title={c.leads?.event_summary ?? ""}>
          <i aria-hidden><Icon name={c.result === "released" ? "ok" : "fehler"} size={16} /></i>
          <b>{c.leads?.watch_companies?.name ?? "?"}</b><span>{c.leads?.country} · {c.leads?.signal_type?.replace(/_/g, " ")}</span>
          <em>{c.result === "released" ? "frei" : `Stufe ${c.failed_stage}: ${(c.reasons ?? [])[0] ?? ""}`}</em>
        </li>
      ))}
      {!checks.length && <li className="none">noch keine Prüfungen</li>}
    </ul>
  );
  const lnk = (to: string, label: string) => <Link href={to} className="more2">{label} <Icon name="weiter" size={16} /></Link>;
  const countryToggles = (list: string[], action: (f: FormData) => Promise<void>) => (
    <div className="tog2">{countries.map((c) => { const off = list.includes(c); return (
      <form key={c} action={action}><Back to={back} /><input type="hidden" name="country" value={c} /><button className={off ? "off" : "on"} title={off ? "aus" : "an"}><i style={{ background: COUNTRY_COLOR[c] }} />{c}</button></form>); })}</div>
  );

  const pre = { k: sp.k, m: sp.m, b: sp.b };
  let drawer: ReactNode = ag ? <AgentDrawer which={ag} tasks={agentTasks} pre={pre} startAt={startAt} /> : null;
  if (s && !ag) {
    const stn = stations.find((x) => x.id === s)!;
    const tabsOn = { set: !["bestand", "gate"].includes(s), check: true };
    let body: ReactNode = null;
    if (s === "lead") body = tab === "set" ? (<>
      <div className="row-sw"><WerkSwitch werk="lead-werk" on={sw("lead-werk").on} back={back} label="Lead-Werk" />{Start({ wf: "lead-werk" })}</div>
      {tokenHint}
      <AutopilotPanel on={autopilotOn} log={planLog["lead-werk"]} reg={REG} werk="lead-werk" back={back} />
      <Pult lanes={pultLanes} only={REG.lanes.filter((l) => l.werk === "lead-werk").map((l) => l.id)} cap={REG.total_slots - REG.reserve} total={REG.total_slots} back={back} action={saveSlotPlan} nextStart={nextStart} custom={custom} />
    </>) : tab === "check" ? <>{checkList}{lnk("/dashboard/werke", "alle Prüfstufen")}</> : (<>
      <div className="row-sw">{Start({ wf: "lead-werk" })}</div>
      {tokenHint}
      <Reactor bays={bays} running={busy} util={util.rate} center={`${busy}`} sub={`von ${REG.total_slots} Plätzen arbeiten gerade · ${Object.values(plan).reduce((a, b) => a + b, 0)} geplant${autopilotOn ? " (Autopilot)" : ""}`} />
      <MiniBars rows={REG.lanes.filter((l) => l.werk === "lead-werk" && (plan[l.id] || stats[l.id].runs)).map((l) => ({ key: l.id, label: l.short, n: stats[l.id].green, color: LANE_COLOR[l.id], href: `${base("lead")}&t=set`, tip: `${l.label}: ${plan[l.id]} Plätze · grün in 24 h` }))} />
      <UtilChart buckets={util.buckets} total={REG.total_slots} cap={REG.total_slots - REG.reserve} />
      <Bays bays={bays} labels={Object.fromEntries(REG.lanes.flatMap((l) => [[l.id, l.label], [`short:${l.id}`, l.short]]))} />
    </>);
    if (s === "gate") body = tab === "check" ? (<>
      <div className="seg"><Link href={`${base("gate")}&t=check`} scroll={false} className={sp.f !== "rot" ? "on" : ""}>alle</Link><Link href={`${base("gate")}&t=check&f=rot`} scroll={false} className={sp.f === "rot" ? "on" : ""}>aussortiert</Link></div>
      {sp.f === "rot" && <Reasons rows={reasonRows(checks)} />}
      {checkList}
    </>) : (<>
      <p className="jfg-what">Jeder Lead wird vor Probe und Lieferung in 3 Stufen geprüft. Nur wer alle besteht, geht raus.</p>
      <GateRings g={gateView} />
      <GateSteps />
      <p className="lock"><Icon name="schloss" size={14} /> immer an · nie abschaltbar</p>
    </>);
    if (s === "bestand") body = tab === "check" ? lnk("/dashboard/bestand", "Bestand im Detail") : (<>
      <Big items={[[compact(Object.values(leadsNew).reduce((a, b) => a + b, 0)), "lieferbar"], [`+${compact(leads24)}`, "24 h"]]} />
      <MiniBars rows={byCountry(leadsNew)} />
    </>);
    if (s === "proben") body = tab === "set" ? (<>
      <div className="row-sw">{Start({ wf: "proben-vorrat" })}</div>
      <form action={saveSampleTargets} className="frm"><Back to={back} />
        {countries.map((c) => <label key={c}><span>{c}</span><input name={`target_${SEGMENT}/${c}`} inputMode="numeric" defaultValue={own.sample_targets[`${SEGMENT}/${c}`] ?? ""} placeholder={String(st.find((r) => r.key.endsWith(`/${c}`))?.target ?? "")} /><em>Soll</em></label>)}
        <button className="go">Speichern</button></form>
    </>) : tab === "check" ? lnk("/dashboard/proben", "Proben im Detail") : (<>
      <div className="row-sw">{Start({ wf: "proben-vorrat" })}</div>
      <Big items={[[`${ready}/${target}`, "bereit"], [`${st.reduce((a, r) => a + r.sent24, 0)}`, "raus 24 h"]]} />
      <MiniBars rows={st.map((r) => ({ key: r.key, label: r.key.split("/")[1], n: r.ready, color: COUNTRY_COLOR[r.key.split("/")[1]], href: `${base("proben")}&t=set`, tip: `Soll ${r.target}` }))} />
    </>);
    if (s === "kwerk") body = tab === "set" ? (<>
      <div className="row-sw"><WerkSwitch werk="kunden-werk" on={sw("kunden-werk").on} back={back} label="Kunden-Werk" />{Start({ wf: "kunden-werk" })}</div>
      {countryToggles(own.buyer_countries_off, toggleBuyerCountry)}
      <AutopilotPanel on={autopilotOn} log={planLog["kunden-werk"]} reg={REG} werk="kunden-werk" back={back} />
      <Pult lanes={pultLanes} only={["kunden"]} cap={REG.total_slots - REG.reserve} total={REG.total_slots} back={back} action={saveSlotPlan} nextStart={nextStart} custom={custom} />
    </>) : tab === "check" ? lnk("/dashboard/kontakte", "Käufer ansehen") : (<>
      <div className="row-sw">{Start({ wf: "kunden-werk" })}</div>
      <Big items={[[compact(newBuyers24), "neu 24 h"], [`${act.buyers_ok_60m}`, "geprüft / h"], [`${plan.kunden}`, "Plätze"]]} />
      {newBuyers24 === 0 && <p className="warn">Quelle durchgeprüft – neue nötig</p>}
    </>);
    if (s === "kaeufer") body = tab === "set" ? (<>{countryToggles(own.buyer_countries_off, toggleBuyerCountry)}<p className="lock">Käufersuche je Land</p></>) : tab === "check" ? lnk("/dashboard/kontakte", "Käufer & Kontakte") : (<>
      <Big items={[[compact(Object.values(freeBuyers).reduce((a, b) => a + b, 0)), "frei"], [compact(countries.reduce((a, c) => a + n(ok(c)?.n), 0)), "mail-fähig"]]} />
      <MiniBars rows={byCountry(freeBuyers)} />
      {countries.filter((c) => (queue[c] ?? 0) > (freeBuyers[c] ?? 0)).map((c) => <p key={c} className="warn">{c}: Käufer knapp</p>)}
    </>);
    if (s === "versand") body = tab === "set" ? (<>
      <form action={setPaused} className="row-sw2"><Back to={back} />
        <button name="paused" value="0" className={!own.send_paused ? "on go" : ""}><Icon name="start" size={16} /> läuft</button><button name="paused" value="1" className={own.send_paused ? "on stop" : ""}><Icon name="pause" size={16} /> Pause</button></form>
      {countryToggles(own.send_countries_off, toggleSendCountry)}
      <form action={saveCountryLimits} className="frm"><Back to={back} />
        {countries.map((c) => <label key={c}><span>{c}</span><input name={`limit_${c}`} inputMode="numeric" defaultValue={own.send_country_limits[c] ?? ""} placeholder={String(CONFIG.countries[c]?.daily_limit ?? "")} /><em>/Tag · max {CONFIG.countries[c]?.daily_limit}</em></label>)}
        <button className="go">Speichern</button></form>
      <form action={saveFollowups} className="frm"><Back to={back} />
        <label><span>Nachfass</span><select name="enabled" defaultValue={own.followup_enabled ? "1" : "0"}><option value="1">an</option><option value="0">aus</option></select></label>
        <label><span>nach</span><input name="days" inputMode="numeric" defaultValue={own.followup_days ?? ""} placeholder="4" /><em>Tagen</em></label>
        <button className="go">Speichern</button></form>
    </>) : tab === "check" ? (<>
      <ul className="chk">{sent.map((m, i) => (
        <li key={i} className="ok"><i aria-hidden><Icon name="mail" size={16} /></i><b>{m.prospects ? <Link href={`/dashboard/kontakte/${m.prospects.id}`}>{m.prospects.company_name}</Link> : "?"}</b>
          <span>{m.prospects?.country} · {berlin(m.sent_at)}</span><em>{m.kind === "initial" ? "Erstmail" : "Nachfass"}</em></li>))}</ul>
      {lnk("/dashboard/versand", "Versand im Detail")}
    </>) : (<>
      <Big items={[[`${sentToday}/${cap}`, "heute"], [compact(Object.values(queue).reduce((a, b) => a + b, 0)), "warten"], [nx("send.yml"), "nächster Lauf"]]} />
      <MiniBars rows={countries.map((c) => ({ key: c, label: c, n: effectiveLimit(CONFIG.countries[c]?.daily_limit ?? 0, own, c), color: COUNTRY_COLOR[c], href: `${base("versand")}&t=set`, tip: "Mails/Tag (Limit)" }))} unit="/Tag" />
      {health && health.length > 0 && (
        <ul className="chk" aria-label="Bounces je Postfach (14 Tage)">{health.map((h) => (
          <li key={h.box} className={{ red: "bad", gold: "warn", grey: "grey", green: "" }[h.tone] || undefined}
            title={`${h.bounced} Bounces, ${h.complained} Beschwerden bei ${h.sent} Mails in 14 Tagen · gelb ab 3 %, rot ab 5 %`}>
            <i aria-hidden><Icon name={h.tone === "red" || h.tone === "gold" ? "warnung" : "mail"} size={16} /></i>
            <b>{h.box === "main" ? "Hauptpostfach" : h.box}</b>
            <span>{h.sent < BOX_MIN ? "zu wenig Mails" : `${(h.rate * 100).toFixed(1).replace(".", ",")} % Bounces`}</span>
            <em>{h.bounced} von {h.sent} · 14 Tage{h.complained ? ` · ${h.complained} Beschwerde` : ""}
              {Object.keys(h.codes).length > 0 && <span title="5.1.x = Adresse unbekannt, 5.7.x = abgelehnt/blockiert"> · {Object.entries(h.codes).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c}×${k}`).join(" ")}</span>}</em></li>))}</ul>
      )}
      {bounceSt && bounceSt.bounces > 0 && (<>
        <p className="lock" title="Bounces je Klasse, 7 Tage">Bounces 7 T · {(bounceSt.bounces / Math.max(1, bounceSt.gesendet) * 100).toFixed(1).replace(".", ",")} %</p>
        <MiniBars rows={KLASSEN.map((k) => ({ key: k, label: KLASSE_LABEL[k], n: bounceSt.klassen[k], color: KLASSE_COLOR[k], tip: KLASSE_TIP[k] }))} />
        {badSources(bounceSt).slice(0, 2).map((q) => <p key={`${q.country}${q.quelle}`} className="warn" title={`${q.hart} von ${q.gesendet} Mails hart zurück (7 Tage)`}>{q.country} · {q.quelle}: {(q.quote_hart * 100).toFixed(1).replace(".", ",")} % hart</p>)}
      </>)}
    </>);
    if (s === "antworten") body = tab === "set" ? (<>
      <div className="row-sw"><WerkSwitch werk="antworten" on={sw("antworten").on} back={back} label="Antwort-Assistent" note="Abmeldungen werden immer gesperrt" /></div>
      <p className="lock"><Icon name="schloss" size={14} /> Abmeldungen immer gesperrt</p>
    </>) : tab === "check" ? (<>
      <ul className="chk">{live.events.filter((e) => ["reply", "reply_positive", "reply_negative", "sample_requested"].includes(e.type)).slice(0, 12).map((e) => (
        <li key={e.id} className={e.type === "reply_negative" ? "bad" : "ok"} title={e.note ?? ""}><i aria-hidden><Icon name={e.type === "reply_positive" ? "stern" : "antwort"} size={16} /></i>
          <b>{e.prospect_id ? <Link href={`/dashboard/kontakte/${e.prospect_id}`}>{e.company_name ?? "?"}</Link> : e.company_name ?? "?"}</b>
          <span>{e.country} · {berlin(e.occurred_at)}</span><em>{(e.note ?? "").slice(0, 60)}</em></li>))}</ul>
      {lnk("/dashboard/antworten", "Antworten bearbeiten")}
    </>) : (<>
      <Big items={[[openReplies === null ? "…" : `${openReplies}`, "offen"], [`${w.replies}`, "Antworten 7 T"], [`${w.positive}`, "positiv"], [`${w.samples_requested}`, "Proben angefragt"]]} />
      {lnk("/dashboard/antworten", openReplies ? `${openReplies} offene Antworten bearbeiten` : "Antworten-Cockpit")}
      <Funnel rows={funnel} />
    </>);
    if (s === "kunden") body = tab === "set" ? lnk("/dashboard/kunden", "Kunden anlegen & freigeben") : tab === "check" ? (
      <ul className="chk">{subs.map((x) => <li key={x.id} className="ok"><i aria-hidden><Icon name="kunde" size={16} /></i><b>{x.customer?.company_name}</b><span>{x.customer?.country}</span><em>{compact(monthly(x))} {currencySign(x.currency, x.customer?.country)}</em></li>)}
        {!subs.length && <li className="none">noch keine Kunden</li>}</ul>
    ) : <Big items={[[`${subs.length}`, "Kunden"], [revenue, "pro Monat"], [nx("kundenlieferung.yml"), "nächste Lieferung"]]} />;
    drawer = <Drawer title={stn.label} icon={stn.icon} tab={tab} base={base(s)} close="/dashboard/jarvis" tabs={tabsOn} state={stn.state}>{body}</Drawer>;
  }

  return (
    <JarvisView hello={hello} say={say} kpis={kpis} recs={recs} rest={rest} tipHref={tipHref} agent={freeAgent(agentTasks)}
      tasks={agentTasks} startAt={startAt} activeAgent={ag} stations={stations} edges={edges} activeStation={s} stationHref={href}
      drawer={drawer} gate={gateView}
      heute={heute} ziel={{ mails: mailBars, leads: leadBars }} zeit={zeit} ticker={ticker(items)} customerAgents={await kaP} chat={await chatP} proposals={await propP} brauchtDich={await bdP}
      kohorten={{ rows: await khP, countries, today }}
      team={await teamP.then(async (d) => (d ? karten({ ...d, kohorten: await khP, today, now }) : null))}
      gehirn={{ score: gehirnScore(await kpiP, today), anpassungen: await metaP, offen: await impP }} />
  );
}

/** Häufigste Gründe der aussortierten Prüfungen (erster Grund je Lead), höchstens 6. */
function reasonRows(checks: { result: string; failed_stage?: number | null; reasons?: string[] | null }[]) {
  const m = new Map<string, { stage: number | null; reason: string; n: number }>();
  for (const c of checks) {
    if (c.result === "released") continue;
    const reason = (c.reasons ?? [])[0] ?? "ohne Grund";
    const k = `${c.failed_stage ?? ""}|${reason}`;
    const x = m.get(k) ?? { stage: c.failed_stage ?? null, reason, n: 0 };
    x.n++;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6);
}

/** Trichter je Land seit Start (alle Experimente der Zielgruppe): wo klappt was? Quote = Antworten je zugestellter Mail. */
function Funnel({ rows }: { rows: FunnelRow[] | null }) {
  if (!rows) return <p className="lock">Trichter lädt …</p>;
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}\u00a0%` : "–");
  return (
    <table className="fun" aria-label="Trichter je Land seit Start">
      <thead><tr><th>Land</th><th>Mails</th><th>zugestellt</th><th>Antw.</th><th>positiv</th><th title="per Mail angefragt (Website-Proben zählen oben mit)">Probe</th><th>Kunde</th><th title="Antworten je zugestellter Mail">Quote</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.country}><th>{r.country}</th><td>{r.sent}</td><td>{r.delivered}</td><td>{r.replies}</td><td>{r.positive}</td>
          <td>{r.samples}</td><td>{r.customers}</td><td title="Antworten je zugestellter Mail">{pct(r.replies, r.delivered)}</td></tr>))}
      </tbody>
    </table>
  );
}
