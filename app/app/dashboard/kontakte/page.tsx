import Link from "next/link";
import { SEGMENT, loadContacts, loadLive } from "@/lib/dashboard-data";
import { COUNTRY_COLOR, compact, onlySegment } from "@/lib/dashboard-logic";
import { STAGES, board, isStage, type Card } from "@/lib/dashboard-board";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Crumbs, ago2 } from "../v2";
import { readParams, withQuery, type SP } from "../params";

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
  const [liveAll, contacts] = await Promise.all([loadLive(), loadContacts(focus ? 200 : 8)]);
  const live = onlySegment(liveAll, SEGMENT);
  const cols = board(contacts, live.sample_requests, live.customers, countries);
  const now = new Date(live.now);
  const base = { ...raw, stufe: focus ?? undefined };

  if (focus) {
    const col = cols.find((c) => c.id === focus)!;
    return (
      <div className="v2">
        <Crumbs items={[["Übersicht", withQuery("/dashboard", raw)], ["Kontakte", withQuery("/dashboard/kontakte", raw)], [col.label, ""]]} />
        <div className="head2">
          <Chips base="/dashboard/kontakte" param="stufe" value={focus} options={STAGES.map(([k, l]) => [k, l])} params={base} />
          <Chips base="/dashboard/kontakte" param="land" value={land} options={COUNTRY_OPTS} params={base} dots />
        </div>
        <div className="big1"><b>{compact(col.count)}</b> {col.label}</div>
        <div className="klist card">
          {col.cards.map((c) => <CardRow key={c.key} c={c} now={now} />)}
          {col.cards.length === 0 && <div className="muted">keine</div>}
          {col.count > col.cards.length && <div className="muted small">neueste {col.cards.length} von {compact(col.count)}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", withQuery("/dashboard", raw)], ["Kontakte", ""]]} />
      <div className="head2"><span /><Chips base="/dashboard/kontakte" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots /></div>
      <div className="kanban">
        {cols.map((col) => (
          <section key={col.id} className={`kcol ${col.id === "out" ? "out" : ""}`}>
            <Link href={withQuery("/dashboard/kontakte", { ...raw, stufe: col.id })} className="kh" title="ganze Liste">
              <b>{compact(col.count)}</b><span>{col.label}</span>
            </Link>
            <div className="kc">
              {col.cards.slice(0, 8).map((c) => <CardRow key={c.key} c={c} now={now} />)}
              {col.count > Math.min(8, col.cards.length) && (
                <Link href={withQuery("/dashboard/kontakte", { ...raw, stufe: col.id })} className="kmore">+{compact(col.count - Math.min(8, col.cards.length))}</Link>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
