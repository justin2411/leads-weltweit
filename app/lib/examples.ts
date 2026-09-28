/**
 * Beispiel-Leads auf den Landingpages (Inhaber 28.09.2026: „bei den Beispielleads sehen alle Leads gleich aus“).
 * Reine Funktionen ohne Datenbank: Auswahl mit Vielfalt und Maskierung, die je Firma anders aussieht.
 *
 * Ehrlich bleiben: verdeckte Teile sind nie echte Zeichen im HTML (nur Platzhalter, weichgezeichnet); sichtbar sind
 * höchstens Anfangsbuchstaben, Rechtsform, Ländervorwahl und – falls bekannt – Rolle der Ansprechperson.
 * Keine Städte oder Regionen (landesweit, Inhaber 27.09.2026).
 */

/** Teil einer maskierten Angabe: sichtbar (m = false) oder verdeckter Platzhalter (m = true). */
export type Part = { t: string; m?: boolean };

export type Candidate = {
  id: string; name: string; signal?: string; urgency?: string; date?: string;
  /** Branchen-Gruppe (SIC-Abteilung) oder Rechtsform, damit die Beispiele aus verschiedenen Bereichen kommen */
  group?: string; web?: "none" | "found"; opener?: boolean;
  /** gleiche Meldung unter zwei Firmeneinträgen (z. B. gleiche Anzahl Stellen am selben Tag) */
  evKey?: string;
};

/** Kleiner deterministischer Zufall je Firma (gleiche Firma -> gleiche Maske bei jedem Aufruf). */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let x = seed || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
}
const LETTERS = "abcdefghiklmnoprstuvwy";
function filler(n: number, r: () => number, digits = false): string {
  let s = "";
  for (let i = 0; i < n; i++) s += digits ? String(Math.floor(r() * 10)) : LETTERS[Math.floor(r() * LETTERS.length)];
  return s;
}

const DAY = 864e5;
function days(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / DAY;
}

/**
 * Drei (bzw. n) möglichst verschiedene Beispiele: zuerst verschiedene Signale, dann verschiedene Branchen,
 * Prioritäten, Tage und Website-Befunde. Jede Firma höchstens einmal. Reihenfolge der Kandidaten = Aktualität.
 */
export function pickDiverse<T extends Candidate>(cands: T[], n = 3, salt = ""): T[] {
  const picked: T[] = [];
  const names = new Set<string>(), ids = new Set<string>(), evs = new Set<string>();
  const pool = cands.filter((c) => {
    const nm = c.name.trim().toLowerCase();
    if (ids.has(c.id) || names.has(nm) || (c.evKey && evs.has(c.evKey))) return false;
    ids.add(c.id); names.add(nm); if (c.evKey) evs.add(c.evKey);
    return true;
  });
  const used = new Set<T>();
  const newest = pool.reduce((m, c) => (c.date && c.date > m ? c.date : m), "");
  while (picked.length < n) {
    let best: T | undefined, bestScore = -Infinity;
    pool.forEach((c, rank) => {
      if (used.has(c)) return;
      let s = -Math.min(rank, 200) * 0.02; // neuere zuerst, aber Vielfalt zählt mehr
      if (salt) s += (seedOf(salt + c.id) % 1000) / 50; // je Zielgruppe andere Firmen (bis 20 Punkte)
      // sehr alte Meldungen wirken nicht frisch
      const age = c.date && newest ? days(c.date, newest) : 0;
      if (age > 90) s -= 40 + Math.min(age, 2000) / 10;
      if (!picked.some((p) => p.signal === c.signal)) s += 100;
      if (c.group && !picked.some((p) => p.group === c.group)) s += 40;
      if (!c.group) s -= 10;
      if (c.urgency && !picked.some((p) => p.urgency === c.urgency)) s += 25;
      if (c.urgency === "low") s -= 30;
      if (!picked.length && c.urgency === "high") s += 20;
      if (c.date && picked.every((p) => days(p.date, c.date) >= 3)) s += 35;
      else if (c.date && picked.every((p) => p.date !== c.date)) s += 12;
      if (c.web && !picked.some((p) => p.web === c.web)) s += 15;
      if (c.opener) s += 10;
      if (s > bestScore) { bestScore = s; best = c; }
    });
    if (!best) break;
    used.add(best); picked.push(best);
  }
  return picked;
}

/** Registernamen in GROSSBUCHSTABEN lesbar machen. */
export function niceName(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_, a, c) => a + c.toUpperCase())
    .replace(/\b(Llp|Plc|Llc|Sas|Sasu|Sarl|Eurl|Sci|Snc)\b/g, (m) => m.toUpperCase());
}

const SUFFIX = /(,?\s+(?:ltd\.?|limited|llp|plc|llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|co\.|sas|sasu|sarl|eurl|sa|snc|gmbh))$/i;

/** Firmenname: erste Buchstaben sichtbar, Rest als Platzhalter gleicher Wortlängen, Rechtsform sichtbar. */
export function maskCompany(name: string, seed = seedOf(name)): Part[] {
  const n = niceName(name.trim());
  const suf = n.match(SUFFIX)?.[1] ?? "";
  const core = n.slice(0, n.length - suf.length).trim() || n;
  const r = rng(seed);
  const words = core.split(/\s+/).filter(Boolean).slice(0, 4);
  const first = words[0] ?? "";
  const show = first.length >= 6 ? 2 : 1;
  const out: Part[] = [{ t: first.slice(0, show) }];
  const rest = [first.slice(show).length, ...words.slice(1).map((w) => w.length)]
    .map((len) => filler(Math.max(2, Math.min(12, len)), r));
  out.push({ t: rest.join(" "), m: true });
  if (suf) out.push({ t: suf.replace(/^,/, "") });
  return out;
}

const PHONE_FORMAT: Record<string, { cc: string; groups: number[][] }> = {
  UK: { cc: "+44", groups: [[4, 6], [2, 4, 4], [3, 3, 4]] },
  US: { cc: "+1", groups: [[3, 3, 4]] },
  FR: { cc: "+33", groups: [[1, 2, 2, 2, 2]] },
  IE: { cc: "+353", groups: [[2, 3, 4], [1, 3, 4]] },
  NL: { cc: "+31", groups: [[2, 3, 4], [3, 6]] },
};

/**
 * Telefon: echte Ländervorwahl sichtbar; ist die Nummer bekannt, auch die ersten zwei Ziffern (Vorwahl-Anfang),
 * sonst alles verdeckt. Gruppierung je Land und Firma verschieden.
 */
export function maskPhone(country: string, seed: number, real?: string): Part[] {
  const f = PHONE_FORMAT[country] ?? { cc: "+", groups: [[3, 3, 4]] };
  const r = rng(seed);
  const digits = (real ?? "").replace(/\D/g, "");
  const national = digits.startsWith(f.cc.slice(1)) ? digits.slice(f.cc.length - 1) : "";
  if (national.length >= 6) {
    // echte Nummer: Gruppierung des Landes, nur die ersten zwei Ziffern sichtbar, der Rest Platzhalter
    const g = f.groups.find((x) => x.reduce((a, b) => a + b, 0) === national.length) ?? [2, national.length - 2];
    let shown = "", hidden = "", pos = 0;
    for (const k of g) {
      for (let j = 0; j < k; j++, pos++) {
        const sep = j === 0 && pos > 0 ? " " : "";
        if (pos < 2) shown += sep + national[pos];
        else hidden += sep + String(Math.floor(r() * 10));
      }
    }
    return [{ t: `${f.cc} ${shown}` }, { t: hidden, m: true }];
  }
  const g = f.groups[Math.floor(r() * f.groups.length)];
  return [{ t: f.cc }, { t: " " }, { t: g.map((k) => filler(k, r, true)).join(" "), m: true }];
}

const TLD: Record<string, string> = { UK: "co.uk", US: "com", FR: "fr", IE: "ie", NL: "nl" };
const GENERIC = /^(info|contact|hello|office|admin|enquiries|enquiry|mail|bonjour|accueil|team|sales)$/i;

/**
 * E-Mail: Domain aus dem Firmennamen bzw. der echten Adresse abgeleitet – erster Buchstabe und Endung sichtbar,
 * Rest verdeckt; Sammelpostfächer (info@, contact@) dürfen sichtbar sein, persönliche Teile nie.
 */
export function maskEmail(company: string, country: string, seed: number, real?: string): Part[] {
  const r = rng(seed ^ 0x5bd1e995);
  const m = /^([^@\s]+)@([^@\s]+)$/.exec((real ?? "").trim().toLowerCase());
  if (m) {
    const [, local, domain] = m;
    const dot = domain.search(/\.(co\.uk|com|fr|ie|nl|org|net|io|uk|us|eu)$/);
    const base = dot > 0 ? domain.slice(0, dot) : domain.split(".")[0];
    const tld = dot > 0 ? domain.slice(dot) : domain.slice(base.length);
    const loc: Part = GENERIC.test(local) ? { t: local } : { t: filler(Math.max(3, Math.min(6, local.length)), r), m: true };
    return [loc, { t: "@" + base.slice(0, 1) }, { t: filler(Math.max(3, Math.min(10, base.length - 1)), r), m: true }, { t: tld }];
  }
  const core = niceName(company).replace(SUFFIX, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const first = core.slice(0, 1) || "x";
  const len = Math.max(4, Math.min(10, core.length - 1));
  return [{ t: filler(3 + Math.floor(r() * 3), r), m: true }, { t: "@" + first }, { t: filler(len, r), m: true },
    { t: "." + (TLD[country] ?? "com") }];
}

/** Rechtsform kurz (Register schreiben sie lang: "DOMESTIC LIMITED LIABILITY COMPANY", "Société par actions simplifiée"). */
export function shortForm(form: string | undefined, name = ""): string | undefined {
  const f = `${form ?? ""} ${name}`.toLowerCase();
  if (/société civile immobilière|\bsci\b/.test(f)) return "SCI";
  if (/à associé unique|sasu/.test(f) && /actions simplifiée|sasu/.test(f)) return "SASU";
  if (/actions simplifiée|\bsas\b/.test(f)) return "SAS";
  if (/responsabilité limitée|sarl|eurl/.test(f)) return /unipersonnelle|eurl/.test(f) ? "EURL" : "SARL";
  if (/limited liability partnership|\bllp\b/.test(f)) return "LLP";
  if (/limited partnership/.test(f)) return "LP";
  if (/not-for-profit/.test(f)) return "Non-profit";
  if (/limited liability company|\bllc\b|l\.l\.c/.test(f)) return "LLC";
  if (/corporation|\binc\b|\bcorp\b/.test(f)) return "Corporation";
  if (/\bplc\b/.test(f)) return "PLC";
  if (/\bltd\b|limited/.test(f)) return "Ltd";
  return undefined;
}

/**
 * Wen man verlangt: die Rolle aus dem Register (falls bekannt), sonst die gesetzliche Vertretung der Rechtsform
 * (Ltd -> Director, LLC -> Managing member, SAS -> Président, SARL -> Gérant). Nie ein erfundener Name.
 */
export function roleFor(country: string, form: string | undefined, known: string | undefined, lang: string): string {
  const k = (known ?? "").trim();
  if (k) return k.split(/[,(]| et | de SAS\b/)[0].trim();
  const s = shortForm(form);
  if (lang === "fr" || country === "FR") {
    if (s === "SAS" || s === "SASU") return "Président";
    if (s === "SARL" || s === "EURL" || s === "SCI") return "Gérant";
    return "Dirigeant";
  }
  if (s === "LLC") return "Managing member";
  if (s === "LLP") return "Designated member";
  if (s === "Ltd" || s === "PLC") return "Director";
  return "Owner";
}

const MONTH_FR: Record<string, string> = {
  January: "janvier", February: "février", March: "mars", April: "avril", May: "mai", June: "juin", July: "juillet",
  August: "août", September: "septembre", October: "octobre", November: "novembre", December: "décembre",
};

/** Stellen-Signale werden englisch erzeugt (scripts/lib/signals.py); auf französischen Seiten übersetzen. */
export function localizeJob(text: string, lang: string): string {
  if (lang !== "fr") return text;
  let m = /^Role “(.+)” open for (\d+) days$/.exec(text);
  if (m) return `Poste « ${m[1]} » ouvert depuis ${m[2]} jours`;
  m = /^(\d+) open roles at the same time on the careers page$/.exec(text);
  if (m) return `${m[1]} postes ouverts en même temps sur la page carrières`;
  m = /^I noticed (.+) has been advertising the (.+) role since (\w+) (\d{4})\. Is that still a position you are looking to fill\?$/.exec(text);
  if (m) return `J'ai vu que ${m[1]} cherche un profil « ${m[2]} » depuis ${MONTH_FR[m[3]] ?? m[3]} ${m[4]}. Ce poste est-il toujours à pourvoir ?`;
  m = /^(.+) currently lists (\d+) open roles on its careers page\. Are you handling all of that hiring in-house\?$/.exec(text);
  if (m) return `${m[1]} affiche actuellement ${m[2]} postes ouverts sur sa page carrières. Gérez-vous tous ces recrutements en interne ?`;
  return text;
}
