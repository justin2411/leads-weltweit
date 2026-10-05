/**
 * Firma-Karte (JARVIS-Zentrale „Organigramm live“, 05.10.2026): einzige Quelle für Bereiche → Agenten → Werke → Flüsse.
 * Reine Helfer ohne Datenbank (gleiche Datei liest scripts/lib/firma_karte.py). Wer einen Agenten oder ein Werk
 * hinzufügt, trägt es in firma-karte.json ein – lib/firma-karte.test.ts prüft Workflows, Linien und Rollen.
 */
import KARTE from "./firma-karte.json" with { type: "json" };

export type Bahn = "lead" | "kaeufer" | "ast" | "rahmen" | "buero";
export type WerkStatus = "laeuft" | "fehlt" | "ziel" | "linie_im_lead_werk" | "schritt_im_proben_vorrat";
export type Werk = {
  id: string; nr: number | null; name: string; workflow: string | null; neben?: string[]; cron_utc?: string[]; takt?: string;
  linien_werk?: string | null; linie?: string; pause_key?: string; station?: string | null; bahn: Bahn; pos?: number;
  puls?: string; status?: WerkStatus; gold?: boolean; teil_von?: string; auftrag?: string; skripte?: string[]; skript?: string;
  schreibt?: string[]; liest?: string[];
};
export type Bereich = {
  slug: string; name: string; icon: string; sort: number; gold?: boolean; leitung: string; naehe_umsatz: number;
  agenten: string[]; werke: string[]; seiten: string[];
};
export type Agent = {
  id: string; name: string; typ: "llm" | "python"; quelle: string; takt: string; routine?: string; routine_trigger?: string;
  workflow?: string; nutzt_werke: string[] | "auftrag";
};
export type Fluss = { von: string; an: string; was: string; tempo?: string; filter?: string };
export type Uebergabe = { regel: string; von: string; an: string; auftrag: string; rolle: string | null; push?: boolean };
export type Leitplanke = { id: string; name: string; quelle: string; gelb?: number; rot?: number; ab_gesendet?: number; gelb_gb?: number; rot_gb?: number; text?: string; schaltbar: false };
export type FirmaKarte = {
  kopf: { inhaber: { name: string; lampen: string[] }; gehirn: { id: string; name: string; takt: string; bereich: string } };
  bereiche: Bereich[]; scout: { id: string; name: string; an_bereich: string; takt: string; nutzt_werke: string[] };
  agenten: Agent[]; werke: Werk[]; fluesse: Fluss[]; uebergaben: Uebergabe[]; leitplanken: Leitplanke[];
};

export const FIRMA = KARTE as unknown as FirmaKarte;
export const BEREICHE: Bereich[] = [...FIRMA.bereiche].sort((a, b) => a.sort - b.sort);
export const WERKE: Werk[] = FIRMA.werke;
export const AGENTEN: Agent[] = FIRMA.agenten;

/** Bereich einer Rolle (agent_tasks.rolle, z. B. „quellen“ oder „rolle:quellen“); unbekannt → „strategie“ (A1–A8 ohne Rolle). */
export function bereichVon(rolle: string | null | undefined): string {
  if (!rolle) return "strategie";
  const id = rolle.includes(":") ? rolle : `rolle:${rolle}`;
  return BEREICHE.find((b) => b.agenten.includes(id))?.slug ?? "strategie";
}

/** Werke, die ein Bereich nutzt (eigene + die seiner Agenten), ohne Doppelte. */
export function werkeVonBereich(slug: string): string[] {
  const b = BEREICHE.find((x) => x.slug === slug);
  if (!b) return [];
  const out = new Set(b.werke);
  for (const a of b.agenten) {
    const ag = AGENTEN.find((x) => x.id === a);
    if (ag && Array.isArray(ag.nutzt_werke)) for (const w of ag.nutzt_werke) out.add(w);
  }
  return [...out].filter((w) => WERKE.some((x) => x.id === w));
}

/** Agenten, die ein Werk nutzen. */
export function agentenVonWerk(id: string): Agent[] {
  return AGENTEN.filter((a) => Array.isArray(a.nutzt_werke) && a.nutzt_werke.includes(id));
}

/** Station der alten Fluss-Karte (Seitenfenster ?s=…) zu einem Werk; null = keine. */
export function stationVonWerk(id: string): string | null {
  return WERKE.find((w) => w.id === id)?.station ?? null;
}

/** Werk zu einer Station (umgekehrt), erstes Werk mit Workflow gewinnt. */
export function werkVonStation(station: string): Werk | null {
  return WERKE.find((w) => w.station === station && w.workflow) ?? WERKE.find((w) => w.station === station) ?? null;
}

/** Werke einer Bahn in Prozessreihenfolge (Kacheln der Werke-Karte). Gleiche pos = eine Kachel (z. B. Prüfer + Stichprobe). */
export function bahn(b: "lead" | "kaeufer"): Werk[][] {
  const ws = WERKE.filter((w) => w.bahn === b && typeof w.pos === "number").sort((x, y) => (x.pos! - y.pos!) || ((x.status === "fehlt" ? 1 : 0) - (y.status === "fehlt" ? 1 : 0)));
  const groups = new Map<number, Werk[]>();
  for (const w of ws) groups.set(w.pos!, [...(groups.get(w.pos!) ?? []), w]);
  return [...groups.values()];
}

/** Äste (Radar am Lead-Werk, Premium-Bewertung am Proben-Vorrat). */
export const aeste = (teilVon: string) => WERKE.filter((w) => w.bahn === "ast" && w.teil_von === teilVon);

/** Kanten der Werke-Karte als [von, an] (ohne Gehirn/Wachhund → Agenten). */
export function layoutKante(): [string, string][] {
  return FIRMA.fluesse.filter((f) => WERKE.some((w) => w.id === f.von) && WERKE.some((w) => w.id === f.an)).map((f) => [f.von, f.an]);
}

/** Umsatznähe je Bereich (Gewicht im Abteilungs-Motor). */
export const naeheUmsatz = (slug: string) => BEREICHE.find((b) => b.slug === slug)?.naehe_umsatz ?? 0.4;

/** Agenten eines Bereichs mit Stammdaten (Name, Typ, Takt); unbekannte Einträge (z. B. „gehirn“) mit Name aus dem Kopf. */
export function agentenVonBereich(slug: string): { id: string; name: string; typ: string; takt: string }[] {
  const b = BEREICHE.find((x) => x.slug === slug);
  if (!b) return [];
  return b.agenten.map((id) => {
    const a = AGENTEN.find((x) => x.id === id);
    if (a) return { id, name: a.name, typ: a.typ === "python" ? "Python" : "LLM", takt: a.takt };
    if (id === "gehirn") return { id, name: FIRMA.kopf.gehirn.name, typ: "LLM", takt: FIRMA.kopf.gehirn.takt };
    return { id, name: id.split(":").pop() ?? id, typ: "LLM", takt: "–" };
  });
}

/** Fach-Agenten-Rollen (ohne Präfix) eines Bereichs, z. B. ["trichter", "zustellung"]. */
export const rollenVonBereich = (slug: string) =>
  (BEREICHE.find((b) => b.slug === slug)?.agenten ?? []).filter((a) => a.startsWith("rolle:")).map((a) => a.slice(6));
