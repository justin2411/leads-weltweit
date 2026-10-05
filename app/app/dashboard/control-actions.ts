"use server";

/**
 * Steuer-Aktionen des Inhabers (Inhaber 03.10.2026: „wo ich direkt auch einfluss auf das ganze nehmen kann“).
 * Jede Aktion: Sitzung prüfen (requireOwner), Eingabe serverseitig prüfen (lib/owner-settings.ts), in der DB
 * speichern, mit Zeit und „Inhaber Dashboard“ protokollieren (signalwerk.owner_log). Server Actions sind von Next
 * gegen CSRF geschützt (nur gleiche Herkunft). Harte Grenzen sind nicht änderbar; Sperren werden nie aufgehoben.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, suppressEmail } from "@/lib/supabase";
import { CONFIG, COUNTRIES, SEGMENT, canDispatch, loadOwnerSettings } from "@/lib/dashboard-data";
import {
  InputError, PACKAGES, WORKFLOWS, toggleIn, validateCountryLimits, validateCustomer, validateFollowupDays, validateMaxAge,
  validateNote, validateReplyKind, validateSampleTargets, validateSlotPlan, WERK_SWITCHES, toggleWerkPaused, type LaneRegistry,
  type SettingKey, type WerkKey, type WorkflowKey,
} from "@/lib/owner-settings";
import LANES from "@/lib/werk-linien.json";
import { COND_LABEL, RECENT_START_MIN, START_WORKFLOWS, fmtBerlin, isStartKey, nextPickup, type StartKey } from "@/lib/start-queue";
import { requireOwner } from "./actions";

const BY = "Inhaber Dashboard";

function back(f: FormData): string {
  const b = String(f.get("back") ?? "/dashboard");
  return b.startsWith("/dashboard") && !b.includes("//") ? b : "/dashboard";
}
function go(url: string, key: "ok" | "fehler", msg: string): never {
  const u = new URL(url, "http://x");
  u.searchParams.delete("ok");
  u.searchParams.delete("fehler");
  u.searchParams.set(key, msg);
  redirect(u.pathname + u.search);
}

async function log(action: string, target: string | null, oldValue: unknown, newValue: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: oldValue ?? null, new_value: newValue ?? null, created_by: BY });
}

async function setSetting<K extends SettingKey>(key: K, value: unknown) {
  const old = (await loadOwnerSettings())[key];
  const { error } = await db().from("owner_settings").upsert({ key, value, updated_at: new Date().toISOString(), updated_by: BY });
  if (error) throw new Error(error.message);
  await log(`setting:${key}`, null, old, value);
}

/** Gemeinsamer Rahmen: Sitzung, Fehler als Hinweis zurück, Erfolg als „gespeichert“ (okMsg als Funktion: Text erst
 *  nach der Aktion, z. B. „gestartet“ oder „startet spätestens 21:41“). */
async function run(f: FormData, okMsg: string | (() => string), fn: () => Promise<void>) {
  await requireOwner();
  const to = back(f);
  try {
    await fn();
  } catch (e) {
    if (e instanceof InputError) go(to, "fehler", e.message);
    throw e;
  }
  revalidatePath("/dashboard", "layout");
  go(to, "ok", typeof okMsg === "function" ? okMsg() : okMsg);
}

/** Länder, die der Inhaber schalten darf: Test-Märkte mit allowed: true in countries.yaml (Spiegel ops-config.json). */
const mailLaender = () => COUNTRIES.filter((c) => CONFIG.countries[c]?.allowed === true);

// ------------------------------------------------------------------------------------------- Versand
export async function setPaused(f: FormData) {
  const paused = f.get("paused") === "1";
  await run(f, paused ? "Versand pausiert" : "Versand läuft wieder", () => setSetting("send_paused", paused));
}

export async function toggleSendCountry(f: FormData) {
  await run(f, "gespeichert", async () => {
    const s = await loadOwnerSettings();
    await setSetting("send_countries_off", toggleIn(s.send_countries_off, String(f.get("country")), mailLaender()));
  });
}

export async function saveCountryLimits(f: FormData) {
  await run(f, "Mails pro Tag gespeichert", async () => {
    const input = Object.fromEntries(COUNTRIES.map((c) => [c, f.get(`limit_${c}`)]));
    await setSetting("send_country_limits", validateCountryLimits(input, CONFIG.countries, COUNTRIES));
  });
}

export async function saveFollowups(f: FormData) {
  await run(f, "Nachfass gespeichert", async () => {
    const enabled = f.get("enabled") === "1";
    const days = String(f.get("days") ?? "").trim();
    await setSetting("followup_enabled", enabled);
    if (days) await setSetting("followup_days", validateFollowupDays(days));
  });
}

// ------------------------------------------------------------------------------------------- Proben / Bestand
export async function saveSampleTargets(f: FormData) {
  await run(f, "Soll gespeichert", async () => {
    const keys = COUNTRIES.map((c) => `${SEGMENT}/${c}`);
    const s = await loadOwnerSettings();
    const mine = validateSampleTargets(Object.fromEntries(keys.map((k) => [k, f.get(`target_${k}`)])), keys);
    const rest = Object.fromEntries(Object.entries(s.sample_targets).filter(([k]) => !keys.includes(k)));
    await setSetting("sample_targets", { ...rest, ...mine });
  });
}

export async function saveMaxAge(f: FormData) {
  await run(f, "Verfall gespeichert", () => setSetting("sample_max_age_hours", validateMaxAge(f.get("hours"))));
}

export async function toggleBuyerCountry(f: FormData) {
  await run(f, "gespeichert", async () => {
    const s = await loadOwnerSettings();
    // nur Länder mit Mail-Erlaubnis (countries.yaml allowed: true) sind wählbar – alle anderen bleiben gesperrt
    await setSetting("buyer_countries_off", toggleIn(s.buyer_countries_off, String(f.get("country")), mailLaender()));
  });
}

// ------------------------------------------------------------------------------------------- Werke an/aus
/** Ein Werk per Klick an- oder ausschalten (Inhaber 03.10.2026). Versand und Nachfass über ihre bestehenden Schalter,
 *  alle anderen über werke_paused. Sicherheitsfunktionen (Abmeldung, Webhook-Sperren, Sperrliste, Notbremse,
 *  Abmelde-Erkennung) sind nicht schaltbar. Jede Änderung wird protokolliert (owner_log). */
export async function toggleWerk(f: FormData) {
  const key = String(f.get("werk") ?? "") as WerkKey;
  const want = f.get("on") === "1";
  await run(f, want ? `${WERK_SWITCHES[key]?.label ?? key} eingeschaltet` : `${WERK_SWITCHES[key]?.label ?? key} pausiert`, async () => {
    if (!(key in WERK_SWITCHES)) throw new InputError("unbekanntes Werk");
    const s = await loadOwnerSettings();
    if (key === "versand") return setSetting("send_paused", !want);
    if (key === "nachfass") return setSetting("followup_enabled", want);
    const cur = s.werke_paused ?? {};
    if (!!cur[key] === !want) return; // schon so
    await setSetting("werke_paused", toggleWerkPaused(cur, key, new Date().toISOString()));
  });
}

/** Autopilot der Plätze an/aus (Inhaber 03.10.2026: „Ja, Autopilot an“); festgesetzte Linien (locks) bleiben. */
export async function toggleAutopilot(f: FormData) {
  const want = f.get("on") === "1";
  await run(f, want ? "Autopilot an – wirkt beim nächsten Start" : "Autopilot aus – deine Belegung gilt ab dem nächsten Start", async () => {
    const cur = (await loadOwnerSettings()).slot_autopilot ?? { on: true, locks: {} };
    if ((cur.on !== false) === want) return; // schon so
    await setSetting("slot_autopilot", { on: want, locks: cur.locks && typeof cur.locks === "object" ? cur.locks : {} });
  });
}

// ------------------------------------------------------------------------------------------- Belegungsplan
/** Plätze je Linie (Inhaber 03.10.2026: „wv plätze werden belegt … wie maschinen steuern“). Wirkt beim nächsten Start
 *  des Werks (Job plan in lead-werk.yml/kunden-werk.yml). Grenzen je Linie und Summe prüft validateSlotPlan.
 *  start=1 („Übernehmen & jetzt starten“): danach die Werke aus `werke` (Standard: Lead- und Kunden-Werk) starten;
 *  changed=0 = Plan unverändert, nur starten (nichts speichern). Pausierte Werke werden übersprungen und gemeldet. */
export async function saveSlotPlan(f: FormData) {
  const start = f.get("start") === "1" && f.get("reset") !== "1";
  const msgs: string[] = [];
  await run(f, () => msgs.join(" · ") || "Belegung gespeichert – wirkt beim nächsten Start der Werke", async () => {
    const reg = LANES as unknown as LaneRegistry;
    if (!start || f.get("changed") !== "0") {
      const input = Object.fromEntries(reg.lanes.map((l) => [l.id, f.get(`slot_${l.id}`)]));
      await setSetting("slot_plan", f.get("reset") === "1" ? {} : validateSlotPlan(input, reg));
      if (start) msgs.push("Belegung gespeichert");
    }
    if (!start) return;
    const want = String(f.get("werke") ?? "").split(",").filter((k): k is StartKey => k === "lead-werk" || k === "kunden-werk");
    for (const k of want.length ? [...new Set(want)] : (["lead-werk", "kunden-werk"] as StartKey[])) {
      try {
        msgs.push(await startWerk(k));
      } catch (e) {
        if (!(e instanceof InputError)) throw e;
        msgs.push(e.message);
      }
    }
  });
}

// ------------------------------------------------------------------------------------------- Werke starten
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

/** Läuft der Ablauf schon (oder wartet er)? Wie wachhund.py overdue(): die letzten 3 Läufe auf main. Fehler → false
 *  (dann höchstens ein Lauf zusätzlich in der Warteschlange, nie ein ausgelassener Start). */
async function ghRunning(token: string, file: string): Promise<boolean> {
  const repo = process.env.GH_REPO?.trim() || "justin2411/leads-weltweit";
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${file}/runs?per_page=3&branch=main`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!r.ok) return false;
    const j = (await r.json()) as { workflow_runs?: { status?: string }[] };
    return (j.workflow_runs ?? []).some((x) => ["queued", "in_progress", "waiting", "requested", "pending"].includes(String(x.status)));
  } catch {
    return false;
  }
}

/** Pausen der Werke – anders als loadOwnerSettings() ohne Rückfall auf Standardwerte: ist owner_settings nicht
 *  lesbar, startet nichts (ein pausiertes Werk darf nie aus Versehen loslaufen). */
async function pausedStrict(): Promise<Record<string, unknown>> {
  const { data, error } = await db().from("owner_settings").select("value").eq("key", "werke_paused").abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error) throw new InputError("Einstellungen nicht lesbar – kein Start");
  const v = data?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function dispatchWorkflow(f: FormData) {
  await run(f, "gestartet", async () => {
    const key = String(f.get("wf")) as WorkflowKey;
    const wf = WORKFLOWS[key];
    if (!wf) throw new InputError("unbekannter Ablauf");
    const token = process.env.GH_DISPATCH_TOKEN?.trim();
    if (!canDispatch() || !token) throw new InputError("Starten braucht GH_DISPATCH_TOKEN in Vercel");
    if (key === "versand" && (await loadOwnerSettings()).send_paused) throw new InputError("Versand ist pausiert");
    const inputs: Record<string, string> = { ...wf.inputs };
    if (key === "versand") inputs.freigabe = `${BY}, ${new Date().toISOString()}`;
    const r = await ghDispatch(token, wf.file, inputs);
    if (!r.ok) throw new InputError(r.status ? `GitHub: ${r.status}` : "GitHub nicht erreichbar");
    await log("workflow:start", wf.file, null, inputs);
  });
}

/** Ein Werk jetzt starten (Inhaber 03.10.2026: „Werke direkt starten statt erst beim nächsten Zeitplan“). Nur
 *  START_WORKFLOWS (nie Versand), nie bei Pause durch den Inhaber. Mit GH_DISPATCH_TOKEN sofort, sonst (oder wenn
 *  GitHub nicht antwortet) als offener Wunsch in start_requests, den der Wachhund spätestens beim nächsten Lauf
 *  startet. Ein schon offener Wunsch wird nicht verdoppelt. Gibt den Text für den Inhaber zurück. */
async function startWerk(key: StartKey): Promise<string> {
  const spec = START_WORKFLOWS[key];
  if (spec.cond && !CONFIG[spec.cond]) throw new InputError(`${COND_LABEL[spec.cond]} ist in config/pipeline.yaml aus – kein Start`);
  if (spec.pause && (await pausedStrict())[spec.pause]) throw new InputError(`${spec.label} ist pausiert – erst einschalten`);
  const sb = db();
  const now = new Date();
  const { data: open, error: e0 } = await sb.from("start_requests").select("id").eq("workflow", key).eq("status", "offen").limit(5);
  if (e0) throw new Error(e0.message);
  const since = new Date(now.getTime() - RECENT_START_MIN * 60_000).toISOString();
  const { data: recent, error: e1 } = await sb.from("start_requests").select("started_at").eq("workflow", key).eq("status", "gestartet")
    .gte("started_at", since).order("started_at", { ascending: false }).limit(1);
  if (e1) throw new Error(e1.message);
  if (recent?.length) return `${spec.label} läuft bereits (gestartet ${fmtBerlin(recent[0].started_at)})`;
  const inputs: Record<string, string> = { ...spec.inputs };
  const token = process.env.GH_DISPATCH_TOKEN?.trim();
  let note: string | null = null;
  if (token) {
    if (await ghRunning(token, spec.file)) return `${spec.label} läuft bereits`;
    const r = await ghDispatch(token, spec.file, inputs);
    if (r.ok) {
      const at = now.toISOString();
      // offene Wünsche erledigt der Direktstart mit (sonst startete der Wachhund ein zweites Mal)
      if (open?.length) await sb.from("start_requests").update({ status: "gestartet", started_at: at, note: "direkt (Dashboard)" }).in("id", open.map((o) => o.id)).eq("status", "offen");
      else {
        const { error } = await sb.from("start_requests").insert({ workflow: key, inputs, status: "gestartet", started_at: at, note: "direkt (Dashboard)", created_by: BY });
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
  return `${spec.label}: startet spätestens ${when}${note ? ` (${note})` : ""}`;
}

export async function requestStart(f: FormData) {
  const msg: string[] = [];
  await run(f, () => msg[0] ?? "Start angefordert", async () => {
    const key = String(f.get("wf") ?? "");
    if (!isStartKey(key)) throw new InputError("unbekannter Ablauf");
    msg.push(await startWerk(key));
  });
}

// ------------------------------------------------------------------------------------------- Kontakte
async function prospect(id: unknown) {
  const pid = String(id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pid)) throw new InputError("Firma unbekannt");
  const { data } = await db().from("prospects").select("id, company_name, country, email, domain, segment_id").eq("id", pid).maybeSingle();
  if (!data) throw new InputError("Firma unbekannt");
  return data;
}
async function lastSent(pid: string) {
  const { data } = await db().from("messages").select("id, to_email, resend_id").eq("prospect_id", pid).eq("status", "sent")
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function contactReply(f: FormData) {
  await run(f, "Antwort erfasst", async () => {
    const p = await prospect(f.get("prospect"));
    const type = validateReplyKind(f.get("kind"));
    const m = await lastSent(p.id);
    if (!m) throw new InputError("an diese Firma wurde noch nichts gesendet");
    const note = String(f.get("note") ?? "").trim().slice(0, 500);
    const { error } = await db().from("email_events").insert({ message_id: m.id, resend_id: m.resend_id ?? null, type, note: note ? `${BY}: ${note}` : BY });
    if (error) throw new Error(error.message);
    await log("contact:reply", p.id, null, { type, note });
  });
}

export async function contactStopFollowups(f: FormData) {
  await run(f, "Nachfass gestoppt", async () => {
    const p = await prospect(f.get("prospect"));
    const { data, error } = await db().from("messages").update({ status: "blocked", blocked_reason: `${BY}: Nachfass gestoppt` })
      .eq("prospect_id", p.id).neq("kind", "initial").in("status", ["draft", "approved"]).select("id");
    if (error) throw new Error(error.message);
    await log("contact:stop_followups", p.id, null, { blocked: data?.length ?? 0 });
  });
}

export async function contactSuppress(f: FormData) {
  await run(f, "dauerhaft gesperrt", async () => {
    const p = await prospect(f.get("prospect"));
    if (f.get("confirm") !== "ja") throw new InputError("Bitte Haken „wirklich sperren“ setzen");
    const m = await lastSent(p.id);
    const email = (m?.to_email ?? p.email ?? "").toLowerCase();
    if (!email.includes("@")) throw new InputError("keine Adresse");
    await suppressEmail(email, "manual", "owner-dashboard");
    await db().from("messages").update({ status: "blocked", blocked_reason: `${BY}: gesperrt` }).eq("prospect_id", p.id).in("status", ["draft", "approved"]);
    await log("contact:suppress", p.id, null, { email });
  });
}

export async function contactNote(f: FormData) {
  await run(f, "Notiz gespeichert", async () => {
    const p = await prospect(f.get("prospect"));
    const note = validateNote(f.get("note"));
    const { error } = await db().from("owner_notes").insert({ prospect_id: p.id, note });
    if (error) throw new Error(error.message);
    await log("contact:note", p.id, null, null);
  });
}

export async function contactMakeCustomer(f: FormData) {
  await run(f, "als Kunde angelegt", async () => {
    const p = await prospect(f.get("prospect"));
    const c = validateCustomer({ company: p.company_name, email: f.get("email") || p.email, country: p.country, pkg: f.get("pkg") }, COUNTRIES);
    await createCustomerRow(c, p.id);
  });
}

// ------------------------------------------------------------------------------------------- Kunden
async function createCustomerRow(c: ReturnType<typeof validateCustomer>, prospectId: string | null) {
  const { data: cust, error } = await db().from("customers").insert({
    prospect_id: prospectId, company_name: c.company, country: c.country, billing_email: c.email, status: "active",
    notes: `angelegt im Dashboard (${BY}), Paket ${PACKAGES[c.pkg].label}`,
  }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await db().from("subscriptions").insert({
    customer_id: cust.id, segment_id: SEGMENT, package: c.pkg, amount_cents: c.amount_cents, currency: c.currency,
    filters: { country: c.country, max_per_week: PACKAGES[c.pkg].perWeek }, status: "active",
  });
  if (e2) throw new Error(e2.message);
  await db().from("customer_filters").upsert({ customer_id: cust.id, segment_id: SEGMENT, max_per_week: PACKAGES[c.pkg].perWeek });
  await log("customer:create", cust.id, null, c);
}

export async function createCustomer(f: FormData) {
  await run(f, "Kunde angelegt", async () => {
    const c = validateCustomer({ company: f.get("company"), email: f.get("email"), country: f.get("country"), pkg: f.get("pkg") }, COUNTRIES);
    await createCustomerRow(c, null);
  });
}

/** Erste Lieferung freigeben – wie scripts/deliveries.py approve. */
export async function approveFirstDelivery(f: FormData) {
  await run(f, "Lieferung freigegeben", async () => {
    const sub = String(f.get("subscription") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sub)) throw new InputError("Abo unbekannt");
    const now = new Date().toISOString();
    await db().from("subscriptions").update({ first_delivery_approved: true, updated_at: now }).eq("id", sub);
    const { data } = await db().from("deliveries").update({ status: "approved", approved_at: now, note: `freigegeben: ${BY}` })
      .eq("subscription_id", sub).eq("status", "prepared").select("id");
    await log("customer:approve_delivery", sub, null, { deliveries: data?.length ?? 0 });
  });
}

export async function setSubscriptionPaused(f: FormData) {
  await run(f, "gespeichert", async () => {
    const sub = String(f.get("subscription") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sub)) throw new InputError("Abo unbekannt");
    const status = f.get("paused") === "1" ? "paused" : "active";
    const { error } = await db().from("subscriptions").update({ status, updated_at: new Date().toISOString() }).eq("id", sub).in("status", ["active", "paused"]);
    if (error) throw new Error(error.message);
    await log("customer:subscription_status", sub, null, { status });
  });
}

// ------------------------------------------------------------------------------------------- Hinweise ausblenden
/**
 * JARVIS-Empfehlung oder Hinweis per X ausblenden (Inhaber 04.10.2026: „was jarvis empfiehlt auch sachen löschen können
 * sehr einfach“): Schlüssel -> bis-Zeitpunkt in owner_settings.dismissed_tips (7 Tage, rote Alarme nur 24 h), mit
 * owner_log. Ohne Weiterleitung, damit die Seite die Leiste „ausgeblendet · rückgängig“ zeigen kann.
 */
/** Eigene Protokoll-Aktion (tip:dismiss/tip:undo) statt setting:…, damit der Regler-Verlauf nicht vollläuft. */
async function saveTips(value: Record<string, string>) {
  const { error } = await db().from("owner_settings").upsert({ key: "dismissed_tips", value, updated_at: new Date().toISOString(), updated_by: BY });
  if (error) throw new Error(error.message);
}

export async function dismissTip(f: FormData): Promise<{ ok: boolean; msg?: string }> {
  await requireOwner();
  const { addDismissal, DismissError } = await import("@/lib/tips");
  const s = await loadOwnerSettings();
  try {
    const level = f.get("level") === "rot" ? "rot" : "gelb";
    const key = String(f.get("key") ?? "");
    const next = addDismissal(s.dismissed_tips, key, level, new Date());
    await saveTips(next);
    await log("tip:dismiss", key, null, { until: next[key.trim()], level });
  } catch (e) {
    if (e instanceof DismissError) return { ok: false, msg: e.message };
    throw e;
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** „rückgängig“ nach dem Ausblenden. */
export async function undoDismissTip(f: FormData): Promise<{ ok: boolean; msg?: string }> {
  await requireOwner();
  const { removeDismissal, DismissError } = await import("@/lib/tips");
  const s = await loadOwnerSettings();
  try {
    const key = String(f.get("key") ?? "");
    await saveTips(removeDismissal(s.dismissed_tips, key, new Date()));
    await log("tip:undo", key.trim(), s.dismissed_tips?.[key.trim()] ?? null, null);
  } catch (e) {
    if (e instanceof DismissError) return { ok: false, msg: e.message };
    throw e;
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ------------------------------------------------------------------------------------------- Agenten
/** Auftrag an einen Agenten (Inhaber 03.10.2026). Ausgeführt von der stündlichen Claude-Sitzung „Agenten“. */
export async function createAgentTask(f: FormData) {
  const { agentStartLabel } = await import("@/lib/agents");
  await run(f, () => `Auftrag erteilt – Agent startet um ${agentStartLabel(new Date())}`, async () => {
    const { validateTask, TaskError } = await import("@/lib/agents");
    let t;
    try {
      t = validateTask({ agent: f.get("agent"), kind: f.get("kind"), market: f.getAll("market").map(String), brief: f.get("brief") });
    } catch (e) {
      if (e instanceof TaskError) throw new InputError(e.message);
      throw e;
    }
    // Rolle (Fach-Agent) nur, wenn sie in firma-karte.json steht – damit der Auftrag in der Zentrale beim richtigen Bereich läuft
    const rolle = String(f.get("rolle") ?? "").trim();
    const { AGENTEN } = await import("@/lib/firma-karte");
    const mitRolle = rolle && AGENTEN.some((a) => a.id === `rolle:${rolle}`) ? { rolle } : {};
    const { error } = await db().from("agent_tasks").insert({ ...t, ...mitRolle, created_by: BY });
    if (error) throw new Error(error.message);
    await log("agent:create", `Agent ${t.agent}`, null, { ...t, ...mitRolle });
  });
}

/**
 * JARVIS-Chat (Inhaber 04.10.2026: „ich will auch mit jarvis schreiben können und ihm direkt aufgaben per text geben
 * … über mein claude abo“): Text → Auftrag (Art/Markt erkannt, sonst Frage) an den ersten freien Agenten. Beantwortet
 * von der stündlichen Agenten-Routine (Claude-Abo, keine API-Kosten), Chat-Aufträge zuerst (docs/AGENTEN.md).
 */
export async function chatToJarvis(f: FormData) {
  await run(f, "Notiert – Antwort kommt mit der nächsten Agenten-Runde", async () => {
    const { CHAT_BY, chatTask, validateTask, TaskError } = await import("@/lib/agents");
    const { loadAgentTasks } = await import("@/lib/dashboard-data");
    if (String(f.get("text") ?? "").trim().length < 3) throw new InputError("Nachricht: 3–1000 Zeichen");
    let t;
    try {
      t = validateTask(chatTask(f.get("text"), await loadAgentTasks()));
    } catch (e) {
      if (e instanceof TaskError) throw new InputError(e.message === "Auftrag: 3–1000 Zeichen" ? "Nachricht: 3–1000 Zeichen" : e.message);
      throw e;
    }
    const { error } = await db().from("agent_tasks").insert({ ...t, created_by: CHAT_BY });
    if (error) throw new Error(error.message);
    await log("agent:chat", `Agent ${t.agent}`, null, t);
  });
}

/** Offenen Auftrag zurückziehen (laufende arbeiten zu Ende). */
export async function cancelAgentTask(f: FormData) {
  await run(f, "Auftrag zurückgezogen", async () => {
    const id = String(f.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InputError("Auftrag unbekannt");
    const { data, error } = await db().from("agent_tasks").update({ status: "abgebrochen", finished_at: new Date().toISOString() }).eq("id", id).eq("status", "offen").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new InputError("nur offene Aufträge lassen sich zurückziehen");
    await log("agent:cancel", id, null, null);
  });
}

/**
 * Fach-Agent jetzt beauftragen (JARVIS „Team“, Inhaber 04.10.2026): Auftrag (kind 'gehirn', rolle = Fach-Agent) an den
 * ersten freien Agenten A1–A8; Text aus agent_roles.auftrag (+ Routine). Höchstens ein offener Auftrag je Fach-Agent.
 */
export async function assignRole(f: FormData) {
  const { agentStartLabel, freeAgent } = await import("@/lib/agents");
  await run(f, () => `Beauftragt – startet um ${agentStartLabel(new Date())}`, async () => {
    const slug = String(f.get("rolle") ?? "");
    if (!/^[a-z][a-z_]{1,30}$/.test(slug)) throw new InputError("Fach-Agent unbekannt");
    const { data: role } = await db().from("agent_roles").select("*").eq("slug", slug).maybeSingle();
    if (!role || role.aktiv === false) throw new InputError("Fach-Agent unbekannt");
    const { data: open } = await db().from("agent_tasks").select("id").eq("rolle", slug).in("status", ["offen", "laeuft"]).limit(1);
    if (open?.length) throw new InputError("läuft schon");
    const { loadAgentTasks } = await import("@/lib/dashboard-data");
    const { roleBrief, toRolle } = await import("@/lib/fach-agenten");
    let zusatz: string | null = null, dauer = 15;
    if (role.routine_id) {
      const { data: r } = await db().from("brain_routines").select("aufgabe, dauer_min").eq("id", role.routine_id).maybeSingle();
      zusatz = r?.aufgabe ?? null;
      dauer = Number(r?.dauer_min) || 15;
    }
    const agent = freeAgent(await loadAgentTasks());
    const row = { agent, kind: "gehirn", market: null, brief: roleBrief(toRolle(role), dauer, zusatz), rolle: slug,
      grund: `Inhaber: ${String(role.name)} jetzt`.slice(0, 160), created_by: BY };
    const { error } = await db().from("agent_tasks").insert(row);
    if (error) throw new Error(error.message);
    await log("agent:rolle", slug, null, { agent });
  });
}

/**
 * „Auftrag geben“ im Bereichs-Office (Inhaber 04.10.2026): Auftrag an den ersten freien Agenten A1–A8, Text mit Präfix
 * „Bereich <Name>:“ (lib/office.ts bereichPrefix), Leitung als Fach-Agent, wenn der Bereich eine hat. Ohne Text: Ziel
 * des Bereichs verbessern. Wie createAgentTask, ausgeführt von der stündlichen Agenten-Routine (docs/AGENTEN.md).
 */
export async function assignBereich(f: FormData) {
  const { agentStartLabel, freeAgent } = await import("@/lib/agents");
  await run(f, () => `Auftrag erteilt – Agent startet um ${agentStartLabel(new Date())}`, async () => {
    const slug = String(f.get("bereich") ?? "");
    if (!/^[a-z][a-z_]{1,30}$/.test(slug)) throw new InputError("Bereich unbekannt");
    const { data: b } = await db().from("departments").select("slug, name, leitung_rolle, ziel_titel, aktiv").eq("slug", slug).maybeSingle();
    if (!b || b.aktiv === false) throw new InputError("Bereich unbekannt");
    const { bereichPrefix } = await import("@/lib/office");
    const text = String(f.get("text") ?? "").trim().replace(/\s+/g, " ");
    if (text.length > 900) throw new InputError("Auftrag: höchstens 900 Zeichen");
    const brief = `${bereichPrefix(String(b.name))} ${text.length >= 3 ? text : `Ziel „${String(b.ziel_titel ?? "")}“ prüfen und kostenlos verbessern`}`;
    const { loadAgentTasks } = await import("@/lib/dashboard-data");
    const agent = freeAgent(await loadAgentTasks());
    const row = { agent, kind: "frage", market: null, brief, created_by: BY, grund: `Inhaber: Bereich ${String(b.name)}`.slice(0, 160),
      ...(b.leitung_rolle ? { rolle: String(b.leitung_rolle) } : {}) };
    const { error } = await db().from("agent_tasks").insert(row);
    if (error) throw new Error(error.message);
    await log("agent:bereich", slug, null, { agent });
  });
}
