/**
 * Firma (Inhaber 04.10.2026: „gib verschiedene bereiche wie in einem unternehmen … bau daraus ein unternehmen was geld
 * verdient“): Bereiche (signalwerk.departments), Ziel mit Ampel, Wirkungszahl Richtung Umsatz, Übergaben und
 * Geschäftsbericht. Reine Funktionen (Daten: lib/firma-data.ts, Seite /dashboard/firma). Gleiche Zahlen wie
 * scripts/uebergaben.py (bericht) und signalwerk.firma_lage(). Fehlende Zahl → „–“ und grau, nie erfunden.
 */
import type { Ampel } from "./ampel.ts";
import { ampelZiel, fortschritt, type ZielZeile } from "./zentrale/ziele.ts";

export type Mitglied = { art: "rolle" | "routine" | "workflow" | "website" | "agent"; ref: string; name: string; takt: string };
export type Bereich = {
  slug: string; name: string; icon: string; zweck: string; leitung_rolle: string | null; leitung_name: string; leitung_takt: string;
  mitglieder: Mitglied[]; ziel_key: string; ziel_titel: string; ziel_soll: number | null; ziel_richtung: "hoch" | "runter";
  wirkung_key: string; wirkung_titel: string; sort: number;
};
export type Lage = Record<string, unknown>;
export type Uebergabe = { id: string; created_at: string; regel: string; von: string; an: string; titel: string; grund: string; market: string | null; status: string; push_at: string | null };
export type BereichBild = Bereich & {
  ziel: { ist: number | null; soll: number | null; text: string; ampel: Ampel; quelle: "inhaber" | "vorschlag" | "bereich" };
  wirkung: string; rein: number; raus: number;
};

export const TITEL_MAX = 60;
const ART: Mitglied["art"][] = ["rolle", "routine", "workflow", "website", "agent"];
export const ART_TEXT: Record<Mitglied["art"], string> = { rolle: "Fach-Agent", routine: "Routine", workflow: "Workflow", website: "Website-Agent", agent: "Agenten" };

const s = (x: unknown, max = 80) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Zeile aus der Datenbank prüfen; kaputte Mitglieder fallen weg (nie die ganze Seite). */
export function toBereich(x: Record<string, unknown>): Bereich | null {
  const slug = s(x.slug, 31);
  if (!/^[a-z][a-z_]{1,30}$/.test(slug)) return null;
  const raw = Array.isArray(x.mitglieder) ? x.mitglieder : [];
  const mitglieder = raw.flatMap((m): Mitglied[] => {
    const o = (m ?? {}) as Record<string, unknown>;
    const art = String(o.art) as Mitglied["art"];
    return ART.includes(art) && s(o.name) ? [{ art, ref: s(o.ref), name: s(o.name, 40), takt: s(o.takt, 40) }] : [];
  });
  const soll = x.ziel_soll === null || x.ziel_soll === undefined || x.ziel_soll === "" ? null : Number(x.ziel_soll);
  return {
    slug, name: s(x.name, 30) || slug, icon: s(x.icon, 30) || "agent", zweck: s(x.zweck), leitung_rolle: x.leitung_rolle ? s(x.leitung_rolle, 31) : null,
    leitung_name: s(x.leitung_name, 40), leitung_takt: s(x.leitung_takt, 60), mitglieder, ziel_key: s(x.ziel_key, 40), ziel_titel: s(x.ziel_titel, 40),
    ziel_soll: soll !== null && Number.isFinite(soll) ? soll : null, ziel_richtung: x.ziel_richtung === "runter" ? "runter" : "hoch",
    wirkung_key: s(x.wirkung_key, 40), wirkung_titel: s(x.wirkung_titel, 40), sort: Number(x.sort ?? 0) || 0,
  };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const zahl = (n: number | null, max = 0): string => (n === null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: max }));

/** Wert einer Kennzahl aus firma_lage (Quote „bestanden“ als Prozent). */
export function lageWert(lage: Lage | null, key: string): number | null {
  if (!lage) return null;
  const v = num(lage[key]);
  return key === "bestanden" && v !== null ? Math.round(v * 1000) / 10 : v;
}

const einheit = (key: string) => (["bestanden", "antwortquote", "lead_fehler"].includes(key) ? " %" : "");

/** Hauptziel: company_goals (Soll vom Inhaber/Vorschlag) oder eigene Kennzahl des Bereichs mit ziel_soll. */
export function bereichsZiel(b: Bereich, lage: Lage | null, ziele: ZielZeile[] | null): BereichBild["ziel"] {
  const g = ziele?.find((z) => z.key === b.ziel_key);
  if (g) {
    const e = g.einheit === "%" ? " %" : "";
    return { ist: g.ist, soll: g.soll, ampel: g.ampel, quelle: g.quelle, text: `${zahl(g.ist, e ? 1 : 0)}${g.ist === null ? "" : e} / ${zahl(g.soll, 1)}${e}` };
  }
  const ist = lageWert(lage, b.ziel_key);
  const soll = b.ziel_soll;
  if (soll === null) return { ist, soll, ampel: "grey", quelle: "bereich", text: zahl(ist) };
  const p = fortschritt({ soll, richtung: b.ziel_richtung }, ist);
  // „höchstens 0“: 0 erreicht = grün, sonst gelb (warten auf jemanden), rot nur über Ziel-Fortschritt < 50 %
  const ampel: Ampel = ist === null ? "grey" : b.ziel_richtung === "runter" && soll === 0 ? (ist <= 0 ? "green" : "gold") : ampelZiel(p);
  const e = einheit(b.ziel_key);
  return { ist, soll, ampel, quelle: "bereich", text: `${zahl(ist)}${ist === null ? "" : e} / ${zahl(soll)}${e}` };
}

/** Wirkungszahl Richtung Umsatz, z. B. „12“ oder „97 %“. */
export function wirkungText(b: Bereich, lage: Lage | null): string {
  const v = lageWert(lage, b.wirkung_key);
  return v === null ? "–" : `${zahl(v, b.wirkung_key === "bestanden" ? 1 : 0)}${einheit(b.wirkung_key)}`;
}

export function bilder(bereiche: Bereich[], lage: Lage | null, ziele: ZielZeile[] | null, ueb: Uebergabe[]): BereichBild[] {
  return [...bereiche].sort((a, b) => a.sort - b.sort || a.slug.localeCompare(b.slug)).map((b) => ({
    ...b, ziel: bereichsZiel(b, lage, ziele), wirkung: wirkungText(b, lage),
    rein: ueb.filter((u) => u.an === b.slug).length, raus: ueb.filter((u) => u.von === b.slug).length,
  }));
}

/** Geschäftsbericht: Titel ≤ 60 + 5 Zeilen, je 1 Zahl (gleich scripts/uebergaben.py bericht). */
export function geschaeftsbericht(lage: Lage | null): { titel: string; zeilen: { label: string; wert: string; key: string }[] } {
  const v = (k: string) => (lage ? zahl(num(lage[k]) ?? 0) : "–");
  const titel = `Geschäft heute: ${v("mrr")} Umsatz/Monat`;
  return {
    titel: titel.length <= TITEL_MAX ? titel : `${titel.slice(0, TITEL_MAX - 1)}…`,
    zeilen: [
      { key: "mails_24h", label: "Mails 24 h", wert: v("mails_24h") },
      { key: "antworten_7d", label: "Antworten 7 T", wert: v("antworten_7d") },
      { key: "proben_7d", label: "Proben 7 T", wert: v("proben_7d") },
      { key: "kunden", label: "Kunden", wert: v("kunden") },
      { key: "mrr", label: "Umsatz/Monat", wert: v("mrr") },
    ],
  };
}

export const STATUS_TEXT: Record<string, string> = { wartet: "wartet auf freien Agenten", beauftragt: "an Agent", gemeldet: "gemeldet" };

export function toUebergabe(x: Record<string, unknown>): Uebergabe {
  return {
    id: s(x.id, 40), created_at: s(x.created_at, 40), regel: s(x.regel, 30), von: s(x.von, 31), an: s(x.an, 31), titel: s(x.titel, TITEL_MAX),
    grund: s(x.grund, 160), market: x.market ? s(x.market, 4) : null, status: s(x.status, 20), push_at: x.push_at ? s(x.push_at, 40) : null,
  };
}
