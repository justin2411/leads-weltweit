import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { CONFIG, loadAgentTasks } from "@/lib/dashboard-data";
import { mailboxes } from "@/lib/dashboard-logic";
import { BRAIN_TASK_BY, TaskError, checkBrainTask, freeAgent } from "@/lib/agents";
import { loadFlow, loadFlows } from "@/lib/flow-data";
import { flowLiveState } from "@/lib/jarvis-chat-data";
import { FlowEditError, checkFlowEdit, toolText, type ToolInput } from "@/lib/jarvis-llm";
import { FOLLOWUP_DAYS_RANGE, InputError, MAX_AGE_RANGE, MAX_SAMPLE_TARGET, type OwnerSettings, type SettingKey } from "@/lib/owner-settings";
import { validateValue } from "@/lib/regler";
import { REG, loadSettingsStrict, reglerCtx } from "@/lib/regler-data";
import { startWerk } from "@/lib/start-werk";
import { area, bestand, loadKnowledge, loadRoutines, type Sources } from "@/lib/jarvis-context";
import { RoutineError, nextRun, scheduleLabel, toRoutine, validateRoutine, whenLabel } from "@/lib/brain-routines";
import type { ChatLink, ChatMode } from "@/lib/jarvis-chat";

/**
 * Werkzeuge der Sofort-Antworten (Opus). Nur feste, sichere Server-Funktionen – kein freies SQL:
 * lesen = Kennzahlen/Bestand/Postfächer/Gründe/Aufträge/Flows/Einstellungen (nur Zahlen, keine Lead-Kontaktdaten);
 * ändern = nur über die bestehenden geprüften Pfade: Regler (validateValue wie /dashboard/regler), Werk an/aus
 * (Mail-Werke nur aus), Auftrag an Agent 1–8 (validateTask), Baukasten-Flow (Prüfung wie flow_edit.py; Master und
 * Flows in der Pipeline nur als Vorschlag, nie aktivieren), Werk-Start (start_requests, nie Versand).
 * Jede Änderung → owner_log (created_by „JARVIS-Chat (API)“). Die Eingaben sind vorher mit checkTool geprüft.
 */
export const BY = "JARVIS-Chat (API)";
/** changed = Aktions-Chip unter der Antwort („A3 beauftragt“), link = wohin der Chip führt (Dashboard-Pfad). */
export type ToolOutcome = { text: string; error?: boolean; changed?: string; routine?: string; link?: ChatLink };

const ok = (x: unknown, changed?: string, href?: string): ToolOutcome => ({ text: toolText(x), changed, ...(changed && href ? { link: { label: changed, url: href } } : {}) });
const no = (msg: string): ToolOutcome => ({ text: msg, error: true });

/** Text ohne Kontaktdaten (E-Mail-Adressen, Telefonnummern) – für Prüfgründe und Auftragsergebnisse. */
export function scrub(t: unknown, max = 200): string {
  return String(t ?? "").replace(/\S+@\S+\.\S+/g, "[E-Mail]").replace(/\+?\d[\d\s().\/-]{6,}\d/g, "[Nummer]").replace(/\s+/g, " ").trim().slice(0, max);
}

async function log(action: string, target: string | null, oldValue: unknown, newValue: unknown) {
  const { error } = await db().from("owner_log").insert({ action, target, old_value: oldValue ?? null, new_value: newValue ?? null, created_by: BY });
  if (error) throw new Error(error.message);
}

async function writeSetting(key: SettingKey, value: unknown, old: OwnerSettings) {
  const { error } = await db().from("owner_settings").upsert({ key, value, updated_at: new Date().toISOString(), updated_by: BY });
  if (error) throw new Error(error.message);
  await log(`setting:${key}`, "JARVIS-Chat", old[key], value);
  revalidatePath("/dashboard", "layout");
}

/** Zusammenhang des Aufrufs: Modus (Gehirn beauftragt selbst) und Sitzung (Kurzmeldung in den Gehirn-Chat). */
export type ToolCtx = { mode: ChatMode; sessionKind?: string };

/** Kurzmeldung in den festen Gehirn-Chat („A3 beauftragt: …“). Fehler sind egal (Auftrag steht schon). */
async function gehirnNote(body: string) {
  try {
    const { data } = await db().from("jarvis_sessions").select("id").eq("kind", "gehirn").limit(1);
    const sid = data?.[0]?.id;
    if (sid) await db().from("jarvis_messages").insert({ session_id: sid, role: "jarvis", body: body.slice(0, 400), status: null, links: [{ label: "Agenten", url: "/dashboard/jarvis#agenten" }] });
  } catch { /* egal */ }
}

export async function runTool(t: ToolInput, s: Sources, ctx: ToolCtx = { mode: "assistent" }): Promise<ToolOutcome> {
  try {
    switch (t.name) {
      case "kennzahlen": return ok(await area(t.bereich, s));
      case "postfaecher": {
        if (!s.live) return no("Versanddaten gerade nicht lesbar");
        return ok(mailboxes(s.live, CONFIG).map((b) => ({ postfach: b.label, heute: b.today, grenze: b.cap, tage_7: b.d7, gesamt: b.total })));
      }
      case "bestand_land": return ok(bestand(s, t.land));
      case "freigabe_gruende": {
        const { data, error } = await db().from("lead_checks").select("result, failed_stage, reasons").order("checked_at", { ascending: false })
          .limit(t.anzahl).abortSignal(AbortSignal.timeout(6000));
        if (error) return no("Prüfungen gerade nicht lesbar");
        const m = new Map<string, { stufe: number | null; grund: string; n: number }>();
        let failed = 0;
        for (const c of (data ?? []) as { result: string; failed_stage: number | null; reasons: string[] | null }[]) {
          if (c.result === "released") continue;
          failed++;
          const grund = scrub((c.reasons ?? [])[0] ?? "ohne Grund", 120);
          const k = `${c.failed_stage ?? ""}|${grund}`;
          const x = m.get(k) ?? { stufe: c.failed_stage ?? null, grund, n: 0 };
          x.n++;
          m.set(k, x);
        }
        return ok({ geprueft: data?.length ?? 0, durchgefallen: failed, gruende: [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8) });
      }
      case "auftraege": {
        const tasks = (await loadAgentTasks()).slice(0, 15);
        return ok(tasks.map((x) => ({ agent: x.agent, art: x.kind, markt: x.market, status: x.status, fortschritt: x.progress, auftrag: scrub(x.brief, 160),
          ergebnis: x.result ? scrub(x.result, 200) : null, kennzahlen: x.numbers, angelegt: x.created_at })));
      }
      case "flows_liste": {
        const flows = await loadFlows();
        return ok(flows.slice(0, 30).map((f) => ({ id: f.id, name: f.name, art: f.kind, status: f.status, bausteine: f.def?.nodes.length ?? null, stand: f.updated_at })));
      }
      case "flow_lesen": {
        const f = await loadFlow(t.flow_id);
        if (!f) return no("Flow unbekannt");
        const live = await flowLiveState(f.id).catch(() => null);
        return ok({ id: f.id, name: f.name, art: f.kind, status: f.status, updated_at: f.updated_at, def: f.def, fehler: f.errors ?? null,
          vorschlag: live?.pending_def ?? null, vorschlag_notiz: live?.pending_note ?? null });
      }
      case "einstellungen": {
        const { saved } = await loadSettingsStrict();
        const ctx = reglerCtx();
        return ok({
          slot_plan: saved.slot_plan, slot_autopilot: saved.slot_autopilot, sample_targets: saved.sample_targets, sample_max_age_hours: saved.sample_max_age_hours,
          followup_days: saved.followup_days, buyer_countries_off: saved.buyer_countries_off, werke_paused: saved.werke_paused, send_paused: saved.send_paused,
          grenzen: {
            linien: REG.lanes.map((l) => ({ id: l.id, werk: l.werk, land: l.country, standard: l.default, max: l.max })), plaetze_hoechstens: REG.total_slots - REG.reserve,
            proben_seiten: ctx.pages, proben_soll_max: MAX_SAMPLE_TARGET, verfall_stunden: MAX_AGE_RANGE, nachfass_tage: FOLLOWUP_DAYS_RANGE, kaeufer_laender: ctx.buyerCountries,
          },
        });
      }
      case "regler_setzen": {
        const { saved } = await loadSettingsStrict();
        const value = validateValue(t.schluessel, t.wert, reglerCtx(), saved);
        await writeSetting(t.schluessel, value, saved);
        return ok({ gespeichert: t.schluessel, wert: value }, `Regler ${t.schluessel}`, "/dashboard/regler");
      }
      case "werk_schalten": {
        const { saved } = await loadSettingsStrict();
        if (t.werk === "versand") {
          if (t.an) return no("Versand schaltet nur der Inhaber ein");
          if (saved.send_paused) return ok("Versand ist schon pausiert");
          await writeSetting("send_paused", true, saved);
          return ok("Versand pausiert", "Versand aus", "/dashboard/jarvis");
        }
        if (t.werk === "nachfass") {
          if (t.an) return no("Nachfassmails schaltet nur der Inhaber ein");
          if (saved.followup_enabled === false) return ok("Nachfass ist schon aus");
          await writeSetting("followup_enabled", false, saved);
          return ok("Nachfassmails aus", "Nachfass aus", "/dashboard/jarvis");
        }
        const cur = { ...(saved.werke_paused ?? {}) };
        const isOn = !cur[t.werk];
        if (isOn === t.an) return ok(`${t.werk} ist schon ${t.an ? "an" : "aus"}`);
        if (t.an) delete cur[t.werk];
        else cur[t.werk] = new Date().toISOString();
        const value = validateValue("werke_paused", cur, reglerCtx(), saved);
        await writeSetting("werke_paused", value, saved);
        return ok(`${t.werk} ${t.an ? "an" : "aus"}`, `${t.werk} ${t.an ? "an" : "aus"}`, "/dashboard/jarvis");
      }
      case "auftrag_anlegen": {
        // Gehirn beauftragt selbst (Gehirn-Modus + Grund): Regeln für Gehirn-Aufträge (frei, Fokus-Märkte, 3 je Stunde)
        if (ctx.mode === "gehirn" && t.grund) {
          const tasks = await loadAgentTasks();
          const b = checkBrainTask({ agent: t.agent, kind: t.kind, market: t.market, brief: t.brief, grund: t.grund }, tasks, s.now);
          const row = { agent: b.agent, kind: b.kind, market: b.market, brief: b.brief, grund: b.grund };
          let ins = await db().from("agent_tasks").insert({ ...row, created_by: BRAIN_TASK_BY }).select("id").single();
          if (ins.error?.code === "42703" || ins.error?.code === "PGRST204") {
            const { grund: _g, ...rest } = row;
            ins = await db().from("agent_tasks").insert({ ...rest, created_by: BRAIN_TASK_BY }).select("id").single();
          }
          if (ins.error) throw new Error(ins.error.message);
          await log("agent:create", `Agent ${b.agent}`, null, { ...row, von: "Gehirn" });
          if (ctx.sessionKind !== "gehirn") await gehirnNote(`A${b.agent} beauftragt: ${b.grund}`);
          revalidatePath("/dashboard", "layout");
          return ok({ angelegt: `Agent ${b.agent}`, id: ins.data?.id, von: "Gehirn", grund: b.grund }, `A${b.agent} beauftragt`, "/dashboard/jarvis#agenten");
        }
        const agent = t.agent ?? freeAgent(await loadAgentTasks());
        const row = { agent, kind: t.kind, market: t.market, brief: t.brief };
        const { data, error } = await db().from("agent_tasks").insert({ ...row, created_by: BY }).select("id").single();
        if (error) throw new Error(error.message);
        await log("agent:create", `Agent ${agent}`, null, row);
        revalidatePath("/dashboard", "layout");
        return ok({ angelegt: `Agent ${agent}`, id: data?.id, anzeige: "/dashboard/jarvis#agenten" }, `A${agent} beauftragt`, "/dashboard/jarvis#agenten");
      }
      case "flow_speichern": {
        const f = await loadFlow(t.flow_id);
        if (!f) return no("Flow unbekannt");
        if (Date.parse(f.updated_at) !== Date.parse(t.version)) return no("Flow wurde inzwischen geändert – erst flow_lesen, dann neu bauen");
        const { live, warns } = checkFlowEdit({ kind: f.kind, status: f.status }, t.def);
        const vals = live
          ? { pending_def: t.def, pending_at: new Date().toISOString(), pending_note: t.notiz || null }
          : { def: t.def, pending_def: null, pending_at: null, pending_note: null };
        const { data, error } = await db().from("flows").update(vals).eq("id", f.id).eq("updated_at", f.updated_at).eq("status", f.status).select("id, updated_at");
        if (error) throw new Error(error.message);
        if (!data?.length) return no("Flow wurde inzwischen geändert – erst flow_lesen, dann neu bauen");
        await log(`${f.kind === "master" ? "master" : "flow"}:chat${live ? "-vorschlag" : ""}`, f.id, { name: f.name, nodes: f.def?.nodes.length ?? 0 },
          { nodes: t.def.nodes.length, edges: t.def.edges.length, modus: live ? "vorschlag" : "gespeichert", notiz: t.notiz || "über Chat geändert" });
        return ok({ modus: live ? "Vorschlag – Inhaber klickt im Baukasten „Übernehmen“" : "gespeichert", bausteine: t.def.nodes.length, warnungen: warns },
          live ? `Vorschlag für „${f.name}“` : `Flow „${f.name}“`, `/dashboard/baukasten?flow=${f.id}`);
      }
      case "werk_starten": {
        const { saved } = await loadSettingsStrict();
        const text = await startWerk(t.werk, saved, BY, "JARVIS-Chat");
        revalidatePath("/dashboard", "layout");
        return ok(text, text, "/dashboard/jarvis");
      }
      case "routinen_liste": {
        const list = await loadRoutines();
        return ok(list.map((r) => ({ id: r.id, name: r.name, plan: scheduleLabel(r), aktiv: r.aktiv, naechster_lauf: whenLabel(nextRun(r, s.now), s.now),
          aufgabe: r.aufgabe.slice(0, 200), letzter_lauf: r.last_run_at, ergebnis: r.last_result })));
      }
      case "routine_anlegen": {
        const r = t.routine;
        const { data, error } = await db().from("brain_routines").insert({ ...r, aktiv: true, created_by: BY }).select("*").single();
        if (error) throw new Error(error.message);
        await log("gehirn:routine", String(data.id), null, r);
        revalidatePath("/dashboard", "layout");
        const row = toRoutine(data as Record<string, unknown>);
        return ok({ angelegt: row.name, id: row.id, plan: scheduleLabel(row), naechster_lauf: whenLabel(nextRun(row, s.now), s.now) },
          `Routine ${row.uhrzeit} angelegt`, "/dashboard/gehirn#routinen");
      }
      case "routine_aendern": {
        const { data: cur, error: e1 } = await db().from("brain_routines").select("*").eq("id", t.id).maybeSingle();
        if (e1) throw new Error(e1.message);
        if (!cur) return no("Routine unbekannt");
        const old = toRoutine(cur as Record<string, unknown>);
        const { aktiv, ...rest } = t.patch;
        const merged = validateRoutine({ ...old, ...rest });
        const vals = { ...merged, ...(aktiv === undefined ? {} : { aktiv }) };
        const { error } = await db().from("brain_routines").update(vals).eq("id", t.id);
        if (error) throw new Error(error.message);
        await log("gehirn:routine-aendern", t.id, { name: old.name, uhrzeit: old.uhrzeit, aktiv: old.aktiv }, t.patch);
        revalidatePath("/dashboard", "layout");
        const label = aktiv === false ? `Routine „${merged.name}“ pausiert` : aktiv === true && !old.aktiv ? `Routine „${merged.name}“ läuft wieder` : `Routine „${merged.name}“ geändert`;
        return ok({ gespeichert: merged.name, aktiv: aktiv ?? old.aktiv, plan: scheduleLabel(merged) }, label, "/dashboard/gehirn#routinen");
      }
      case "wissen_liste": {
        const docs = await loadKnowledge(100);
        return ok(docs.map((d) => ({ slug: d.slug, titel: d.titel, quelle: d.quelle, stand: d.updated_at, zeichen: d.markdown.length })));
      }
      case "wissen_lesen": {
        const { data, error } = await db().from("brain_knowledge").select("slug, titel, markdown, quelle, updated_at").eq("slug", t.slug).maybeSingle();
        if (error) throw new Error(error.message);
        return data ? ok(data) : no("Notiz unbekannt");
      }
      case "wissen_notieren": {
        const { data: cur } = await db().from("brain_knowledge").select("id").eq("slug", t.slug).maybeSingle();
        const vals = { titel: t.titel, markdown: t.markdown, quelle: "chat" };
        const r = cur
          ? await db().from("brain_knowledge").update(vals).eq("id", cur.id).select("id").single()
          : await db().from("brain_knowledge").insert({ ...vals, slug: t.slug }).select("id").single();
        if (r.error) throw new Error(r.error.message);
        await log("gehirn:wissen", t.slug, null, { titel: t.titel, zeichen: t.markdown.length, neu: !cur });
        revalidatePath("/dashboard", "layout");
        return ok({ gespeichert: t.slug, neu: !cur }, `Wissen „${t.titel.slice(0, 40)}“`, `/dashboard/gehirn?wissen=${t.slug}#wissen`);
      }
      case "an_routine_uebergeben":
        return { text: "übergeben – ein Agent übernimmt beim nächsten Lauf", routine: t.grund };
    }
  } catch (e) {
    if (e instanceof InputError || e instanceof FlowEditError || e instanceof TaskError || e instanceof RoutineError) return no(e.message);
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`jarvis-tool ${t.name} [${ref}]:`, e instanceof Error ? e.message.slice(0, 200) : "Fehler");
    return no(`technischer Fehler (${ref}) – nichts geändert`);
  }
  return no("unbekanntes Werkzeug");
}
