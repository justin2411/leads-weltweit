import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { ChatInputError, checkBody, isSessionId, titleFrom, toMessage, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { flowSession, loadMessages, loadSession } from "@/lib/jarvis-chat-data";
import { loadFlow } from "@/lib/flow-data";
import { isUuid } from "@/lib/flow-io";
import {
  MAX_OPUS_ROUNDS, MODELS, ROUTINE_TOOL, TOOL_DEFS, budgetOf, canCall, checkTool, cleanReply, costEur, fallbackHint, haikuSystem, opusSystem,
  parseRoute, routineReply, tokensOf, toApiMessages, type ModelKey,
} from "@/lib/jarvis-llm";
import { buildContext, llmSpent, loadSources, type Sources } from "@/lib/jarvis-context";
import { runTool } from "@/lib/jarvis-tools";

/**
 * Sofort-Antwort für alle Chat-Oberflächen (JARVIS-Chat, Mini-Chats, Baukasten, Website-Seite): eine einzige
 * Sende-Funktion, aufgerufen von POST /api/jarvis/ask (Inhaber-Sitzung geprüft). Ablauf:
 *  1. Sitzung bestimmen (session_id; ohne = neue Chat-Sitzung; flow_id = Baukasten-Sitzung des Flows) und die
 *     Inhaber-Nachricht speichern (status offen – so übernimmt die Routine, falls hier nichts klappt).
 *  2. Ohne ANTHROPIC_API_KEY oder bei erreichter Monatsgrenze: Nachricht bleibt offen, Hinweis zurück.
 *  3. Haiku mit kompaktem Kontext: einfache Frage → Antwort; {"route":"opus"} → Opus mit sicheren Werkzeugen
 *     (höchstens 6 Runden); {"route":"routine"} bzw. Werkzeug an_routine_uebergeben → kurze Antwort „übernimmt die
 *     Routine, startet um HH:MM“, Nachricht bleibt offen.
 *  4. Antwort als jarvis_messages (model haiku|opus, cost_eur), Inhaber-Nachricht „fertig“. Jeder API-Aufruf → llm_usage.
 * Der Schlüssel bleibt serverseitig und wird nie geloggt; an die API gehen nur Kennzahlen, Verlauf und Flow-Daten –
 * keine Lead-Kontaktdaten.
 */
export type AskInput = { sessionId?: unknown; flowId?: unknown; text: unknown };
export type Fallback = { reason: "kein_schluessel" | "budget" | "fehler" | "zeit"; hint: string };
export type AskResult =
  | { ok: true; sessionId: string; messageId: string; reply: ChatMessage | null; model: ModelKey | null; cost: number; routine: boolean; changed: string[]; fallback: Fallback | null }
  | { ok: false; error: string };

const BY = "Inhaber Dashboard";
/** Gesamtzeit je Nachricht (Vercel-Funktion maxDuration 60 s): danach übernimmt die Routine. */
const DEADLINE_MS = 50_000;

/** Ist ein Schlüssel gesetzt? (nur Ja/Nein – der Wert verlässt nie den Server) */
export const instantEnabled = () => !!process.env.ANTHROPIC_API_KEY?.trim();

async function ownerLog(action: string, target: string | null, value: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: null, new_value: value ?? null, created_by: BY });
}

/** Sitzung zur Nachricht: vorhandene (auch Tagesbericht, Baukasten, Website), Baukasten je Flow, sonst neue Chat-Sitzung. */
async function resolveSession(input: AskInput, body: string): Promise<ChatSession> {
  if (input.flowId !== undefined && input.flowId !== null && input.flowId !== "") {
    if (!isUuid(input.flowId)) throw new ChatInputError("erst speichern – dann baut JARVIS mit");
    const f = await loadFlow(input.flowId);
    if (!f) throw new ChatInputError("Flow unbekannt");
    if (f.status === "archiv") throw new ChatInputError("Flow ist archiviert");
    const s = await flowSession(f.id, f.name, true);
    if (!s) throw new Error("Sitzung fehlt");
    return s;
  }
  const sid = input.sessionId;
  if (sid === undefined || sid === null || sid === "") {
    const { data, error } = await db().from("jarvis_sessions").insert({ title: titleFrom(body), kind: "chat" }).select("id").single();
    if (error) throw new Error(error.message);
    await ownerLog("jarvis:session", String(data.id), { title: titleFrom(body) });
    const s = await loadSession(String(data.id));
    if (!s) throw new Error("Sitzung fehlt");
    return s;
  }
  if (!isSessionId(sid)) throw new ChatInputError("Sitzung unbekannt");
  const s = await loadSession(sid.toLowerCase());
  if (!s) throw new ChatInputError("Sitzung unbekannt");
  if (s.archived) throw new ChatInputError("Sitzung ist archiviert – neue Sitzung starten");
  return s;
}

async function recordUsage(model: ModelKey, u: Anthropic.Usage | undefined, sessionId: string): Promise<number> {
  const cost = costEur(model, u);
  const t = tokensOf(u);
  const { error } = await db().from("llm_usage").insert({ model: MODELS[model], input_tokens: t.input, output_tokens: t.output, cost_eur: cost, session_id: sessionId });
  if (error) console.error("llm_usage:", error.message);
  return cost;
}

/** JARVIS-Antwort speichern (ohne Modell-Spalten, falls die Migration noch fehlt). */
async function insertReply(sessionId: string, body: string, model: ModelKey, cost: number): Promise<ChatMessage | null> {
  const base = { session_id: sessionId, role: "jarvis", body, status: null, links: [] };
  let r = await db().from("jarvis_messages").insert({ ...base, model, cost_eur: Math.round(cost * 1e6) / 1e6 }).select("*").single();
  if (r.error?.code === "42703" || r.error?.code === "PGRST204") r = await db().from("jarvis_messages").insert(base).select("*").single();
  if (r.error) throw new Error(r.error.message);
  return r.data ? toMessage(r.data as Record<string, unknown>) : null;
}

async function markDone(id: string) {
  await db().from("jarvis_messages").update({ status: "fertig", done_at: new Date().toISOString() }).eq("id", id).eq("status", "offen");
}

const textOf = (content: Anthropic.ContentBlock[]) => content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
const errInfo = (e: unknown) => (e instanceof Anthropic.APIError ? `${e.name} ${e.status ?? ""}` : e instanceof Error ? e.name : "Fehler");

export async function askJarvis(input: AskInput): Promise<AskResult> {
  const t0 = Date.now();
  const now = new Date();
  let body: string;
  let session: ChatSession;
  let messageId: string;
  try {
    body = checkBody(input.text);
    session = await resolveSession(input, body);
    const { data, error } = await db().from("jarvis_messages").insert({ session_id: session.id, role: "inhaber", body, status: "offen" }).select("id").single();
    if (error) throw new Error(error.message);
    messageId = String(data.id);
    await ownerLog(session.kind === "baukasten" ? "baukasten:chat" : "jarvis:message", session.flow_id ?? session.id, { chars: body.length, sofort: true });
  } catch (e) {
    if (e instanceof ChatInputError) return { ok: false, error: e.message };
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`jarvis-ask speichern [${ref}]:`, e instanceof Error ? e.message.slice(0, 200) : "Fehler");
    return { ok: false, error: `Senden fehlgeschlagen – bitte gleich noch einmal (Fehler ${ref})` };
  }

  const base = { ok: true as const, sessionId: session.id, messageId };
  const fallback = (reason: Fallback["reason"], cost = 0): AskResult => ({ ...base, reply: null, model: null, cost, routine: true, changed: [], fallback: { reason, hint: fallbackHint(reason, now) } });

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return fallback("kein_schluessel");

  let spent = 0;
  let cost = 0;
  const changed: string[] = [];
  try {
    const [sp, sources] = await Promise.all([llmSpent(now), loadSources(now)]);
    if (sp === null) return fallback("fehler"); // Kosten nicht lesbar → lieber nicht ausgeben
    spent = sp;
    const budget = budgetOf(sources.own.llm_budget_eur);
    if (!canCall(spent, budget, "haiku")) return fallback("budget");

    const history = (await loadMessages(session.id, 12)).map((m) => ({ role: m.role, body: m.body }));
    const msgs = toApiMessages(history, 10);
    if (!msgs.length) return fallback("fehler");
    const context = await buildContext(session, sources);
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const left = () => DEADLINE_MS - (Date.now() - t0);

    // 1) Haiku: Weiche und einfache Antworten
    const h = await client.messages.create(
      { model: MODELS.haiku, max_tokens: 700, system: haikuSystem(context), messages: msgs },
      { timeout: Math.max(5_000, Math.min(20_000, left())) },
    );
    cost += await recordUsage("haiku", h.usage, session.id);
    const route = parseRoute(textOf(h.content));
    const finish = async (text: string, model: ModelKey, routine: boolean): Promise<AskResult> => {
      const reply = await insertReply(session.id, cleanReply(text), model, cost);
      if (!routine) await markDone(messageId);
      revalidatePath("/dashboard", "layout");
      return { ...base, reply, model, cost, routine, changed, fallback: null };
    };
    if (route.kind === "answer") return await finish(route.text, "haiku", false);
    if (route.kind === "routine") return await finish(routineReply(now), "haiku", true);

    // 2) Opus mit sicheren Werkzeugen
    return await runOpus(client, context, msgs, sources, session.id, left, () => spent + cost, budget, async (u) => { cost += await recordUsage("opus", u, session.id); }, changed, finish, fallback, () => cost);
  } catch (e) {
    console.error("jarvis-ask:", errInfo(e)); // nie Schlüssel oder Inhalte loggen
    return fallback("fehler", cost);
  }
}

async function runOpus(
  client: Anthropic, context: string, msgs: { role: "user" | "assistant"; content: string }[], sources: Sources, sessionId: string,
  left: () => number, spentNow: () => number, budget: number, addUsage: (u: Anthropic.Usage) => Promise<void>, changed: string[],
  finish: (text: string, model: ModelKey, routine: boolean) => Promise<AskResult>, fallback: (r: Fallback["reason"], cost?: number) => AskResult, costNow: () => number,
): Promise<AskResult> {
  const messages: Anthropic.MessageParam[] = msgs.map((m) => ({ role: m.role, content: m.content }));
  const tools = TOOL_DEFS as unknown as Anthropic.Tool[];
  for (let round = 0; round < MAX_OPUS_ROUNDS; round++) {
    if (!canCall(spentNow(), budget, "opus")) return fallback("budget", costNow());
    if (left() < 8_000) return fallback("zeit", costNow());
    const r = await client.messages.create(
      { model: MODELS.opus, max_tokens: 4096, system: opusSystem(context), tools, messages, output_config: { effort: "medium" } },
      { timeout: Math.max(5_000, left() - 2_000) },
    );
    await addUsage(r.usage);
    if (r.stop_reason === "refusal") return fallback("fehler", costNow());
    const uses = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !uses.length) {
      const text = textOf(r.content);
      return text ? finish(text, "opus", false) : fallback("fehler", costNow());
    }
    messages.push({ role: "assistant", content: r.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    let routine: string | null = null;
    for (const u of uses) {
      const c = checkTool(u.name, u.input);
      if (!c.ok) { results.push({ type: "tool_result", tool_use_id: u.id, content: `abgelehnt: ${c.error}`, is_error: true }); continue; }
      if (c.input.name === ROUTINE_TOOL) { routine = (c.input as { grund: string }).grund; results.push({ type: "tool_result", tool_use_id: u.id, content: "übergeben" }); continue; }
      const out = await runTool(c.input, sources);
      if (out.changed) changed.push(out.changed);
      results.push({ type: "tool_result", tool_use_id: u.id, content: out.text, ...(out.error ? { is_error: true } : {}) });
    }
    if (routine) {
      const done = changed.length ? `Erledigt: ${changed.join(", ")}. ` : "";
      return finish(`${done}${routineReply(new Date())}`, "opus", true);
    }
    messages.push({ role: "user", content: results });
  }
  // Runden aufgebraucht: ehrlich sagen, Routine übernimmt
  return changed.length ? finish(`Erledigt: ${changed.join(", ")}. Rest: ${routineReply(new Date())}`, "opus", true) : fallback("zeit", costNow());
}
