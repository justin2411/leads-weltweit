/**
 * Strategie-Seite (/dashboard/strategie, Inhaber 05.10.2026): reine Regeln ohne Datenbank und React.
 * Inhalte (Zusammenfassung, Skalier-Stufen, Meilensteine, Rückblick) kommen aus der Datenbank
 * (brain_knowledge, strategy_milestones, strategy_rueckblick, dashboard_cache 'strategie'), nie aus dem Repo.
 */

export const TITEL_MAX = 60;
export const GRUND_MAX = 160;
/** Nordstern: 25.000 €/Monat ≈ 100 Pro-Kunden à 249 */
export const NORDSTERN = 25_000;
export const PRO_LEADS_WOCHE = 40;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const clean = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

export type Zusammenfassung = { satz: string; saetze: string[]; stufe: number | null; quelle: "zusammenfassung" | "skalierung" | "leer" };

/**
 * brain_knowledge 'strategie-zusammenfassung': Zeile „Satz: …“, optional „Stufe: n“, dann 3–5 Aufzählungspunkte.
 * Fehlt sie, wird aus 'strategie-skalierung' abgeleitet (Grundsatz + Stufen-Titel).
 */
export function zusammenfassung(zf: { titel?: string | null; markdown?: string | null } | null, skal: { titel?: string | null; markdown?: string | null } | null): Zusammenfassung {
  if (zf?.markdown) {
    const md = zf.markdown;
    const satz = /^\s*Satz:\s*(.+)$/im.exec(md)?.[1] ?? zf.titel ?? "";
    const st = /^\s*Stufe:\s*(\d)/im.exec(md)?.[1];
    const saetze = [...md.matchAll(/^\s*[-*]\s+(.+)$/gm)].map((m) => cut(clean(m[1]), GRUND_MAX)).filter(Boolean).slice(0, 5);
    return { satz: cut(clean(satz), GRUND_MAX), saetze, stufe: st ? Number(st) : null, quelle: "zusammenfassung" };
  }
  if (skal?.markdown) {
    const g = /\*\*Grundsatz:\*\*\s*(.+)$/im.exec(skal.markdown)?.[1];
    const saetze = stufen(skal.markdown).map((s) => `${s.nr}. ${s.titel}`);
    return { satz: cut(clean(g ?? skal.titel ?? ""), GRUND_MAX), saetze: saetze.slice(0, 5), stufe: null, quelle: "skalierung" };
  }
  return { satz: "", saetze: [], stufe: null, quelle: "leer" };
}

export type StufeText = { nr: number; titel: string; bedingung: string };
export const STUFEN_STANDARD: StufeText[] = [
  { nr: 1, titel: "Zustellung belegen", bedingung: "Erstmails landen im Posteingang (Gmail + Outlook)." },
  { nr: 2, titel: "Mail mit ≥ 1 % Antworten", bedingung: "Eine Variante ≥ 1 % echte Antworten und ≥ 1 Probe je ~300 Mails." },
  { nr: 3, titel: "Zweitdomains und Postfächer", bedingung: "Bounce < 3 %, 0 Beschwerden, Antwortquote hält bei 1.000+ Mails/Tag." },
  { nr: 4, titel: "Enterprise und Rechenleistung", bedingung: "Erst wenn Leads der Engpass sind (Premium-Bedarf > Nachschub)." },
];

/** Stufen aus dem Markdown von 'strategie-skalierung' („1. **Titel.**“ … „Weiter wenn: …“); fehlt etwas → Standard. */
export function stufen(md: string | null | undefined): StufeText[] {
  if (!md) return STUFEN_STANDARD;
  const teile = md.split(/^\s*(?=\d\.\s+\*\*)/m).slice(1);
  const out = STUFEN_STANDARD.map((s) => ({ ...s }));
  for (const t of teile) {
    const m = /^(\d)\.\s+\*\*(.+?)\*\*/.exec(t.trim());
    if (!m) continue;
    const nr = Number(m[1]);
    const ziel = out.find((s) => s.nr === nr);
    if (!ziel) continue;
    ziel.titel = cut(clean(m[2]).replace(/\.$/, ""), TITEL_MAX);
    const w = /(?:Weiter wenn|wenn):\s*(.+)$/im.exec(t)?.[1];
    const erst = w ? clean(w).split(/(?<=[.!])\s|\s→\s/)[0] : null;
    if (erst) ziel.bedingung = cut(erst, GRUND_MAX);
  }
  return out;
}

export type Mess = {
  seeds: Record<string, number>;
  p30: { sent?: number; bounced?: number; complained?: number; antworten?: number; proben?: number } | null;
  sent_24h: number | null;
  kunden: number | null;
  premium: number | null;
};
export type StufeBild = StufeText & { wert: string; anteil: number; erfuellt: boolean; aktuell: boolean };

const pct = (x: number) => `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
const z = (x: number) => Math.round(x).toLocaleString("de-DE");

/** Messwerte je Stufe; aktuelle Stufe = erste nicht erfüllte (streng der Reihe nach, Stufe 4 ist das Ende). */
export function treppe(text: StufeText[], m: Mess): StufeBild[] {
  const inbox = Object.entries(m.seeds).filter(([k]) => /inbox|posteingang/i.test(k)).reduce((a, [, v]) => a + num(v), 0);
  const spam = Object.entries(m.seeds).filter(([k]) => /spam|junk/i.test(k)).reduce((a, [, v]) => a + num(v), 0);
  const offen = Object.entries(m.seeds).filter(([k]) => !/inbox|posteingang|spam|junk/i.test(k)).reduce((a, [, v]) => a + num(v), 0);
  const sent = num(m.p30?.sent), antw = num(m.p30?.antworten), proben = num(m.p30?.proben);
  const bounce = sent ? num(m.p30?.bounced) / sent : 0, rate = sent ? antw / sent : 0;
  const s24 = num(m.sent_24h), kunden = num(m.kunden), prem = num(m.premium);
  const bedarf = kunden * PRO_LEADS_WOCHE;
  const bew = inbox + spam;
  const roh = [
    { wert: bew || offen ? `Posteingang ${inbox} · Spam ${spam}${offen ? ` · offen ${offen}` : ""}` : "noch keine Kontrollmail",
      anteil: bew ? inbox / bew : 0, erfuellt: bew >= 4 && inbox / bew >= 0.8 },
    { wert: `${z(antw)} Antworten / ${z(sent)} Mails = ${pct(rate)}`, anteil: Math.min(1, rate / 0.01),
      erfuellt: sent >= 100 && rate >= 0.01 && proben * 300 >= sent },
    { wert: `${z(s24)} Mails / 24 h · Bounce ${pct(bounce)}`, anteil: Math.min(1, s24 / 1000),
      erfuellt: s24 >= 1000 && bounce < 0.03 && num(m.p30?.complained) === 0 },
    { wert: `Premium frei ${z(prem)} · Bedarf ${z(bedarf)}/Woche${bedarf ? ` · ${(prem / bedarf).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Wochen` : ""}`,
      anteil: prem ? Math.min(1, bedarf / prem) : bedarf ? 1 : 0, erfuellt: false },
  ];
  let aktuell = text.length;
  for (let i = 0; i < roh.length && i < text.length; i++) if (!roh[i].erfuellt) { aktuell = i + 1; break; }
  return text.map((t, i) => ({ ...t, ...(roh[i] ?? { wert: "–", anteil: 0, erfuellt: false }), aktuell: t.nr === aktuell }));
}

export type Meilenstein = { key: string; titel: string; grund: string | null; ziel_datum: string | null; status: "geplant" | "erreicht" | "verfehlt"; erreicht_am: string | null; kennzahl: string | null; updated_by: string | null };

/** Tage bis zum Zieldatum (Berlin, ganze Tage); negativ = überfällig. */
export function tageBis(ziel: string | null, now = new Date()): number | null {
  if (!ziel) return null;
  const heute = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
  return Math.round((Date.parse(`${ziel.slice(0, 10)}T00:00:00Z`) - Date.parse(`${heute}T00:00:00Z`)) / 86_400_000);
}

/** Plan nach vorne: offene Meilensteine nach Zieldatum; „nächster“ = erster geplanter. */
export function plan(ms: Meilenstein[]) {
  const offen = ms.filter((m) => m.status !== "erreicht").sort((a, b) => (a.ziel_datum ?? "9999").localeCompare(b.ziel_datum ?? "9999"));
  const erreicht = ms.filter((m) => m.status === "erreicht").sort((a, b) => (a.erreicht_am ?? "").localeCompare(b.erreicht_am ?? ""));
  return { alle: [...erreicht, ...offen], naechster: offen.find((m) => m.status === "geplant")?.key ?? null, erreicht: erreicht.length, gesamt: ms.length };
}

export type RbEintrag = { tag: string; titel: string; grund: string | null; art: string; zahl: number | null };
export type RbTag = { tag: string; eintraege: RbEintrag[] };

/** Rückblick nach Tag gruppiert (neueste zuerst), Meilensteine zuerst, Titel/Grund gekürzt, Dubletten je Tag raus. */
export function rueckblick(rows: RbEintrag[], maxTage = 21): RbTag[] {
  const ORD: Record<string, number> = { meilenstein: 0, versand: 1, premium: 2, quelle: 3, schritt: 4, lehre: 5 };
  const map = new Map<string, RbEintrag[]>();
  for (const r of rows) {
    const tag = String(r.tag ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tag) || !r.titel) continue;
    const e = { ...r, tag, titel: cut(clean(r.titel), TITEL_MAX), grund: r.grund ? cut(clean(r.grund), GRUND_MAX) : null, zahl: r.zahl === null || r.zahl === undefined ? null : num(r.zahl) };
    const xs = map.get(tag) ?? [];
    if (!xs.some((x) => x.titel.toLowerCase() === e.titel.toLowerCase())) xs.push(e);
    map.set(tag, xs);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, maxTage)
    .map(([tag, xs]) => ({ tag, eintraege: xs.sort((a, b) => (ORD[a.art] ?? 9) - (ORD[b.art] ?? 9)) }));
}

/** Nordstern-Ring: Anteil 0–1 am Ziel 25.000 €/Monat und Kunden-Äquivalent (Pro 249). */
export function nordstern(mrr: number | null | undefined) {
  const v = Math.max(0, num(mrr));
  return { mrr: v, anteil: Math.min(1, v / NORDSTERN), kunden_aequivalent: Math.round(v / 249) };
}
