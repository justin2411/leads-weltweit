import "server-only";
import { db } from "@/lib/supabase";
import { CONFIG, SEGMENT, loadFunnel, loadFunnelCache, loadLive, loadOwnerSettings, loadStock } from "@/lib/dashboard-data";
import { funnelBrief } from "@/lib/website-funnel";
import { brake, mailboxes, monthly, realSubscriptions, sampleStock, type Live, type Stock } from "@/lib/dashboard-logic";
import { budgetOf, budgetState, compactFlow, knowledgeBlock, monthStart, type Bereich, type BudgetState, type KnowledgeDoc } from "@/lib/jarvis-llm";
import { nextRun, scheduleLabel, toRoutine, whenLabel, type BrainRoutine } from "@/lib/brain-routines";
import { titelVon } from "@/lib/kurz";
import { fromBrain } from "@/lib/agents";
import { nextRunAt, type ChatSession } from "@/lib/jarvis-chat";
import { WERK_SWITCHES, slotCounts, werkOn, type OwnerSettings, type WerkKey } from "@/lib/owner-settings";
import { REG } from "@/lib/regler-data";
import { fmtBerlin } from "@/lib/start-queue";
import { nextSendStart } from "@/lib/versandzeit";

/**
 * Kompakter Kontext für die Sofort-Antworten (lib/jarvis-ask.ts) und die lesenden Werkzeuge (lib/jarvis-tools.ts).
 * Nur Zahlen und Zustände – keine Lead-Kontaktdaten (keine E-Mail-Adressen, Telefonnummern, Firmenlisten).
 * Jeder Teil fängt seine Fehler selbst ab („nicht lesbar“ statt falscher Nullen).
 */
const T = (ms = 5000) => AbortSignal.timeout(ms);
const NA = "nicht lesbar";

export type Sources = { live: Live | null; stock: Stock | null; own: OwnerSettings; now: Date };

export async function loadSources(now = new Date()): Promise<Sources> {
  const [live, stock, own] = await Promise.all([
    loadLive().catch(() => null),
    Promise.race([loadStock().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 4500))]),
    loadOwnerSettings(),
  ]);
  return { live, stock, own, now };
}

// ------------------------------------------------------------------------------------------- API-Kosten
/** Summe der API-Kosten seit Monatsbeginn (deutsche Zeit); Tabelle fehlt/Fehler → null. */
export async function llmSpent(now = new Date()): Promise<number | null> {
  try {
    const { data, error } = await db().from("llm_usage").select("cost_eur").gte("at", monthStart(now).toISOString()).limit(20000).abortSignal(T(4000));
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((a, r) => a + Number((r as { cost_eur: unknown }).cost_eur ?? 0), 0);
  } catch {
    return null;
  }
}

/** „API diesen Monat: x,xx € von 30 €“ – null, wenn die Kosten nicht lesbar sind. */
export async function loadLlmState(own?: OwnerSettings): Promise<BudgetState | null> {
  const [spent, s] = await Promise.all([llmSpent(), own ? Promise.resolve(own) : loadOwnerSettings()]);
  return spent === null ? null : budgetState(spent, budgetOf(s.llm_budget_eur));
}

// ------------------------------------------------------------------------------------------- Bereiche
const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

function versand(s: Sources) {
  if (!s.live) return { fehler: NA };
  const boxes = mailboxes(s.live, CONFIG);
  const b = brake(s.live, CONFIG);
  const next = nextSendStart(s.now);
  return {
    aktiv: CONFIG.versand.aktiv !== false && !s.own.send_paused, pausiert_im_dashboard: s.own.send_paused,
    heute_gesendet: sumBy(boxes, (x) => x.today), tagesgrenze: sumBy(boxes, (x) => x.cap), postfaecher: boxes.length,
    naechster_lauf: next ? `${fmtBerlin(next.at)} (${next.g.name})` : "kein Lauf geplant",
    notbremse: b.stop ?? "aus", bounces_30_tage: `${b.bounced}/${b.sent}`, beschwerden: b.complained,
    nachfass: s.own.followup_enabled !== false ? "an" : "aus", letzte_mail: s.live.last_sent_at ? fmtBerlin(s.live.last_sent_at) : null,
  };
}

function proben(s: Sources) {
  if (!s.live) return { fehler: NA };
  const rows = sampleStock(s.live, CONFIG, s.now);
  const req = s.live.sample_requests.filter((r) => !r.is_test);
  const by: Record<string, number> = {};
  for (const r of req) by[r.status] = (by[r.status] ?? 0) + 1;
  return {
    seiten: rows.map((r) => ({ seite: r.key, bereit: r.ready, soll: r.target, raus_24h: r.sent24 })),
    bereit_gesamt: sumBy(rows, (r) => r.ready), soll_gesamt: sumBy(rows, (r) => r.target),
    anfragen_nach_status: by, zuletzt_gebaut: s.live.stock_last_built ? fmtBerlin(s.live.stock_last_built) : null,
  };
}

async function freigabe() {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const count = (result: string) => db().from("lead_checks").select("id", { count: "exact", head: true }).eq("result", result).gte("checked_at", since)
    .abortSignal(T()).then((r) => (r.error ? null : r.count ?? 0), () => null);
  const [ok, bad] = await Promise.all([count("released"), count("failed")]);
  if (ok === null || bad === null) return { fehler: NA };
  return { freigegeben_24h: ok, durchgefallen_24h: bad, quote_durchgefallen: ok + bad ? `${Math.round((bad / (ok + bad)) * 1000) / 10} %` : "–" };
}

function kunden(s: Sources) {
  if (!s.live) return { fehler: NA };
  const subs = realSubscriptions(s.live);
  const byCur: Record<string, number> = {};
  for (const x of subs) {
    const c = (x.currency ?? "eur").toUpperCase();
    byCur[c] = (byCur[c] ?? 0) + monthly(x);
  }
  const anfragen: Record<string, number> = {};
  for (const c of s.live.contact_requests) anfragen[c.status] = (anfragen[c.status] ?? 0) + 1;
  return { zahlende_kunden: subs.length, umsatz_monat_netto: byCur, kontaktanfragen_nach_status: anfragen };
}

async function antworten() {
  const [open, funnel] = await Promise.all([
    db().from("inbound_replies").select("id", { count: "exact", head: true }).eq("status", "offen").abortSignal(T())
      .then((r) => (r.error ? null : r.count ?? 0), () => null),
    loadFunnel(),
  ]);
  return {
    offen_im_cockpit: open,
    je_land_seit_start: funnel?.map((f) => ({ land: f.country, mails: f.sent, zugestellt: f.delivered, antworten: f.replies, positiv: f.positive, proben: f.samples, kunden: f.customers })) ?? NA,
  };
}

/** Leads und mail-fähige Käufer je Land (Zielgruppe des Dashboards), optional nur ein Land. */
export function bestand(s: Sources, land?: string) {
  if (!s.stock) return { fehler: "Bestand lädt noch" };
  const st = s.stock;
  const lands = [...new Set([...st.leads.map((l) => l.country), ...st.prospects.map((p) => p.country)])].filter((c) => !land || c === land).sort();
  return {
    stand: fmtBerlin(st.at), zielgruppe: SEGMENT,
    laender: lands.map((c) => {
      const leads: Record<string, number> = {};
      for (const l of st.leads) if (l.country === c && (l.segment_id ?? SEGMENT) === SEGMENT) leads[l.status] = (leads[l.status] ?? 0) + Number(l.n);
      const ok = st.prospects.filter((p) => p.country === c && p.segment_id === SEGMENT && p.check_status === "ok");
      const call = st.prospects.filter((p) => p.country === c && p.segment_id === SEGMENT && p.check_status === "call_only");
      return {
        land: c, leads_nach_status: leads,
        leads_neu_24h: sumBy(st.leads_24h.filter((l) => l.country === c && (l.segment_id ?? SEGMENT) === SEGMENT), (l) => Number(l.n)),
        kaeufer_mailfaehig: sumBy(ok, (p) => Number(p.n)), kaeufer_noch_nicht_angeschrieben: sumBy(ok, (p) => Number(p.unused)),
        kaeufer_mailfaehig_neu_24h: sumBy(st.prospects_24h.filter((p) => p.country === c && p.segment_id === SEGMENT && p.check_status === "ok"), (p) => Number(p.n)),
        nur_anruf_brief: sumBy(call, (p) => Number(p.n)),
      };
    }),
  };
}

function werke(s: Sources) {
  const plan = slotCounts(REG, s.own.slot_plan);
  return {
    werke: Object.fromEntries((Object.keys(WERK_SWITCHES) as WerkKey[]).map((k) => [k, werkOn(s.own, k).on ? "an" : "aus"])),
    autopilot_plaetze: s.own.slot_autopilot?.on !== false ? "an" : "aus",
    plaetze_je_linie: Object.fromEntries(REG.lanes.map((l) => [l.id, `${plan[l.id] ?? 0}/${l.max}`])),
    plaetze_gesamt: `${Object.values(plan).reduce((a, b) => a + b, 0)}/${REG.total_slots - REG.reserve}`,
  };
}

async function engpass() {
  try {
    const { data, error } = await db().from("decisions").select("subject, created_at, metrics").like("subject", "Engpass:%")
      .order("created_at", { ascending: false }).limit(3).abortSignal(T());
    if (error) throw new Error(error.message);
    return { letzte: (data ?? []).map((d) => ({ station: String(d.subject).replace(/^Engpass:\s*/, ""), am: fmtBerlin(String(d.created_at)) })) };
  } catch {
    return { fehler: NA };
  }
}

/** Ein Bereich für das Werkzeug „kennzahlen“. */
export async function area(b: Bereich, s: Sources): Promise<unknown> {
  switch (b) {
    case "versand": return versand(s);
    case "proben": return proben(s);
    case "freigabe": return freigabe();
    case "kunden": return kunden(s);
    case "antworten": return antworten();
    case "bestand": return bestand(s);
    case "werke": return werke(s);
    case "engpass": return engpass();
    case "api": return (await loadLlmState(s.own)) ?? { fehler: NA };
  }
}

// ------------------------------------------------------------------------------------------- Thema der Sitzung
/** Baukasten: Flow kurz (Name, Art, Status, Bausteine); Website: letzter Website-Check (Tabelle darf fehlen). */
async function topic(session: ChatSession): Promise<string> {
  const head = `Sitzung: „${session.title}“ (${session.kind})`;
  if (session.kind === "baukasten" && session.flow_id) {
    try {
      const { data } = await db().from("flows").select("id, name, kind, status, def, updated_at").eq("id", session.flow_id).abortSignal(T()).maybeSingle();
      if (!data) return head;
      let pending: unknown = null;
      const p = await db().from("flows").select("pending_def").eq("id", session.flow_id).abortSignal(T()).maybeSingle();
      if (!p.error && p.data) pending = p.data.pending_def ?? null;
      return `${head}\nFlow im Baukasten: id ${data.id}, „${data.name}“, Art ${data.kind ?? "test"}, Status ${data.status}, version (updated_at) ${data.updated_at}`
        + `\nGespeicherter Flow (kompakt): ${compactFlow(data.def)}`
        + (pending ? `\nOffener Vorschlag (noch nicht übernommen): ${compactFlow(pending)}` : "")
        + "\nFlow-Änderungen selbst mit flow_speichern machen (vorher flow_lesen für die volle Fassung) – nicht an einen Agenten geben.";
    } catch {
      return head;
    }
  }
  if ((session.kind as string) === "website") {
    try {
      const { data, error } = await db().from("website_checks").select("*").order("created_at", { ascending: false }).limit(1).abortSignal(T());
      if (error || !data?.length) return `${head}\nLetzter Website-Check: keiner vorhanden`;
      const s = JSON.stringify(data[0]);
      return `${head}\nLetzter Website-Check: ${s.length > 1500 ? `${s.slice(0, 1500)} …` : s}`;
    } catch {
      return `${head}\nLetzter Website-Check: nicht lesbar`;
    }
  }
  return head;
}

const line = (k: string, v: unknown) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`;

/** Kompakter Kontext (wenige hundert Tokens): Uhrzeit, Kennzahlen, Thema der Sitzung. */
export async function buildContext(session: ChatSession, s: Sources): Promise<string> {
  const now = s.now;
  const [fg, en, an, top, api, wt] = await Promise.all([freigabe(), engpass(), antworten(), topic(session), loadLlmState(s.own),
    loadFunnelCache(5 * 60_000).then(funnelBrief, () => ({ fehler: NA }))]);
  const v = versand(s) as Record<string, unknown>;
  const p = proben(s) as Record<string, unknown>;
  const k = kunden(s);
  const b = bestand(s) as { laender?: { land: string; leads_neu_24h: number; kaeufer_mailfaehig: number; kaeufer_noch_nicht_angeschrieben: number }[] };
  const w = werke(s);
  return [
    `Jetzt: ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "full", timeStyle: "short" }).format(now)} (deutsche Zeit). Nächster Agenten-Lauf: ${nextRunAt(now)}.`,
    line("Versand", v.fehler ? v : { aktiv: v.aktiv, heute: `${v.heute_gesendet}/${v.tagesgrenze}`, naechster_lauf: v.naechster_lauf, notbremse: v.notbremse, nachfass: v.nachfass }),
    line("Proben", p.fehler ? p : { bereit: `${p.bereit_gesamt}/${p.soll_gesamt}`, seiten: p.seiten }),
    line("Freigabe", fg),
    line("Kunden", k),
    line("Antworten", { offen: an.offen_im_cockpit }),
    line("Bestand", b.laender ? b.laender.map((x) => ({ land: x.land, leads_neu_24h: x.leads_neu_24h, kaeufer_ok: x.kaeufer_mailfaehig, kaeufer_frei: x.kaeufer_noch_nicht_angeschrieben })) : b),
    line("Werke", { ...w.werke, autopilot: w.autopilot_plaetze, plaetze: w.plaetze_gesamt }),
    line("Engpass", en),
    // Website-Trichter Startseite → Landingpage → Tarif → Stripe → Danke (24 h und 30 Tage, wie /dashboard/website/auswertung)
    line("Website-Trichter", wt),
    line("API", api?.text ?? NA),
    top,
  ].join("\n");
}

// ------------------------------------------------------------------------------------------- Gehirn-Modus
/** Gehirn-Routinen (Tabelle darf fehlen → leer). */
export async function loadRoutines(): Promise<BrainRoutine[]> {
  try {
    const { data, error } = await db().from("brain_routines").select("*").order("uhrzeit").limit(100).abortSignal(T());
    if (error) throw new Error(error.message);
    return (data ?? []).map((x) => toRoutine(x as Record<string, unknown>));
  } catch {
    return [];
  }
}

/** Wissen des Gehirns, neueste zuerst (Tabelle darf fehlen → leer). */
export async function loadKnowledge(limit = 60): Promise<(KnowledgeDoc & { id: string; created_at: string; routine_id: string | null })[]> {
  try {
    const { data, error } = await db().from("brain_knowledge").select("id, slug, titel, markdown, quelle, routine_id, created_at, updated_at")
      .order("updated_at", { ascending: false }).limit(limit).abortSignal(T(6000));
    if (error) throw new Error(error.message);
    return (data ?? []).map((x) => ({
      id: String(x.id), slug: String(x.slug), titel: String(x.titel), markdown: String(x.markdown ?? ""), quelle: String(x.quelle ?? "agent"),
      routine_id: (x.routine_id as string | null) ?? null, created_at: String(x.created_at), updated_at: String(x.updated_at),
    }));
  } catch {
    return [];
  }
}

/** Zusätzlicher Kontext für den Gehirn-Modus: Trichter je Land, Umsatz/Kunden, offene Vorschläge, laufende Tests,
 *  letzte Änderungen von JARVIS, Routinen, Aufträge. Nur Zahlen und kurze Titel – keine Lead-Kontaktdaten. */
export async function brainContext(s: Sources): Promise<string> {
  const since7 = new Date(s.now.getTime() - 7 * 86_400_000).toISOString();
  type Row = Record<string, unknown>;
  const rows = (p: PromiseLike<{ data: unknown; error: unknown }>) => Promise.resolve(p).then((r) => (r.error ? null : ((r.data ?? []) as Row[])), () => null);
  const [an, proposed, tests, done, routines, tasks] = await Promise.all([
    antworten(),
    rows(db().from("decisions").select("*").eq("status", "proposed").gte("created_at", since7).order("created_at", { ascending: false }).limit(8).abortSignal(T())),
    rows(db().from("decisions").select("*").like("subject", "Test:%").order("created_at", { ascending: false }).limit(5).abortSignal(T())),
    rows(db().from("decisions").select("*").eq("status", "done").gte("created_at", since7).order("created_at", { ascending: false }).limit(8).abortSignal(T())),
    loadRoutines(),
    rows(db().from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(10).abortSignal(T())),
  ]);
  const short = (d: Row) => ({ titel: titelVon({ subject: String(d.subject ?? ""), kurz_titel: (d.kurz_titel as string | null) ?? null }), am: fmtBerlin(String(d.created_at)) });
  return [
    line("Trichter je Land seit Start", an.je_land_seit_start),
    line("Offene Vorschläge (7 Tage)", proposed ? proposed.map(short) : NA),
    line("A/B-Tests (letzte)", tests ? tests.map((d) => ({ ...short(d), status: d.status })) : NA),
    line("JARVIS hat umgesetzt (7 Tage)", done ? done.map(short) : NA),
    line("Gehirn-Routinen", routines.length ? routines.map((r) => ({ id: r.id, name: r.name, plan: scheduleLabel(r), aktiv: r.aktiv, naechster: whenLabel(nextRun(r, s.now), s.now), ergebnis: r.last_result })) : "keine"),
    line("Letzte Aufträge", tasks ? tasks.map((t) => ({ agent: t.agent, art: t.kind, status: t.status, von: fromBrain(t as { created_by?: string | null }) ? "Gehirn" : t.created_by ?? null,
      grund: t.grund ?? null, auftrag: String(t.brief ?? "").slice(0, 100), ergebnis: t.result ? String(t.result).slice(0, 160) : null, gelernt: !!t.gelernt_at })) : NA),
  ].join("\n");
}

/** Wissen als Kontext-Block (neueste zuerst, gekürzt). */
export async function knowledgeContext(): Promise<string> {
  return knowledgeBlock(await loadKnowledge());
}
