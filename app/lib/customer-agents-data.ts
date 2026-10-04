/**
 * Kunden-Agenten: Datenbank-Zugriffe (nur serverseitig, Service-Schlüssel). Tabellen signalwerk.customer_agents und
 * signalwerk.customer_agent_messages nach docs/KUNDEN-AGENTEN.md. Fehler hier dürfen den Stripe-Webhook nie scheitern
 * lassen (Aufrufer fangen ab); im Dashboard zeigt die Seite den Fehler statt zu hängen.
 */
import "server-only";
import { db } from "@/lib/supabase";
import PERSONAS from "@/lib/personas.json";
import { agentEligible, fullName, langFor, pickPersona, type PausedBy, type Persona, type PersonaData } from "@/lib/customer-agents";

export const PERSONA_DATA = PERSONAS as unknown as PersonaData;

export type CustomerAgent = {
  id: string; customer_id: string; subscription_id: string; status: string; paused_by?: PausedBy | null; persona: Persona; profile: Record<string, unknown> | null;
  kpis: Record<string, unknown> | null; mail_opt_out: boolean | null; last_contact_at: string | null; next_checkin_at: string | null;
  created_at: string; updated_at: string | null;
};
export type AgentMessage = {
  id: string; agent_id: string; created_at: string; direction: "in" | "out" | "notiz"; channel: string | null; subject: string | null;
  body: string | null; status: string | null;
};
export type AgentCustomer = { id: string; company_name: string | null; country: string | null; billing_email: string | null; status: string | null };
export type AgentSubscription = { id: string; package: string | null; status: string | null; filters: Record<string, unknown> | null };

/**
 * Agent zum Abo anlegen, wenn das Paket passt (Pro, individuell ab 40/Woche). Idempotent über subscription_id: gibt es
 * ihn schon, kommt seine Persona zurück. Name: je Kunde ein anderer, solange möglich (vergebene Namen aus der Tabelle).
 */
export async function ensureCustomerAgent(o: { subscriptionId: string; customerId: string; pkg: unknown; weekly?: unknown; country: unknown }): Promise<Persona | null> {
  if (!agentEligible(o.pkg, o.weekly)) return null;
  const existing = await db().from("customer_agents").select("persona").eq("subscription_id", o.subscriptionId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data.persona as Persona;
  const { data: all, error } = await db().from("customer_agents").select("persona").limit(5000);
  if (error) throw new Error(error.message);
  const used = (all ?? []).map((r: any) => fullName(r.persona)).filter(Boolean);
  const persona = pickPersona(PERSONA_DATA, langFor(o.country), o.subscriptionId, used);
  const ins = await db().from("customer_agents").upsert(
    { customer_id: o.customerId, subscription_id: o.subscriptionId, status: "onboarding", persona, profile: {}, kpis: {} },
    { onConflict: "subscription_id", ignoreDuplicates: true },
  );
  if (ins.error) throw new Error(ins.error.message);
  // Gleichzeitige Zustellung: die gespeicherte Persona gilt
  const again = await db().from("customer_agents").select("persona").eq("subscription_id", o.subscriptionId).maybeSingle();
  return (again.data?.persona as Persona | undefined) ?? persona;
}

/** Kündigung/Downgrade: Agent pausiert, nichts gelöscht. Gibt zurück, ob ein Agent betroffen war. */
export async function pauseAgentForSubscription(subscriptionId: string): Promise<boolean> {
  const { data, error } = await db().from("customer_agents").update({ status: "pausiert", paused_by: "abo", updated_at: new Date().toISOString() })
    .eq("subscription_id", subscriptionId).neq("status", "pausiert").select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

const ms = (n: number) => AbortSignal.timeout(n);

/** Anzahl Agenten für den JARVIS-Link; null = nicht lesbar (z. B. Tabelle noch nicht angelegt). */
export async function countCustomerAgents(): Promise<number | null> {
  try {
    const { count, error } = await db().from("customer_agents").select("id", { count: "exact", head: true }).abortSignal(ms(1500));
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

/** Alle Agenten mit Kunde, Abo und letzter Nachricht (neueste Agenten zuerst). */
export async function loadCustomerAgents() {
  const { data, error } = await db().from("customer_agents").select("*").order("created_at", { ascending: false }).limit(500).abortSignal(ms(5000));
  if (error) throw new Error(error.message);
  const agents = (data ?? []) as CustomerAgent[];
  if (!agents.length) return { agents, customers: new Map<string, AgentCustomer>(), subs: new Map<string, AgentSubscription>(), last: new Map<string, AgentMessage>() };
  const [c, s, m] = await Promise.all([
    db().from("customers").select("id, company_name, country, billing_email, status").in("id", [...new Set(agents.map((a) => a.customer_id))]),
    db().from("subscriptions").select("id, package, status, filters").in("id", agents.map((a) => a.subscription_id)),
    db().from("customer_agent_messages").select("id, agent_id, created_at, direction, channel, subject, body, status")
      .in("agent_id", agents.map((a) => a.id)).order("created_at", { ascending: false }).limit(1000),
  ]);
  const last = new Map<string, AgentMessage>();
  for (const x of (m.data ?? []) as AgentMessage[]) if (!last.has(x.agent_id)) last.set(x.agent_id, x);
  return {
    agents,
    customers: new Map(((c.data ?? []) as AgentCustomer[]).map((x) => [x.id, x])),
    subs: new Map(((s.data ?? []) as AgentSubscription[]).map((x) => [x.id, x])),
    last,
  };
}

/** Ein Agent mit Verlauf (älteste zuerst), Kunde, Abo und seinen Aufträgen (agent_tasks kind „kunde“ mit seiner ID). */
export async function loadCustomerAgent(id: string) {
  const { data, error } = await db().from("customer_agents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const a = data as CustomerAgent;
  const [c, s, m, t] = await Promise.all([
    db().from("customers").select("id, company_name, country, billing_email, status").eq("id", a.customer_id).maybeSingle(),
    db().from("subscriptions").select("id, package, status, filters").eq("id", a.subscription_id).maybeSingle(),
    db().from("customer_agent_messages").select("id, agent_id, created_at, direction, channel, subject, body, status")
      .eq("agent_id", a.id).order("created_at", { ascending: false }).limit(200),
    db().from("agent_tasks").select("id, created_at, status, brief, result, created_by").eq("kind", "kunde")
      .ilike("brief", `%${a.id}%`).order("created_at", { ascending: false }).limit(10),
  ]);
  return {
    agent: a,
    customer: (c.data ?? null) as AgentCustomer | null,
    sub: (s.data ?? null) as AgentSubscription | null,
    messages: ((m.data ?? []) as AgentMessage[]).reverse(),
    tasks: (t.data ?? []) as { id: string; created_at: string; status: string; brief: string; result: string | null; created_by: string | null }[],
  };
}
