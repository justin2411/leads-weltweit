"use server";

/**
 * Aktionen des Antworten-Cockpits (Nachtschicht 03./04.10.2026). Jede Aktion: Sitzung prüfen (requireOwner), Eingabe
 * serverseitig neu prüfen, Antwort aus der Datenbank laden (nie Formularwerte für Adressen vertrauen), owner_action/_at
 * an der Antwort speichern und in owner_log protokollieren. Server Actions sind von Next gegen CSRF geschützt.
 *
 * Grenzen: Mails nur an die Person, die uns geschrieben hat (Einwilligung, Resend erlaubt); keine Preise, Beträge oder
 * Garantien (lintAnswer); Proben nur aus dem geprüften Vorrat (sendFromStock, nie die Inhaber-Vorschau); Sperren wie
 * contactSuppress (suppress_email, dauerhaft, nie aufheben); gesperrte Adressen bekommen nichts.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, suppressEmail } from "@/lib/supabase";
import { sendConsentMail } from "@/lib/mail";
import { sendFromStock } from "@/lib/sample-stock";
import { LEGAL_NAME } from "@/lib/site";
import { InputError } from "@/lib/owner-settings";
import { hadSample, stockDeps, stockReady } from "@/lib/antworten-data";
import {
  answerLang, cleanAnswer, domainOf, isStatus, isUuid, lintAnswer, replyFooter, replySubject, shortHash, STATUS_LABEL,
  threadHeaders,
} from "@/lib/antworten";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
const LIST = "/dashboard/antworten";
const POSTAL = "Nikolaistraße 3-7, 04109 Leipzig, Germany";

function go(path: string, key: "ok" | "fehler", msg: string): never {
  const u = new URL(path, "http://x");
  u.searchParams.set(key, msg);
  redirect(u.pathname + u.search);
}

async function log(action: string, target: string | null, newValue: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: null, new_value: newValue ?? null, created_by: BY });
}

type Reply = {
  id: string; status: string; from_email: string | null; subject: string | null; imap_message_id: string | null;
  message_id: string | null; prospect_id: string | null; received_at: string | null; owner_action: string | null;
  prospects: { id: string; company_name: string; country: string; domain: string | null; segment_id: string | null; email: string | null } | null;
  messages: { id: string; subject: string; smtp_message_id: string | null; resend_id: string | null; language: string | null } | null;
};

async function loadOne(raw: unknown): Promise<Reply> {
  const id = String(raw ?? "");
  if (!isUuid(id)) throw new InputError("Antwort unbekannt");
  const { data, error } = await db().from("inbound_replies")
    .select("id, status, from_email, subject, imap_message_id, message_id, prospect_id, received_at, owner_action, "
      + "prospects(id, company_name, country, domain, segment_id, email), messages(id, subject, smtp_message_id, resend_id, language)")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new InputError("Antwort unbekannt");
  const one = (x: any) => (Array.isArray(x) ? x[0] ?? null : x ?? null);
  return { ...(data as any), prospects: one((data as any).prospects), messages: one((data as any).messages) } as Reply;
}

async function mark(r: Reply, action: string, status?: string) {
  const { error } = await db().from("inbound_replies")
    .update({ owner_action: action, owner_action_at: new Date().toISOString(), ...(status ? { status } : {}) }).eq("id", r.id);
  if (error) throw new Error(error.message);
}

function sender(r: Reply): string {
  const e = String(r.from_email ?? "").trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(e)) throw new InputError("keine gültige Absender-Adresse");
  return e;
}

async function suppressed(email: string): Promise<boolean> {
  const { data, error } = await db().rpc("is_suppressed", { p_email: email });
  if (error) throw new Error(`is_suppressed: ${error.message}`);
  return !!data;
}

/** Unsere zuletzt gesendete Mail an die Firma (für Ereignisse), bevorzugt die, auf die geantwortet wurde. */
async function ourMessage(r: Reply): Promise<{ id: string; resend_id: string | null } | null> {
  if (r.messages) return { id: r.messages.id, resend_id: r.messages.resend_id };
  if (!r.prospect_id) return null;
  const { data } = await db().from("messages").select("id, resend_id").eq("prospect_id", r.prospect_id).eq("status", "sent")
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

/** Rahmen: Sitzung, Fehler als Hinweis zurück zur Antwort, Erfolg mit Text an das Ziel. */
async function run(f: FormData, fn: (r: Reply) => Promise<{ to: string; msg: string }>) {
  await requireOwner();
  const id = String(f.get("id") ?? "");
  const here = isUuid(id) ? `${LIST}/${id}` : LIST;
  let out: { to: string; msg: string };
  try {
    out = await fn(await loadOne(id));
  } catch (e) {
    if (e instanceof InputError) go(here, "fehler", e.message);
    throw e;
  }
  revalidatePath(LIST, "layout");
  go(out.to, "ok", out.msg);
}

// ------------------------------------------------------------------------------------------- Status
/** Später / Erledigt / wieder offen. */
export async function setReplyStatus(f: FormData) {
  await run(f, async (r) => {
    const s = String(f.get("status") ?? "");
    if (!isStatus(s)) throw new InputError("Status ungültig");
    await mark(r, `status:${s}`, s);
    await log("antwort:status", r.id, { status: s, from: r.status });
    return { to: s === "offen" ? `${LIST}/${r.id}` : LIST, msg: STATUS_LABEL[s] };
  });
}

// ------------------------------------------------------------------------------------------- Kaufinteresse
/** Wie contactReply mit „positiv“: Ereignis reply_positive an unserer Mail (zählt in den Kennzahlen). */
export async function markBuyInterest(f: FormData) {
  await run(f, async (r) => {
    if (r.owner_action === "kaufinteresse") throw new InputError("schon als Kaufinteresse erfasst");
    const m = await ourMessage(r);
    if (!m) throw new InputError("an diese Firma wurde noch nichts gesendet");
    const { error } = await db().from("email_events").insert({ message_id: m.id, resend_id: m.resend_id ?? null, type: "reply_positive",
      note: `${BY}: Kaufinteresse (Antworten-Cockpit)` });
    if (error) throw new Error(error.message);
    await mark(r, "kaufinteresse");
    await log("antwort:kaufinteresse", r.id, { prospect: r.prospect_id, message: m.id });
    return { to: `${LIST}/${r.id}`, msg: "Kaufinteresse erfasst" };
  });
}

// ------------------------------------------------------------------------------------------- Sperren
/** Wie contactSuppress: Adresse + Domain dauerhaft sperren, offene Entwürfe der Firma stoppen. Nie rückgängig. */
export async function suppressReply(f: FormData) {
  await run(f, async (r) => {
    if (f.get("confirm") !== "ja") throw new InputError("Bitte Haken „wirklich sperren“ setzen");
    const email = sender(r);
    await suppressEmail(email, "manual", "owner-dashboard");
    if (r.prospect_id) {
      await db().from("messages").update({ status: "blocked", blocked_reason: `${BY}: gesperrt` })
        .eq("prospect_id", r.prospect_id).in("status", ["draft", "approved"]);
    }
    await mark(r, "gesperrt", "erledigt");
    await log("antwort:sperren", r.id, { email, prospect: r.prospect_id });
    return { to: LIST, msg: "dauerhaft gesperrt" };
  });
}

// ------------------------------------------------------------------------------------------- Antwort senden
/** Antwort des Inhabers an die Person, die geschrieben hat – im selben Verlauf (In-Reply-To/References). */
export async function sendAnswer(f: FormData) {
  await run(f, async (r) => {
    const text = cleanAnswer(f.get("text"));
    const errs = lintAnswer(text);
    if (errs.length) throw new InputError(`Nicht gesendet: ${errs.join(", ")}`);
    const to = sender(r);
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) throw new InputError("Resend nicht eingerichtet – nichts gesendet");
    if (await suppressed(to)) throw new InputError("Adresse ist gesperrt – nichts gesendet");
    const lang = answerLang(r.prospects?.country, r.messages?.language);
    const body = `${text}\n\n${replyFooter(lang, LEGAL_NAME, POSTAL, domainOf(to))}`;
    const subject = replySubject(r.subject, r.messages?.subject);
    const th = threadHeaders(r.imap_message_id, r.messages?.smtp_message_id);
    let resendId: string | null;
    try {
      resendId = await sendConsentMail(to, subject, body, undefined, undefined,
        { ...th, idempotencyKey: `antwort-${r.id}-${shortHash(text)}` });
    } catch (e) {
      await log("antwort:senden_fehler", r.id, { to, error: String((e as Error)?.message ?? e).slice(0, 200) });
      throw new InputError(`Nicht gesendet (${String((e as Error)?.message ?? e).slice(0, 80)})`);
    }
    await mark(r, "antwort_gesendet", "erledigt");
    await log("antwort:senden", r.id, { to, subject, resend_id: resendId, chars: text.length, thread: !!th.inReplyTo });
    return { to: LIST, msg: "Antwort gesendet" };
  });
}

// ------------------------------------------------------------------------------------------- Probe senden
/**
 * Probe aus dem geprüften Vorrat an die Person, die geschrieben hat (derselbe Weg wie der Sofortversand nach dem
 * Klick: sample_requests-Zeile, claim_sample_stock, Resend mit Idempotency-Key, finish_sample_stock). Nie über die
 * Inhaber-Vorschau. Ohne passenden Vorrat: nichts senden und das sagen.
 */
export async function sendSample(f: FormData) {
  await run(f, async (r) => {
    const p = r.prospects;
    if (!p?.segment_id || !p.country) throw new InputError("Firma unbekannt – Probe nicht möglich");
    const email = sender(r);
    if (await suppressed(email)) throw new InputError("Adresse ist gesperrt – nichts gesendet");
    if (await hadSample(email, r.prospect_id)) throw new InputError("hat schon eine Probe bekommen");
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) throw new InputError("Resend nicht eingerichtet – nichts gesendet");
    if ((await stockReady(p.segment_id, p.country)) < 1) throw new InputError(`Kein fertiger Vorrat für ${p.country} – nichts gesendet`);
    const now = new Date().toISOString();
    const { data: req, error } = await db().from("sample_requests").insert({
      variant_id: null, company_name: p.company_name, email, segment_id: p.segment_id, country: p.country,
      consent_text: "Per E-Mail-Antwort auf unsere Nachricht angefragt (Antworten-Cockpit)",
      consent_at: r.received_at ?? now, status: "new", note: `Antworten-Cockpit ${r.id}`,
      claimed_at: now, // Sperre: web_samples.py lässt die Anfrage in Ruhe, solange wir sie bedienen
    }).select("id").single();
    if (error) throw new Error(error.message);
    const res = await sendFromStock(stockDeps(), { id: req.id, segment: p.segment_id, country: p.country, email, wish: [] })
      .catch((e) => ({ status: "error" as const, detail: String(e).slice(0, 200) }));
    if (res.status === "none") {
      // kein Vorrat mehr (gleichzeitig vergeben): Anfrage schließen, damit die Warteschlange nichts Unerwartetes sendet
      await db().from("sample_requests").update({ status: "rejected", claimed_at: null, note: `Antworten-Cockpit ${r.id}: kein Vorrat` })
        .eq("id", req.id).eq("status", "new");
      await log("antwort:probe", r.id, { result: "none" });
      throw new InputError(`Kein fertiger Vorrat für ${p.country} – nichts gesendet`);
    }
    if (res.status !== "sent") {
      await log("antwort:probe", r.id, { result: res.status, detail: "detail" in res ? res.detail : null });
      throw new InputError(`Probe nicht gesendet (${"detail" in res && res.detail ? res.detail : "Fehler"})`);
    }
    const m = await ourMessage(r);
    if (m) {
      await db().from("email_events").insert({ message_id: m.id, type: "sample_requested", note: `${BY}: Probe aus Vorrat (Antworten-Cockpit)` });
    }
    await mark(r, "probe_gesendet", "erledigt");
    await log("antwort:probe", r.id, { result: "sent", stock: res.stockId, resend_id: res.resendId ?? null, request: req.id });
    return { to: LIST, msg: "Probe gesendet" };
  });
}
