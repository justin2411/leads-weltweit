/**
 * Kennzahlen und Ampel des Inhaber-Dashboards (Inhaber 03.10.2026: „übersicht … wer wo in welchem prozess ist,
 * wv leads wir haben, wo engpass ist, was vorbereitet ist“). Reine Funktionen ohne Next/Supabase, damit testbar.
 *
 * Regeln aus CLAUDE.md, die hier gelten:
 * - Käufer zählen nur mail-fähig: prospects.check_status = 'ok' in den Mail-Ländern der Zielgruppe;
 *   „nur Anruf/Brief“ (call_only) nur getrennt und ausdrücklich so benannt.
 * - Uhrzeiten immer in deutscher Zeit (Europe/Berlin).
 * - Echte Zahlen: zugestellt = gesendet − Bounces (Versand über SMTP liefert keine Zustellmeldungen).
 * Bounce-Zählung und Notbremse wie scripts/lib/deliverability.py, Antworten wie scripts/lib/stats.py.
 */

// --------------------------------------------------------------------------------------------- Typen
export type OpsConfig = {
  versand: {
    aktiv: boolean; notbremse_ab: string | null; tagesziel: number; tagesziel_ab: string | null; tagesziel_schritt: number;
    tagesziel_max: number; anbieter_tageslimit: number; postfach_start: number; postfach_schritt: number;
    postfach_tageslimit: number; gesamtgrenze: number;
  };
  proben: { fokus_je_seite: number; andere_je_seite: number; max_alter_stunden: number };
  fokus: string[];
  nur_fokus: boolean;
  lead_suche: boolean;
  kunden_suche: boolean;
  countries: Record<string, { allowed: boolean; daily_limit: number }>;
  workflows: { file: string; name: string; crons: string[] }[];
};

export type Ev = {
  id: string; type: string; dedupe_key?: string | null; message_id?: string | null; occurred_at: string; created_at: string;
  note?: string | null; bounce_type?: string | null; to_email?: string | null; kind?: string | null;
  segment_id?: string | null; country?: string | null; prospect_id?: string | null; company_name?: string | null;
  domain?: string | null;
};
export type MsgAgg = { segment_id: string; country: string; status: string; kind: string; n: number; today: number; d7: number };
export type Live = {
  now: string; today: string; db_size: number; legal_ready: boolean;
  segments: { id: string; name: string; email_countries: string[]; status: string }[];
  msg: MsgAgg[];
  sent_days: { day: string; country: string; box: string; n: number }[];
  boxes: { box: string; first_sent: string; last_sent: string; n: number }[];
  last_sent_at: string | null; window_sent: number;
  events: Ev[];
  followups_due: { n: number; rows: { prospect_id: string; segment_id: string; country: string; sent_at: string; to_email: string; company_name: string; domain: string }[] };
  sample_requests: { id: string; company_name: string; domain: string; segment_id: string | null; country: string | null; status: string; created_at: string; sent_at: string | null; claimed_at: string | null; note: string | null }[];
  stock: { segment_id: string; country: string; ready: number; oldest: string | null; newest: string | null; sent24: number; failed24: number }[];
  stock_last_built: string | null;
  pages: { slug: string; segment_id: string; country: string; status: string; views: number; clicks: number; requests: number; checkouts: number; purchases: number }[];
  customers: { id: string; company_name: string; country: string; status: string; created_at: string; prospect_id: string | null; stripe: boolean; test_note: boolean }[];
  subscriptions: { id: string; customer_id: string; segment_id: string; status: string; package: string | null; amount_cents: number | null; currency: string | null; price_eur_month: number | null; started_on: string; current_period_end: string | null; first_delivery_approved: boolean; filters: any }[];
  deliveries: { id: string; subscription_id: string; period_start: string; leads: number; status: string; approved_at: string | null; sent_at: string | null; created_at: string }[];
  suppression: Record<string, number>;
  contact_requests: { id: string; company_name: string; country: string | null; industry: string | null; status: string; created_at: string }[];
  later_msgs: { prospect_id: string; kind: string; status: string; sent_at: string | null; created_at: string }[];
  last_lead_at: string | null; last_prospect_at: string | null;
  /** Entwürfe, die die Prüfung gestoppt hat (nicht freigebbar); separat geladen */
  drafts_blocked?: number;
  experiments: { id: string; segment_id: string; country: string; variant: string; status: string; decision: string | null; started_on: string | null; last_sent_on: string | null }[];
};
export type Stock = {
  at: string;
  leads: { segment_id: string | null; country: string; status: string; n: number }[];
  leads_24h: { segment_id: string | null; country: string; n: number }[];
  prospects: { check_status: string; segment_id: string; country: string; n: number; unused: number }[];
  prospects_24h: { check_status: string; segment_id: string; country: string; n: number }[];
};
export type RawStock = { at: string; by_country: Record<string, number> };
export type RunInfo = { file: string; name: string; status: string; conclusion: string | null; updated_at: string; url: string };

// --------------------------------------------------------------------------------------------- Zeit
const TZ = "Europe/Berlin";
const HOUR = 3600_000;

/** „03.10. 18:23“ in deutscher Zeit; mit Jahr, wenn nicht dieses Jahr. */
export function berlin(ts: string | Date | null | undefined, withDate = true): string {
  if (!ts) return "–";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "–";
  const time = d.toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (!withDate) return time;
  const date = d.toLocaleDateString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  return `${date} ${time}`;
}

/** Kalendertag in deutscher Zeit (YYYY-MM-DD). */
export function berlinDay(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** „vor 12 min“, „vor 3 h“, „vor 2 Tagen“. */
export function ago(ts: string | null | undefined, now: Date): string {
  if (!ts) return "nie";
  const ms = now.getTime() - new Date(ts).getTime();
  if (ms < 60_000) return "gerade eben";
  if (ms < HOUR) return `vor ${Math.round(ms / 60_000)} min`;
  if (ms < 48 * HOUR) return `vor ${Math.round(ms / HOUR)} h`;
  return `vor ${Math.round(ms / (24 * HOUR))} Tagen`;
}

export function hoursSince(ts: string | null | undefined, now: Date): number {
  return ts ? (now.getTime() - new Date(ts).getTime()) / HOUR : Infinity;
}

// --------------------------------------------------------------------------------------------- Cron (UTC)
function field(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [range, stepS] = part.split("/");
    const step = stepS ? Number(stepS) : 1;
    let lo = min, hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-").map(Number);
      lo = a; hi = b ?? (stepS ? max : a);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Nächster Zeitpunkt eines GitHub-Cron-Ausdrucks (UTC, 5 Felder) nach `from`; null, wenn ungültig. */
export function nextCron(expr: string, from: Date): Date | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [mi, ho, dom, mo, dow] = [field(f[0], 0, 59), field(f[1], 0, 23), field(f[2], 1, 31), field(f[3], 1, 12), field(f[4], 0, 7)];
  if (dow.has(7)) dow.add(0);
  const domAny = f[2] === "*", dowAny = f[4] === "*";
  const t = new Date(from.getTime());
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);
  for (let i = 0; i < 60 * 24 * 32; i++) {
    const dayOk = domAny && dowAny ? true
      : domAny ? dow.has(t.getUTCDay())
      : dowAny ? dom.has(t.getUTCDate())
      : dom.has(t.getUTCDate()) || dow.has(t.getUTCDay());
    if (dayOk && mo.has(t.getUTCMonth() + 1) && ho.has(t.getUTCHours()) && mi.has(t.getUTCMinutes())) return t;
    t.setUTCMinutes(t.getUTCMinutes() + 1);
  }
  return null;
}

export function nextRun(crons: string[], from: Date): Date | null {
  const all = crons.map((c) => nextCron(c, from)).filter((d): d is Date => !!d);
  return all.length ? new Date(Math.min(...all.map((d) => d.getTime()))) : null;
}

// --------------------------------------------------------------------------------------------- Versand
const HARD_MAX_PER_DAY = 250;

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / (24 * HOUR)));
}

/** Tagesmenge des Hauptpostfachs (deliverability.warmup_cap ohne Aufwärmphase). */
export function mainBoxCap(v: OpsConfig["versand"], today: string): number {
  let target = v.tagesziel;
  if (v.tagesziel_ab && v.tagesziel_schritt) target = Math.min(target + v.tagesziel_schritt * daysBetween(v.tagesziel_ab, today), v.tagesziel_max);
  return Math.max(0, Math.min(target, HARD_MAX_PER_DAY, v.anbieter_tageslimit - 10));
}

/** Tagesmenge eines weiteren Postfachs (mailboxes.box_cap). */
export function extraBoxCap(v: OpsConfig["versand"], firstSentDay: string | null, today: string): number {
  const day = firstSentDay ? daysBetween(firstSentDay, today) : 0;
  return Math.max(0, Math.min(v.postfach_start + v.postfach_schritt * day, v.postfach_tageslimit, HARD_MAX_PER_DAY));
}

/** Hauptpostfach: info@… bzw. ältere Mails ohne Absender (leer). */
export function isMainBox(box: string): boolean {
  return box === "" || box.startsWith("info@");
}

export type BoxRow = { box: string; label: string; cap: number; today: number; d7: number; total: number; first_sent: string | null; last_sent: string | null };

/** Postfächer mit heutiger Kapazität und gesendeten Mails (heute / 7 Tage / gesamt). */
export function mailboxes(live: Live, cfg: OpsConfig): BoxRow[] {
  const today = live.today;
  const main: BoxRow = { box: "main", label: "Hauptpostfach (info@)", cap: mainBoxCap(cfg.versand, today), today: 0, d7: 0, total: 0, first_sent: null, last_sent: null };
  const rows = new Map<string, BoxRow>([["main", main]]);
  for (const b of live.boxes) {
    const key = isMainBox(b.box) ? "main" : b.box;
    const r = rows.get(key) ?? { box: key, label: b.box, cap: extraBoxCap(cfg.versand, berlinDay(new Date(b.first_sent)), today), today: 0, d7: 0, total: 0, first_sent: null, last_sent: null };
    r.total += b.n;
    if (!r.first_sent || b.first_sent < r.first_sent) r.first_sent = b.first_sent;
    if (!r.last_sent || b.last_sent > r.last_sent) r.last_sent = b.last_sent;
    rows.set(key, r);
  }
  const weekAgo = berlinDay(new Date(Date.parse(live.now) - 6 * 24 * HOUR));
  for (const s of live.sent_days) {
    const r = rows.get(isMainBox(s.box) ? "main" : s.box);
    if (!r) continue;
    if (s.day === today) r.today += s.n;
    if (s.day >= weekAgo) r.d7 += s.n;
  }
  return [...rows.values()];
}

/** Bounces und Beschwerden je Empfängeradresse (deliverability.count_bounces). */
export function countBounces(events: Pick<Ev, "type" | "bounce_type" | "to_email" | "message_id">[]): { bounced: number; complained: number } {
  const hard = new Set<string>();
  const soft = new Map<string, number>();
  const complained = new Set<string>();
  for (const e of events) {
    const who = (e.to_email || e.message_id || "").toLowerCase();
    if (e.type === "complained") { complained.add(who); continue; }
    if (e.type !== "bounced") continue;
    if ((e.bounce_type ?? "").toLowerCase() === "transient") soft.set(who, (soft.get(who) ?? 0) + 1);
    else hard.add(who);
  }
  for (const [w, n] of soft) if (n >= 2) hard.add(w);
  return { bounced: hard.size, complained: complained.size };
}

export const BOUNCE_STOP = 0.05;
export const MIN_SAMPLE = 100;

/** Notbremse wie deliverability.emergency_stop; Fenster = max(jetzt − 30 Tage, notbremse_ab). */
export function brake(live: Live, cfg: OpsConfig) {
  const now = Date.parse(live.now);
  const start = Math.max(now - 30 * 24 * HOUR, cfg.versand.notbremse_ab ? Date.parse(cfg.versand.notbremse_ab) : 0);
  const evs = live.events.filter((e) => Date.parse(e.created_at) >= start);
  const { bounced, complained } = countBounces(evs);
  const sent = live.window_sent;
  const rate = sent ? bounced / sent : 0;
  let stop: string | null = null;
  if (complained >= 1) stop = `${complained} Spam-Beschwerde(n): Versand gestoppt, Inhaber muss entscheiden`;
  else if (sent >= MIN_SAMPLE && rate > BOUNCE_STOP) stop = `Bounce-Quote ${bounced}/${sent} = ${pctS(rate)} über 5 %: Versand gestoppt`;
  return { start: new Date(start).toISOString(), sent, bounced, complained, rate, stop };
}

// --------------------------------------------------------------------------------------------- Antworten
const REPLY_PRIORITY: Record<string, number> = { reply_positive: 5, sample_requested: 4, reply_negative: 3, unsubscribed: 2, auto_reply: 1, reply: 0 };
const INBOUND = /^(imap|reply|unknown):(.+)$/;

/** Je eingehender Mail ein Ereignis, das aussagekräftigste (stats.distinct_replies). */
export function distinctReplies<T extends Pick<Ev, "id" | "type" | "dedupe_key" | "message_id">>(events: T[]): T[] {
  const best = new Map<string, T>();
  for (const e of events) {
    if (!(e.type in REPLY_PRIORITY)) continue;
    const m = INBOUND.exec(e.dedupe_key ?? "");
    const k = m ? `mail:${m[2]}` : e.message_id ? `msg:${e.message_id}` : `ev:${e.id}`;
    const old = best.get(k);
    if (!old || REPLY_PRIORITY[e.type] > REPLY_PRIORITY[old.type]) best.set(k, e);
  }
  return [...best.values()];
}

// --------------------------------------------------------------------------------------------- Kunden
/** Kauf im Stripe-Testmodus (deliveries.is_test_customer): zählt nie als Kunde oder Umsatz. */
export function isTestCustomer(c: { status: string; stripe: boolean; test_note: boolean }): boolean {
  return c.status === "trial" && (c.stripe || c.test_note);
}

export function currencySign(cur: string | null | undefined, country?: string | null): string {
  const c = (cur ?? "").toLowerCase();
  if (c === "gbp") return "£";
  if (c === "usd") return "$";
  if (c === "eur") return "€";
  return country === "UK" ? "£" : country === "US" ? "$" : "€";
}

export function monthly(s: { amount_cents: number | null; price_eur_month: number | null }): number {
  return (s.amount_cents ?? 0) / 100 || Number(s.price_eur_month ?? 0);
}

/** Echte Abos (aktiv, kein Testkauf) mit Kunde. */
export function realSubscriptions(live: Live) {
  const cust = new Map(live.customers.map((c) => [c.id, c]));
  return live.subscriptions
    .map((s) => ({ ...s, customer: cust.get(s.customer_id) }))
    .filter((s) => s.customer && !isTestCustomer(s.customer) && ["active", "past_due"].includes(s.status) && s.customer.status !== "cancelled");
}

// --------------------------------------------------------------------------------------------- Trichter
export type Funnel = {
  key: string; segment_id: string; country: string; mailCountry: boolean;
  buyersOk: number; buyersUnused: number; callOnly: number | null;
  drafts: number; queue: number; queueFollowup: number;
  sentToday: number; sent7: number; sent: number; followupsSent: number;
  bounced: number; delivered: number; replies: number; positive: number; negative: number;
  samplesRequested: number; samplesSent: number; customers: number; revenue: number; currency: string;
};

export function pctS(x: number): string {
  return `${(100 * x).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: x > 0 && x < 0.1 ? 1 : 0 })} %`;
}

export function funnel(live: Live, stock: Stock | null, segment: string, country: string): Funnel {
  const seg = live.segments.find((s) => s.id === segment);
  const mailCountry = !!seg?.email_countries.includes(country);
  const msgs = live.msg.filter((m) => m.segment_id === segment && m.country === country);
  const sum = (f: (m: MsgAgg) => boolean, k: "n" | "today" | "d7" = "n") => msgs.filter(f).reduce((a, m) => a + Number(m[k]), 0);
  const pr = stock?.prospects.filter((p) => p.segment_id === segment && p.country === country) ?? [];
  const ok = pr.find((p) => p.check_status === "ok");
  const evs = live.events.filter((e) => e.segment_id === segment && e.country === country);
  const replies = distinctReplies(evs).filter((e) => e.type !== "auto_reply");
  const mailSamples = new Set(evs.filter((e) => e.type === "sample_requested").map((e) => e.prospect_id ?? e.id));
  const web = live.sample_requests.filter((r) => r.segment_id === segment && r.country === country);
  const subs = realSubscriptions(live).filter((s) => s.segment_id === segment && s.customer?.country === country);
  const sentInitial = sum((m) => m.status === "sent" && m.kind === "initial");
  const { bounced } = countBounces(evs);
  return {
    key: `${segment}/${country}`, segment_id: segment, country, mailCountry,
    buyersOk: mailCountry ? Number(ok?.n ?? 0) : 0,
    buyersUnused: mailCountry ? Number(ok?.unused ?? 0) : 0,
    callOnly: stock ? Number(pr.find((p) => p.check_status === "call_only")?.n ?? 0) : null,
    drafts: sum((m) => m.status === "draft"),
    queue: sum((m) => m.status === "approved" && m.kind === "initial"),
    queueFollowup: sum((m) => m.status === "approved" && m.kind !== "initial"),
    sentToday: sum((m) => m.status === "sent" && m.kind === "initial", "today"),
    sent7: sum((m) => m.status === "sent" && m.kind === "initial", "d7"),
    sent: sentInitial,
    followupsSent: sum((m) => m.status === "sent" && m.kind !== "initial"),
    bounced,
    delivered: Math.max(0, sentInitial - bounced),
    replies: replies.length,
    positive: replies.filter((e) => e.type === "reply_positive" || e.type === "sample_requested").length,
    negative: replies.filter((e) => e.type === "reply_negative" || e.type === "unsubscribed").length,
    samplesRequested: mailSamples.size + web.filter((r) => r.status !== "rejected").length,
    samplesSent: mailSamples.size + web.filter((r) => r.status === "sent").length,
    customers: subs.length,
    revenue: subs.reduce((a, s) => a + monthly(s), 0),
    currency: currencySign(subs[0]?.currency, country),
  };
}

/** Alle Zielgruppe×Land-Paare mit Experiment oder Mails; Fokus zuerst. */
export function pairs(live: Live, cfg: OpsConfig): { focus: string[]; other: string[] } {
  const all = new Set<string>([...live.experiments.map((e) => `${e.segment_id}/${e.country}`), ...live.msg.map((m) => `${m.segment_id}/${m.country}`)]);
  const focus = cfg.fokus.slice();
  const other = [...all].filter((k) => !focus.includes(k)).sort();
  return { focus, other };
}

// --------------------------------------------------------------------------------------------- Wer ist wo
export type Person = {
  key: string; company: string; domain: string | null; segment_id: string | null; country: string | null;
  stage: string; tone: "gold" | "green" | "blue" | "grey" | "red"; last: string; next: string; source: "Mail" | "Website" | "Kunde";
};

const STAGE: Record<string, { label: string; tone: Person["tone"]; rank: number }> = {
  customer: { label: "Kunde", tone: "green", rank: 9 },
  reply_positive: { label: "Kaufinteresse", tone: "gold", rank: 8 },
  sample_requested: { label: "Probe erhalten", tone: "gold", rank: 7 },
  reply: { label: "Hat geantwortet", tone: "blue", rank: 6 },
  reply_negative: { label: "Kein Interesse", tone: "grey", rank: 3 },
  unsubscribed: { label: "Abgemeldet", tone: "grey", rank: 2 },
  auto_reply: { label: "Abwesenheitsnotiz", tone: "grey", rank: 1 },
};

export function pipeline(live: Live, cfg: OpsConfig, now: Date): Person[] {
  const out = new Map<string, Person & { rank: number }>();
  const later = new Map<string, typeof live.later_msgs>();
  for (const m of live.later_msgs) later.set(m.prospect_id, [...(later.get(m.prospect_id) ?? []), m]);
  const taeglich = cfg.workflows.find((w) => w.file === "taeglich.yml");
  const nextDaily = taeglich ? nextRun(taeglich.crons, now) : null;

  for (const e of distinctReplies(live.events)) {
    const st = STAGE[e.type];
    if (!st || !e.prospect_id) continue;
    const old = out.get(e.prospect_id);
    if (old && (old.rank > st.rank || (old.rank === st.rank && old.last > e.occurred_at))) continue;
    let next = "";
    const fu = later.get(e.prospect_id) ?? [];
    if (e.type === "reply_positive") next = "Selbst antworten – Kaufinteresse (Assistent hat nur bestätigt)";
    else if (e.type === "sample_requested") {
      const sf = fu.find((m) => m.kind === "sample_followup");
      const due = new Date(Date.parse(e.occurred_at) + 3 * 24 * HOUR);
      next = sf ? (sf.status === "sent" ? `Nachfrage gesendet ${berlin(sf.sent_at)} – auf Antwort warten` : "Nachfrage zur Probe liegt bereit (nächster Versand)")
        : due > now ? `Nachfrage zur Probe automatisch ab ${berlin(due)}` : "Nachfrage zur Probe fällig (nächster Automatiklauf)";
    } else if (e.type === "reply") next = "Antwort im Postfach lesen und einordnen";
    else if (e.type === "auto_reply") next = "Nichts tun – Nachfassmail läuft normal";
    else next = "Gesperrt – nicht mehr anschreiben";
    out.set(e.prospect_id, {
      key: e.prospect_id, company: e.company_name ?? e.to_email ?? "?", domain: e.domain ?? null, segment_id: e.segment_id ?? null,
      country: e.country ?? null, stage: st.label, tone: st.tone, last: e.occurred_at, next, source: "Mail", rank: st.rank,
    });
  }
  for (const f of live.followups_due.rows) {
    if (out.has(f.prospect_id)) continue;
    out.set(f.prospect_id, {
      key: f.prospect_id, company: f.company_name, domain: f.domain, segment_id: f.segment_id, country: f.country,
      stage: "Nachfass fällig", tone: "blue", last: f.sent_at,
      next: `Nachfassmail im Automatiklauf${nextDaily ? ` (${berlin(nextDaily)})` : ""}`, source: "Mail", rank: 4,
    });
  }
  for (const r of live.sample_requests) {
    const waitMin = (now.getTime() - Date.parse(r.created_at)) / 60_000;
    const stage = r.status === "sent" ? "Probe erhalten" : r.status === "new" ? "Probe angefordert" : "Probe abgelehnt";
    const next = r.status === "sent"
      ? `Probe nach ${durationS(Date.parse(r.sent_at ?? r.created_at) - Date.parse(r.created_at))} gesendet – Nachfrage nach 3 Tagen`
      : r.status === "new" ? `Probe ausstehend – wartet seit ${durationS(waitMin * 60_000)}` : (r.note ?? "abgelehnt");
    out.set(`sr:${r.id}`, {
      key: `sr:${r.id}`, company: r.company_name, domain: r.domain, segment_id: r.segment_id, country: r.country, stage,
      tone: r.status === "new" ? (waitMin > 10 ? "red" : "gold") : r.status === "sent" ? "gold" : "grey",
      last: r.sent_at ?? r.created_at, next, source: "Website", rank: 7,
    });
  }
  const subs = live.subscriptions;
  for (const c of live.customers) {
    const s = subs.filter((x) => x.customer_id === c.id);
    const test = isTestCustomer(c);
    const pending = live.deliveries.find((d) => s.some((x) => x.id === d.subscription_id) && d.status === "prepared");
    out.set(`c:${c.id}`, {
      key: `c:${c.id}`, company: c.company_name + (test ? " (Testkauf)" : ""), domain: null, segment_id: s[0]?.segment_id ?? null,
      country: c.country, stage: test ? "Testkauf" : "Kunde", tone: test ? "grey" : "green", last: c.created_at,
      next: test ? "Stripe-Testmodus – bekommt keine Leads" : pending && !s.some((x) => x.first_delivery_approved)
        ? "Erste Lieferung freigeben (Vorschau im Postfach)" : "Lieferung montags automatisch",
      source: "Kunde", rank: test ? 0 : 9,
    });
  }
  return [...out.values()].sort((a, b) => b.rank - a.rank || (b.last > a.last ? 1 : -1)).map(({ rank: _r, ...p }) => p);
}

export function durationS(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} Tagen`;
}

// --------------------------------------------------------------------------------------------- Proben-Vorrat
export type StockRow = { key: string; slug: string; focus: boolean; target: number; ready: number; oldestH: number | null; sent24: number };

export function sampleStock(live: Live, cfg: OpsConfig, now: Date): StockRow[] {
  if (!live.legal_ready) return [];
  return live.pages
    .map((p) => {
      const key = `${p.segment_id}/${p.country}`;
      const focus = cfg.fokus.includes(key);
      const s = live.stock.find((x) => x.segment_id === p.segment_id && x.country === p.country);
      return {
        key, slug: p.slug, focus, target: focus ? cfg.proben.fokus_je_seite : cfg.proben.andere_je_seite,
        ready: Number(s?.ready ?? 0), oldestH: s?.oldest ? hoursSince(s.oldest, now) : null, sent24: Number(s?.sent24 ?? 0),
      };
    })
    .sort((a, b) => Number(b.focus) - Number(a.focus) || a.key.localeCompare(b.key));
}

// --------------------------------------------------------------------------------------------- Ampel
export type Alert = { level: "rot" | "gelb" | "gruen"; area: string; title: string; detail?: string };

export const DB_LIMIT_BYTES = 8 * 1024 ** 3; // Supabase Pro: 8 GB Speicher inklusive, darüber kostet es

export function alerts(live: Live, stock: Stock | null, cfg: OpsConfig, now: Date, runs: RunInfo[] | null): Alert[] {
  const a: Alert[] = [];
  const add = (level: Alert["level"], area: string, title: string, detail?: string) => a.push({ level, area, title, detail });
  const v = cfg.versand;
  const b = brake(live, cfg);

  // Versand
  const boxes = mailboxes(live, cfg);
  const cap = boxes.reduce((s, x) => s + x.cap, 0);
  const sentToday = boxes.reduce((s, x) => s + x.today, 0);
  const sendWf = cfg.workflows.find((w) => w.file === "send.yml");
  const nextSend = sendWf ? nextRun(sendWf.crons, now) : null;
  if (!v.aktiv) add("gelb", "Versand", "Versand ist ausgeschaltet", "config/versand.yaml: aktiv: false");
  if (b.stop) add("rot", "Versand", "Notbremse aktiv", b.stop);
  else if (b.complained === 0) {
    const detail = `${b.bounced} von ${b.sent} seit ${berlin(b.start)}` + (b.sent < MIN_SAMPLE ? ` – Notbremse bewertet erst ab ${MIN_SAMPLE} Mails` : "");
    if (b.rate > BOUNCE_STOP * 0.8) add(b.sent >= MIN_SAMPLE * 0.8 ? "rot" : "gelb", "Versand", `Bounce-Quote ${pctS(b.rate)} nahe an der Notbremse (5 %)`, detail);
    else add("gruen", "Versand", `Bounce-Quote ${pctS(b.rate)}`, detail);
  }
  if (b.complained > 0 && !b.stop) add("rot", "Versand", `${b.complained} Spam-Beschwerde(n)`);
  const hourBerlin = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (v.aktiv && !b.stop) {
    if (hoursSince(live.last_sent_at, now) > 26) add("rot", "Versand", "Seit über 26 h keine Mail gesendet", `zuletzt ${berlin(live.last_sent_at)}`);
    else if (hourBerlin >= 21 && sentToday < cap * 0.8) add("gelb", "Versand", `Versand heute unter Ziel: ${sentToday} von ${cap}`, "Kapazität aller Postfächer heute");
    else add("gruen", "Versand", `Heute ${sentToday} von ${cap} Mails gesendet`, nextSend ? `nächster geplanter Lauf ${berlin(nextSend)}` : undefined);
  }
  const totalSent = live.boxes.reduce((s, x) => s + x.n, 0);
  if (totalSent >= v.gesamtgrenze * 0.9) add(totalSent >= v.gesamtgrenze ? "rot" : "gelb", "Versand", `Gesamtgrenze fast erreicht: ${totalSent} von ${v.gesamtgrenze}`);

  // Warteschlange / Käufer je Fokus-Test
  const sendable = cfg.nur_fokus ? cfg.fokus : pairs(live, cfg).focus;
  const perPair = cap / Math.max(1, sendable.length);
  for (const k of sendable) {
    const [s, c] = k.split("/");
    const f = funnel(live, stock, s, c);
    const days = perPair ? f.queue / perPair : Infinity;
    if (f.queue === 0) add("rot", "Entwürfe", `${k}: keine freigegebenen Erstmails mehr`, stock ? `${fmt(f.buyersUnused)} mail-fähige Käufer noch ohne Mail` : undefined);
    else if (days < 3) add("gelb", "Entwürfe", `${k}: Erstmails reichen nur noch ~${Math.max(1, Math.floor(days))} Tag(e)`, `${f.queue} freigegeben bei ~${Math.round(perPair)}/Tag`);
    if (stock && f.buyersUnused < perPair * 7 && f.mailCountry) add(f.buyersUnused < perPair ? "rot" : "gelb", "Käufer", `${k}: nur ${fmt(f.buyersUnused)} mail-fähige Käufer ohne Mail`, "Kunden-Werk füllt nach");
  }
  const drafts = live.msg.filter((m) => m.status === "draft").reduce((s, m) => s + m.n, 0);
  const blocked = Math.min(drafts, live.drafts_blocked ?? 0);
  if (drafts - blocked > 0) add("gelb", "Entwürfe", `${drafts - blocked} Entwürfe warten auf deine Freigabe`, "unten unter „Freigaben“" + (blocked ? `; dazu ${blocked} von der Prüfung gestoppt` : ""));
  else if (blocked) add("gruen", "Entwürfe", `${blocked} Entwürfe von der Prüfung gestoppt`, "nicht freigebbar – nur ablehnen oder liegen lassen");

  // Antworten mit Handlungsbedarf (letzte 7 Tage)
  const positive = distinctReplies(live.events).filter((e) => e.type === "reply_positive");
  const hot = positive.filter((e) => hoursSince(e.occurred_at, now) < 72);
  const warm = positive.filter((e) => hoursSince(e.occurred_at, now) >= 72 && hoursSince(e.occurred_at, now) < 7 * 24);
  const who = (l: Ev[]) => l.map((e) => `${e.company_name ?? e.to_email} (${e.segment_id}/${e.country}, ${berlin(e.occurred_at)})`).join(", ");
  if (hot.length) add("rot", "Antworten", `${hot.length} Kaufinteresse – bitte selbst antworten`, who(hot));
  if (warm.length) add("gelb", "Antworten", `${warm.length} Kaufinteresse älter als 3 Tage – beantwortet?`, who(warm));

  // Proben
  const waiting = live.sample_requests.filter((r) => r.status === "new" && hoursSince(r.created_at, now) > 10 / 60);
  if (waiting.length) add("rot", "Proben", `${waiting.length} Probe-Anfrage(n) seit über 10 min unbeantwortet`, waiting.map((r) => `${r.company_name} (${r.segment_id}/${r.country}, seit ${durationS(now.getTime() - Date.parse(r.created_at))})`).join(", "));
  const st = sampleStock(live, cfg, now);
  const empty = st.filter((r) => r.ready === 0);
  const low = st.filter((r) => r.ready > 0 && r.ready < Math.ceil(r.target / 2));
  if (empty.length) add(empty.some((r) => r.focus) ? "rot" : "gelb", "Proben", `Proben-Vorrat leer: ${empty.map((r) => r.key).join(", ")}`, "Klick auf „Probe anfordern“ landet in der Warteschlange");
  if (low.length) add("gelb", "Proben", `Proben-Vorrat niedrig: ${low.map((r) => `${r.key} ${r.ready}/${r.target}`).join(", ")}`);
  const aging = st.filter((r) => r.oldestH !== null && r.oldestH > cfg.proben.max_alter_stunden - 6);
  if (aging.length) add("gelb", "Proben", `Proben verfallen bald (> ${cfg.proben.max_alter_stunden - 6} h alt): ${aging.map((r) => r.key).join(", ")}`);
  const below = st.some((r) => r.ready < r.target);
  if (below && hoursSince(live.stock_last_built, now) > 3) add("gelb", "Proben", `Proben-Vorrat seit ${ago(live.stock_last_built, now).replace("vor ", "")} nicht nachgebaut`, "proben-vorrat.yml läuft stündlich");
  if (st.length && !empty.length && !low.length) add("gruen", "Proben", `Proben-Vorrat: ${st.reduce((s, r) => s + r.ready, 0)} fertige Proben (Soll ${st.reduce((s, r) => s + r.target, 0)})`);

  // Werke
  if (cfg.lead_suche) {
    const h = hoursSince(live.last_lead_at, now);
    if (h > 9) add("rot", "Werke", `Lead-Werk: seit ${Math.round(h)} h kein neuer Lead`, "läuft alle 3 h");
    else if (h > 4) add("gelb", "Werke", `Lead-Werk: seit ${Math.round(h)} h kein neuer Lead`, "läuft alle 3 h");
    else add("gruen", "Werke", `Lead-Werk: letzter Lead ${ago(live.last_lead_at, now)}`);
  }
  if (cfg.kunden_suche) {
    const h = hoursSince(live.last_prospect_at, now);
    if (h > 12) add("rot", "Werke", `Kunden-Werk: seit ${Math.round(h)} h kein neuer Käufer`, "läuft alle 2 h");
    else if (h > 5) add("gelb", "Werke", `Kunden-Werk: seit ${Math.round(h)} h kein neuer Käufer`, "läuft alle 2 h – evtl. keine neuen Kandidaten");
    else add("gruen", "Werke", `Kunden-Werk: letzter Käufer ${ago(live.last_prospect_at, now)}`);
  }
  for (const r of runs ?? []) {
    if (r.status === "completed" && r.conclusion && !["success", "skipped", "cancelled"].includes(r.conclusion)) add("rot", "Abläufe", `${r.name}: letzter Lauf ${r.conclusion}`, `${berlin(r.updated_at)}`);
  }

  // Leads knapp für Fokus-Tests und Live-Seiten
  if (stock) {
    const keys = new Set([...cfg.fokus, ...live.pages.map((p) => `${p.segment_id}/${p.country}`)]);
    for (const k of keys) {
      const [s, c] = k.split("/");
      const n = stock.leads.filter((l) => l.segment_id === s && l.country === c && l.status === "new").reduce((x, l) => x + Number(l.n), 0);
      if (n < 10) add(cfg.fokus.includes(k) ? "rot" : "gelb", "Leads", `${k}: nur ${n} lieferbare Leads – keine volle Probe möglich`);
      else if (n < 100) add("gelb", "Leads", `${k}: nur ${n} lieferbare Leads`);
    }
  }

  // Kunden
  const real = realSubscriptions(live);
  for (const s of real) {
    const pend = live.deliveries.find((d) => d.subscription_id === s.id && d.status === "prepared");
    if (pend && !s.first_delivery_approved) add("gelb", "Kunden", `Erste Lieferung an ${s.customer?.company_name} wartet auf Freigabe`, `vorbereitet ${berlin(pend.created_at)}`);
  }

  // Datenbank
  const share = live.db_size / DB_LIMIT_BYTES;
  if (share > 0.9) add("rot", "Datenbank", `Datenbank ${gb(live.db_size)} von 8 GB`, "darüber kostet Supabase extra");
  else if (share > 0.75) add("gelb", "Datenbank", `Datenbank ${gb(live.db_size)} von 8 GB`);
  else add("gruen", "Datenbank", `Datenbank ${gb(live.db_size)} von 8 GB`);

  const order = { rot: 0, gelb: 1, gruen: 2 };
  return a.sort((x, y) => order[x.level] - order[y.level]);
}

export function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB`;
}

export function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "–" : Number(n).toLocaleString("de-DE");
}
