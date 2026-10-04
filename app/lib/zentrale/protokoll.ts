/**
 * Abteilung „Protokoll“ der Kommandozentrale (Inhaber 04.10.2026): eine Zeitleiste aller Entscheidungen und
 * Änderungen im Unternehmen – Gehirn (decisions, Lernnotizen, Wissen), Agenten (fertige Aufträge), Werke
 * (geänderte Belegung/Bremse aus werk_plan_log) und Inhaber (owner_log). Titel ≤ 60, Grund 1 Satz ≤ 160,
 * Details auf Klick. Gemergte PRs stehen nicht in der Datenbank und fehlen deshalb.
 * Reine Funktionen (testbar); Daten: ./protokoll-data.ts, Seite: app/dashboard/protokoll.
 */
import { kuerzen, kurzGrundText, kurzTitelText, TITEL_MAX } from "../kurz-schreiben.ts";
import type { Trend, ZKpi } from "./recht.ts";

export type { ZKpi, Trend };

export type Bereich = "gehirn" | "agenten" | "werke" | "inhaber";
export const BEREICHE: Bereich[] = ["gehirn", "agenten", "werke", "inhaber"];
export const BEREICH_TEXT: Record<Bereich, string> = { gehirn: "Gehirn", agenten: "Agenten", werke: "Werke", inhaber: "Inhaber" };

export type Eintrag = { id: string; at: string; bereich: Bereich; titel: string; grund: string; details: string | null; status: string | null };

const GRUND_MAX = 160;
const glatt = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();
const titel = (t: unknown, fallback: string) => kuerzen(kurzTitelText(t) || fallback, TITEL_MAX);
const grund = (t: unknown) => kuerzen(kurzGrundText(t), GRUND_MAX);
/** Details nur, wenn sie mehr sagen als Titel + Grund. */
const mehr = (full: string, ...shown: string[]) => (full && !shown.includes(full) ? full : null);

// ------------------------------------------------------------------------------------------------- Quellen
export type DecisionRow = { id: number | string; created_at: string; type?: string | null; status?: string | null; subject?: string | null; reasoning?: string | null;
  action?: string | null; kurz_titel?: string | null; kurz_grund?: string | null };

export function ausDecisions(rows: DecisionRow[]): Eintrag[] {
  return rows.map((r) => {
    const t = glatt(r.kurz_titel) ? kuerzen(r.kurz_titel, TITEL_MAX) : titel(r.subject, "Entscheidung");
    const g = glatt(r.kurz_grund) ? kuerzen(r.kurz_grund, GRUND_MAX) : grund(r.reasoning);
    const full = [glatt(r.subject), glatt(r.reasoning), r.action ? `Aktion: ${glatt(r.action)}` : ""].filter(Boolean).join("\n\n");
    const extra = !!glatt(r.action) || (!!glatt(r.subject) && glatt(r.subject) !== t) || (!!glatt(r.reasoning) && glatt(r.reasoning) !== g);
    return { id: `d${r.id}`, at: r.created_at, bereich: "gehirn", titel: t, grund: g, details: extra ? full : null, status: r.status ?? null };
  });
}

export type TaskRow = { id: string; created_at: string; finished_at: string | null; agent: number; kind: string; market: string | null; brief: string;
  status: string; result: string | null; step?: string | null };

/** Nur fertige Aufträge (Ergebnis zählt), Zeit = fertig. */
export function ausTasks(rows: TaskRow[]): Eintrag[] {
  return rows.filter((r) => r.status === "fertig").map((r) => {
    const t = titel(`A${r.agent}: ${glatt(r.brief)}`, `Agent ${r.agent}`);
    const g = grund(r.result) || "Auftrag erledigt.";
    const full = [`Auftrag: ${glatt(r.brief)}`, r.result ? `Ergebnis: ${glatt(r.result)}` : "", r.market ? `Markt: ${r.market}` : ""].filter(Boolean).join("\n\n");
    return { id: `t${r.id}`, at: r.finished_at ?? r.created_at, bereich: "agenten", titel: t, grund: g, details: full, status: "fertig" };
  });
}

export type PlanRow = { id: number | string; werk: string; at: string; mode: string | null; bremse: string | null; plan: Record<string, number> | null; reasons: Record<string, string> | null };
const WERK_TEXT: Record<string, string> = { "lead-werk": "Lead-Werk", "kunden-werk": "Kunden-Werk" };

/** Plan-Änderungen: nur Läufe, deren Belegung, Modus oder Bremse sich gegenüber dem vorigen Lauf desselben Werks ändert. */
export function ausPlanLog(rows: PlanRow[]): Eintrag[] {
  const out: Eintrag[] = [];
  const last = new Map<string, PlanRow>();
  for (const r of [...rows].sort((a, b) => a.at.localeCompare(b.at))) {
    const prev = last.get(r.werk);
    last.set(r.werk, r);
    if (!prev) continue;
    const a = prev.plan ?? {}, b = r.plan ?? {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? 0) !== (b[k] ?? 0)).sort();
    const bremse = (prev.bremse ?? "aus") !== (r.bremse ?? "aus");
    const modus = (prev.mode ?? "") !== (r.mode ?? "");
    if (!keys.length && !bremse && !modus) continue;
    const name = WERK_TEXT[r.werk] ?? r.werk;
    const t = bremse ? `${name}: Speicher-Bremse ${r.bremse ?? "aus"}` : modus ? `${name}: Modus ${r.mode ?? "?"}` : `${name}: Plätze neu verteilt`;
    const g = keys.length ? keys.map((k) => `${k} ${a[k] ?? 0}→${b[k] ?? 0}`).join(", ") : `vorher ${bremse ? prev.bremse ?? "aus" : prev.mode ?? "?"}`;
    const why = keys.map((k) => r.reasons?.[k] ? `${k}: ${glatt(r.reasons[k])}` : "").filter(Boolean).join("\n");
    out.push({ id: `p${r.id}`, at: r.at, bereich: "werke", titel: kuerzen(t, TITEL_MAX), grund: kuerzen(g, GRUND_MAX), details: why || null, status: r.mode ?? null });
  }
  return out;
}

export type OwnerRow = { id: number | string; action: string; target: string | null; new_value: unknown; created_at: string; created_by?: string | null };
const AKTION: Record<string, string> = {
  setting: "Einstellung geändert", agent: "Agent", flow: "Flow", jarvis: "JARVIS", website: "Website", tip: "Hinweis", workflow: "Werk",
  baukasten: "Baukasten", custom_agent: "Eigener Agent",
};
const TUN: Record<string, string> = { create: "angelegt", chat: "Chat", cancel: "abgebrochen", message: "Nachricht", session: "neue Sitzung", dismiss: "ausgeblendet",
  start: "gestartet", "agent-neu": "Agent angelegt", fix: "Fund beheben", ignorieren: "Fund ausgeblendet" };

const EINSTELLUNG: Record<string, string> = {
  send_paused: "Versand pausiert", send_countries_off: "Länder ohne Versand", send_country_limits: "Tageslimits je Land", followup_enabled: "Nachfassmails",
  followup_days: "Nachfass nach Tagen", sample_targets: "Proben-Vorrat Soll", sample_max_age_hours: "Proben-Höchstalter", buyer_countries_off: "Käufer-Länder aus",
  werke_paused: "Werke an/aus", slot_plan: "Plätze je Linie", slot_autopilot: "Autopilot Plätze", dismissed_tips: "Hinweise ausgeblendet",
  llm_budget_eur: "Budget Sofort-Antworten", website_autofix: "Website Auto-Fix", website_ignored: "Website-Funde ausgeblendet",
};
const wert = (v: string) => (v === "true" ? "an" : v === "false" ? "aus" : v);

/** Handlungen im Dashboard (owner_log): Titel aus der Aktion, Grund = neuer Wert kurz. Chat-Texte nur in den Details. */
export function ausOwnerLog(rows: OwnerRow[]): Eintrag[] {
  return rows.map((r) => {
    const [bereich, was = ""] = r.action.split(":");
    const t = bereich === "setting" ? `Einstellung: ${EINSTELLUNG[was] ?? was}` : `${AKTION[bereich] ?? bereich}: ${TUN[was] ?? was}`;
    const v = r.new_value === null || r.new_value === undefined ? "" : typeof r.new_value === "string" ? r.new_value : JSON.stringify(r.new_value);
    const chat = /chat|message/.test(was);
    const g = chat ? (r.created_by ? `von ${r.created_by}` : "") : wert(glatt(v));
    return { id: `o${r.id}`, at: r.created_at, bereich: "inhaber", titel: kuerzen(t, TITEL_MAX), grund: kuerzen(g || (r.target ?? ""), GRUND_MAX),
      details: v.length > GRUND_MAX || chat ? kuerzen(glatt(v), 2000) || null : null, status: null };
  });
}

export type NotizRow = { id: number | string; created_at: string; kind?: string | null; text: string | null };
export function ausLernen(rows: NotizRow[]): Eintrag[] {
  return rows.map((r) => {
    const t = titel(r.text, "Lernnotiz"), g = grund(r.text);
    return { id: `l${r.id}`, at: r.created_at, bereich: "gehirn", titel: t, grund: g, details: mehr(glatt(r.text), t, g), status: r.kind ?? null };
  });
}

export type WissenRow = { id: string; titel: string; quelle: string | null; created_at: string; updated_at: string };
export function ausWissen(rows: WissenRow[]): Eintrag[] {
  return rows.map((r) => {
    const neu = Math.abs(Date.parse(r.updated_at) - Date.parse(r.created_at)) < 60_000;
    return { id: `w${r.id}`, at: r.updated_at, bereich: "gehirn", titel: kuerzen(`Wissen ${neu ? "neu" : "aktualisiert"}: ${glatt(r.titel)}`, TITEL_MAX),
      grund: r.quelle ? kuerzen(`Quelle: ${glatt(r.quelle)}`, GRUND_MAX) : "", details: null, status: null };
  });
}

// ------------------------------------------------------------------------------------------------- Zeitleiste
export function zeitleiste(alle: Eintrag[], o: { bereich: Bereich | null; tage: number; now: Date; max?: number }): Eintrag[] {
  const ab = o.now.getTime() - o.tage * 86_400_000;
  return alle.filter((e) => Date.parse(e.at) >= ab && (!o.bereich || e.bereich === o.bereich))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id))).slice(0, o.max ?? 300);
}

export function zaehlen(alle: Eintrag[], tage: number, now: Date): Record<Bereich, number> {
  const ab = now.getTime() - tage * 86_400_000;
  const out = Object.fromEntries(BEREICHE.map((b) => [b, 0])) as Record<Bereich, number>;
  for (const e of alle) if (Date.parse(e.at) >= ab) out[e.bereich]++;
  return out;
}

/** Nach Tag (deutsche Zeit) gruppieren, neueste zuerst; Schlüssel YYYY-MM-DD. */
export function nachTag(list: Eintrag[]): [string, Eintrag[]][] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
  const m = new Map<string, Eintrag[]>();
  for (const e of list) {
    const k = fmt.format(new Date(e.at));
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(e);
  }
  return [...m.entries()];
}

// ------------------------------------------------------------------------------------------------- Kennzahl
/** Kennzahl „Protokoll“: Einträge der letzten 24 h, Trend gegen die 24 h davor; grau, wenn nichts passiert ist. */
export function kpiAus(alle: Eintrag[], now: Date): ZKpi {
  const t = now.getTime(), d1 = t - 86_400_000, d2 = t - 2 * 86_400_000;
  let jetzt = 0, vorher = 0;
  for (const e of alle) {
    const x = Date.parse(e.at);
    if (x > t) continue;
    if (x >= d1) jetzt++;
    else if (x >= d2) vorher++;
  }
  const trend: Trend = !jetzt && !vorher ? null : jetzt > vorher ? "hoch" : jetzt < vorher ? "runter" : "gleich";
  return { titel: "Protokoll", wert: `${jetzt} in 24 h`, ampel: jetzt ? "green" : "grey", trend };
}

/** Kennzahl für die JARVIS-Abteilungs-Übersicht (lädt selbst; nur auf dem Server aufrufen). */
export async function kpi(): Promise<ZKpi> {
  try {
    const { loadProtokoll } = await import("./protokoll-data");
    return kpiAus((await loadProtokoll(2)).eintraege, new Date());
  } catch {
    return { titel: "Protokoll", wert: "–", ampel: "grey", trend: null };
  }
}
