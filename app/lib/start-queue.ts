/**
 * Direktstart (Inhaber 03.10.2026: „Werke direkt starten statt erst beim nächsten Zeitplan“). Reine Funktionen:
 * erlaubte Abläufe, nächste Abholung durch den Wachhund, Anzeige des Startzustands. Mit GH_DISPATCH_TOKEN startet
 * das Dashboard sofort; ohne Token legt es einen Wunsch in signalwerk.start_requests ab, den der Wachhund
 * (scripts/wachhund.py, START_WF – gleiche Liste) spätestens beim nächsten Lauf startet. Der Versand ist NIE dabei.
 */
export const START_WORKFLOWS = {
  "lead-werk": { file: "lead-werk.yml", label: "Lead-Werk", inputs: {} as Record<string, string>, pause: "lead-werk" },
  "kunden-werk": { file: "kunden-werk.yml", label: "Kunden-Werk", inputs: {} as Record<string, string>, pause: "kunden-werk" },
  "proben-vorrat": { file: "proben-vorrat.yml", label: "Proben-Vorrat", inputs: { befehl: "run", probelauf: "false" } as Record<string, string>, pause: "proben-vorrat" },
  "freigabe-stichprobe": { file: "freigabe-stichprobe.yml", label: "Freigabe-Stichprobe", inputs: {} as Record<string, string>, pause: null },
} as const;
export type StartKey = keyof typeof START_WORKFLOWS;
export const isStartKey = (x: unknown): x is StartKey => typeof x === "string" && Object.hasOwn(START_WORKFLOWS, x);

/** Minuten (UTC), zu denen der Wachhund läuft (.github/workflows/wachhund.yml: "11,41" und "26,56"). */
export const WACHHUND_MINUTES = [11, 26, 41, 56];
/** Ältere offene Wünsche verwirft der Wachhund (scripts/wachhund.py START_MAX_AGE_MIN). */
export const START_MAX_AGE_MIN = 120;

/** Nächster Wachhund-Lauf nach `now` (volle Minute, UTC-Minuten sind in jeder Zeitzone gleich). */
export function nextPickup(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCSeconds(0, 0);
  for (let i = 1; i <= 60; i++) {
    const c = new Date(d.getTime() + i * 60_000);
    if (WACHHUND_MINUTES.includes(c.getUTCMinutes())) return c;
  }
  return new Date(d.getTime() + 15 * 60_000); // unerreichbar
}

/** „21:41“ in deutscher Zeit (Europe/Berlin, MEZ/MESZ). */
export function fmtBerlin(d: Date | string | null | undefined): string {
  if (!d) return "–";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "–";
  return x.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
}

export type StartRequest = { id: string; created_at: string; workflow: string; status: "offen" | "gestartet" | "fehler" | "verworfen"; started_at: string | null; note: string | null };
export type StartState = { tone: "wait" | "ok" | "bad"; text: string } | null;

/** Anzeige für einen Ablauf: neuester Wunsch der letzten 3 h (offen → „spätestens HH:MM“, gestartet, Fehler). */
export function startState(rows: StartRequest[], wf: StartKey, now: Date): StartState {
  const t = now.getTime();
  const r = rows.filter((x) => x.workflow === wf && t - Date.parse(x.created_at) < 3 * 3_600_000)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (!r) return null;
  if (r.status === "offen") {
    const old = t - Date.parse(r.created_at) > START_MAX_AGE_MIN * 60_000;
    return old ? { tone: "bad", text: "Start angefordert – Wachhund hat ihn nicht aufgenommen" } : { tone: "wait", text: `Start angefordert – spätestens ${fmtBerlin(nextPickup(now))}` };
  }
  if (r.status === "gestartet") return { tone: "ok", text: `gestartet ${fmtBerlin(r.started_at ?? r.created_at)}` };
  if (r.status === "fehler") return { tone: "bad", text: `Start fehlgeschlagen${r.note ? `: ${r.note.slice(0, 80)}` : ""}` };
  return { tone: "bad", text: `nicht gestartet${r.note ? `: ${r.note.slice(0, 80)}` : ""}` };
}
