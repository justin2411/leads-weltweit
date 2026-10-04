import Link from "next/link";
import { SEGMENT, loadContacts, loadLive } from "@/lib/dashboard-data";
import { COUNTRY_COLOR, berlinDay, compact, onlySegment } from "@/lib/dashboard-logic";
import { PERIODS, isPeriod, period } from "@/lib/dashboard-periods";
import { STAGES, board, isStage, type Card } from "@/lib/dashboard-board";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Crumbs, Leer, PageHead, ago2 } from "../v2";
import { readParams, withQuery, type SP } from "../params";
import { Icon } from "@/app/icons";
import { MobileTabs } from "../mobile-tabs";

function CardRow({ c, now }: { c: Card; now: Date }) {
  const inner = (
    <>
      <span className="cn">{c.company}</span>
      <span className="cm">
        <i style={{ background: COUNTRY_COLOR[c.country ?? ""] ?? "#c3bcae" }} />{c.country}
        {c.positive && <span className="pill t-gold">positiv</span>}
        {c.source !== "Mail" && <span className="pill t-next">{c.source}</span>}
        <span className="ca" title={c.since}>{ago2(c.since, now)}</span>
      </span>
    </>
  );
  return c.href ? <Link href={c.href} className="kcard">{inner}</Link> : <div className="kcard">{inner}</div>;
}

/** Wer ist wo: Stufen als Spalten (Anzahl + neueste Firmen); ?stufe= zeigt die ganze Liste einer Stufe. */
export default async function Kontakte({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, raw, one } = await readParams(searchParams);
  const stufe = one("stufe");
  const focus = isStage(stufe) ? stufe : null;
  // Zeitraum: Firmen, deren erste Mail im Zeitraum lag; Standard „Alle“
  const zRaw = one("z");
  const zk = isPeriod(zRaw) ? zRaw : null;
  const today = berlinDay(new Date());
  const p = zk ? period(zk, today) : null;
  const n = Math.min(1000, Math.max(50, Number(one("n")) || 100));
  const [liveAll, contacts] = await Promise.all([loadLive(), loadContacts(focus ? n : 8, p?.from ?? null, p?.to ?? null)]);
  const live = onlySegment(liveAll, SEGMENT);
  const inP = (ts: string | null) => !p || (!!ts && berlinDay(new Date(ts)) >= p.from && berlinDay(new Date(ts)) <= p.to);
  const cols = board(contacts, live.sample_requests.filter((r) => inP(r.created_at)), live.customers.filter((c) => inP(c.created_at)), countries);
  const now = new Date(live.now);
  const prm = { ...raw, z: zk ?? undefined };
  const base = { ...prm, stufe: focus ?? undefined };
  const zChips = (b: string, params: Record<string, string | undefined>) => (
    <Chips base={b} param="z" value={zk} options={[[null, "Alle"], ...PERIODS.map(([k, l]) => [k, l] as [string, string])]} params={params} />
  );

  if (focus) {
    const col = cols.find((c) => c.id === focus)!;
    return (
      <div className="v2">
        <Crumbs items={[["JARVIS", withQuery("/dashboard/jarvis", raw)], ["Kontakte", withQuery("/dashboard/kontakte", prm)], [col.label, ""]]} />
        <div className="head2">
          <Chips base="/dashboard/kontakte" param="stufe" value={focus} options={STAGES.map(([k, l]) => [k, l])} params={base} />
          <Chips base="/dashboard/kontakte" param="land" value={land} options={COUNTRY_OPTS} params={base} dots />
        </div>
        {zChips("/dashboard/kontakte", base)}
        <div className="big1"><b>{compact(col.count)}</b> {col.label} · {col.cards.length < col.count ? `neueste ${compact(col.cards.length)} von ${compact(col.count)}` : "alle"}</div>
        <div className="klist card">
          {col.cards.map((c) => <CardRow key={c.key} c={c} now={now} />)}
          {col.cards.length === 0 && <Leer icon="kontakte" text="Keine Firmen in dieser Stufe." />}
        </div>
        {col.count > col.cards.length && n < 1000 && (
          <Link className="more-btn" href={withQuery("/dashboard/kontakte", { ...base, n: String(Math.min(1000, n + 200)) })}>mehr laden ({compact(col.count - col.cards.length)} weitere)</Link>
        )}
      </div>
    );
  }

  return (
    <div className="v2">
      <PageHead title="Kontakte" icon="kontakte" crumbs={[["JARVIS", withQuery("/dashboard/jarvis", raw)], ["Kontakte", ""]]} />
      <div className="head2">{zChips("/dashboard/kontakte", prm)}<Chips base="/dashboard/kontakte" param="land" value={land} options={COUNTRY_OPTS} params={prm} dots /></div>
      <MobileTabs className="kanban" label="Stufen" tabs={cols.map((c) => ({ label: c.label, n: compact(c.count) }))}>
        {cols.map((col) => (
          <section key={col.id} className={`kcol ${col.id === "out" ? "out" : ""}`}>
            <Link href={withQuery("/dashboard/kontakte", { ...prm, stufe: col.id })} className="kh" title="ganze Liste">
              <b>{compact(col.count)}</b><span>{col.label}</span>
            </Link>
            <div className="kc">
              {col.cards.slice(0, 8).map((c) => <CardRow key={c.key} c={c} now={now} />)}
              {col.cards.length === 0 && <Leer small icon="kontakte" text="Noch keine." />}
              {col.count > Math.min(8, col.cards.length) && (
                <Link href={withQuery("/dashboard/kontakte", { ...prm, stufe: col.id })} className="kmore">alle {compact(col.count)} ansehen <Icon name="weiter" size={14} /></Link>
              )}
            </div>
          </section>
        ))}
      </MobileTabs>
    </div>
  );
}
