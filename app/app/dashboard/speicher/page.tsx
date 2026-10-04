import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { berlin } from "@/lib/dashboard-logic";
import {
  ALL, LAYERS, baukastenHref, big, buyerTanks, checkRows, dbFill, fmtBytes, layerShares, leadTanks, logHeight, probenSummary,
  scaleTop, ticks, type LayerKey, type ProbeRow,
} from "@/lib/storage";
import { loadProben, loadStorage, type Storage } from "@/lib/storage-data";
import { loadPlanLog } from "@/lib/dashboard-data";
import { isTestSub, matrixRows, nextColor, poolDraft, poolTotals } from "@/lib/pools";
import { loadPools, type PoolsData } from "@/lib/pools-data";
import { requireOwner } from "../actions";
import { Icon } from "@/app/icons";
import { SPEICHER_CSS } from "./css";
import { Pools } from "./pools";

export const metadata = { title: "Speicher" };
type SP = Promise<Record<string, string | string[] | undefined>>;

// Schichten von unten nach oben: Bodensatz zuerst, die freie Ware bildet die Oberfläche
const STACK: LayerKey[] = ["sonst", "abgelaufen", "zurueck", "geliefert", "proben", "frei"];
const LAYER = Object.fromEntries(LAYERS.map((l) => [l.key, l]));

type Layer = { c: string; n: number; title: string };
type Tick = { at: number; label: string };

/** Glas-Tank: Füllhöhe h (0…1), Schichten anteilig, Welle in der Farbe der obersten Schicht. Ganzer Tank = Link. */
function Tank({ href, h, layers, tk = [], n, label, sub, call, off, title }: {
  href?: string; h: number; layers: Layer[]; tk?: Tick[]; n: ReactNode; label: ReactNode; sub?: ReactNode; call?: ReactNode;
  off?: boolean; title?: string;
}) {
  const shares = layerShares(layers.map((l) => l.n));
  const shown = layers.map((l, i) => ({ ...l, share: shares[i] })).filter((l) => l.share > 0);
  const top = shown.at(-1);
  const body = (
    <>
      <div className="tk-glass" aria-hidden>
        {tk.map((t) => <div key={t.label} className={`tk-tick${t.at > 0.94 ? " top" : ""}`} style={{ bottom: `${t.at * 100}%` }}><span>{t.label}</span></div>)}
        {h > 0 && top ? (
          <div className="tk-liq" style={{ height: `${Math.max(h, 0.025) * 100}%`, "--wc": top.c } as CSSProperties}>
            {shown.map((l, i) => <i key={i} className={i === shown.length - 1 ? "tk-top" : undefined} style={{ "--c": l.c, flex: `0 0 ${l.share * 100}%` } as CSSProperties} />)}
            <div className="tk-wave b" /><div className="tk-wave" /><div className="tk-glow" />
          </div>
        ) : <div className="tk-empty">leer</div>}
      </div>
      <b className="tk-n">{n}</b>
      <span className="tk-c">{label}</span>
      {sub && <span className="tk-s">{sub}</span>}
      {call}
    </>
  );
  const tip = title ?? layers.filter((l) => l.n > 0).map((l) => `${l.title}: ${l.n.toLocaleString("de-DE")}`).join(" · ");
  return href
    ? <Link href={href} className={`tk${off ? " off" : ""}`} title={tip}>{body}</Link>
    : <div className={`tk${off ? " off" : ""}`} title={tip}>{body}</div>;
}

function Legend({ items }: { items: { c: string; label: string }[] }) {
  return <div className="sp-legend">{items.map((x) => <span key={x.label} style={{ "--c": x.c } as CSSProperties}><i />{x.label}</span>)}</div>;
}

/**
 * Speicher (Inhaber 03.10.2026: „wie voll die Speicher sind – Kunden-Leads je Land“): Glas-Tanks je Land für
 * Kunden-Leads (log. Skala, Schichten je Status) und mail-fähige Käufer, dazu Datenbank gegen 8 GB, Proben-Vorrat
 * gegen Soll und die Drei-Stufen-Freigabe je Land. Jeder Tank öffnet den Baukasten mit dieser Quelle.
 */
export default async function Speicher({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const raw = typeof sp.seg === "string" ? sp.seg : "S2";
  const seg = raw === ALL || /^S\d{1,2}$/.test(raw) ? raw : "S2";
  const [st, pr, plans, pl] = await Promise.all([
    loadStorage().then((d) => ({ ok: true as const, d }), (e: unknown) => {
      console.error("speicher:", e); // Details nur im Server-Protokoll, nie im Browser
      return { ok: false as const };
    }),
    loadProben().catch(() => null as ProbeRow[] | null),
    loadPlanLog(),
    loadPools().then((d) => ({ ok: true as const, d }), (e: unknown) => {
      console.error("speicher pools:", e);
      return { ok: false as const };
    }),
  ]);
  // Speicher-Bremse (Nachtschicht 04.10.2026): Stufe aus der letzten Verteilung eines Werks (werk_plan_log)
  const lastPlan = [plans["lead-werk"], plans["kunden-werk"]].filter(Boolean).sort((a, b) => b!.at.localeCompare(a!.at))[0];
  const brake = lastPlan ? { level: lastPlan.bremse as string, at: lastPlan.at } : null;

  const chips = (
    <nav className="sp-chips" aria-label="Zielgruppe">
      {[["S2", "Webagenturen"], [ALL, "alle"]].map(([v, l]) => (
        <Link key={v} href={v === "S2" ? "/dashboard/speicher" : `/dashboard/speicher?seg=${v}`} className={seg === v ? "on" : undefined} aria-current={seg === v ? "page" : undefined}>{l}</Link>
      ))}
    </nav>
  );

  return (
    <div className="sp">
      <style dangerouslySetInnerHTML={{ __html: SPEICHER_CSS }} />
      <div className="sp-head">
        <h1>Speicher</h1>
        {chips}
        <span className="sp-at">{st.ok ? `Stand ${berlin(st.d.at, false)}` : ""}</span>
      </div>
      {st.ok ? <Body d={st.d} seg={seg} proben={pr} brake={brake} /> : (
        <section className="sp-card sp-err"><p className="sp-none">Speicher-Zahlen gerade nicht erreichbar – gleich noch einmal laden.</p></section>
      )}
      <PoolsBlock r={pl} />
    </div>
  );
}

/** Eigene Speicher: Daten für den Client-Teil aufbereiten (nur Namen/Zahlen, keine Lead-Daten). */
function PoolsBlock({ r }: { r: { ok: true; d: PoolsData } | { ok: false } }) {
  const d: PoolsData = r.ok ? r.d : { pools: [], counts: [], routes: [], segments: [], subs: [] };
  const tot = poolTotals(d.pools, d.counts);
  const pools = d.pools.map((p) => ({ ...p, ...(tot.get(p.id) ?? { total: 0, byCountry: [] }) }));
  // Testkäufe ans Ende, sonst neueste zuerst (Reihenfolge aus der Abfrage)
  const subs = d.subs.filter((s) => s.customer).map((s) => ({
    id: s.id, company: s.customer!.company_name, country: s.customer!.country, segment: s.segment_id, pkg: s.package,
    test: isTestSub(s), paused: s.status === "paused",
  })).sort((a, b) => Number(a.test) - Number(b.test));
  const subRoute = Object.fromEntries(d.subs.map((s) => [s.id, { segment_id: s.segment_id, country: s.customer?.country ?? null }]));
  return (
    <Pools pools={pools} rows={matrixRows(d.segments, d.routes)} saved={poolDraft(d.routes, d.subs.filter((s) => s.customer))} subs={subs}
      subRoute={subRoute} error={r.ok ? null : "nicht lesbar"} newColor={nextColor(d.pools)} />
  );
}

const BREMSE: Record<string, string> = { aus: "aus", hinweis: "Hinweis (ab 5,5 GB)", drossel: "Drossel: höchstens 8 Lead-Plätze (ab 6 GB)",
  "ohne-rohbestand": "nur noch grüne Leads, kein Rohbestand (ab 7 GB)", stopp: "Lead-Werk gestoppt (ab 7,5 GB)" };

function Body({ d, seg, proben, brake }: { d: Storage; seg: string; proben: ProbeRow[] | null; brake: { level: string; at: string } | null }) {
  // ------------------------------------------------------------- Kunden-Leads
  const lt = leadTanks(d, seg);
  const lTop = scaleTop(Math.max(0, ...lt.map((t) => t.total)));
  const lTicks = ticks(lTop);
  const freeAll = lt.reduce((a, t) => a + t.layers.frei, 0);

  // ------------------------------------------------------------- Käufer (nur mail-fähig zählt)
  const bt = buyerTanks(d, d.segments, seg);
  const bTop = scaleTop(Math.max(0, ...bt.map((t) => t.mail)));
  const bTicks = ticks(bTop);
  const mailAll = bt.reduce((a, t) => a + t.mail, 0), callAll = bt.reduce((a, t) => a + t.callOnly, 0);

  // ------------------------------------------------------------- Datenbank, Proben, Freigabe
  const db = dbFill(d);
  const dbTicks = [2, 4, 6, 8].map((g) => ({ at: g / 8, label: `${g} GB` }));
  const dbColor = db.level === "rot" ? "var(--red)" : db.level === "gelb" ? "var(--amber)" : "var(--cy)";
  const pb = proben ? probenSummary(proben, seg) : null;
  const gate = checkRows(d, seg);
  const gMax = Math.max(1, ...gate.map((g) => g.released + g.failed));

  return (
    <>
      <section className="sp-card">
        <div className="sp-h">
          <h2>Kunden-Leads</h2><span className="sp-big">{big(freeAll)}</span><span className="sp-note">frei</span>
          <span className="sp-sp" /><span className="sp-note" title="Jeder Teilstrich = zehnmal so viel">log. Skala</span>
        </div>
        <div className="tk-row" style={{ "--n": lt.length } as CSSProperties}>
          {lt.map((t) => (
            <Tank key={t.country} href={baukastenHref(t.country, seg)} h={logHeight(t.total, lTop)} tk={lTicks}
              layers={STACK.map((k) => ({ c: `var(--l-${k})`, n: t.layers[k], title: LAYER[k].label }))}
              n={big(t.layers.frei)} label={t.country}
              sub={t.total > t.layers.frei ? <>von <b>{big(t.total)}</b></> : undefined} />
          ))}
        </div>
        <Legend items={STACK.slice().reverse().filter((k) => k !== "sonst" || lt.some((t) => t.layers.sonst > 0)).map((k) => ({ c: `var(--l-${k})`, label: LAYER[k].label }))} />
      </section>

      <section className="sp-card">
        <div className="sp-h">
          <h2>Käufer</h2><span className="sp-big">{big(mailAll)}</span><span className="sp-note">mail-fähig</span>
          <span className="sp-sp" /><span className="sp-note" title="call_only und Käufer außerhalb der Mail-Länder – zählen nicht als Käufer">{big(callAll)} nur Anruf/Brief (getrennt)</span>
        </div>
        <div className="tk-row gold" style={{ "--n": bt.length } as CSSProperties}>
          {bt.map((t) => (
            <Tank key={t.country} href={baukastenHref(t.country, seg, "kaeufer")} h={logHeight(t.mail, bTop)} tk={bTicks} off={!t.mailCountry}
              layers={[{ c: "var(--b-sent)", n: t.sent, title: "angeschrieben" }, { c: "var(--b-queued)", n: t.queued, title: "in Arbeit" }, { c: "var(--b-frei)", n: t.free, title: "noch frei" }]}
              n={t.mailCountry ? big(t.mail) : "–"} label={t.country}
              sub={t.mailCountry ? <><span><b>{big(t.free)}</b> frei</span><span className="dot"> · </span><span>{big(t.sent)} angeschr.</span></> : "kein Mail-Land"}
              call={t.callOnly > 0 ? <span className="tk-call" title="zählt nicht als Käufer"><Icon name="telefon" size={13} /> {big(t.callOnly)} <span>nur Anruf/Brief</span></span> : undefined}
              title={t.mailCountry ? `mail-fähig ${t.mail.toLocaleString("de-DE")} · angeschrieben ${t.sent.toLocaleString("de-DE")} · in Arbeit ${t.queued.toLocaleString("de-DE")} · noch frei ${t.free.toLocaleString("de-DE")} · nur Anruf/Brief ${t.callOnly.toLocaleString("de-DE")}` : `kein Mail-Land dieser Zielgruppe · nur Anruf/Brief ${t.callOnly.toLocaleString("de-DE")}`} />
          ))}
        </div>
        <Legend items={[{ c: "var(--b-frei)", label: "noch frei" }, { c: "var(--b-queued)", label: "in Arbeit" }, { c: "var(--b-sent)", label: "angeschrieben" }]} />
      </section>

      <div className="sp-row3">
        <section className={`sp-card sp-lvl-${db.level}`}>
          <div className="sp-h"><h2>Datenbank</h2><span className="sp-big">{Math.round(db.pct * 100)} %</span><span className="sp-note">{fmtBytes(db.used)} von 8 GB</span></div>
          <div className="sp-db">
            <Tank h={Math.min(1, db.pct)} tk={dbTicks} layers={[{ c: dbColor, n: db.used, title: "belegt" }]} n={fmtBytes(db.free)} label="frei"
              title={`${fmtBytes(db.used)} belegt · ${fmtBytes(db.free)} frei bis 8 GB`} />
            <div className="sp-tbl">
              {db.tables.map((t) => (
                <div key={t.name} title={t.name}><span>{t.label}</span><b>{fmtBytes(t.bytes)}</b><em><i style={{ width: `${Math.max(2, t.pct * 100)}%` }} /></em></div>
              ))}
            </div>
          </div>
          <p className="sp-cost"><b>Supabase Pro: 8 GB inklusive</b>, darüber kostet es extra.</p>
          <p className="sp-cost" title="Stufen: ab 5,5 GB Hinweis · ab 6 GB höchstens 8 Lead-Plätze · ab 7 GB kein Rohbestand mehr · ab 7,5 GB Lead-Werk gestoppt · zurück erst 0,2 GB darunter">
            <Icon name="speicher" size={14} /> Speicher-Bremse: <b>{brake ? BREMSE[brake.level] ?? brake.level : "noch keine Messung"}</b>
            {brake && <> · geprüft {berlin(brake.at)}</>}</p>
        </section>

        <section className="sp-card">
          <div className="sp-h"><h2>Proben-Vorrat</h2>{pb && <><span className="sp-big">{pb.ready}/{pb.target}</span><span className="sp-note">fertig / Soll</span></>}</div>
          {!pb ? <p className="sp-none">Vorrat gerade nicht erreichbar.</p> : !pb.rows.length ? <p className="sp-none">Keine Live-Seite.</p> : (
            <div className="tk-row small">
              {pb.rows.map((r) => {
                const [s, c] = r.key.split("/");
                return (
                  <Tank key={r.key} href={baukastenHref(c, s)} h={r.pct} layers={[{ c: r.ready >= r.target ? "var(--green)" : r.ready ? "var(--amber)" : "var(--red)", n: r.ready, title: "fertig" }]}
                    n={<>{r.ready}<small>/{r.target}</small></>} label={seg === ALL ? r.key : c} title={`${r.slug ?? r.key}: ${r.ready} fertig, Soll ${r.target}`} />
                );
              })}
            </div>
          )}
        </section>

        <section className="sp-card">
          <div className="sp-h"><h2>Freigabe</h2><span className="sp-note">Drei-Stufen-Prüfung je Land</span></div>
          {!gate.length ? <p className="sp-none">Noch keine Prüfungen.</p> : (
            <div className="sp-gate">
              {gate.map((g) => (
                <Link key={g.country} href={baukastenHref(g.country, seg)} title={`${g.released.toLocaleString("de-DE")} freigegeben · ${g.failed.toLocaleString("de-DE")} zurückgehalten`}>
                  <span className="c">{g.country}</span>
                  <span className="bar"><i className="ok" style={{ width: `${(g.released / gMax) * 100}%` }} /><i className="bad" style={{ width: `${g.failed ? Math.max(1.5, (g.failed / gMax) * 100) : 0}%` }} /></span>
                  <span className="v"><b>{big(g.released)}</b> <Icon name="ok" size={13} title="freigegeben" /> · <span className={g.failed ? "r" : undefined}>{g.failed} <Icon name="fehler" size={13} title="zurückgehalten" /> ({(g.failPct * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %)</span></span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
