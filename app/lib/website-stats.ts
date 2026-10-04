/**
 * Website-Auswertung (Inhaber 04.10.2026: „grafiken zu den websitenaufrufen … heatmaps … performance der website“).
 * Reine Funktionen ohne Next/Supabase – gemeinsam für Browser-Messung (tracker.tsx), Annahme (/api/events),
 * Dashboard (/dashboard/website/auswertung) und JARVIS-Linie „Website“.
 *
 * Datenschutz (CLAUDE.md §2, app/content/legal.ts Abschnitt 5): keine Cookies, keine IP, keine vollständige
 * Referrer-Adresse (nur die Herkunftsart), keine Formulareingaben, keine Kennung über den einzelnen Seitenaufruf hinaus.
 * Keine Öffnungsmessung von Mails – nur Klicks aus Mails (Link-Parameter ?src=mail&sv=A|B).
 */

// ------------------------------------------------------------------ Messung (Browser + Annahme)

export type Source = "mail" | "direkt" | "suche" | "andere";
export type Device = "mobil" | "desktop";
export type ElKind = "cta" | "button" | "link" | "faq" | "video" | "feld" | "flaeche";
export type Dwell = "0-10" | "10-30" | "30-60" | "60-180" | "180+";

export const SOURCES: Source[] = ["mail", "direkt", "suche", "andere"];
export const DEVICES: Device[] = ["desktop", "mobil"];
export const DEPTHS = [25, 50, 75, 100] as const;
export const DWELLS: Dwell[] = ["0-10", "10-30", "30-60", "60-180", "180+"];
export const EL_KINDS: ElKind[] = ["cta", "button", "link", "faq", "video", "feld", "flaeche"];

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|qwant|yandex|baidu|startpage|search\.brave|brave|naver|seznam|you|perplexity)\.[a-z.]+$/i;
const WEBMAIL = /(^|\.)(mail\.google\.com|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.aol\.com|webmail\.[a-z0-9-]+\.[a-z.]+|mail\.proton\.me|icloud\.com|mail\.zoho\.[a-z.]+|mail\.gmx\.[a-z.]+|navigator\.web\.de)$/i;

/** Nur der Hostname eines Referrers (nie Pfad oder Parameter); leer bei ungültigem Wert. */
export function refHost(referrer: string | null | undefined): string {
  try {
    return referrer ? new URL(referrer).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

/**
 * Herkunftsart aus dem Link-Parameter src (unsere Mails) bzw. der Referrer-Domain:
 * src=mail oder Webmail-Domain → mail; Suchmaschine → suche; kein Referrer oder eigene Domain → direkt; sonst andere.
 */
export function sourceOf(srcParam: string | null | undefined, referrerHost: string, ownHost: string): Source {
  if ((srcParam ?? "").toLowerCase() === "mail") return "mail";
  const h = (referrerHost || "").toLowerCase().replace(/^www\./, "");
  const own = (ownHost || "").toLowerCase().split(":")[0].replace(/^www\./, "");
  if (!h || h === own) return "direkt";
  if (WEBMAIL.test(h)) return "mail";
  if (SEARCH.test(h)) return "suche";
  return "andere";
}

/** Betreff-Variante aus ?sv= (nur A/B, sonst nichts). */
export function subjectOf(sv: string | null | undefined): "A" | "B" | null {
  const x = (sv ?? "").toUpperCase();
  return x === "A" || x === "B" ? x : null;
}

/** Gerät grob: Touch-Bedienung oder schmaler Bildschirm = mobil. */
export function deviceOf(width: number, coarsePointer: boolean): Device {
  return coarsePointer || width < 820 ? "mobil" : "desktop";
}

/** Klickposition in Prozent, auf 2 % gerundet (abgerundet), 0 … 98. */
export function bin2(pos: number, size: number): number {
  if (!(size > 0) || !Number.isFinite(pos)) return 0;
  const p = Math.max(0, Math.min(99.999, (pos / size) * 100));
  return Math.floor(p / 2) * 2;
}

/** Größte Scrolltiefe als Stufe 0/25/50/75/100 (sichtbarer Anteil der Seite). */
export function depthBucket(scrollBottom: number, pageHeight: number): 0 | 25 | 50 | 75 | 100 {
  if (!(pageHeight > 0)) return 0;
  const r = scrollBottom / pageHeight;
  if (r >= 0.97) return 100;
  if (r >= 0.75) return 75;
  if (r >= 0.5) return 50;
  if (r >= 0.25) return 25;
  return 0;
}

/** Verweildauer (sichtbare Zeit) als Stufe. */
export function dwellBucket(ms: number): Dwell {
  const s = ms / 1000;
  return s < 10 ? "0-10" : s < 30 ? "10-30" : s < 60 ? "30-60" : s < 180 ? "60-180" : "180+";
}

/**
 * Beschriftung eines Knopfs/Links für die Klickziel-Liste: Seitentext, gekürzt auf 40 Zeichen. Alles, was nach
 * persönlichen Daten aussieht (@, lange Ziffernfolgen), fällt weg – nie Formulareingaben.
 */
export function cleanLabel(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || /@/.test(s) || /\d{4,}/.test(s) || /https?:|www\./i.test(s)) return null;
  return s.length > 40 ? s.slice(0, 39).trimEnd() + "…" : s;
}

export const isUuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

const BOT = /bot\b|bot\/|crawl|spider|slurp|scrap|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|whatsapp|telegram|slack|discord|skype|linkchecker|validator|python|curl|wget|httpclient|okhttp|go-http|java\/|axios|node-fetch|undici|libwww|feedfetcher|mediapartners|google-inspectiontool|apis-google|bingpreview|yandex|baidu|petal|semrush|ahrefs|mj12|dotbot|barracuda|mimecast|proofpoint|safelinks|symantec|forcepoint|trendmicro|ironport|cloudmark/i;

/** Automatische Abrufe (Suchmaschinen, Link-Prüfer der Mail-Sicherheit, Vorschauen, Skripte) zählen nicht. */
export function isBot(ua: string | null | undefined): boolean {
  const s = String(ua ?? "");
  if (s.length < 20) return true; // kein oder verdächtig kurzer User-Agent
  return BOT.test(s);
}

export type Beacon =
  | { kind: "legacy"; variant_id: string; type: "view" | "cta_click" }
  | { kind: "view"; variant_id: string; pv: string; src: Source; subj: "A" | "B" | null; device: Device; ref: string | null; um?: string | null; uc?: string | null }
  | { kind: "click"; variant_id: string; pv: string; x: number; y: number; el: ElKind; label: string | null; device: Device; cta: boolean }
  | { kind: "end"; variant_id: string; pv: string; depth: 0 | 25 | 50 | 75 | 100; dwell: Dwell; ds: number | null }
  /** Aufruf der Tarifseite /[country]/[segment]/start (älterer Beacon, nur eindeutige Besucher) */
  | { kind: "visit"; variant_id: string; page: "tarif" }
  /** Trichter-Aufruf (Startseite, Tarif, Danke): Stufe, Gerät, Herkunft; Startseite ohne Variante */
  | { kind: "hit"; stage: HitStage; variant_id: string | null; pv: string; src: Source; ref: string | null; device: Device; um?: string | null; uc?: string | null }
  /** Ende eines Trichter-Aufrufs: sichtbare Sekunden und Scrolltiefe */
  | { kind: "hit_end"; pv: string; ds: number; depth: 0 | 25 | 50 | 75 | 100 }
  /** Zählung ohne Kennung: CTA, Formular begonnen/abgeschickt, Video gestartet/zu Ende */
  | { kind: "ev"; stage: EvStage; variant_id: string | null; pv: string; ev: EvKind }
  /** Core Web Vitals eines Aufrufs (Messwerte ohne Kennung): LCP/INP in ms, CLS × 1000 */
  | { kind: "vitals"; stage: EvStage; variant_id: string | null; pv: string; device: Device; lcp: number | null; inp: number | null; cls: number | null };

export type EvStage = "start" | "landing" | "tarif" | "danke";
export type EvKind = "cta" | "form_start" | "form_submit" | "video_start" | "video_done";
const EV_STAGES: EvStage[] = ["start", "landing", "tarif", "danke"];
export const EV_KINDS: EvKind[] = ["cta", "form_start", "form_submit", "video_start", "video_done"];

/** utm_medium / utm_campaign bereinigt: nur [a-z0-9._-], höchstens 40 Zeichen, sonst null. */
export function utmKey(x: string | null | undefined): string | null {
  const s = String(x ?? "").slice(0, 80).toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+/, "").slice(0, 40);
  return s || null;
}
const UTM_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;

export type Browser = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "opera" | "andere";
/** Browserfamilie aus dem User-Agent (nur die Klasse wird gespeichert, nie der User-Agent selbst). */
export function browserOf(ua: string | null | undefined): Browser {
  const s = String(ua ?? "");
  if (/SamsungBrowser/i.test(s)) return "samsung";
  if (/OPR\/|Opera/i.test(s)) return "opera";
  if (/Edg(e|A|iOS)?\//i.test(s)) return "edge";
  if (/Firefox\/|FxiOS/i.test(s)) return "firefox";
  if (/Chrome\/|CriOS|Chromium/i.test(s)) return "chrome";
  if (/Safari\//i.test(s) && /Version\//i.test(s)) return "safari";
  return "andere";
}

/** Stufen, die der Browser meldet (Landingpage über „view“, Stripe serverseitig in /api/checkout). */
export type HitStage = "start" | "tarif" | "danke";
const HIT_STAGES: HitStage[] = ["start", "tarif", "danke"];

/**
 * Herkunfts-Kennung für den Trichter: utm_source (falls gesetzt) oder die Domain der vorherigen Seite – nie Pfad oder
 * Parameter. Eigene Domain → null. Nur [a-z0-9._-], höchstens 60 Zeichen.
 */
export function refKey(utmSource: string | null | undefined, referrerHost: string, ownHost: string): string | null {
  const clean = (x: string) => x.toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+/, "").slice(0, 60);
  const u = clean(String(utmSource ?? "").slice(0, 80));
  if (u) return u;
  const h = clean((referrerHost || "").replace(/^www\./i, ""));
  const own = (ownHost || "").toLowerCase().split(":")[0].replace(/^www\./, "");
  return h && h !== own ? h : null;
}

const REF_RE = /^[a-z0-9][a-z0-9._-]{0,59}$/;
/** utm_medium/utm_campaign aus dem Beacon (nur gültige, bereinigte Werte; fehlen sie, kommen keine Felder dazu). */
function utms(b: Record<string, unknown>): { um?: string; uc?: string } {
  const out: { um?: string; uc?: string } = {};
  if (typeof b.um === "string" && UTM_RE.test(b.um)) out.um = b.um;
  if (typeof b.uc === "string" && UTM_RE.test(b.uc)) out.uc = b.uc;
  return out;
}

const int = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) ? x : null);

/** Prüft ein Ereignis aus dem Browser streng; alles Unbekannte → null (wird verworfen). */
export function parseBeacon(body: unknown): Beacon | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const t = b.type;
  const devOk = DEVICES.includes(b.dev as Device) ? (b.dev as Device) : null;
  if (t === "hit") {
    const stage = b.st as HitStage;
    if (!HIT_STAGES.includes(stage) || !isUuid(b.pv) || !devOk || !SOURCES.includes(b.src as Source)) return null;
    const vid = b.variant_id === undefined || b.variant_id === null ? null : isUuid(b.variant_id) ? b.variant_id.toLowerCase() : undefined;
    if (vid === undefined || (stage !== "start" && !vid)) return null;
    const ref = typeof b.ref === "string" && REF_RE.test(b.ref) ? b.ref : null;
    return { kind: "hit", stage, variant_id: vid, pv: (b.pv as string).toLowerCase(), src: b.src as Source, ref, device: devOk, ...utms(b) };
  }
  if (t === "ev" || t === "vitals") {
    const stage = b.st as EvStage;
    if (!EV_STAGES.includes(stage) || !isUuid(b.pv)) return null;
    const vid = b.variant_id === undefined || b.variant_id === null ? null : isUuid(b.variant_id) ? b.variant_id.toLowerCase() : undefined;
    if (vid === undefined || (stage !== "start" && !vid)) return null;
    const pv = (b.pv as string).toLowerCase();
    if (t === "ev") return EV_KINDS.includes(b.k as EvKind) ? { kind: "ev", stage, variant_id: vid, pv, ev: b.k as EvKind } : null;
    const ms = (x: unknown, max: number) => { const n = int(x); return n === null || n < 0 ? null : Math.min(n, max); };
    const lcp = ms(b.lcp, 60000), inp = ms(b.inp, 60000), cls = ms(b.cls, 10000);
    if (!devOk || (lcp === null && inp === null && cls === null)) return null;
    return { kind: "vitals", stage, variant_id: vid, pv, device: devOk, lcp, inp, cls };
  }
  if (t === "hit_end") {
    const ds = int(b.ds), depth = int(b.depth);
    if (!isUuid(b.pv) || ds === null || ds < 0 || depth === null || ![0, 25, 50, 75, 100].includes(depth)) return null;
    return { kind: "hit_end", pv: (b.pv as string).toLowerCase(), ds: Math.min(ds, 1800), depth: depth as 0 | 25 | 50 | 75 | 100 };
  }
  const variant_id = b.variant_id;
  if (!isUuid(variant_id)) return null;
  if ((t === "view" || t === "cta_click") && b.pv === undefined) return { kind: "legacy", variant_id: variant_id.toLowerCase(), type: t };
  if (t === "visit") return b.pg === "tarif" ? { kind: "visit", variant_id: variant_id.toLowerCase(), page: "tarif" } : null;
  if (!isUuid(b.pv)) return null;
  const pv = (b.pv as string).toLowerCase();
  const device = devOk;
  if (t === "view") {
    if (!SOURCES.includes(b.src as Source) || !device) return null;
    const subj = b.src === "mail" ? subjectOf(typeof b.sv === "string" ? b.sv : null) : null;
    const ref = typeof b.ref === "string" && REF_RE.test(b.ref) ? b.ref : null;
    return { kind: "view", variant_id: variant_id.toLowerCase(), pv, src: b.src as Source, subj, device, ref, ...utms(b) };
  }
  if (t === "click") {
    const x = int(b.x), y = int(b.y);
    if (x === null || y === null || x < 0 || x > 98 || y < 0 || y > 98 || x % 2 || y % 2 || !device) return null;
    if (!EL_KINDS.includes(b.el as ElKind)) return null;
    const el = b.el as ElKind;
    const label = el === "feld" || el === "flaeche" ? null : cleanLabel(typeof b.label === "string" ? b.label : null);
    return { kind: "click", variant_id: variant_id.toLowerCase(), pv, x, y, el, label, device, cta: b.cta === true || el === "cta" };
  }
  if (t === "end") {
    const depth = int(b.depth);
    if (depth === null || ![0, 25, 50, 75, 100].includes(depth) || !DWELLS.includes(b.dwell as Dwell)) return null;
    const ds = int(b.ds);
    return { kind: "end", variant_id: variant_id.toLowerCase(), pv, depth: depth as 0 | 25 | 50 | 75 | 100, dwell: b.dwell as Dwell,
             ds: ds === null || ds < 0 ? null : Math.min(ds, 1800) };
  }
  return null;
}

/**
 * Begrenzung je Server-Instanz ohne IP: höchstens perView Ereignisse je Seitenaufruf-ID und global perSecond pro
 * Sekunde. Der Zustand lebt nur im Speicher und wird alle windowMs geleert.
 */
export class RateLimiter {
  private views = new Map<string, number>();
  private resetAt = 0;
  private sec = 0;
  private secN = 0;
  private perView: number;
  private perSecond: number;
  private windowMs: number;
  constructor(perView = 120, perSecond = 200, windowMs = 10 * 60_000) {
    this.perView = perView;
    this.perSecond = perSecond;
    this.windowMs = windowMs;
  }
  allow(pv: string | null, now: number = Date.now()): boolean {
    if (now >= this.resetAt) { this.views.clear(); this.resetAt = now + this.windowMs; }
    const s = Math.floor(now / 1000);
    if (s !== this.sec) { this.sec = s; this.secN = 0; }
    if (++this.secN > this.perSecond) return false;
    if (!pv) return true;
    const n = (this.views.get(pv) ?? 0) + 1;
    this.views.set(pv, n);
    return n <= this.perView;
  }
}

// ------------------------------------------------------------------ Auswertung (Dashboard)

export type Row = { d: string; s: string; m: string; k: string; n: number };
export type HeatRow = { s: string; m: "hm" | "tg"; k: string; n: number };
export type SentRow = { c: string; g: string; v: string; n: number };
export type PageRow = { s: string; g: string; c: string; st: string };
export type WebsiteStats = { now: string; days: number; since: string; today: string; rows: Row[]; heat: HeatRow[]; sent: SentRow[]; pages: PageRow[] };

export type Filter = { country: string | null; page: string | null; device: Device };

export const countryOfSlug = (slug: string) => slug.slice(0, 2).toUpperCase();
const inFilter = (slug: string, f: Pick<Filter, "country" | "page">) =>
  (!f.page || slug === f.page) && (!f.country || countryOfSlug(slug) === f.country);

/** Alle Tage von since bis today (YYYY-MM-DD), auch ohne Daten. */
export function dayRange(since: string, today: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${since}T12:00:00Z`), end = Date.parse(`${today}T12:00:00Z`); t <= end && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Zählungen des Zeitraums. Trichter (wie die JARVIS-Linie): land → tarif → checkout (Stripe) → buy (Danke).
 * land/tarif = eindeutige Besucher je Tag (Hash ohne Cookies, Summe der Tage); views = Aufrufe gesamt der Landingpages.
 */
export type Funnel = { views: number; cta: number; req: number; buy: number; checkout: number; land: number; tarif: number; tarifViews: number };
export type View = {
  days: string[];
  /** Aufrufe je Tag und Land (page_events „view“) */
  perDay: { day: string; byCountry: Record<string, number>; total: number }[];
  countries: string[];
  funnel: Funnel;
  /** gemessene Aufrufe mit Herkunft/Gerät/Scrolltiefe (erst seit der neuen Messung) */
  tracked: number;
  sources: Record<Source, number>;
  devices: Record<Device, number>;
  /** Anteil der gemessenen Aufrufe, die mindestens diese Tiefe erreichten */
  depth: { at: number; n: number; share: number }[];
  dwell: { k: Dwell; n: number }[];
  /** Mail-Klicks (Aufrufe mit src=mail) je Land und Betreff-Variante, dazu gesendete Mails */
  mail: { country: string; A: number; B: number; other: number; sentA: number; sentB: number; sentOther: number }[];
  heat: { x: number; y: number; n: number }[];
  heatMax: number;
  heatTotal: number;
  targets: { el: ElKind; label: string; n: number; share: number }[];
};

const n0 = () => ({ mail: 0, direkt: 0, suche: 0, andere: 0 }) as Record<Source, number>;

/** Bereitet die Tagessummen für die Grafiken auf (gefiltert nach Land/Seite, Heatmap nach Gerät). */
export function buildView(st: WebsiteStats, f: Filter): View {
  const days = dayRange(st.since, st.today);
  const rows = st.rows.filter((r) => inFilter(r.s, f) && r.d >= st.since);
  const per = new Map<string, Record<string, number>>();
  const countries = new Set<string>();
  const funnel: Funnel = { views: 0, cta: 0, req: 0, buy: 0, checkout: 0, land: 0, tarif: 0, tarifViews: 0 };
  const sources = n0();
  const devices = { mobil: 0, desktop: 0 } as Record<Device, number>;
  const depthN = new Map<number, number>();
  const dwellN = new Map<string, number>();
  const mailBy = new Map<string, { A: number; B: number; other: number }>();
  let tracked = 0;
  for (const r of rows) {
    const n = Number(r.n) || 0;
    const c = countryOfSlug(r.s);
    if (r.m === "pe") {
      if (r.k === "view") {
        const m = per.get(r.d) ?? {};
        m[c] = (m[c] ?? 0) + n;
        per.set(r.d, m);
        countries.add(c);
        funnel.views += n;
      } else if (r.k === "cta_click") funnel.cta += n;
      else if (r.k === "sample_request") funnel.req += n;
      else if (r.k === "purchase") funnel.buy += n;
      else if (r.k === "checkout_started") funnel.checkout += n;
    } else if (r.m === "uv") {
      if (r.k === "landing") funnel.land += n;
      else if (r.k === "tarif") funnel.tarif += n;
    } else if (r.m === "av") {
      if (r.k === "tarif") funnel.tarifViews += n;
    } else if (r.m === "tv") tracked += n;
    else if (r.m === "src" && SOURCES.includes(r.k as Source)) sources[r.k as Source] += n;
    else if (r.m === "dev" && DEVICES.includes(r.k as Device)) devices[r.k as Device] += n;
    else if (r.m === "depth") depthN.set(Number(r.k), (depthN.get(Number(r.k)) ?? 0) + n);
    else if (r.m === "dwell") dwellN.set(r.k, (dwellN.get(r.k) ?? 0) + n);
    else if (r.m === "mail") {
      const x = mailBy.get(c) ?? { A: 0, B: 0, other: 0 };
      if (r.k === "A" || r.k === "B") x[r.k] += n; else x.other += n;
      mailBy.set(c, x);
    }
  }
  const order = (a: string, b: string) => (ORDER_C.indexOf(a) + 99 * Number(!ORDER_C.includes(a))) - (ORDER_C.indexOf(b) + 99 * Number(!ORDER_C.includes(b))) || a.localeCompare(b);
  const cs = [...countries].sort(order);
  const perDay = days.map((day) => {
    const byCountry = per.get(day) ?? {};
    return { day, byCountry, total: Object.values(byCountry).reduce((a, b) => a + b, 0) };
  });
  const depth = DEPTHS.map((at) => {
    const n = [...depthN].filter(([k]) => k >= at).reduce((a, [, v]) => a + v, 0);
    return { at, n, share: tracked ? n / tracked : 0 };
  });
  const dwell = DWELLS.map((k) => ({ k, n: dwellN.get(k) ?? 0 }));
  // Mails: gesendete je Land/Variante (alle Zielgruppen der gefilterten Seite bzw. des Landes)
  const segs = f.page ? new Set(st.pages.filter((p) => p.s === f.page).map((p) => p.g)) : null;
  const sentBy = new Map<string, { A: number; B: number; other: number }>();
  for (const s of st.sent) {
    if (f.country && s.c !== f.country) continue;
    if (f.page && (s.c !== countryOfSlug(f.page) || (segs && !segs.has(s.g)))) continue;
    const x = sentBy.get(s.c) ?? { A: 0, B: 0, other: 0 };
    if (s.v === "A" || s.v === "B") x[s.v] += s.n; else x.other += s.n;
    sentBy.set(s.c, x);
  }
  const mailCs = [...new Set([...mailBy.keys(), ...sentBy.keys()])].sort(order);
  const mail = mailCs.map((country) => {
    const m = mailBy.get(country) ?? { A: 0, B: 0, other: 0 }, s = sentBy.get(country) ?? { A: 0, B: 0, other: 0 };
    return { country, A: m.A, B: m.B, other: m.other, sentA: s.A, sentB: s.B, sentOther: s.other };
  });
  const { cells, max, total } = heatCells(st.heat, f);
  return { days, perDay, countries: cs, funnel, tracked, sources, devices, depth, dwell, mail, heat: cells, heatMax: max, heatTotal: total, targets: topTargets(st.heat, f) };
}

const ORDER_C = ["US", "UK", "FR"];

/** Heatmap-Felder (x/y in 2-%-Schritten) einer Seite bzw. aller gefilterten Seiten für ein Gerät. */
export function heatCells(heat: HeatRow[], f: Filter): { cells: { x: number; y: number; n: number }[]; max: number; total: number } {
  const m = new Map<string, number>();
  for (const h of heat) {
    if (h.m !== "hm" || !inFilter(h.s, f)) continue;
    const [dev, xs, ys] = h.k.split("|");
    if (dev !== f.device) continue;
    const x = Number(xs), y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    m.set(`${x}|${y}`, (m.get(`${x}|${y}`) ?? 0) + h.n);
  }
  const cells = [...m].map(([k, n]) => { const [x, y] = k.split("|").map(Number); return { x, y, n }; }).sort((a, b) => b.n - a.n);
  return { cells, max: cells.reduce((a, c) => Math.max(a, c.n), 0), total: cells.reduce((a, c) => a + c.n, 0) };
}

/**
 * Dichte für die Wärmepunkte: jedes Feld zählt mit seinen Nachbarn (Abstand ≤ 2 Felder, gewichtet), damit einzelne
 * Klicks nicht als harte Punkte erscheinen. Ergebnis 0…1 je Feld (1 = heißeste Stelle).
 */
export function density(cells: { x: number; y: number; n: number }[]): { x: number; y: number; n: number; w: number }[] {
  const at = new Map(cells.map((c) => [`${c.x}|${c.y}`, c.n]));
  const W = [1, 0.5, 0.2];
  const raw = cells.map((c) => {
    let s = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      s += (at.get(`${c.x + dx * 2}|${c.y + dy * 2}`) ?? 0) * W[d];
    }
    return { ...c, s };
  });
  const max = raw.reduce((a, c) => Math.max(a, c.s), 0);
  return raw.map(({ s, ...c }) => ({ ...c, w: max ? s / max : 0 }));
}

const EL_LABEL: Record<ElKind, string> = { cta: "Probe-Knopf", button: "Knopf", link: "Link", faq: "FAQ", video: "Video", feld: "Formularfeld", flaeche: "freie Fläche" };
export const elLabel = (k: ElKind) => EL_LABEL[k] ?? k;

/** Häufigste Klickziele (Art + Beschriftung) für das gewählte Gerät, höchstens n. */
export function topTargets(heat: HeatRow[], f: Filter, n = 8): View["targets"] {
  const m = new Map<string, { el: ElKind; label: string; n: number }>();
  let total = 0;
  for (const h of heat) {
    if (h.m !== "tg" || !inFilter(h.s, f)) continue;
    const [dev, el, ...rest] = h.k.split("|");
    if (dev !== f.device || !EL_KINDS.includes(el as ElKind)) continue;
    const label = rest.join("|");
    const key = `${el}|${label}`;
    const x = m.get(key) ?? { el: el as ElKind, label, n: 0 };
    x.n += h.n;
    total += h.n;
    m.set(key, x);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, n).map((x) => ({ ...x, share: total ? x.n / total : 0 }));
}

/** Quote a/b als „12,3 %“, „–“ ohne Basis. */
export function pct(a: number, b: number, digits = 1): string {
  if (!b) return "–";
  return `${((a / b) * 100).toFixed(digits).replace(".", ",")} %`;
}

// ------------------------------------------------------------------ JARVIS-Linie „Website“

/**
 * Kennzahlen aus signalwerk.dashboard_cache ('website', website_refresh): je letzte Stunde, 24 h, 30 Tage.
 * land/tarif = eindeutige Besucher (je Tag, ohne Cookies, Inhaber/Vorschau/Bots ausgenommen), co = gestartete
 * Stripe-Checkouts (serverseitig), buy = abgeschlossene Käufe (Stripe-Webhook). views/cta/req bleiben für die Auswertung.
 */
export type WebsiteLive = {
  at?: string;
  land_60m: number; land_24h: number; land_30d: number;
  tarif_60m: number; tarif_24h: number; tarif_30d: number; tarif_views_30d: number;
  co_60m: number; co_24h: number; co_30d: number;
  views_60m: number; cta_60m: number; req_60m: number; buy_60m: number;
  views_24h: number; cta_24h: number; req_24h: number; buy_24h: number;
  views_30d: number; cta_30d: number; req_30d: number; buy_30d: number;
  mail_views_30d: number; mails_30d: number;
  visitors_since?: string | null;
  /** Startseite (Website-Trichter, web_funnel_refresh) – fehlt ohne Messung */
  start_60m?: number; start_24h?: number; start_30d?: number; start_land_60m?: number;
};
export const EMPTY_WEBSITE: WebsiteLive = {
  land_60m: 0, land_24h: 0, land_30d: 0, tarif_60m: 0, tarif_24h: 0, tarif_30d: 0, tarif_views_30d: 0, co_60m: 0, co_24h: 0, co_30d: 0,
  views_60m: 0, cta_60m: 0, req_60m: 0, buy_60m: 0, views_24h: 0, cta_24h: 0, req_24h: 0, buy_24h: 0,
  views_30d: 0, cta_30d: 0, req_30d: 0, buy_30d: 0, mail_views_30d: 0, mails_30d: 0,
};

/** Stationen der Linie (Inhaber 04.10.2026: „genau die websiten namen: Landingpage, Tarif, Stripe, Danke“; Startseite davor). */
export type WebStationId = "wstart" | "wland" | "wtarif" | "wstripe" | "wdanke";
export type WebNeck = WebStationId;
export const WEB_LINE: { id: WebStationId; label: "Startseite" | "Landingpage" | "Tarif" | "Stripe" | "Danke" }[] = [
  { id: "wstart", label: "Startseite" }, { id: "wland", label: "Landingpage" }, { id: "wtarif", label: "Tarif" }, { id: "wstripe", label: "Stripe" }, { id: "wdanke", label: "Danke" },
];
/** Ehrlicher Hinweis an der Linie (Inhaber: „wie zuverlässig kannst du die werte tracken“). */
export const WEB_INFO = "eindeutig je Tag, ohne Cookies – Gerätewechsel zählt doppelt, Inhaber ausgeblendet";

/**
 * Engpass der Website wie bottleneckOf() in dashboard-logic: feste Mindestmengen (30 Tage), dann die erste Stufe
 * unter ihrer Schwelle. Mails bringen kaum Besucher (< 1 % Klicks ab 200 Mails) → Landingpage; wenige gehen zum Tarif
 * (< 3 % ab 50 Besuchern) → Tarif; Tarif ohne Checkout (< 5 % ab 20 Besuchern) → Stripe; Checkouts ohne Kauf (ab 5) → Danke.
 */
export function webNeck(w: WebsiteLive): WebNeck | null {
  if (w.mails_30d >= 200 && w.mail_views_30d / w.mails_30d < 0.01) return "wland";
  if (w.land_30d >= 50 && w.tarif_30d / w.land_30d < 0.03) return "wtarif";
  if (w.tarif_30d >= 20 && w.co_30d / w.tarif_30d < 0.05) return "wstripe";
  if (w.co_30d >= 5 && w.buy_30d === 0) return "wdanke";
  return null;
}

type WebStation = { id: WebStationId; label: string; icon: "start-seite" | "website" | "tarif" | "karte" | "ok-kreis"; value: string; sub: string; state: "live" | "idle"; tip: string };
type WebEdge = { from: WebStationId; to: WebStationId | "kunden"; perHour: number; label: string };

/** Stationen und Leitungen der Linie „Website“ (Werte aus echten Zählungen; fmt = kompakte Zahl). */
export function webLine(w: WebsiteLive, fmt: (n: number) => string = String): { stations: WebStation[]; edges: WebEdge[] } {
  const live = (n: number) => (n > 0 ? "live" : "idle") as "live" | "idle";
  const stations: WebStation[] = [
    { id: "wstart", label: "Startseite", icon: "start-seite", value: fmt(w.start_24h ?? 0), sub: "Besucher 24 h", state: live(w.start_60m ?? 0),
      tip: `eindeutige Besucher der Startseite in 24 h · ${WEB_INFO}` },
    { id: "wland", label: "Landingpage", icon: "website", value: fmt(w.land_24h), sub: "Besucher 24 h", state: live(w.land_60m),
      tip: `eindeutige Besucher der Landingpages in 24 h (${fmt(w.views_24h)} Aufrufe gesamt) · ${WEB_INFO}` },
    { id: "wtarif", label: "Tarif", icon: "tarif", value: fmt(w.tarif_24h), sub: "Besucher 24 h", state: live(w.tarif_60m),
      tip: `eindeutige Besucher der Tarifseite in 24 h · ${WEB_INFO}` },
    { id: "wstripe", label: "Stripe", icon: "karte", value: fmt(w.co_24h), sub: "Checkouts 24 h", state: live(w.co_60m),
      tip: "gestartete Stripe-Checkouts in 24 h (serverseitig gezählt, ohne Inhaber)" },
    { id: "wdanke", label: "Danke", icon: "ok-kreis", value: fmt(w.buy_24h), sub: `${fmt(w.buy_30d)} in 30 T`, state: live(w.buy_60m),
      tip: "abgeschlossene Käufe in 24 h · 30 Tage (Stripe-Webhook)" },
  ];
  const edges: WebEdge[] = [
    { from: "wstart", to: "wland", perHour: w.start_land_60m ?? 0, label: "zur Landingpage" },
    { from: "wland", to: "wtarif", perHour: w.tarif_60m, label: "zum Tarif" },
    { from: "wtarif", to: "wstripe", perHour: w.co_60m, label: "Checkouts" },
    { from: "wstripe", to: "wdanke", perHour: w.buy_60m, label: "Käufe" },
    { from: "wdanke", to: "kunden", perHour: w.buy_60m, label: "neue Kunden" },
  ];
  return { stations, edges };
}
