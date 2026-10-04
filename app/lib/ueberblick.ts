/**
 * JARVIS-Überblick (Inhaber 04.10.2026): „Heute wichtig“ (höchstens 3 Punkte), Ziel-vs-Ist je Land und die
 * Entscheidungs-Zeitleiste. Reine Funktionen ohne Datenbank – Daten kommen aus lib/ueberblick-data.ts, die Seite
 * zeigt nur an. Texte kurz: Titel ≤ 60 Zeichen (lib/kurz-schreiben.ts).
 */
import { kurzGrundText, kurzTitelText } from "./kurz-schreiben.ts";

export type Level = "rot" | "gelb";
export type Wichtig = { level: Level; title: string; href: string; tip?: string };
export type Tone = "green" | "gold" | "red" | "grey";

/** Grenzen der Ampel im Ziel-vs-Ist-Balken: ab 90 % des Solls grün, ab 60 % gelb (knapp), darunter rot. */
export const OK_AB = 0.9;
export const KNAPP_AB = 0.6;
/** Freigabe-Stichprobe: Fehlerquote > 2 % gelb, > 5 % rot (wie Tagescheck/Dashboard). */
export const STICH_GELB = 0.02;
export const STICH_ROT = 0.05;

export type WichtigInput = {
  /** Notbremse: Grund oder null */
  brake: string | null;
  /** letzter Zustellbarkeits-Check (deliverability_daily); null = keiner */
  deliver: { status: string; gruende: string[] } | null;
  /** offene Antworten im Cockpit (null = nicht lesbar) */
  openReplies: number | null;
  /** Freigabe-Stichprobe je Land (7 Tage) */
  stich: { country: string; candidates: number; green: number }[];
  /** Werke mit Fehler (Station rot), z. B. „Lead-Werk“ */
  bad: { id: string; label: string }[];
  /** Engpass der Kette */
  neck: { id: string; label: string } | null;
  /** Datenfluss-Alarm (judgeFlow): Stationen ohne Zuwachs */
  still?: Still[];
};

const st = (id: string) => `/dashboard/jarvis?s=${id}`;
const cut = (s: string) => kurzTitelText(s);

/** Die wichtigsten Punkte heute: rot vor gelb, je Art höchstens einer, insgesamt höchstens `max`. */
export function heuteWichtig(x: WichtigInput, max = 3): Wichtig[] {
  const out: Wichtig[] = [];
  if (x.brake) out.push({ level: "rot", title: "Notbremse: Versand steht", href: st("versand"), tip: x.brake });
  const d = x.deliver;
  if (d && (d.status === "rot" || d.status === "gelb")) {
    const g = d.gruende[0] ?? "";
    out.push({ level: d.status === "rot" ? "rot" : "gelb", title: cut(g ? `Zustellbarkeit: ${g}` : "Zustellbarkeit prüfen"), href: st("versand"), tip: d.gruende.join(" · ") });
  }
  const worst = x.stich.filter((r) => r.candidates > 0).map((r) => ({ c: r.country, err: Math.round((1 - r.green / r.candidates) * 10_000) / 10_000 })).sort((a, b) => b.err - a.err)[0];
  if (worst && worst.err > STICH_GELB) {
    out.push({ level: worst.err > STICH_ROT ? "rot" : "gelb", title: `Freigabe ${worst.c}: ${(worst.err * 100).toFixed(1).replace(".", ",")} % Fehler`, href: `${st("gate")}&t=check&f=rot` });
  }
  // Stillstand: nur die schlimmste Station (rot vor gelb, dann am längsten still)
  const halt = (x.still ?? []).filter((a) => a.stufe === "rot" || a.stufe === "gelb")
    .sort((a, b) => (a.stufe === b.stufe ? (b.still_h ?? 0) - (a.still_h ?? 0) : a.stufe === "rot" ? -1 : 1))[0];
  if (halt) out.push({ level: halt.stufe === "rot" ? "rot" : "gelb", title: cut(`${halt.name} steht seit ${dauer(halt.still_h ?? 0)} still`), href: st(halt.station) });
  for (const b of x.bad.slice(0, 1)) out.push({ level: "rot", title: cut(`${b.label}: Lauf gestört`), href: st(b.id) });
  if (x.openReplies) out.push({ level: "gelb", title: x.openReplies === 1 ? "1 Antwort offen" : `${x.openReplies} Antworten offen`, href: "/dashboard/antworten" });
  if (x.neck) out.push({ level: "gelb", title: cut(`Engpass: ${x.neck.label}`), href: st(x.neck.id) });
  // stabil sortieren: rot zuerst, sonst Reihenfolge oben (Notbremse, Zustellung, Freigabe, Werke, Antworten, Engpass)
  return out.map((w, i) => ({ w, i })).sort((a, b) => (a.w.level === b.w.level ? a.i - b.i : a.w.level === "rot" ? -1 : 1)).slice(0, max).map((a) => a.w);
}

/** Anteil des deutschen Kalendertags, der um `now` schon vorbei ist (0 … 1). */
export function dayShare(now: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((q) => [q.type, q.value]));
  return Math.min(1, Math.max(0, (Number(p.hour) * 60 + Number(p.minute)) / 1440));
}

export type Bar = { key: string; ist: number; ziel: number | null; soll: number | null; pct: number; tone: Tone };

/**
 * Ein Balken: Ist gegen das Tagesziel. Bewertet wird gegen das Soll bis jetzt (Ziel × Anteil des Tages), weil
 * Versand und Werke über den ganzen Tag laufen; der Balken selbst zeigt Ist / Tagesziel. Ohne Ziel: grau.
 */
export function bar(key: string, ist: number, ziel: number | null, share: number): Bar {
  const i = Math.max(0, Number(ist) || 0);
  if (ziel === null || !(ziel > 0)) return { key, ist: i, ziel: ziel === null ? null : 0, soll: null, pct: 0, tone: "grey" };
  const soll = Math.max(1, Math.round(ziel * Math.min(1, Math.max(0, share))));
  const r = i / soll;
  return { key, ist: i, ziel, soll, pct: Math.min(100, Math.round((i / ziel) * 100)), tone: r >= OK_AB ? "green" : r >= KNAPP_AB ? "gold" : "red" };
}

/** Lead-Tagesziel je Land: Durchschnitt der Vortage (bis 7) aus kpi_daily `leads_neu`; ohne Vortage null. */
export function leadZiel(rows: { day: string; country: string; value: number }[], country: string, today: string): number | null {
  const prev = rows.filter((r) => r.country === country && r.day < today).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 7);
  if (!prev.length) return null;
  return Math.round(prev.reduce((a, r) => a + Number(r.value || 0), 0) / prev.length);
}

export type DecisionLite = { id: number | string; created_at: string; type?: string | null; status?: string | null; subject?: string | null; reasoning?: string | null; kurz_titel?: string | null; kurz_grund?: string | null };
export type Eintrag = { id: string; at: string; zeit: string; titel: string; grund: string; status: string };

/** Uhrzeit in deutscher Zeit mit Zone (MESZ/MEZ), z. B. „04.10. 15:42 MESZ“. */
export function deZeit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  const p = Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" })
    .formatToParts(d).map((q) => [q.type, q.value]));
  const zone = p.timeZoneName === "MESZ" || /\+2/.test(p.timeZoneName ?? "") ? "MESZ" : "MEZ";
  return `${p.day}.${p.month}. ${p.hour}:${p.minute} ${zone}`;
}

// ------------------------------------------------------------------------------------------------- Stillstand
/**
 * Datenfluss-Alarm (PR #329, gleiche Regeln wie scripts/datenfluss.py judge/switched_off): je Station letzter Zuwachs
 * gegen das übliche Intervall aus 7 Tagen (RPC datenfluss_stand). > 3× Intervall gelb, > 6× und ≥ 6 h rot;
 * gewollt abgeschaltete Stationen und Stationen ohne Basis melden nie.
 */
export const STILL = { HOURS: 168, GELB: 3, ROT: 6, MIN_LIMIT_H: 2, ROT_MIN_H: 6 } as const;
export const STILL_STATIONS: Record<string, { name: string; station: string }> = {
  leads: { name: "Neue Leads", station: "lead" },
  kaeufer: { name: "Neue Käufer", station: "kwerk" },
  proben: { name: "Proben gebaut", station: "proben" },
  mails: { name: "Mails gesendet", station: "versand" },
  antworten: { name: "Antworten gelesen", station: "antworten" },
};
export type FlowRow = { station: string; last_at: string | null; active_hours: number | null; extra: number | string | null };
export type Still = { key: string; name: string; station: string; stufe: "ok" | "gelb" | "rot" | "aus" | "keine_basis"; still_h: number | null; intervall_h: number | null };
export type SwitchInput = { lead_suche: boolean; kunden_suche: boolean; versand_aktiv: boolean; werke_paused: Record<string, unknown> | null | undefined; send_paused: boolean };

/** Stationen, die gewollt stillstehen (wie datenfluss.switched_off). */
export function switchedOff(s: SwitchInput, rows: FlowRow[]): Set<string> {
  const by = Object.fromEntries(rows.map((r) => [r.station, r]));
  const p = s.werke_paused ?? {};
  const off = new Set<string>();
  if (!s.lead_suche || p["lead-werk"]) off.add("leads");
  if (!s.kunden_suche || p["kunden-werk"]) off.add("kaeufer");
  if (p["proben-vorrat"] || Number(by.proben?.extra ?? 0) > 0) off.add("proben");
  if (!s.versand_aktiv || s.send_paused) off.add("mails");
  if (off.has("mails") || !Number(by.mails?.active_hours ?? 0)) off.add("antworten");
  return off;
}

/** Stufe je Station (wie datenfluss.judge). */
export function judgeFlow(rows: FlowRow[], now: Date, off: Set<string>): Still[] {
  const out: Still[] = [];
  for (const r of rows) {
    const meta = STILL_STATIONS[r.station];
    if (!meta) continue;
    const active = Number(r.active_hours ?? 0) || 0;
    const last = r.last_at ? Date.parse(r.last_at) : NaN;
    const still = Number.isNaN(last) ? null : (now.getTime() - last) / 3_600_000;
    const base = { key: r.station, name: meta.name, station: meta.station, still_h: still === null ? null : Math.round(still * 10) / 10, intervall_h: null as number | null };
    if (off.has(r.station)) { out.push({ ...base, stufe: "aus" }); continue; }
    if (active <= 0 || still === null) { out.push({ ...base, stufe: "keine_basis" }); continue; }
    const interval = STILL.HOURS / active;
    const limit = Math.max(STILL.GELB * interval, STILL.MIN_LIMIT_H);
    const stufe = still <= limit ? "ok" : still >= Math.max(STILL.ROT * interval, 2 * STILL.MIN_LIMIT_H) && still >= STILL.ROT_MIN_H ? "rot" : "gelb";
    out.push({ ...base, intervall_h: Math.round(interval * 10) / 10, stufe });
  }
  return out;
}

/** Dauer kurz: „3 h“ ab 1,5 h, sonst Minuten (wie datenfluss._h). */
export function dauer(h: number): string {
  return h >= 1.5 ? `${Math.round(h)} h` : `${Math.round(h * 60)} min`;
}

/** Kachel für „JARVIS empfiehlt“ (Titel/Grund wie datenfluss.texts; die Farbe zeigt gelb/rot). */
export function stillTip(a: Still): { level: Level; title: string; text: string; href: string; task: { kind: "pruefen"; market: null; brief: string } } {
  const s = dauer(a.still_h ?? 0), every = dauer(a.intervall_h ?? 0);
  return {
    level: a.stufe === "rot" ? "rot" : "gelb",
    title: `${a.name} steht seit ${s} still`.slice(0, 60),
    text: `Kein Zuwachs seit ${s}, üblich etwa alle ${every}. Ursache prüfen: Läufe, Quelle, Schalter.`.slice(0, 160),
    href: st(a.station),
    task: { kind: "pruefen", market: null, brief: `Datenfluss „${a.name}“ steht seit ${s} still (üblich alle ${every}). Ursache finden (Läufe, Quelle, Schalter) und beheben, mit Test. Nichts senden, keine Prüfregeln ändern.` },
  };
}

/** Zeitleiste: neueste zuerst, höchstens n, Titel ≤ 60 und Grund ≤ 160 Zeichen (kurz_* bevorzugt). */
export function zeitleiste(rows: DecisionLite[], n = 20): Eintrag[] {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n).map((r) => ({
    id: String(r.id), at: r.created_at, zeit: deZeit(r.created_at),
    titel: kurzTitelText(r.kurz_titel || r.subject || "Entscheidung") || "Entscheidung",
    grund: kurzGrundText(r.kurz_grund || r.reasoning || ""),
    status: String(r.status ?? ""),
  }));
}
