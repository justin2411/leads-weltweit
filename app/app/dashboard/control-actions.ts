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

/** Gemeinsamer Rahmen: Sitzung, Fehler als Hinweis zurück, Erfolg als „gespeichert“. */
async function run(f: FormData, okMsg: string, fn: () => Promise<void>) {
  await requireOwner();
  const to = back(f);
  try {
    await fn();
  } catch (e) {
    if (e instanceof InputError) go(to, "fehler", e.message);
    throw e;
  }
  revalidatePath("/dashboard", "layout");
  go(to, "ok", okMsg);
}

// ------------------------------------------------------------------------------------------- Versand
export async function setPaused(f: FormData) {
  const paused = f.get("paused") === "1";
  await run(f, paused ? "Versand pausiert" : "Versand läuft wieder", () => setSetting("send_paused", paused));
}

export async function toggleSendCountry(f: FormData) {
  await run(f, "gespeichert", async () => {
    const s = await loadOwnerSettings();
    await setSetting("send_countries_off", toggleIn(s.send_countries_off, String(f.get("country")), COUNTRIES));
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
    await setSetting("buyer_countries_off", toggleIn(s.buyer_countries_off, String(f.get("country")), COUNTRIES));
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

// ------------------------------------------------------------------------------------------- Belegungsplan
/** Plätze je Linie (Inhaber 03.10.2026: „wv plätze werden belegt … wie maschinen steuern“). Wirkt beim nächsten Start
 *  des Werks (Job plan in lead-werk.yml/kunden-werk.yml). Grenzen je Linie und Summe prüft validateSlotPlan. */
export async function saveSlotPlan(f: FormData) {
  await run(f, "Belegung gespeichert – wirkt beim nächsten Start der Werke", async () => {
    const reg = LANES as unknown as LaneRegistry;
    const input = Object.fromEntries(reg.lanes.map((l) => [l.id, f.get(`slot_${l.id}`)]));
    await setSetting("slot_plan", f.get("reset") === "1" ? {} : validateSlotPlan(input, reg));
  });
}

// ------------------------------------------------------------------------------------------- Werke starten
export async function dispatchWorkflow(f: FormData) {
  await run(f, "gestartet", async () => {
    const key = String(f.get("wf")) as WorkflowKey;
    const wf = WORKFLOWS[key];
    if (!wf) throw new InputError("unbekannter Ablauf");
    const token = process.env.GH_DISPATCH_TOKEN?.trim();
    if (!canDispatch() || !token) throw new InputError("Starten braucht GH_DISPATCH_TOKEN in Vercel");
    if (key === "versand" && (await loadOwnerSettings()).send_paused) throw new InputError("Versand ist pausiert");
    const repo = process.env.GH_REPO?.trim() || "justin2411/leads-weltweit";
    const inputs: Record<string, string> = { ...wf.inputs };
    if (key === "versand") inputs.freigabe = `${BY}, ${new Date().toISOString()}`;
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf.file}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new InputError(`GitHub: ${r.status}`);
    await log("workflow:start", wf.file, null, inputs);
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
