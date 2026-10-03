"use server";

/**
 * Sofort-Alarm (Web-Push) aus dem Antworten-Cockpit: Abo des Inhaber-Handys speichern und Test-Alarm senden.
 * Jede Aktion prüft zuerst die Sitzung (requireOwner) und die Eingabe serverseitig neu. Nichts wird gelöscht.
 * Die Endpunkt-Adresse eines Abos ist geheim (wer sie kennt, kann dem Gerät schreiben) und landet nie im Log.
 */
import { db } from "@/lib/supabase";
import { pushAlarm, saveSubscription } from "@/lib/push";
import { validSubscription } from "@/lib/push-core";
import { requireOwner } from "../actions";

export type PushActionResult = { ok: boolean; msg: string };

export async function savePushSubscription(sub: unknown, label: unknown): Promise<PushActionResult> {
  await requireOwner();
  const s = validSubscription(sub);
  if (!s) return { ok: false, msg: "Abo ungültig" };
  const name = String(label ?? "").replace(/[^\p{L}\p{N} .:/-]/gu, "").trim().slice(0, 60) || "Gerät";
  try {
    await saveSubscription(s, name);
    await db().from("owner_log").insert({ action: "push_subscribe", target: new URL(s.endpoint).hostname,
      old_value: null, new_value: { label: name }, created_by: "Inhaber Dashboard" }).then(() => null, () => null);
    return { ok: true, msg: "Alarm an" };
  } catch (e) {
    return { ok: false, msg: `Nicht gespeichert: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}

export async function sendTestPush(): Promise<PushActionResult> {
  await requireOwner();
  try {
    const r = await pushAlarm("Test-Alarm", "So kommt eine neue Antwort aufs Handy.", "/dashboard/antworten", "test");
    if (r.skipped === "keys") return { ok: false, msg: "Schlüssel fehlen (vercel.yml env-add-vapid)" };
    if (r.skipped === "rate") return { ok: false, msg: "Zu viele Alarme in der letzten Stunde" };
    if (r.skipped === "empty") return { ok: false, msg: "Kein Gerät angemeldet" };
    return r.sent ? { ok: true, msg: `Gesendet an ${r.sent} Gerät${r.sent === 1 ? "" : "e"}` }
      : { ok: false, msg: "Kein Gerät erreicht" };
  } catch (e) {
    return { ok: false, msg: `Fehler: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}
