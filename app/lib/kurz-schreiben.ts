/**
 * Wenig Text überall (Inhaber 04.10.2026: „ich will einen klaren titel und dann eine kurze knappe und saubere
 * begründung haben, damit ich es direkt einordnen kann“). Kurzfassung beim SCHREIBEN von signalwerk.decisions:
 * kurz_titel ≤ 60 Zeichen (worum es geht), kurz_grund 1 Satz ≤ 160 Zeichen.
 *
 * Gleiche Regeln wie scripts/lib/kurz.py (gemeinsame Fälle: tests/fixtures/kurz_cases.json).
 * Fehlen die Spalten noch (Migration nicht angewandt, PostgREST PGRST204), wird ohne sie geschrieben.
 */

export const TITEL_MAX = 60;
export const GRUND_MAX = 160;
const KURZ_SPALTEN = ["kurz_titel", "kurz_grund"] as const;

const ZEIT = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const ZONE = String.raw`(?:UTC|MESZ|MEZ|CEST|CET)`;
const PRAEFIX = new RegExp(
  String.raw`^(?:(?:Gehirn-)?Sitzung(?:\s+\d{1,2}\.\d{1,2}\.(?:\d{2,4})?)?(?:\s*${ZEIT})?(?:\s*${ZONE})?\s*[:–-]\s*` +
    String.raw`|(?:Vorschlag|Notiz|Hinweis|Info)\s*:\s*)`,
  "i",
);
const ZEITSTEMPEL = new RegExp(
  String.raw`\s*(?:\b(?:um|seit|ab|bis)\s+)?~?\s*(?:\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\s+)?~?${ZEIT}(?:\s*${ZONE})?` +
    String.raw`|\s*\b${ZONE}\b`,
  "g",
);
const ISO = /\s*\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const KLAMMER = /\s*\([^()]*\)/g;
const ABK = new Set(["z", "b", "u", "a", "d", "h", "ca", "bzw", "inkl", "ggf", "evtl", "nr", "vgl", "usw", "etc", "max", "min",
  "mind", "bspw", "s", "st", "str", "dr", "mio", "mrd", "tsd", "vs", "abs", "art", "e", "i", "o", "v"]);

const glatt = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();
const stripChars = (t: string, chars: string, left = true) => {
  let a = 0, b = t.length;
  if (left) while (a < b && chars.includes(t[a])) a++;
  while (b > a && chars.includes(t[b - 1])) b--;
  return t.slice(a, b);
};

/** An Wortgrenze auf höchstens n Zeichen kürzen, mit „…“ wenn gekürzt. */
export function kuerzen(text: unknown, n: number): string {
  const t = glatt(text);
  if (t.length <= n) return t;
  let cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  if (sp >= Math.floor(n / 2)) cut = cut.slice(0, sp);
  return stripChars(cut, " ,;:–-(/~", false) + "…";
}

function ohneRauschen(text: string): string {
  let t = glatt(text);
  for (let i = 0; i < 2; i++) t = t.replace(PRAEFIX, "");
  t = t.replace(ISO, "").replace(ZEITSTEMPEL, "");
  for (let i = 0; i < 2; i++) {
    t = t.replace(KLAMMER, (m) => {
      const inner = m.trim().slice(1, -1);
      return /[\d=/%]/.test(inner) || inner.length > 25 ? "" : m;
    });
  }
  t = t.replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  return stripChars(t, " ,;–-");
}

function satzende(t: string): number {
  for (const m of t.matchAll(/[.!?](?=\s+[A-ZÄÖÜ0-9„"]|\s*$)/g)) {
    const i = m.index ?? 0;
    if (t[i] === ".") {
      const parts = t.slice(0, i).split(/[\s(]/);
      const wort = parts[parts.length - 1];
      if (/^[\d.,]*\d$/.test(wort) && /\d\.\d{1,2}$|^\d{1,2}$/.test(wort)) continue; // Datum „27.09.“
      if (ABK.has(wort.toLowerCase().replace(/\.+$/, "")) || (wort.length === 1 && /^\p{L}$/u.test(wort))) continue;
    }
    return i + 1;
  }
  return t.length;
}

function teile(t: string, n: number): string {
  if (t.length <= n) return t;
  const stuecke = t.split(/(?<=[,;])\s+|\s+(?=[–—]\s)/);
  let out = "";
  for (const s of stuecke) {
    const neu = out ? `${out} ${s}`.trim() : s;
    if (stripChars(neu, ",; –—", false).length > n) break;
    out = neu;
  }
  out = stripChars(out, ",; –—", false);
  return out.length >= Math.floor(n / 2) ? out : kuerzen(t, n);
}

/** Worum es geht, ≤ 60 Zeichen (ohne „Sitzung …:“/„Vorschlag:“, ohne Uhrzeiten; kurze Etiketten bleiben). */
export function kurzTitelText(text: unknown): string {
  let t = ohneRauschen(String(text ?? ""));
  if (!t) return "";
  t = t.slice(0, satzende(t)).replace(/\.+$/, "");
  const c = t.indexOf(":");
  if (c >= 0) {
    const kopf = t.slice(0, c);
    const rest = t.slice(c + 1).trim();
    t = kopf.length > 24 || !rest ? kopf.trim() : `${kopf.trim()}: ${rest.split(":")[0].trim()}`;
  }
  return teile(t, TITEL_MAX);
}

/** Ein klarer Satz, ≤ 160 Zeichen (ohne Uhrzeiten und Zahlenkaskaden in Klammern). */
export function kurzGrundText(text: unknown): string {
  const t = ohneRauschen(String(text ?? ""));
  if (!t) return "";
  return teile(t.slice(0, satzende(t)).trim(), GRUND_MAX);
}

type DecisionRow = { subject: string; reasoning: string; kurz_titel?: string | null; kurz_grund?: string | null } & Record<string, unknown>;

/** Zeile für decisions um kurz_titel/kurz_grund ergänzen (vorhandene Werte bleiben, werden aber begrenzt). */
export function mitKurz<T extends DecisionRow>(row: T): T {
  const titel = row.kurz_titel || kurzTitelText(row.subject);
  const grund = row.kurz_grund || kurzGrundText(row.reasoning);
  return { ...row, kurz_titel: kuerzen(titel, TITEL_MAX) || null, kurz_grund: kuerzen(grund, GRUND_MAX) || null };
}

type PgError = { code?: string; message?: string } | null;
type Inserter = { from: (t: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: PgError }> } };

/** Fehlt eine der neuen Spalten in der Datenbank (Migration noch nicht angewandt)? */
export function fehlendeSpalte(err: PgError): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return err.code === "PGRST204" || KURZ_SPALTEN.some((c) => msg.includes(c) && /column|Spalte/.test(msg));
}

/** decisions schreiben – mit Kurzfassung; fehlen die Spalten noch, ohne sie. Gibt den Fehler zurück (oder null). */
export async function insertDecision(sb: Inserter, row: DecisionRow): Promise<PgError> {
  const voll = mitKurz(row);
  const { error } = await sb.from("decisions").insert(voll);
  if (!fehlendeSpalte(error)) return error;
  const alt: Record<string, unknown> = { ...voll };
  for (const c of KURZ_SPALTEN) delete alt[c];
  return (await sb.from("decisions").insert(alt)).error;
}
