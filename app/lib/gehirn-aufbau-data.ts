import "server-only";
import { db } from "@/lib/supabase";
import { CONFIG, loadRuns } from "@/lib/dashboard-data";
import { loadZentrale } from "@/lib/zentrale-data";
import { WERKE } from "@/lib/firma-karte";
import { gehirnBild, nowMs, plaetzeBild, werkeBild } from "@/lib/zentrale-modell";
import { kurz } from "@/lib/zentrale-logik";
import { AGENT_COUNT } from "@/lib/agents";
import {
  agentStatus, aktuell, erledigt7, kurzAuftrag, naechster, ROUTINEN_LISTE, zeitplan, type AStatus, type ATask, type Termin,
} from "@/lib/gehirn-aufbau";

/**
 * Daten der Gehirn-Seite „Aufbau“ (Gehirn → Agenten → Werke → Zeitplan), nur serverseitig mit Service-Schlüssel.
 * Agenten nur, die es wirklich gibt: A1–A9 (agent_tasks.agent), Fach-Agenten (agent_roles), Website-Agenten
 * (website_agents), eigene Agenten (custom_agents + agent_runs), Routinen Quellen-Scout und Premium-Labor (lib/routinen.json).
 * Werke aus firma-karte.json + Herzschlag/Läufe (loadZentrale), Plätze aus werk-linien.json/slot_plan. Keine Lead-Daten.
 * Jede Abfrage mit Zeitlimit; Ausfall → leer statt Fehlerseite.
 */
type Row = Record<string, unknown>;
async function lies(tabelle: string, spalten: string, f: (q: any) => any, ms = 3000): Promise<Row[]> {
  try {
    const { data, error } = await f(db().from(tabelle).select(spalten)).abortSignal(AbortSignal.timeout(ms));
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}
const s = (x: unknown) => (x === null || x === undefined ? null : String(x));

export type Verlauf = { titel: string; status: string; at: string; ergebnis: string };
export type AgentKarte = {
  key: string; name: string; icon: string; marke?: string; status: AStatus; auftrag: string; erledigt: number | null;
  next?: string | null; verlauf: Verlauf[];
};
export type Gruppe = { key: string; titel: string; icon: string; agenten: AgentKarte[] };
export type WerkKarte = {
  id: string; name: string; icon: string; puls: string; ist: number | null; soll: number | null; max: number | null;
  last: string | null; next: string | null; fehler: boolean; zahl: string; unter: string;
};
export type AufbauBild = {
  now: string;
  gehirn: { an: boolean | null; autopilot: boolean; wort: string; letzte: string | null; naechste: string | null;
    meldung: { text: string; at: string } | null; meldungen: { text: string; at: string }[]; chatId: string | null };
  gruppen: Gruppe[];
  werke: WerkKarte[];
  plaetze: { laufend: number; geplant: number; gesamt: number };
  zeitplan: { haupt: Termin[]; weitere: Termin[] };
};

const WERK_ICON: Record<string, string> = {
  lead: "lead-werk", pruefer: "freigabe", stichprobe: "filter", proben: "proben", kunden: "kunden-werk", versand: "versand", antworten: "antworten",
  lieferung: "lieferung", wachhund: "puls", kontakt: "kontakte", "website-check": "website", "agenten-werk": "agent",
};
const ROLLE_ICON: Record<string, string> = {
  test: "weiche", trichter: "filter", qualitaet: "freigabe", lead_pruefer: "ok-kreis", kaeufer_pruefer: "kaeufer", zustellung: "versand", quellen: "quelle",
  kundenservice: "antworten", finanzen: "trend-hoch", recht: "recht", strategie: "gehirn", premium: "premium",
};

function verlauf(ts: ATask[], n = 6): Verlauf[] {
  return [...ts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n).map((t) => ({
    titel: kurz(t.brief).titel, status: t.status, at: t.finished_at ?? t.created_at, ergebnis: kurz("", t.result ?? t.step ?? "").grund,
  }));
}

function karte(key: string, name: string, icon: string, ts: ATask[], now: Date, an = true, marke?: string): AgentKarte {
  const a = aktuell(ts);
  return { key, name, icon, marke, status: agentStatus(ts, an), auftrag: a ? kurzAuftrag(a.step && a.status === "laeuft" ? a.step : a.brief) : "", erledigt: erledigt7(ts, now), verlauf: verlauf(ts) };
}

export async function loadAufbau(): Promise<AufbauBild> {
  const seit = new Date(Date.now() - 7 * 864e5).toISOString();
  const [z, tasksRaw, rollen, web, eigene, runs, sess, ghRuns] = await Promise.all([
    loadZentrale("alle"),
    lies("agent_tasks", "id, agent, rolle, kind, brief, status, step, result, created_by, created_at, finished_at",
      (q) => q.or(`created_at.gte.${seit},status.in.(offen,laeuft)`).order("created_at", { ascending: false }).limit(600)),
    lies("agent_roles", "slug, name, aktiv, sort", (q) => q.order("sort").limit(40)),
    lies("website_agents", "id, name, aktiv, last_run_at, last_task_id, last_result", (q) => q.order("created_at").limit(20)),
    lies("custom_agents", "id, name, enabled, last_run_at, last_result", (q) => q.order("created_at").limit(20)),
    lies("agent_runs", "agent_id, started_at, finished_at, error", (q) => q.gte("started_at", seit).order("started_at", { ascending: false }).limit(300)),
    lies("jarvis_sessions", "id", (q) => q.eq("kind", "gehirn").limit(1)),
    Promise.race([loadRuns().catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]),
  ]);
  const now = new Date(nowMs(z.schnell, z.abruf));
  const chatId = s(sess[0]?.id);
  const msgs = chatId ? await lies("jarvis_messages", "body, created_at, role", (q) => q.eq("session_id", chatId).neq("role", "user").order("created_at", { ascending: false }).limit(5)) : [];
  const tasks: ATask[] = tasksRaw.map((t) => ({
    id: String(t.id), agent: t.agent === null || t.agent === undefined ? null : Number(t.agent), rolle: s(t.rolle), kind: String(t.kind ?? ""), brief: String(t.brief ?? ""),
    status: String(t.status ?? ""), step: s(t.step), result: s(t.result), created_by: s(t.created_by), created_at: String(t.created_at), finished_at: s(t.finished_at),
  }));

  // ---------------------------------------------------------------- Gehirn
  const g = gehirnBild(z.schnell, z.langsam, now.getTime());
  const gehirnRoutine = ROUTINEN_LISTE.find((r) => r.key === "gehirn");
  const meldungen = msgs.map((m) => ({ text: kurz(String(m.body ?? "").split("\n")[0]).titel, at: String(m.created_at) }));
  const letzte = [z.langsam?.lern.last_decision ?? null, meldungen[0]?.at ?? null,
    ...tasks.filter((t) => /^Gehirn/.test(t.created_by ?? "")).map((t) => t.created_at)].filter((x): x is string => !!x).sort().pop() ?? null;
  const gehirn = {
    an: z.schnell?.brain_enabled ?? null, autopilot: z.schnell?.owner.slot_autopilot?.on !== false, wort: g.wort, letzte,
    naechste: gehirnRoutine ? naechster(gehirnRoutine.crons, now)?.toISOString() ?? null : null,
    meldung: meldungen[0] ?? null, meldungen, chatId,
  };

  // ---------------------------------------------------------------- Agenten
  const agentNr = Array.from({ length: AGENT_COUNT + 1 }, (_, i) => i + 1).map((n) =>
    karte(`a${n}`, n === 9 ? "Kunden-Agenten" : `Agent ${n}`, n === 9 ? "kunden" : "agent", tasks.filter((t) => t.agent === n), now, true, `A${n}`));
  const fach = rollen.map((r) => {
    const slug = String(r.slug);
    return karte(`r:${slug}`, String(r.name ?? slug), ROLLE_ICON[slug] ?? "agent", tasks.filter((t) => t.rolle === slug || t.rolle === `rolle:${slug}`), now, r.aktiv !== false);
  });
  const webTasks = tasks.filter((t) => t.kind === "website");
  const website = web.map((w) => {
    const name = String(w.name ?? "");
    const ts = webTasks.filter((t) => t.id === s(w.last_task_id) || t.brief.includes(name));
    const k = karte(`w:${s(w.id)}`, name, "website", ts, now, w.aktiv !== false);
    if (!k.verlauf.length && w.last_result) k.verlauf = [{ titel: name, status: "fertig", at: String(w.last_run_at ?? ""), ergebnis: kurz("", String(w.last_result)).grund }];
    return k;
  });
  const eigen = eigene.map((c) => {
    const name = String(c.name ?? "");
    const ts = tasks.filter((t) => t.created_by === `Agent ${name}`);
    const rs = runs.filter((r) => r.agent_id === c.id);
    const k = karte(`c:${s(c.id)}`, name, "baukasten", ts, now, c.enabled !== false);
    const laeuft = rs.some((r) => !r.finished_at && now.getTime() - Date.parse(String(r.started_at)) < 30 * 60_000);
    if (laeuft && k.status !== "aus") k.status = "arbeitet";
    k.erledigt = rs.filter((r) => r.finished_at && !r.error).length + (k.erledigt ?? 0);
    k.verlauf = [...k.verlauf, ...rs.slice(0, 4).map((r) => ({ titel: "Lauf", status: r.error ? "fehler" : r.finished_at ? "fertig" : "laeuft", at: String(r.finished_at ?? r.started_at),
      ergebnis: r.error ? kurz("", String(r.error)).grund : "" }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    return k;
  });
  const routinen = ROUTINEN_LISTE.filter((r) => r.key === "scout" || r.key === "premium").map((r): AgentKarte => {
    const ts = r.key === "premium" ? tasks.filter((t) => t.rolle === "premium" || /premium-labor/i.test(t.created_by ?? "")) : tasks.filter((t) => /scout/i.test(t.created_by ?? ""));
    const k = karte(`rt:${r.key}`, r.name, r.icon, ts, now);
    k.next = naechster(r.crons, now)?.toISOString() ?? null;
    if (!ts.length) k.erledigt = null;
    return k;
  });
  const gruppen: Gruppe[] = [
    { key: "nummer", titel: "Agenten A1–A9", icon: "agent", agenten: agentNr },
    { key: "fach", titel: "Fach-Agenten", icon: "punkte", agenten: fach },
    { key: "routinen", titel: "Routinen", icon: "uhr", agenten: routinen },
    { key: "website", titel: "Website-Agenten", icon: "website", agenten: website },
    { key: "eigene", titel: "Eigene Agenten", icon: "baukasten", agenten: eigen },
  ].filter((x) => x.agenten.length > 0);

  // ---------------------------------------------------------------- Werke
  const wb = werkeBild(z.schnell, z.langsam, now.getTime());
  const beats = Object.fromEntries((z.schnell?.beats ?? []).map((b) => [b.werk, b.last_beat]));
  const ghByFile = new Map((ghRuns ?? []).map((r) => [r.file, r]));
  const werke: WerkKarte[] = WERKE.filter((w) => w.workflow && w.status !== "fehlt").map((w) => {
    const b = wb[w.id];
    const gh = ghByFile.get(w.workflow!);
    const runLast = w.linien_werk ? z.langsam?.runs?.[w.linien_werk]?.last ?? null : null;
    const last = [gh?.updated_at ?? null, runLast, beats[w.linien_werk ?? ""] ?? null].filter((x): x is string => !!x).sort().pop() ?? null;
    return {
      id: w.id, name: w.name, icon: WERK_ICON[w.id] ?? "werk", puls: b?.puls ?? "grau",
      ist: b?.plaetze?.ist ?? null, soll: b?.plaetze?.soll ?? null, max: b?.plaetze?.max ?? null,
      last, next: naechster(w.cron_utc ?? [], now)?.toISOString() ?? null, fehler: gh?.conclusion === "failure",
      zahl: b?.zahl ?? "–", unter: b?.unter ?? "",
    };
  });
  const pl = plaetzeBild(z.schnell);

  return {
    now: now.toISOString(), gehirn, gruppen, werke, plaetze: { laufend: pl.laufend, geplant: pl.geplant, gesamt: pl.gesamt },
    zeitplan: zeitplan(CONFIG.zeitplan ?? CONFIG.workflows, now),
  };
}
