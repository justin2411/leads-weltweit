import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { CONFIG, loadAgentTasks } from "@/lib/dashboard-data";
import { mailboxes } from "@/lib/dashboard-logic";
import { TaskError, freeAgent } from "@/lib/agents";
import { loadFlow, loadFlows } from "@/lib/flow-data";
import { flowLiveState } from "@/lib/jarvis-chat-data";
import { FlowEditError, checkFlowEdit, toolText, type ToolInput } from "@/lib/jarvis-llm";
import { FOLLOWUP_DAYS_RANGE, InputError, MAX_AGE_RANGE, MAX_SAMPLE_TARGET, type OwnerSettings, type SettingKey } from "@/lib/owner-settings";
import { validateValue } from "@/lib/regler";
import { REG, loadSettingsStrict, reglerCtx } from "@/lib/regler-data";
import { startWerk } from "@/lib/start-werk";
import { area, bestand, type Sources } from "@/lib/jarvis-context";

/**
 * Werkzeuge der Sofort-Antworten (Opus). Nur feste, sichere Server-Funktionen – kein freies SQL:
 * lesen = Kennzahlen/Bestand/Postfächer/Gründe/Aufträge/Flows/Einstellungen (nur Zahlen, keine Lead-Kontaktdaten);
 * ändern = nur über die bestehenden geprüften Pfade: Regler (validateValue wie /dashboard/regler), Werk an/aus
 * (Mail-Werke nur aus), Auftrag an Agent 1–8 (validateTask), Baukasten-Flow (Prüfung wie flow_edit.py; Master und
 * Flows in der Pipeline nur als Vorschlag, nie aktivieren), Werk-Start (start_requests, nie Versand).
 * Jede Änderung → owner_log (created_by „JARVIS-Chat (API)“). Die Eingaben sind vorher mit checkTool geprüft.
 */
export const BY = "JARVIS-Chat (API)";
export type ToolOutcome = { text: string; error?: boolean; changed?: string; routine?: string };

const ok = (x: unknown, changed?: string): ToolOutcome => ({ text: toolText(x), changed });
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

export async function runTool(t: ToolInput, s: Sources): Promise<ToolOutcome> {
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
        return ok({ gespeichert: t.schluessel, wert: value }, `Regler ${t.schluessel}`);
      }
      case "werk_schalten": {
        const { saved } = await loadSettingsStrict();
        if (t.werk === "versand") {
          if (t.an) return no("Versand schaltet nur der Inhaber ein");
          if (saved.send_paused) return ok("Versand ist schon pausiert");
          await writeSetting("send_paused", true, saved);
          return ok("Versand pausiert", "Versand aus");
        }
        if (t.werk === "nachfass") {
          if (t.an) return no("Nachfassmails schaltet nur der Inhaber ein");
          if (saved.followup_enabled === false) return ok("Nachfass ist schon aus");
          await writeSetting("followup_enabled", false, saved);
          return ok("Nachfassmails aus", "Nachfass aus");
        }
        const cur = { ...(saved.werke_paused ?? {}) };
        const isOn = !cur[t.werk];
        if (isOn === t.an) return ok(`${t.werk} ist schon ${t.an ? "an" : "aus"}`);
        if (t.an) delete cur[t.werk];
        else cur[t.werk] = new Date().toISOString();
        const value = validateValue("werke_paused", cur, reglerCtx(), saved);
        await writeSetting("werke_paused", value, saved);
        return ok(`${t.werk} ${t.an ? "an" : "aus"}`, `${t.werk} ${t.an ? "an" : "aus"}`);
      }
      case "auftrag_anlegen": {
        const agent = t.agent ?? freeAgent(await loadAgentTasks());
        const row = { agent, kind: t.kind, market: t.market, brief: t.brief };
        const { data, error } = await db().from("agent_tasks").insert({ ...row, created_by: BY }).select("id").single();
        if (error) throw new Error(error.message);
        await log("agent:create", `Agent ${agent}`, null, row);
        revalidatePath("/dashboard", "layout");
        return ok({ angelegt: `Agent ${agent}`, id: data?.id }, `Auftrag an A${agent}`);
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
          live ? `Vorschlag für „${f.name}“` : `Flow „${f.name}“`);
      }
      case "werk_starten": {
        const { saved } = await loadSettingsStrict();
        const text = await startWerk(t.werk, saved, BY, "JARVIS-Chat");
        revalidatePath("/dashboard", "layout");
        return ok(text, text);
      }
      case "an_routine_uebergeben":
        return { text: "übergeben – die Routine übernimmt beim nächsten Lauf", routine: t.grund };
    }
  } catch (e) {
    if (e instanceof InputError || e instanceof FlowEditError || e instanceof TaskError) return no(e.message);
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`jarvis-tool ${t.name} [${ref}]:`, e instanceof Error ? e.message.slice(0, 200) : "Fehler");
    return no(`technischer Fehler (${ref}) – nichts geändert`);
  }
  return no("unbekanntes Werkzeug");
}
