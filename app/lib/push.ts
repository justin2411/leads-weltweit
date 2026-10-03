import "server-only";
import webpush from "web-push";
import { db } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";
import { buildPayload, isGoneStatus, MAX_FAILURES, RateLimiter, type PushKind, type PushSubscriptionInput } from "@/lib/push-core";

/**
 * Sofort-Alarm aufs Handy des Inhabers (Web-Push, kostenlos; Nachtschicht 03./04.10.2026). Empfänger stehen in
 * signalwerk.push_subscriptions (gespeichert über „Alarm aufs Handy“ im Antworten-Cockpit).
 *
 * Schlüssel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…) aus Vercel (`vercel.yml env-add-vapid`).
 * Fehlen sie, passiert nichts außer einer Log-Zeile. Es wird nie ein Empfänger gelöscht: „gibt es nicht mehr“
 * (404/410/403) zählt failures hoch, ab 3 wird der Empfänger nicht mehr benutzt; ein neues Abo setzt ihn zurück.
 */
export type PushResult = { sent: number; failed: number; skipped?: "keys" | "empty" | "rate" | "error" };

/** Je Server-Instanz höchstens 30 Alarme pro Stunde (API, Website-Auslöser und Test zusammen). */
const limiter = new RateLimiter();

function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:info@nextgen-profit.de";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export function vapidPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

/** An alle aktiven Empfänger senden. Wirft nicht bei einzelnen Empfängern; Datenbankfehler beim Lesen schon. */
export async function sendToAll(title: string, body: string, url: string, kind: PushKind = "other"): Promise<PushResult> {
  const keys = vapid();
  if (!keys) {
    console.log("push: VAPID-Schlüssel fehlen – kein Alarm gesendet");
    return { sent: 0, failed: 0, skipped: "keys" };
  }
  const payload = buildPayload({ title, body, url, kind }, siteUrl());
  if (!payload) return { sent: 0, failed: 0, skipped: "empty" };
  const { data, error } = await db().from("push_subscriptions").select("id, endpoint, p256dh, auth, failures")
    .lt("failures", MAX_FAILURES).limit(20);
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  const subs = (data ?? []) as { id: string; endpoint: string; p256dh: string | null; auth: string | null; failures: number }[];
  if (!subs.length) return { sent: 0, failed: 0, skipped: "empty" };

  const json = JSON.stringify(payload);
  const opts = { vapidDetails: keys, TTL: 6 * 3600, urgency: "high" as const, timeout: 10_000 };
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    if (!s.p256dh || !s.auth) return;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json, opts);
      sent++;
      await db().from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), failures: 0 }).eq("id", s.id);
    } catch (e) {
      failed++;
      const status = (e as { statusCode?: number }).statusCode;
      // Endpunkt-Adresse nie ins Log (sie ist der Schlüssel zum Gerät)
      console.log(`push: Empfänger ${s.id.slice(0, 8)} Fehler ${status ?? (e as Error).message?.slice(0, 80)}`);
      if (isGoneStatus(status)) {
        await db().from("push_subscriptions").update({ failures: (s.failures ?? 0) + 1 }).eq("id", s.id);
      }
    }
  }));
  return { sent, failed };
}

/** Mit Ratenbegrenzung (30/h). Für die API und die Auslöser in der App. */
export async function pushAlarm(title: string, body: string, url: string, kind: PushKind = "other"): Promise<PushResult> {
  if (!limiter.take()) {
    console.log("push: mehr als 30 Alarme in der letzten Stunde – übersprungen");
    return { sent: 0, failed: 0, skipped: "rate" };
  }
  return sendToAll(title, body, url, kind);
}

/** Feuern und vergessen: wirft nie (für Probe-Anfrage, Checkout). Aufruf in after(), damit die Antwort nicht wartet. */
export async function pushAlarmSafe(title: string, body: string, url: string, kind: PushKind = "other"): Promise<void> {
  try {
    await pushAlarm(title, body, url, kind);
  } catch (e) {
    console.log(`push: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}

/** Abo speichern bzw. erneuern (setzt failures zurück). Nur aus der Inhaber-Aktion aufrufen. */
export async function saveSubscription(sub: PushSubscriptionInput, label: string): Promise<void> {
  const { error } = await db().from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, label: label.slice(0, 80), failures: 0 },
    { onConflict: "endpoint" });
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
}
