"use server";

/**
 * Regler-Aktionen (Inhaber 03.10.2026: „immer mit einem button, dass die änderungen auch übernommen werden“).
 * Ablauf wie control-actions.ts: Sitzung prüfen (requireOwner), jeden Wert serverseitig prüfen (lib/owner-settings.ts
 * über regler.validateValue – nie lockerer), owner_settings schreiben (updated_at, updated_by) und in owner_log
 * protokollieren („setting:<key>“, alter und neuer Wert). Der Versand lässt sich hier nur pausieren/fortsetzen –
 * Limits, Länder, versand.yaml, Sperrliste, Notbremse und Freigabe sind nicht erreichbar. Direktstart nur für
 * Lead-/Kunden-Werk und Proben-Vorrat (START_WORKFLOWS), nie bei Pause.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { InputError, type OwnerSettings, type SettingKey } from "@/lib/owner-settings";
import { cardOf, diff, draftFrom, isCardKey, toSettings, validateValue, type Change } from "@/lib/regler";
import { isReglerKey, undoValue } from "@/lib/regler-verlauf";
import { loadSettingsStrict, reglerCtx } from "@/lib/regler-data";
import { START_WORKFLOWS, fmtBerlin, nextPickup, type StartKey } from "@/lib/start-queue";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
export type ApplyResult = { ok: true; at: string; applied: { card: string; text: string }[]; started: string[] } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } =>
  ({ ok: false, error: e instanceof InputError ? e.message : `nicht gespeichert: ${e instanceof Error ? e.message.slice(0, 160) : "Fehler"}` });

async function log(action: string, target: string | null, oldValue: unknown, newValue: unknown) {
  const { error } = await db().from("owner_log").insert({ action, target, old_value: oldValue ?? null, new_value: newValue ?? null, created_by: BY });
  if (error) throw new Error(error.message);
}

/** Schreibt geprüfte Werte (gleiche Zeit für alle) und protokolliert jeden Schlüssel. */
async function write(values: Partial<Record<SettingKey, unknown>>, old: OwnerSettings, at: string, target: string | null = null) {
  for (const [key, value] of Object.entries(values) as [SettingKey, unknown][]) {
    const { error } = await db().from("owner_settings").upsert({ key, value, updated_at: at, updated_by: BY });
    if (error) throw new Error(error.message);
    await log(`setting:${key}`, target, old[key], value);
  }
}

// ------------------------------------------------------------------------------------------- Direktstart
/** workflow_dispatch auf main mit GH_DISPATCH_TOKEN; Antwort-Status (0 = Netzfehler/Zeitüberschreitung). */
async function ghDispatch(token: string, file: string, inputs: Record<string, string>): Promise<{ ok: boolean; status: number }> {
  const repo = process.env.GH_REPO?.trim() || "justin2411/leads-weltweit";
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${file}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs }),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Wie der Direktstart in control-actions.ts: mit Token sofort, sonst Wunsch für den Wachhund (nie doppelt, nie bei Pause). */
async function startWerk(key: StartKey, s: OwnerSettings): Promise<string> {
  const spec = START_WORKFLOWS[key];
  if (spec.pause && s.werke_paused?.[spec.pause]) throw new InputError(`${spec.label} ist pausiert – erst einschalten`);
  const sb = db();
  const now = new Date();
  const { data: open, error: e0 } = await sb.from("start_requests").select("id").eq("workflow", key).eq("status", "offen").limit(5);
  if (e0) throw new Error(e0.message);
  const inputs: Record<string, string> = { ...spec.inputs };
  const token = process.env.GH_DISPATCH_TOKEN?.trim();
  let note: string | null = null;
  if (token) {
    const r = await ghDispatch(token, spec.file, inputs);
    if (r.ok) {
      const at = now.toISOString();
      if (open?.length) await sb.from("start_requests").update({ status: "gestartet", started_at: at, note: "direkt (Regler)" }).in("id", open.map((o) => o.id)).eq("status", "offen");
      else {
        const { error } = await sb.from("start_requests").insert({ workflow: key, inputs, status: "gestartet", started_at: at, note: "direkt (Regler)", created_by: BY });
        if (error) throw new Error(error.message);
      }
      await log("workflow:start", spec.file, null, { ...inputs, via: "direkt" });
      return `${spec.label} gestartet`;
    }
    note = r.status ? `GitHub ${r.status} – Wachhund übernimmt` : "GitHub nicht erreichbar – Wachhund übernimmt";
  }
  const when = fmtBerlin(nextPickup(now));
  if (open?.length) return `${spec.label}: Start schon angefordert – spätestens ${when}`;
  const { error } = await sb.from("start_requests").insert({ workflow: key, inputs, status: "offen", note, created_by: BY });
  if (error) throw new Error(error.message);
  await log("workflow:request_start", spec.file, null, { ...inputs, via: "wachhund", note });
  return `${spec.label}: startet spätestens ${when}`;
}

// ------------------------------------------------------------------------------------------- Übernehmen
/**
 * Übernimmt die Änderungen aus dem Regler. `seen` = updated_at je Schlüssel, wie die Seite sie kannte: wurde ein
 * Schlüssel inzwischen anders gespeichert (anderer Tab, JARVIS), wird nichts überschrieben. startNow: danach die
 * betroffenen startbaren Werke anstoßen.
 */
export async function applySettings(changes: Change[], startNow: boolean, seen: Partial<Record<string, string | null>> = {}): Promise<ApplyResult> {
  await requireOwner();
  try {
    if (!Array.isArray(changes) || !changes.length || changes.length > 60) throw new InputError("keine Änderung");
    for (const c of changes) {
      if (!c || !isCardKey(c.card) || !cardOf(c.card).keys.includes(c.key)) throw new InputError("unbekannte Einstellung");
      if (c.key === "werke_paused" && typeof c.to !== "boolean") throw new InputError("an/aus ungültig");
    }
    const ctx = reglerCtx();
    const { saved, updatedAt } = await loadSettingsStrict();
    const keys = [...new Set(changes.map((c) => c.key))];
    if (keys.some((k) => (updatedAt[k] ?? null) !== (seen[k] ?? null) && Date.parse(updatedAt[k] ?? "") !== Date.parse(seen[k] ?? ""))) {
      throw new InputError("inzwischen anders gespeichert – Seite neu geladen, bitte noch einmal");
    }
    const at = new Date().toISOString();
    const next = toSettings(changes, saved, at) as Partial<Record<SettingKey, unknown>>;
    const values: Partial<Record<SettingKey, unknown>> = {};
    for (const k of Object.keys(next) as SettingKey[]) values[k] = validateValue(k, next[k], ctx, saved);
    if ("send_paused" in values && typeof values.send_paused !== "boolean") throw new InputError("Versand: an/aus");
    await write(values, saved, at);
    const after = { ...saved, ...values } as OwnerSettings;
    const applied = diff(saved, draftFrom(after, ctx), ctx).map((c) => ({ card: c.card, text: c.text }));
    const started: string[] = [];
    if (startNow) {
      for (const k of [...new Set(changes.map((c) => cardOf(c.card).start).filter((x): x is StartKey => !!x))]) {
        try {
          started.push(await startWerk(k, after));
        } catch (e) {
          if (!(e instanceof InputError)) throw e;
          started.push(e.message);
        }
      }
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true, at, applied, started };
  } catch (e) {
    return fail(e);
  }
}

/** „Jetzt anwenden“: ein startbares Werk sofort (bzw. beim nächsten Wachhund) starten. */
export async function startNow(card: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireOwner();
  try {
    if (!isCardKey(card) || !cardOf(card).start) throw new InputError("dieses Werk startet nach Zeitplan");
    const { saved } = await loadSettingsStrict();
    const text = await startWerk(cardOf(card).start!, saved);
    revalidatePath("/dashboard", "layout");
    return { ok: true, text };
  } catch (e) {
    return fail(e);
  }
}

/** „Rückgängig“: den alten Wert einer Änderung aus dem Verlauf wieder setzen (gleiche Prüfung wie Übernehmen). */
export async function undoChange(logId: number): Promise<ApplyResult> {
  await requireOwner();
  try {
    if (!Number.isSafeInteger(logId) || logId <= 0) throw new InputError("Eintrag unbekannt");
    const { data: row, error } = await db().from("owner_log").select("id, action, old_value, new_value").eq("id", logId).maybeSingle();
    if (error) throw new Error(error.message);
    const key = String(row?.action ?? "").replace(/^setting:/, "");
    if (!row || !String(row.action).startsWith("setting:") || !isReglerKey(key)) throw new InputError("lässt sich hier nicht zurücknehmen");
    const ctx = reglerCtx();
    const { saved } = await loadSettingsStrict();
    const at = new Date().toISOString();
    const raw = undoValue(key, row.old_value, row.new_value, saved[key], at);
    // Standard (null) als Zahl speichern – owner_settings.value ist NOT NULL
    const value = validateValue(key, raw ?? (key === "followup_days" ? ctx.followupDefault ?? 4 : ctx.proben.max_alter_stunden), ctx, saved);
    await write({ [key]: value }, saved, at, `rückgängig #${logId}`);
    const after = { ...saved, [key]: value } as OwnerSettings;
    const applied = diff(saved, draftFrom(after, ctx), ctx).map((c) => ({ card: c.card, text: c.text }));
    revalidatePath("/dashboard", "layout");
    return { ok: true, at, applied, started: [] };
  } catch (e) {
    return fail(e);
  }
}
