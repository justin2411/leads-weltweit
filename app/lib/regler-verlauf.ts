/**
 * Verlauf im Regler (Inhaber 03.10.2026): letzte Änderungen aus signalwerk.owner_log („setting:<key>“) als kurze Texte
 * und „Rückgängig“ – der alte Wert wird über dieselbe Prüfung wie „Übernehmen“ wieder gespeichert. Reine Funktionen.
 * Gemeinsame Schlüssel nur teilweise zurück: werke_paused nur die Werke dieser Änderung, sample_targets nur die Seiten
 * dieser Änderung – spätere Änderungen an anderen Werken/Seiten bleiben.
 */
import { DEFAULTS, merge, type SettingKey } from "./owner-settings.ts";
import { CARDS, diff, draftFrom, type ReglerCtx } from "./regler.ts";

/** Schlüssel, die der Regler stellt (und zurücknehmen darf). Versand-Limits/-Länder bleiben in JARVIS. */
export const REGLER_KEYS: SettingKey[] = [...new Set(CARDS.flatMap((c) => c.keys))];
export const isReglerKey = (k: unknown): k is SettingKey => typeof k === "string" && (REGLER_KEYS as string[]).includes(k);

export type LogRow = { id: number; action: string; target: string | null; old_value: unknown; new_value: unknown; created_at: string; created_by: string | null };
export type Entry = { id: number; at: string; key: SettingKey; texts: string[]; undo: boolean; undone: boolean };

const LABEL: Record<SettingKey, string> = {
  send_paused: "Versand", send_countries_off: "Versand-Länder", send_country_limits: "Mails pro Tag", followup_enabled: "Nachfassmails",
  followup_days: "Nachfass-Tage", sample_targets: "Proben-Soll", sample_max_age_hours: "Proben-Verfall", buyer_countries_off: "Käufer-Länder",
  werke_paused: "Werke an/aus", slot_plan: "Plätze", slot_autopilot: "Autopilot", dismissed_tips: "Ausgeblendete Hinweise",
};

/** Eintrag für eine Zeile aus owner_log (null = keine Einstellung). */
export function entryOf(r: LogRow, ctx: ReglerCtx): Entry | null {
  const key = r.action.replace(/^setting:/, "") as SettingKey;
  if (!r.action.startsWith("setting:") || !(key in DEFAULTS)) return null;
  let texts: string[] = [];
  if (isReglerKey(key)) {
    try {
      texts = diff(merge([{ key, value: r.old_value }]), draftFrom(merge([{ key, value: r.new_value }]), ctx), ctx).map((c) => c.text);
    } catch {
      texts = [];
    }
  }
  const same = JSON.stringify(r.old_value ?? null) === JSON.stringify(r.new_value ?? null);
  return {
    id: r.id, at: r.created_at, key, texts: texts.length ? texts : [`${LABEL[key]} ${same ? "unverändert" : "geändert"}`],
    undo: isReglerKey(key) && !same, undone: /^rückgängig/.test(r.target ?? ""),
  };
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Wert, der eine Änderung (alt -> neu) auf dem aktuellen Stand `cur` zurücknimmt. null = Standard. */
export function undoValue(key: SettingKey, oldV: unknown, newV: unknown, cur: unknown, nowIso: string): unknown {
  if (!isReglerKey(key)) throw new Error("nicht im Regler");
  if (key === "werke_paused") {
    const o = rec(oldV), n = rec(newV), out = { ...rec(cur) };
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
      if (!!o[k] === !!n[k]) continue;
      if (o[k]) out[k] = nowIso;
      else delete out[k];
    }
    return out;
  }
  if (key === "sample_targets") {
    const o = rec(oldV), n = rec(newV), out = { ...rec(cur) };
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
      if (o[k] === n[k]) continue;
      if (o[k] === undefined || o[k] === null) delete out[k];
      else out[k] = o[k];
    }
    return out;
  }
  if (oldV === null || oldV === undefined) return key === "followup_days" || key === "sample_max_age_hours" ? null : DEFAULTS[key];
  return oldV;
}
