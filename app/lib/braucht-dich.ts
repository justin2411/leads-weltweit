/**
 * „Braucht dich“ auf JARVIS (Inhaber 04.10.2026): alles, was nur der Inhaber erledigen kann – je Punkt Titel
 * (≤ 60 Zeichen), ein Satz Grund (≤ 160 Zeichen), Ziel-Link und Details zum Aufklappen. Reines Modul (testbar).
 * Quellen: decisions mit needs_owner = true und status 'proposed' (setzen JARVIS/Gehirn/Agenten) plus feste
 * Prüfungen, die von selbst verschwinden, sobald erledigt (Secret, Token, Rechtstexte, Signatur, Platz s2-neu).
 */
import { kuerzen } from "./kurz-schreiben.ts";

export const BD_TITEL_MAX = 60;
export const BD_GRUND_MAX = 160;

export type BdKey = "seed" | "dispatch" | "legal" | "signatur" | "s2neu" | `d${number}`;
export type BdPunkt = {
  key: BdKey; title: string; reason: string; href: string; cta: string; detail: string;
  /** Ampel-Ton (lib/ampel.ts): rot = blockiert, gold = wichtig, grey = optional */
  tone: "red" | "gold" | "grey";
  /** Aktion im Dashboard statt nur Link: Entscheidung erledigt / Signatur entscheiden */
  act?: "erledigt" | "signatur";
  decisionId?: number;
};

export type BdDecision = { id: number | string; subject: string; reasoning?: string | null; action?: string | null; kurz_titel?: string | null; kurz_grund?: string | null };

export type BdInput = {
  /** offene Inhaber-Entscheidungen (needs_owner, proposed); null = nicht lesbar */
  decisions: BdDecision[] | null;
  /** Zeilen in seed_checks der letzten 8 Tage; null = nicht lesbar (dann kein Punkt) */
  seedRows: number | null;
  /** GH_DISPATCH_TOKEN in Vercel gesetzt */
  dispatch: boolean;
  /** Rechtstexte: Anzahl Platzhalter/zu kurz (content/legal.ts) und settings.legal_ready (null = unbekannt) */
  legalOpen: number; legalReady: boolean | null;
  /** Dateien, deren Signatur noch „Exclusive trigger leads …“ enthält (lib/ops-config.json) */
  signaturFiles: string[];
  /** Inhaber hat zur Signatur schon entschieden (decisions.metrics.braucht_dich = 'signatur') */
  signaturDecided: boolean;
  /** owner_settings.slot_plan (nur s2-neu wird geprüft); null = nicht lesbar */
  slotPlan: Record<string, number> | null;
};

export const REPO = "https://github.com/justin2411/leads-weltweit";
const P = (x: Omit<BdPunkt, "title" | "reason"> & { title: string; reason: string }): BdPunkt =>
  ({ ...x, title: kuerzen(x.title, BD_TITEL_MAX), reason: kuerzen(x.reason, BD_GRUND_MAX) });

/** Alle offenen Punkte: rot zuerst, dann gold, dann grau; Entscheidungen vor festen Prüfungen gleicher Farbe. */
export function brauchtDich(i: BdInput): BdPunkt[] {
  const out: BdPunkt[] = [];
  for (const d of i.decisions ?? []) {
    const id = Number(d.id);
    if (!Number.isSafeInteger(id)) continue;
    out.push(P({
      key: `d${id}`, tone: "gold", decisionId: id, act: "erledigt", href: "/dashboard/gehirn", cta: "Ansehen",
      title: String(d.kurz_titel ?? "").trim() || d.subject,
      reason: String(d.kurz_grund ?? "").trim() || String(d.reasoning ?? "").split(/(?<=[.!?])\s/)[0] || "Entscheidung des Inhabers nötig.",
      detail: [d.action ? `Nächster Schritt: ${d.action}` : "", String(d.reasoning ?? "").trim()].filter(Boolean).join("\n"),
    }));
  }
  if (i.legalOpen > 0) {
    out.push(P({
      key: "legal", tone: "red", href: "/dashboard/gehirn", cta: "Gehirn",
      title: `Rechtstexte: ${i.legalOpen} noch Platzhalter`,
      reason: "Ohne fertige Rechtstexte gehen keine Landingpages live.",
      detail: "Impressum, Datenschutz und AGB liefern (app/content/legal.ts). Danach im Gehirn „Rechtstexte veröffentlicht“ einschalten.",
    }));
  } else if (i.legalReady === false) {
    out.push(P({
      key: "legal", tone: "gold", href: "/dashboard/gehirn", cta: "Freigeben",
      title: "Rechtstexte freigeben",
      reason: "Texte sind fertig, aber noch nicht freigegeben – Seiten bleiben bis dahin offline.",
      detail: "Gehirn → Schalter „Rechtstexte veröffentlicht“ einschalten (settings.legal_ready).",
    }));
  }
  if (i.signaturFiles.length && !i.signaturDecided) {
    out.push(P({
      key: "signatur", tone: "gold", act: "signatur", href: `${REPO}/blob/main/docs/KALTMAIL-VORLAGE.md`, cta: "Vorlage",
      title: "Signatur verspricht Exklusivität",
      reason: "„Exclusive trigger leads …“ widerspricht Vorlage §2 (keine Exklusivitätszusage) – behalten oder ändern?",
      detail: `Steht in: ${i.signaturFiles.join(", ")}.\n„Ändern“ gibt einem Agenten den Auftrag, die Zeile ohne Zusage zu formulieren.`,
    }));
  }
  if (i.seedRows === 0) {
    out.push(P({
      key: "seed", tone: "gold", href: `${REPO}/settings/secrets/actions/new`, cta: "Secret anlegen",
      title: "Kontrolladressen fehlen (SEED_INBOXES)",
      reason: "Ohne eigene Testpostfächer sehen wir nicht, ob Kaltmails im Posteingang oder im Spam landen.",
      detail: "GitHub-Secret SEED_INBOXES = eigene Adressen, kommagetrennt (je ein neues Gmail- und Outlook-Postfach). Nachweis danach in seed_checks (docs/EINRICHTUNG.md).",
    }));
  }
  if (i.slotPlan && i.slotPlan["s2-neu"] === 0) {
    out.push(P({
      key: "s2neu", tone: "gold", href: "/dashboard/regler", cta: "Regler",
      title: "Platz „S2 neu“ steht auf 0",
      reason: "Neue Länder FI·SG·MX·BR bekommen keine Leads – absichtlich?",
      detail: "owner_settings.slot_plan s2-neu = 0. Im Regler wieder auf 1 stellen oder so lassen.",
    }));
  }
  if (!i.dispatch) {
    out.push(P({
      key: "dispatch", tone: "grey", href: "/dashboard/hilfe", cta: "Anleitung",
      title: "Direktstart ohne Token (optional)",
      reason: "Mit GH_DISPATCH_TOKEN startet „Jetzt starten“ sofort statt in ≤ 15 min.",
      detail: "Vercel → Settings → Environment Variables → GH_DISPATCH_TOKEN (nur Production). Anleitung unter Hilfe.",
    }));
  }
  const rank = { red: 0, gold: 1, grey: 2 } as const;
  return out.map((x, n) => ({ x, n })).sort((a, b) => rank[a.x.tone] - rank[b.x.tone] || a.n - b.n).map((o) => o.x);
}

/** Zähler-Text oben: „1 braucht dich“ / „2 brauchen dich“. */
export const bdZaehler = (n: number) => `${n} ${n === 1 ? "braucht" : "brauchen"} dich`;
