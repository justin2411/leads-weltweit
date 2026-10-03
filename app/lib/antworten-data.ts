import "server-only";
import { db } from "@/lib/supabase";
import { loadCompany } from "@/lib/dashboard-data";
import { STOCK_BUCKET, type StockDeps } from "@/lib/sample-stock";
import { isUuid, sortReplies, type ReplyStatus } from "@/lib/antworten";

/**
 * Daten des Antworten-Cockpits (signalwerk.inbound_replies, Migration 20261004050000). Nur serverseitig mit dem
 * Service-Schlüssel, ohne Zwischenspeicher: Antworten müssen sofort sichtbar sein, und ein Fehler (z. B. Tabelle noch
 * nicht angelegt) wird nie gespeichert – der nächste Aufruf fragt neu.
 */

export type ReplyListRow = {
  id: string; received_at: string | null; processed_at: string | null; status: string; intent: string | null;
  summary_de: string | null; subject: string | null; from_email: string | null; auto_action: string | null;
  owner_action: string | null; owner_action_at: string | null; prospect_id: string | null;
  prospects: { company_name: string; country: string; domain: string | null } | null;
};

export type ReplyDetail = ReplyListRow & {
  imap_message_id: string | null; message_id: string | null; body_text: string | null; draft_text: string | null;
  draft_kind: string | null; alert_sent_at: string | null;
  prospects: { company_name: string; country: string; domain: string | null; segment_id: string | null; legal_form: string | null;
    website: string | null; email: string | null } | null;
  messages: { subject: string; body: string; sent_at: string | null; to_email: string; smtp_message_id: string | null;
    language: string | null; kind: string | null } | null;
};

const LIST_COLS = "id, received_at, processed_at, status, intent, summary_de, subject, from_email, auto_action, owner_action, "
  + "owner_action_at, prospect_id, prospects(company_name, country, domain)";

const one = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** Antworten eines Status (sortiert) und die Anzahl je Status. error: Text für den Inhaber, nie geworfen. */
export async function loadReplies(status: ReplyStatus, limit = 200): Promise<{ rows: ReplyListRow[]; counts: Record<ReplyStatus, number>; error: string | null }> {
  const sb = db();
  const count = (s: ReplyStatus) => sb.from("inbound_replies").select("id", { count: "exact", head: true }).eq("status", s);
  const [list, o, l, e] = await Promise.all([
    sb.from("inbound_replies").select(LIST_COLS).eq("status", status)
      .order("received_at", { ascending: status !== "erledigt", nullsFirst: false }).limit(limit),
    count("offen"), count("spaeter"), count("erledigt"),
  ]);
  const err = list.error ?? o.error ?? l.error ?? e.error;
  const rows = ((list.data ?? []) as any[]).map((r) => ({ ...r, prospects: one(r.prospects) })) as ReplyListRow[];
  return {
    rows: sortReplies(rows),
    counts: { offen: o.count ?? 0, spaeter: l.count ?? 0, erledigt: e.count ?? 0 },
    error: err ? err.message : null,
  };
}

/** Eine Antwort mit Firma, unserer Mail, Verlauf (wie Kontakte), weiteren Antworten und Proben-Vorrat. */
export async function loadReply(id: string) {
  if (!isUuid(id)) return null;
  const sb = db();
  const { data, error } = await sb.from("inbound_replies")
    .select("*, prospects(company_name, country, domain, segment_id, legal_form, website, email), "
      + "messages(subject, body, sent_at, to_email, smtp_message_id, language, kind)")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = { ...(data as any), prospects: one((data as any).prospects), messages: one((data as any).messages) } as ReplyDetail;
  const p = r.prospects;
  const [company, others, stock] = await Promise.all([
    r.prospect_id ? loadCompany(r.prospect_id).catch(() => null) : Promise.resolve(null),
    r.prospect_id || r.from_email
      ? sb.from("inbound_replies").select("id, received_at, processed_at, intent, summary_de, status")
          .eq(r.prospect_id ? "prospect_id" : "from_email", (r.prospect_id ?? r.from_email)!)
          .neq("id", r.id).order("received_at", { ascending: false }).limit(8)
          .then((x) => (x.data ?? []) as { id: string; received_at: string | null; processed_at: string | null; intent: string | null; summary_de: string | null; status: string }[])
      : Promise.resolve([]),
    p?.segment_id && p.country ? stockReady(p.segment_id, p.country).catch(() => null) : Promise.resolve(null),
  ]);
  return { reply: r, company, others, stock };
}

/** Wie viele fertige Proben liegen für Zielgruppe/Land bereit (dieselbe Bedingung wie claim_sample_stock)? */
export async function stockReady(segment: string, country: string): Promise<number> {
  const { count, error } = await db().from("sample_stock").select("id", { count: "exact", head: true })
    .eq("segment_id", segment).eq("country", country).eq("status", "ready").gt("expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Hat diese Adresse oder Firma schon eine Probe bekommen? (wie sample-request hadSample / web_samples.skip_reason) */
export async function hadSample(email: string, prospectId: string | null): Promise<boolean> {
  const sb = db();
  const { data: sent } = await sb.from("sample_requests").select("id").eq("email", email).eq("status", "sent").limit(1);
  if (sent?.length) return true;
  if (!prospectId) return false;
  const { data: msgs } = await sb.from("messages").select("id").eq("prospect_id", prospectId).eq("status", "sent").limit(50);
  const ids = (msgs ?? []).map((m: { id: string }) => m.id);
  if (!ids.length) return false;
  const { data: ev } = await sb.from("email_events").select("id").in("message_id", ids).eq("type", "sample_requested").limit(1);
  return !!ev?.length;
}

/** Vorrats-Versand (lib/sample-stock.ts) mit der Datenbank – derselbe Weg wie der Sofortversand nach dem Klick. */
export function stockDeps(): StockDeps {
  return {
    rpc: async (fn, args) => {
      const { data, error } = await db().rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    download: async (path) => {
      const { data, error } = await db().storage.from(STOCK_BUCKET).download(path);
      if (error || !data) throw new Error(error?.message ?? "leer");
      return data.text();
    },
    fetch,
    env: { RESEND_API_KEY: process.env.RESEND_API_KEY, MAIL_FROM: process.env.MAIL_FROM, REPLY_TO: process.env.REPLY_TO },
  };
}
