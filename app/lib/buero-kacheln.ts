/**
 * Büro-Kacheln (Inhaber 05.10.2026: „kannst du hier die kacheln und das design des büro hochwertiger machen?“):
 * je Kachel eine echte Live-Kennzahl groß + Mini-Grafik, je Bereich Akzentfarbe und Ampel. Reihenfolge so, dass das
 * Raster (6 Spalten am Rechner) in drei vollen Reihen aufgeht: 3+2+1 · 5+1 · 2+2+2. Reine Logik ohne React,
 * nur aus vorhandenen Caches (Zentrale schnell/langsam, Trichter-Cache, Flows-Anzahl) – nie langsame Live-Zählungen.
 */
import type { IconName } from "../app/icons";
import { BEREICHE } from "./firma-karte.ts";
import { naechster, ROUTINEN_LISTE } from "./gehirn-aufbau.ts";
import { uhr, type Ton } from "./zentrale-logik.ts";
import { bereicheBild, plaetzeBild } from "./zentrale-modell.ts";
import type { Langsam, Schnell } from "./zentrale-typen.ts";
import { countdown, zahlText } from "./buero-format.ts";

export { countdown, zahlText };

export type Viz =
  | { art: "balken"; anteil: number }
  | { art: "ring"; anteil: number }
  | { art: "saeulen"; werte: number[]; namen: string[] }
  | { art: "ampel"; ton: Ton };

export type Kachel = {
  href: string; titel: string; icon: IconName; tip: string;
  /** Zahl zum Hochzählen; null = nur `text` (z. B. Uhrzeit) */
  wert: number | null; dez?: number; vor?: string; nach?: string; text: string;
  unter: string; viz: Viz | null; ton: Ton; gold?: boolean;
  /** Gehirn: Zeitpunkt der nächsten Sitzung (Countdown im Browser) */
  bis?: string | null;
};
export type Gruppe = { slug: string; name: string; icon: IconName; farbe: string; ton: Ton; kacheln: Kachel[] };

/** Akzentfarbe je Bereich (nur Dekor; Status bleibt grün/gelb/rot/grau). */
export const FARBE: Record<string, string> = {
  vertrieb: "#5fd4ff", marketing: "#b48cff", produktion: "#3ddc97", qualitaet: "#7aa2ff",
  kundenservice: "#ffb38a", finanzen: "#e2c68f", recht: "#ff9ec4", strategie: "#c9b6ff",
};

export type Extras = {
  /** Besucher der Website je Zeitraum (Trichter-Cache website_funnel); null = keine Messung */
  besucher: { h24: number | null; d7: number | null; d30: number | null } | null;
  /** nicht archivierte Flows im Baukasten; null = nicht lesbar */
  flows: number | null;
  /** GH_DISPATCH_TOKEN gesetzt (nur ob, nie der Wert) */
  dispatch: boolean;
  now: number;
};

const n = (x: unknown) => Number(x ?? 0) || 0;
const anteil = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(1, a / b)) : 0);
const STORAGE_GB = 8;

/** Schlechteste Ampel einer Liste (grau zählt nur, wenn alles grau ist). */
export function schlechteste(xs: Ton[]): Ton {
  for (const t of ["rot", "gelb", "gruen"] as Ton[]) if (xs.includes(t)) return t;
  return "grau";
}

function k(x: Omit<Kachel, "text"> & { text?: string }): Kachel {
  return { ...x, text: x.text ?? zahlText(x.wert, x.dez, x.vor, x.nach) };
}

export function bueroGruppen(s: Schnell | null, l: Langsam | null, e: Extras): Gruppe[] {
  const p7 = l?.extra?.p?.["7"] ?? null, p30 = l?.extra?.p?.["30"] ?? null;
  const kap = l?.kap ?? null;
  const sentHeute = s ? n(s.msg.sent_heute) : null;
  const tank = l ? Object.values(l.tank ?? {}).reduce((a, b) => a + n(b), 0) : null;
  const tankSoll = l ? Object.values(l.tank_soll ?? {}).reduce((a, b) => a + n(b), 0) : 0;
  const gb = l?.storage?.db_bytes ? n(l.storage.db_bytes) / 1024 ** 3 : null;
  const pl = plaetzeBild(s);
  const fehler = s?.gaps.find((g) => g.ziel_key === "lead_fehler")?.ist ?? null;
  const goals = l?.goals ?? [];
  const best = goals.filter((g) => g.quelle && g.quelle !== "vorschlag").length;
  const score = [...(l?.kpi ?? [])].filter((x) => x.metric === "gehirn_score").pop();
  const gehirn = ROUTINEN_LISTE.find((r) => r.key === "gehirn");
  const next = gehirn ? naechster(gehirn.crons, new Date(e.now))?.toISOString() ?? null : null;
  const lw = l?.runs?.["lead-werk"], kw = l?.runs?.["kunden-werk"];
  const b = e.besucher;
  const proTag = (x: number | null | undefined, t: number) => (x === null || x === undefined ? 0 : x / t);
  const bremse = l?.bremse?.stop ? "rot" : null;

  const tonGb: Ton = gb === null ? "grau" : gb >= 7.5 ? "rot" : gb >= 6 ? "gelb" : "gruen";
  const tonFehler: Ton = fehler === null ? "grau" : n(fehler) > 5 ? "rot" : n(fehler) > 2 ? "gelb" : "gruen";

  const roh: { slug: string; kacheln: Kachel[] }[] = [
    { slug: "vertrieb", kacheln: [
      k({ href: "/dashboard/versand", titel: "Versand", icon: "versand", tip: "Freigaben, Postfächer, Zustellung", wert: sentHeute,
        unter: kap ? `heute von ${kap.toLocaleString("de-DE")}` : "heute gesendet", viz: kap ? { art: "balken", anteil: anteil(n(sentHeute), kap) } : null,
        ton: bremse ?? (s ? "gruen" : "grau") }),
      k({ href: "/dashboard/kontakte", titel: "Kontakte", icon: "kontakte", tip: "angeschriebene Käufer", wert: p7 ? n(p7.sent) : null,
        unter: "angeschrieben 7 T", ton: p7 ? "gruen" : "grau",
        viz: p7 ? { art: "saeulen", werte: [n(s?.msg.sent_24h), proTag(p7.sent, 7), proTag(p30?.sent, 30)], namen: ["24 h", "Ø 7 T", "Ø 30 T"] } : null }),
      k({ href: "/dashboard/vertrieb", titel: "Vertrieb", icon: "trend-hoch", tip: "Trichter je Land", wert: p7 ? n(p7.antworten) : null,
        unter: p7 ? `Antworten 7 T · ${n(p7.positiv)} positiv` : "Antworten 7 T", ton: p7 ? "gruen" : "grau",
        viz: p7 ? { art: "saeulen", werte: [n(p7.antworten), n(p7.positiv), n(p7.proben)], namen: ["Antw.", "positiv", "Proben"] } : null }),
    ] },
    { slug: "marketing", kacheln: [
      k({ href: "/dashboard/website", titel: "Website", icon: "website", tip: "Gesundheit, Website-Agenten, Trichter", wert: b?.d7 ?? null,
        unter: "Besucher 7 T", ton: b?.d7 === null || b?.d7 === undefined ? "grau" : "gruen",
        viz: b ? { art: "saeulen", werte: [n(b.h24), proTag(b.d7, 7), proTag(b.d30, 30)], namen: ["24 h", "Ø 7 T", "Ø 30 T"] } : null }),
      k({ href: "/dashboard/proben", titel: "Proben", icon: "proben", tip: "fertige, geprüfte Proben", wert: tank,
        unter: l?.extra ? `bereit · ${zahlText(n(l.extra.premium))} Premium` : "bereit",
        viz: tankSoll ? { art: "balken", anteil: anteil(n(tank), tankSoll) } : null,
        ton: tank === null ? "grau" : tankSoll && n(tank) < tankSoll * 0.5 ? "gelb" : "gruen" }),
    ] },
    { slug: "recht", kacheln: [
      k({ href: "/dashboard/recht", titel: "Recht", icon: "recht", tip: "Kaltmail-Recht, Sperrliste", wert: l ? n(l.sperre.gesamt) : null,
        unter: l ? `gesperrt · +${n(l.sperre.neu_24h).toLocaleString("de-DE")} / 24 h` : "gesperrt", viz: null, ton: l ? "gruen" : "grau" }),
    ] },
    { slug: "produktion", kacheln: [
      k({ href: "/dashboard/speicher", titel: "Speicher", icon: "speicher", tip: "Datenbank je Land · Bremse 6 GB, Stopp 7,5 GB", wert: gb, dez: 1, nach: " GB",
        unter: `von ${STORAGE_GB} GB`, viz: gb === null ? null : { art: "ring", anteil: anteil(gb, STORAGE_GB) }, ton: tonGb }),
      k({ href: "/dashboard/buero/werke", titel: "Werke", icon: "werk", tip: "Läufe, Herzschläge, Prüfstufen", wert: s ? pl.laufend : null,
        unter: `Plätze laufen von ${pl.gesamt}`, viz: s ? { art: "balken", anteil: anteil(pl.laufend, pl.gesamt) } : null,
        ton: !s ? "grau" : pl.laufend > 0 ? "gruen" : "gelb" }),
      k({ href: "/dashboard/bestand", titel: "Bestand", icon: "bestand", tip: kw ? `lieferbare Leads und Käufer · Käufer 24 h +${zahlText(n(kw.green_24h))}` : "lieferbare Leads und Käufer", wert: lw ? n(lw.green_24h) : null, vor: "+",
        unter: "neue Leads 24 h", ton: lw ? "gruen" : "grau", viz: null }),
      k({ href: "/dashboard/liste", titel: "Liste", icon: "filter", tip: "Leads und Käufer als Liste", wert: l?.lage?.gruen_7d ?? null,
        unter: "grüne Leads 7 T", viz: null, ton: l?.lage ? "gruen" : "grau" }),
      k({ href: "/dashboard/baukasten", titel: "Baukasten", icon: "baukasten", tip: "eigene Regeln (Stufe 4 der Freigabe)", wert: e.flows,
        unter: e.flows === 1 ? "Flow" : "Flows", viz: null, ton: e.flows === null ? "grau" : "gruen" }),
    ] },
    { slug: "kundenservice", kacheln: [
      k({ href: "/dashboard/antworten", titel: "Antworten", icon: "antworten", tip: "Antworten-Cockpit", wert: s ? n(s.replies.offen) : null,
        unter: s ? `offen · ${n(s.replies.heiss)} Kaufinteresse` : "offen", viz: null,
        ton: !s ? "grau" : n(s.replies.heiss) > 0 ? "gelb" : "gruen" }),
    ] },
    { slug: "qualitaet", kacheln: [
      k({ href: "/dashboard/betrieb", titel: "Betrieb", icon: "freigabe", tip: "Prüfungen, Läufe, Fehlerquote", wert: fehler === null ? null : n(fehler), dez: 1, nach: " %",
        unter: "Fehlerquote Leads", viz: { art: "ampel", ton: tonFehler }, ton: tonFehler }),
      k({ href: "/dashboard/protokoll", titel: "Protokoll", icon: "dokument", tip: "Entscheidungen und Änderungen", wert: null,
        text: uhr(l?.lern.last_decision ?? null, e.now), unter: "letzte Entscheidung", viz: null, ton: l?.lern.last_decision ? "gruen" : "grau" }),
    ] },
    { slug: "finanzen", kacheln: [
      k({ href: "/dashboard/finanzen", titel: "Finanzen", icon: "trend-hoch", tip: "Umsatz, Kosten", wert: l?.mrr ?? null,
        unter: `MRR · ${n(l?.kunden)} ${n(l?.kunden) === 1 ? "Kunde" : "Kunden"}`, viz: null, ton: l?.mrr === null || l?.mrr === undefined ? "grau" : "gruen", gold: true }),
      k({ href: "/dashboard/ziele", titel: "Ziele", icon: "stern", tip: "Ziele bestätigen", wert: null,
        text: goals.length ? `${best}/${goals.length}` : "–", unter: best === goals.length ? "bestätigt" : `${goals.length - best} unbestätigt`,
        viz: goals.length ? { art: "ring", anteil: anteil(best, goals.length) } : null,
        ton: !goals.length ? "grau" : best === goals.length ? "gruen" : "gelb" }),
    ] },
    { slug: "strategie", kacheln: [
      k({ href: "/dashboard/gehirn", titel: "Gehirn", icon: "gehirn", wert: null, text: countdown(next, e.now), bis: next,
        unter: "nächste Sitzung", tip: score ? `Lernschleife · Score ${n(score.value).toLocaleString("de-DE", { maximumFractionDigits: 1 })}` : "Lernschleife, Lehren, Prüffälle",
        viz: null, ton: s?.brain_enabled === false ? "gelb" : "gruen" }),
      k({ href: "/dashboard/hilfe", titel: "Hilfe", icon: "frage", tip: "Hilfe und Einrichtung", wert: null, text: e.dispatch ? "bereit" : "offen",
        unter: e.dispatch ? "Sofortstart eingerichtet" : "Sofortstart einrichten", viz: { art: "ampel", ton: e.dispatch ? "gruen" : "gelb" },
        ton: e.dispatch ? "gruen" : "gelb" }),
    ] },
  ];
  const amp = new Map(bereicheBild(s).map((x) => [x.slug, x.ton]));
  return roh.map((g) => {
    const b = BEREICHE.find((x) => x.slug === g.slug);
    const ziel = amp.get(g.slug) ?? "grau";
    return { slug: g.slug, name: b?.name ?? g.slug, icon: (b?.icon ?? "buero") as IconName, farbe: FARBE[g.slug] ?? "#5fd4ff",
      ton: schlechteste([ziel, ...g.kacheln.map((x) => x.ton)]), kacheln: g.kacheln };
  });
}
