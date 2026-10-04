/**
 * Bounce-Klassen (04.10.2026): Auswertung aus signalwerk.bounce_stats (7 Tage) für JARVIS-Kontext und die Station
 * Versand. Klassen: hart = Adresse/Domain fehlt, weich = Postfach voll/Timeout, richtlinie = Spam/Blockliste,
 * unbekannt = kein Grund. Nur Anzeige – Notbremse, Sperrliste und Prüfregeln bleiben unverändert.
 */
export type Klasse = "hart" | "weich" | "richtlinie" | "unbekannt";
export const KLASSEN: Klasse[] = ["hart", "weich", "richtlinie", "unbekannt"];
export const KLASSE_LABEL: Record<Klasse, string> = { hart: "hart", weich: "weich", richtlinie: "Richtlinie", unbekannt: "unbekannt" };
export const KLASSE_TIP: Record<Klasse, string> = {
  hart: "Adresse unbekannt oder Domain fehlt",
  weich: "Postfach voll, Timeout",
  richtlinie: "Spam, Blockliste, Absender abgelehnt",
  unbekannt: "kein Grund in der Meldung",
};
export const KLASSE_COLOR: Record<Klasse, string> = { hart: "#c0392b", weich: "#c9973a", richtlinie: "#7b3fa0", unbekannt: "#8a8f98" };

type Counts = Record<Klasse, number> & { gesendet: number; bounces: number };
export type BoxRow = Counts & { box: string };
export type SourceRow = Counts & { country: string; quelle: string };
export type BounceStats = { tage: number; gesendet: number; bounces: number; klassen: Record<Klasse, number>; postfaecher: BoxRow[]; quellen: SourceRow[] };

/** Wie zustellbarkeit.py: Vorschlag ab 20 Mails und mehr als 5 % harten Bounces. */
export const QUELLE_MIN = 20;
export const QUELLE_HART = 0.05;

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export function normalize(raw: unknown): BounceStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<BounceStats>;
  const k = (r.klassen ?? {}) as Partial<Record<Klasse, number>>;
  return {
    tage: Number(r.tage ?? 7), gesendet: Number(r.gesendet ?? 0), bounces: Number(r.bounces ?? 0),
    klassen: { hart: Number(k.hart ?? 0), weich: Number(k.weich ?? 0), richtlinie: Number(k.richtlinie ?? 0), unbekannt: Number(k.unbekannt ?? 0) },
    postfaecher: Array.isArray(r.postfaecher) ? r.postfaecher : [],
    quellen: Array.isArray(r.quellen) ? r.quellen : [],
  };
}

/** Käufer-Quellen mit zu vielen harten Bounces (ab 20 Mails, > 5 %), schlechteste zuerst. */
export function badSources(st: BounceStats): (SourceRow & { quote_hart: number })[] {
  return st.quellen
    .filter((q) => q.gesendet >= QUELLE_MIN && q.hart / q.gesendet > QUELLE_HART)
    .map((q) => ({ ...q, quote_hart: q.hart / q.gesendet }))
    .sort((a, b) => b.quote_hart - a.quote_hart);
}

/** Kompakt für den JARVIS-Kontext (wenige Tokens): Zeichenketten statt verschachtelter Objekte, Quellen nur mit Bounces (≤ 4). */
export function bounceBrief(st: BounceStats | null): unknown {
  if (!st) return "nicht lesbar";
  if (!st.gesendet) return "keine Kaltmails in 7 Tagen";
  const schlecht = badSources(st).map((q) => `${q.country} · ${q.quelle}: ${pct(q.hart, q.gesendet)} % hart`);
  return {
    quote_7t: `${pct(st.bounces, st.gesendet)} % (${st.bounces}/${st.gesendet})`,
    klassen: KLASSEN.map((k) => `${k} ${st.klassen[k]}`).join(" · "),
    postfaecher: st.postfaecher.map((b) => `${b.box} ${pct(b.bounces, b.gesendet)} % von ${b.gesendet} (hart ${b.hart}, Richtl. ${b.richtlinie})`),
    quellen: st.quellen.filter((q) => q.bounces > 0).slice(0, 4).map((q) => `${q.country} · ${q.quelle} ${pct(q.bounces, q.gesendet)} % von ${q.gesendet} (hart ${q.hart})`),
    ...(schlecht.length ? { schlecht } : {}),
  };
}
