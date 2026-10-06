import "server-only";
import { db } from "@/lib/supabase";
import { InputError, type OwnerSettings } from "@/lib/owner-settings";
import { START_WORKFLOWS, fmtBerlin, nextPickup, type StartKey } from "@/lib/start-queue";
import { ACTIONS_DIRECT_DISPATCH } from "@/lib/drossel";

/**
 * Werk-Start (Direktstart) für Regler und JARVIS-Chat – ein gemeinsamer Pfad: mit GH_DISPATCH_TOKEN sofort
 * (workflow_dispatch auf main), sonst ein Wunsch in signalwerk.start_requests, den der Wachhund spätestens beim nächsten
 * Lauf startet. Nie doppelt, nie bei Pause, nur die Liste START_WORKFLOWS (der Versand ist nie dabei).
 * Aufrufer prüfen vorher die Inhaber-Sitzung (requireOwner).
 */
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

async function log(action: string, target: string | null, newValue: unknown, by: string) {
  const { error } = await db().from("owner_log").insert({ action, target, old_value: null, new_value: newValue ?? null, created_by: by });
  if (error) throw new Error(error.message);
}

/** Startet ein Werk (bzw. legt den Wunsch für den Wachhund ab) und gibt einen kurzen Satz zurück. `via` steht im Vermerk. */
export async function startWerk(key: StartKey, s: OwnerSettings, by: string, via = "Regler"): Promise<string> {
  const spec = START_WORKFLOWS[key];
  if (spec.pause && s.werke_paused?.[spec.pause]) throw new InputError(`${spec.label} ist pausiert – erst einschalten`);
  const sb = db();
  const now = new Date();
  const { data: open, error: e0 } = await sb.from("start_requests").select("id").eq("workflow", key).eq("status", "offen").limit(5);
  if (e0) throw new Error(e0.message);
  const inputs: Record<string, string> = { ...spec.inputs };
  // Actions-Drossel (06.10.2026): kein Sofortstart – immer als Wunsch für den Wachhund
  const token = ACTIONS_DIRECT_DISPATCH ? process.env.GH_DISPATCH_TOKEN?.trim() : undefined;
  let note: string | null = null;
  if (token) {
    const r = await ghDispatch(token, spec.file, inputs);
    if (r.ok) {
      const at = now.toISOString();
      if (open?.length) await sb.from("start_requests").update({ status: "gestartet", started_at: at, note: `direkt (${via})` }).in("id", open.map((o) => o.id)).eq("status", "offen");
      else {
        const { error } = await sb.from("start_requests").insert({ workflow: key, inputs, status: "gestartet", started_at: at, note: `direkt (${via})`, created_by: by });
        if (error) throw new Error(error.message);
      }
      await log("workflow:start", spec.file, { ...inputs, via: "direkt" }, by);
      return `${spec.label} gestartet`;
    }
    note = r.status ? `GitHub ${r.status} – Wachhund übernimmt` : "GitHub nicht erreichbar – Wachhund übernimmt";
  }
  const when = fmtBerlin(nextPickup(now));
  if (open?.length) return `${spec.label}: Start schon angefordert – spätestens ${when}`;
  const { error } = await sb.from("start_requests").insert({ workflow: key, inputs, status: "offen", note, created_by: by });
  if (error) throw new Error(error.message);
  await log("workflow:request_start", spec.file, { ...inputs, via: "wachhund", note }, by);
  return `${spec.label}: startet spätestens ${when}`;
}
