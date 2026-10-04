/**
 * Abteilung „Recht“ der Kommandozentrale (Inhaber 04.10.2026: „wie in einem unternehmen alles steuern und regeln“).
 * Reine Funktionen ohne Datenbank (testbar): Länder-Ampel aus countries.yaml + docs/KALTMAIL-RECHT.md (über
 * lib/ops-config.json), Sperrliste je Grund, Abmelde-Link-Prüfung, Rechtstexte, offene Rechtsfragen.
 * Nur Anzeige: Länderregeln, Sperrliste, Abmeldung und Notbremse werden hier nie geändert.
 * Daten: ./recht-data.ts (server-only), Seite: app/dashboard/recht.
 */
import type { Ampel } from "../ampel.ts";

export type Trend = "hoch" | "runter" | "gleich" | null;
/** Kennzahl für die Abteilungs-Übersicht in JARVIS. */
export type ZKpi = { titel: string; wert: string; ampel: Ampel; trend: Trend };

export type LandRegel = { allowed: boolean; never: boolean; generic_only: boolean; company_forms_only: boolean; daily_limit: number | null; open_question: string | null };
export type TabellenZeile = { code: string; name: string; einzel: string; firmen: string; bedingung: string; risiko: string };
export type RechtCfg = { laender: Record<string, LandRegel>; tabelle: TabellenZeile[] };

export type Land = {
  code: string; name: string; ampel: Ampel; stand: "sendet" | "frei" | "gesperrt" | "nie";
  /** Wer darf ohne Einwilligung angeschrieben werden (strengere Regel aus Tabelle und countries.yaml) */
  firmen: boolean; einzel: boolean; nurAllgemein: boolean; limit: number | null; risiko: string; bedingung: string;
};

export const STAND_TEXT: Record<Land["stand"], string> = { sendet: "Versand an", frei: "erlaubt, Versand aus", gesperrt: "gesperrt", nie: "nie" };

const ja = (s: string | undefined) => !!s && /^(ja|eher ja)/i.test(s.trim());
const STAND_RANG: Record<Land["stand"], number> = { sendet: 0, frei: 1, gesperrt: 2, nie: 3 };
const LEER: LandRegel = { allowed: false, never: false, generic_only: false, company_forms_only: false, daily_limit: null, open_question: null };

/**
 * Länder-Ampel: grün = erlaubt und Versand läuft dorthin, gelb = erlaubt, aber kein Versand (nicht im Fokus,
 * Land aus, Versand gestoppt), grau = gesperrt, rot = nie (Risiko hoch, Inhaber 04.10.2026). Länder aus
 * countries.yaml ohne Tabellenzeile kommen mit ihrem Code dazu. Es gilt die strengere Regel.
 */
export function laender(cfg: RechtCfg, o: { versandAn: boolean; fokus: string[]; aus: string[] }): Land[] {
  const tab = new Map(cfg.tabelle.map((t) => [t.code, t]));
  const codes = [...new Set([...cfg.tabelle.map((t) => t.code), ...Object.keys(cfg.laender)])];
  const out = codes.map((code): Land => {
    const r = cfg.laender[code] ?? LEER;
    const t = tab.get(code);
    const erlaubt = r.allowed && !r.never;
    const firmen = erlaubt && (t ? ja(t.firmen) || /info@/i.test(t.firmen) : true);
    const einzel = erlaubt && !r.company_forms_only && (t ? ja(t.einzel) : true);
    const sendet = erlaubt && o.versandAn && o.fokus.includes(code) && !o.aus.includes(code);
    const stand: Land["stand"] = r.never ? "nie" : !erlaubt ? "gesperrt" : sendet ? "sendet" : "frei";
    const ampel: Ampel = stand === "sendet" ? "green" : stand === "frei" ? "gold" : stand === "nie" ? "red" : "grey";
    return { code, name: t?.name ?? code, ampel, stand, firmen, einzel, nurAllgemein: erlaubt && r.generic_only, limit: erlaubt ? r.daily_limit : null,
      risiko: t?.risiko ?? "–", bedingung: t?.bedingung ?? "–" };
  });
  return out.sort((a, b) => STAND_RANG[a.stand] - STAND_RANG[b.stand] || a.name.localeCompare(b.name, "de"));
}

// ------------------------------------------------------------------------------------------------- Sperrliste
export type Grund = "abmeldung" | "bounce" | "beschwerde" | "sonst";
export const GRUENDE: Grund[] = ["abmeldung", "bounce", "beschwerde", "sonst"];
export const GRUND_TEXT: Record<Grund, string> = { abmeldung: "Abmeldung", bounce: "Bounce", beschwerde: "Beschwerde", sonst: "Sonstige" };

export function grundVon(reason: string | null | undefined): Grund {
  const r = String(reason ?? "").toLowerCase();
  if (/unsub|abmeld|opt.?out/.test(r)) return "abmeldung";
  if (/bounce/.test(r)) return "bounce";
  if (/complain|spam|beschwer/.test(r)) return "beschwerde";
  return "sonst";
}

export type Sperren = { gesamt: number; d7: number; vorher7: number; je: Record<Grund, { gesamt: number; d7: number }> };

/** Sperrliste je Grund: gesamt und letzte 7 Tage (dazu die 7 Tage davor für den Trend). */
export function sperren(rows: { reason: string | null; created_at: string }[], now: Date): Sperren {
  const t7 = now.getTime() - 7 * 86_400_000, t14 = now.getTime() - 14 * 86_400_000;
  const je = Object.fromEntries(GRUENDE.map((g) => [g, { gesamt: 0, d7: 0 }])) as Sperren["je"];
  let d7 = 0, vorher7 = 0;
  for (const r of rows) {
    const g = grundVon(r.reason), t = Date.parse(r.created_at);
    je[g].gesamt++;
    if (t >= t7) { je[g].d7++; d7++; } else if (t >= t14) vorher7++;
  }
  return { gesamt: rows.length, d7, vorher7, je };
}

export function trendVon(jetzt: number, vorher: number): Trend {
  if (!jetzt && !vorher) return null;
  return jetzt > vorher ? "hoch" : jetzt < vorher ? "runter" : "gleich";
}

// ------------------------------------------------------------------------------------------------- Abmelde-Link
export type AbmeldeInput = {
  /** Selbsttest: Antwort von /api/unsubscribe mit ungültigem Token (404 = Route lebt; schreibt nichts); null = nicht erreichbar */
  probe: number | null;
  /** Gesendete Mails der letzten 7 Tage und davon ohne Abmelde-Token (null = nicht lesbar) */
  sent7: number | null; ohneToken: number | null;
  siteHttps: boolean;
};
export type Check = { ampel: Ampel; titel: string; grund: string };

export function abmeldeCheck(x: AbmeldeInput): Check {
  if (x.ohneToken !== null && x.ohneToken > 0) return { ampel: "red", titel: "Mails ohne Abmelde-Link", grund: `${x.ohneToken} Mails der letzten 7 Tage ohne Abmelde-Token.` };
  if (x.probe !== null && x.probe >= 500) return { ampel: "red", titel: "Abmelde-Link antwortet nicht", grund: `Selbsttest: Fehler ${x.probe}.` };
  if (!x.siteHttps) return { ampel: "gold", titel: "Seitenadresse ohne https", grund: "SITE_URL ist keine https-Adresse – Links in Mails prüfen." };
  if (x.probe === null) return { ampel: "grey", titel: "Selbsttest nicht möglich", grund: "Seite gerade nicht erreichbar – gleich noch einmal laden." };
  if (x.probe !== 404) return { ampel: "gold", titel: "Abmelde-Link unerwartet", grund: `Selbsttest: Antwort ${x.probe} statt 404 für einen ungültigen Link.` };
  if (!x.sent7) return { ampel: "green", titel: "Abmelde-Link funktioniert", grund: "Selbsttest ok, in 7 Tagen keine Mails gesendet." };
  return { ampel: "green", titel: "Abmelde-Link funktioniert", grund: `Selbsttest ok, alle ${x.sent7} Mails der letzten 7 Tage mit Token.` };
}

// ------------------------------------------------------------------------------------------------- Rechtstexte
export type Text = { key: string; title: string; placeholder: boolean; laenge: number };
export type Texte = { ampel: Ampel; luecken: string[]; grund: string };

export function rechtstexte(docs: Text[], legalReady: boolean | null): Texte {
  const luecken = docs.filter((d) => d.placeholder || d.laenge <= 200).map((d) => d.title);
  if (luecken.length) return { ampel: "red", luecken, grund: `Platzhalter: ${luecken.join(", ")}.` };
  if (legalReady === null) return { ampel: "grey", luecken, grund: "Freigabe-Schalter nicht lesbar." };
  if (!legalReady) return { ampel: "gold", luecken, grund: "Texte fertig, Freigabe (legal_ready) aus – Seiten bleiben privat." };
  return { ampel: "green", luecken, grund: "Impressum, Datenschutz und AGB fertig und freigegeben." };
}

// ------------------------------------------------------------------------------------------------- Offene Fragen
export type Frage = { titel: string; grund: string; wer: "Inhaber" };

const kurz = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Feste Frage Art. 14 DSGVO (CLAUDE.md 8a) + offene Fragen aus countries.yaml für erlaubte Länder. */
export function offeneFragen(cfg: RechtCfg): Frage[] {
  const out: Frage[] = [{ titel: "Art. 14 DSGVO bei Lead-Weitergabe", grund: "Informationspflicht gegenüber Ansprechpersonen in EU/UK, wenn Leads an Kunden gehen.", wer: "Inhaber" }];
  for (const [code, r] of Object.entries(cfg.laender)) {
    if (!r.open_question || !r.allowed || r.never) continue;
    const t = cfg.tabelle.find((x) => x.code === code);
    out.push({ titel: kurz(`${t?.name ?? code}: offene Rechtsfrage`, 60), grund: kurz(r.open_question, 160), wer: "Inhaber" });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- Kennzahl
export type RechtLage = { beschwerden30: number | null; abmelde: Check; texte: { ampel: Ampel }; sperren: Sperren | null };

/**
 * Kennzahl „Recht“: rot bei Spam-Beschwerde (30 Tage), kaputtem Abmelde-Link oder fehlenden Rechtstexten, gelb bei
 * Warnungen, grau ohne Daten. Wert = Spam-Beschwerden, Trend = neue Sperren (7 Tage gegen die 7 davor).
 */
export function kpiAus(x: RechtLage): ZKpi {
  const amps = [x.abmelde.ampel, x.texte.ampel];
  const b = x.beschwerden30;
  const ampel: Ampel = (b ?? 0) > 0 || amps.includes("red") ? "red" : amps.includes("gold") ? "gold" : b === null ? "grey" : "green";
  return {
    titel: "Recht",
    wert: b === null ? "–" : `${b} ${b === 1 ? "Beschwerde" : "Beschwerden"}`,
    ampel,
    trend: x.sperren ? trendVon(x.sperren.d7, x.sperren.vorher7) : null,
  };
}

/** Kennzahl für die JARVIS-Abteilungs-Übersicht (lädt selbst; nur auf dem Server aufrufen). */
export async function kpi(): Promise<ZKpi> {
  try {
    const { loadRecht } = await import("./recht-data");
    return kpiAus(await loadRecht());
  } catch {
    return { titel: "Recht", wert: "–", ampel: "grey", trend: null };
  }
}
