/**
 * „Wer ist wo“ als Stufen (Inhaber 03.10.2026: „so das ich genau checke wo wer ist“):
 * Angeschrieben → Geantwortet → Probe angefordert → Probe erhalten → Kunde, daneben Abgesagt.
 * Jede Firma steht genau in ihrer weitesten Stufe. Reine Funktion, testbar.
 */
export type StageId = "contacted" | "replied" | "requested" | "sample" | "customer" | "out";
export const STAGES: [StageId, string][] = [
  ["contacted", "Angeschrieben"], ["replied", "Geantwortet"], ["requested", "Probe angefordert"],
  ["sample", "Probe erhalten"], ["customer", "Kunde"], ["out", "Abgesagt"],
];
export const isStage = (s: string | undefined | null): s is StageId => !!s && STAGES.some(([k]) => k === s);

export type Card = { key: string; stage: StageId; company: string; country: string | null; since: string; href: string | null; positive?: boolean; source: "Mail" | "Website" | "Kunde" };
export type Column = { id: StageId; label: string; count: number; cards: Card[] };

type ContactCard = { id: string; stage: "contacted" | "replied" | "sample" | "out"; country: string; company: string; last_at: string; positive: boolean };
type Web = { id: string; company_name: string; country: string | null; status: string; created_at: string; sent_at: string | null; segment_id: string | null };
type Cust = { id: string; company_name: string; country: string; created_at: string; status: string; stripe: boolean; test_note: boolean };

export function board(
  contacts: { counts: { stage: string; country: string; n: number }[]; cards: ContactCard[] },
  web: Web[], customers: Cust[], countries: string[],
): Column[] {
  const inC = (c: string | null) => !!c && countries.includes(c);
  const cols = new Map<StageId, Column>(STAGES.map(([id, label]) => [id, { id, label, count: 0, cards: [] }]));
  for (const c of contacts.counts) if (inC(c.country) && cols.has(c.stage as StageId)) cols.get(c.stage as StageId)!.count += Number(c.n);
  for (const c of contacts.cards) {
    if (!inC(c.country)) continue;
    cols.get(c.stage)!.cards.push({ key: c.id, stage: c.stage, company: c.company, country: c.country, since: c.last_at, href: `/dashboard/kontakte/${c.id}`, positive: c.positive, source: "Mail" });
  }
  for (const r of web) {
    if (!inC(r.country) || r.status === "rejected") continue;
    const st: StageId = r.status === "sent" ? "sample" : "requested";
    const col = cols.get(st)!;
    col.count++;
    col.cards.push({ key: `w:${r.id}`, stage: st, company: r.company_name, country: r.country, since: r.sent_at ?? r.created_at, href: null, source: "Website" });
  }
  for (const c of customers) {
    if (!inC(c.country) || c.status === "cancelled" || (c.status === "trial" && (c.stripe || c.test_note))) continue;
    const col = cols.get("customer")!;
    col.count++;
    col.cards.push({ key: `c:${c.id}`, stage: "customer", company: c.company_name, country: c.country, since: c.created_at, href: "/dashboard/kunden", source: "Kunde" });
  }
  for (const col of cols.values()) col.cards.sort((a, b) => (a.since < b.since ? 1 : -1));
  return [...cols.values()];
}
