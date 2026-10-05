import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { berlin } from "@/lib/dashboard-logic";
import {
  ALL, LAYERS, PREMIUM_FOCUS, activeCountries, splitActive, baukastenHref, big, buyerTanks, checkRows, dbFill, dbRing, fmtBytes, layerShares, leadTanks, logHeight,
  premiumFree, premiumProben, premiumTanks, probenSummary, scaleTop, ticks, type LayerKey, type PremiumTank, type ProbeRow,
} from "@/lib/storage";
import { loadProben, loadStorage, type Storage } from "@/lib/storage-data";
import { loadPlanLog } from "@/lib/dashboard-data";
import { isTestSub, matrixRows, nextColor, poolDraft, poolTotals } from "@/lib/pools";
import { loadPools, type PoolsData } from "@/lib/pools-data";
import { requireOwner } from "../actions";
import { Icon } from "@/app/icons";
import { PageHead } from "../v2";
import { SPEICHER_CSS } from "./css";
import { Pools } from "./pools";
import { TankScroller } from "./scroller";
import { Fold } from "../fold";
import { CountUp } from "./count-up";
import opsConfig from "@/lib/ops-config.json";

/** Ruhende Märkte (nicht in config/fokus.yaml): eingeklappt, nur Land und Zahl – Daten bleiben (Inhaber 05.10.2026). */
function Ruht({ items }: { items: { country: string; n: number; href: string }[] }) {
  if (!items.length) return null;
  return (
    <details className="sp-ruht">
      <summary>ruht · {items.length} {items.length === 1 ? "Land" : "Länder"} <span>(nicht im Fokus, wird nicht befüllt)</span></summary>
      <div>{items.map((t) => <Link key={t.country} href={t.href}><b>{t.country}</b> {big(t.n)}</Link>)}</div>
    </details>
  );
}

export const metadata = { title: "Speicher" };
type SP = Promise<Record<string, string | string[] | undefined>>;

// Schichten von unten nach oben: Bodensatz zuerst, die freie Ware bildet die Oberfläche
const STACK: LayerKey[] = ["sonst", "abgelaufen", "zurueck", "geliefert", "proben", "frei"];
const LAYER = Object.fromEntries(LAYERS.map((l) => [l.key, l]));

type Layer = { c: string; n: number; title: string; pr?: boolean };
/** feste Funkel-Punkte der Premium-Schicht (x %, y %, Verzögerung s) – kein Zufall, damit Server und Browser gleich rendern */
const SPARKS = [[18, 30, 0], [62, 55, 0.7], [40, 78, 1.3], [80, 22, 1.9], [28, 62, 2.4], [70, 85, 0.4]] as const;
const Sparks = () => <>{SPARKS.map(([x, y, d], i) => <b key={i} className="sk" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />)}</>;
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
            {shown.map((l, i) => (
              <i key={i} className={[i === shown.length - 1 ? "tk-top" : "", l.pr ? "tk-pr" : ""].join(" ").trim() || undefined} style={{ "--c": l.c, flex: `0 0 ${l.share * 100}%` } as CSSProperties}>
                {l.pr && <Sparks />}
              </i>
            ))}
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
      <PageHead title="Speicher" icon="speicher" at={st.ok ? `Stand ${berlin(st.d.at, false)}` : undefined}
        crumbs={[["JARVIS", "/dashboard/jarvis"], ["Büro", "/dashboard/buero"], ["Speicher", ""]]}>{chips}</PageHead>
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
  const act = activeCountries((opsConfig as { fokus?: string[] }).fokus ?? [], seg);
  const { active: lt, resting: lRest } = splitActive(leadTanks(d, seg, d.segments), act);
  const pt = premiumTanks(d, seg);
  const lTop = scaleTop(Math.max(0, ...lt.map((t) => t.total)));
  const lTicks = ticks(lTop);
  const freeAll = lt.reduce((a, t) => a + t.layers.frei, 0);

  // ------------------------------------------------------------- Käufer (nur mail-fähig zählt)
  const { active: bt, resting: bRest } = splitActive(buyerTanks(d, d.segments, seg), act);
  const bTop = scaleTop(Math.max(0, ...bt.map((t) => t.mail)));
  const bTicks = ticks(bTop);
  const mailAll = bt.reduce((a, t) => a + t.mail, 0), callAll = bt.reduce((a, t) => a + t.callOnly, 0);

  // ------------------------------------------------------------- Datenbank, Proben, Freigabe
  const db = dbFill(d);
  const pb = proben ? probenSummary(proben, seg) : null;
  const gate = checkRows(d, seg);
  const gMax = Math.max(1, ...gate.map((g) => g.released + g.failed));

  return (
    <>
      <PremiumHero tanks={pt} seg={seg} />

      <section className="sp-card">
        <div className="sp-h">
          <h2>Kunden-Leads</h2><span className="sp-big">{big(freeAll)}</span><span className="sp-note">frei</span>
          <span className="sp-sp" /><span className="sp-note" title="Jeder Teilstrich = zehnmal so viel">log. Skala</span>
        </div>
        <TankScroller className="tk-row" style={{ "--n": lt.length } as CSSProperties}>
          {lt.map((t) => (
            <Tank key={t.country} href={baukastenHref(t.country, seg)} h={logHeight(t.total, lTop)} tk={lTicks}
              layers={leadLayers(t.layers, Math.min(t.layers.frei, premiumFree(d, seg, t.country)))}
              n={big(t.layers.frei)} label={t.country}
              sub={t.total > t.layers.frei ? <>von <b>{big(t.total)}</b></> : undefined} />
          ))}
        </TankScroller>
        <Ruht items={lRest.map((t) => ({ country: t.country, n: t.layers.frei, href: baukastenHref(t.country, seg) }))} />
        <Legend items={[{ c: "var(--pr)", label: "Premium frei" }, ...STACK.slice().reverse().filter((k) => k !== "sonst" || lt.some((t) => t.layers.sonst > 0)).map((k) => ({ c: `var(--l-${k})`, label: LAYER[k].label }))]} />
      </section>

      <section className="sp-card">
        <div className="sp-h">
          <h2>Käufer</h2><span className="sp-big">{big(mailAll)}</span><span className="sp-note">mail-fähig</span>
          <span className="sp-sp" /><span className="sp-note" title="call_only und Käufer außerhalb der Mail-Länder – zählen nicht als Käufer">{big(callAll)} nur Anruf/Brief (getrennt)</span>
        </div>
        <TankScroller className="tk-row gold" style={{ "--n": bt.length } as CSSProperties}>
          {bt.map((t) => (
            <Tank key={t.country} href={baukastenHref(t.country, seg, "kaeufer")} h={logHeight(t.mail, bTop)} tk={bTicks} off={!t.mailCountry}
              layers={[{ c: "var(--b-sent)", n: t.sent, title: "angeschrieben" }, { c: "var(--b-queued)", n: t.queued, title: "in Arbeit" }, { c: "var(--b-frei)", n: t.free, title: "noch frei" }]}
              n={t.mailCountry ? big(t.mail) : "–"} label={t.country}
              sub={t.mailCountry ? <><span><b>{big(t.free)}</b> frei</span><span className="dot"> · </span><span>{big(t.sent)} angeschr.</span></> : "kein Mail-Land"}
              call={t.callOnly > 0 ? <span className="tk-call" title="zählt nicht als Käufer"><Icon name="telefon" size={13} /> {big(t.callOnly)} <span>nur Anruf/Brief</span></span> : undefined}
              title={t.mailCountry ? `mail-fähig ${t.mail.toLocaleString("de-DE")} · angeschrieben ${t.sent.toLocaleString("de-DE")} · in Arbeit ${t.queued.toLocaleString("de-DE")} · noch frei ${t.free.toLocaleString("de-DE")} · nur Anruf/Brief ${t.callOnly.toLocaleString("de-DE")}` : `kein Mail-Land dieser Zielgruppe · nur Anruf/Brief ${t.callOnly.toLocaleString("de-DE")}`} />
          ))}
        </TankScroller>
        <Ruht items={bRest.map((t) => ({ country: t.country, n: t.mail, href: baukastenHref(t.country, seg, "kaeufer") }))} />
        <Legend items={[{ c: "var(--b-frei)", label: "noch frei" }, { c: "var(--b-queued)", label: "in Arbeit" }, { c: "var(--b-sent)", label: "angeschrieben" }]} />
      </section>

      <div className="sp-row3">
        <Fold id="speicher-datenbank" className={`sp-card sp-lvl-${db.level}`} head="sp-h" title={<h2>Datenbank</h2>}
          sum={<><span className="sp-big">{Math.round(db.pct * 100)} %</span><span className="sp-note">{fmtBytes(db.used)} von 8 GB</span></>}>
          <div className="sp-db">
            <DbRing used={db.used} />
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
        </Fold>

        <Fold id="speicher-proben" className="sp-card" head="sp-h" title={<h2>Proben-Vorrat</h2>}
          sum={pb ? <><span className="sp-big">{pb.ready}/{pb.target}</span><span className="sp-note">fertig / Soll · <Icon name="premium" size={12} /> {pb.rows.reduce((a, r) => a + Math.min(r.ready, premiumProben(d, r.key) ?? 0), 0)} Premium</span></> : null}>
          {!pb ? <p className="sp-none">Vorrat gerade nicht erreichbar.</p> : !pb.rows.length ? <p className="sp-none">Keine Live-Seite.</p> : (
            <div className="tk-row small">
              {pb.rows.map((r) => {
                const [s, c] = r.key.split("/");
                const prem = Math.min(r.ready, premiumProben(d, r.key) ?? 0);
                const col = r.ready >= r.target ? "var(--green)" : r.ready ? "var(--amber)" : "var(--red)";
                return (
                  <Tank key={r.key} href={baukastenHref(c, s)} h={r.pct}
                    layers={[{ c: col, n: r.ready - prem, title: "fertig" }, { c: "var(--pr)", n: prem, title: "Premium-Proben", pr: true }]}
                    n={<>{r.ready}<small>/{r.target}</small></>} label={seg === ALL ? r.key : c}
                    sub={prem > 0 ? <span className="tk-prn"><Icon name="premium" size={12} />{prem}</span> : undefined}
                    title={`${r.slug ?? r.key}: ${r.ready} fertig (davon ${prem} Premium-Proben), Soll ${r.target}`} />
                );
              })}
            </div>
          )}
        </Fold>

        <Fold id="speicher-freigabe" className="sp-card" head="sp-h" title={<h2>Freigabe</h2>} sum={<span className="sp-note">{gate.length ? `${gate.length} Länder` : "Drei-Stufen-Prüfung"}</span>}>
          <p className="fold-note">Drei-Stufen-Prüfung je Land</p>
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
        </Fold>
      </div>
    </>
  );
}

/** Schichten eines Lead-Tanks: freie Leads geteilt in Standard (cyan) und Premium (Gold, funkelt, ganz oben). */
function leadLayers(l: Record<LayerKey, number>, prem: number): Layer[] {
  return [
    ...STACK.map((k) => ({ c: `var(--l-${k})`, n: k === "frei" ? l.frei - prem : l[k], title: k === "frei" ? "frei (Standard)" : LAYER[k].label })),
    { c: "var(--pr)", n: prem, title: "Premium frei", pr: true },
  ];
}

/**
 * Premium frei je Land (Inhaber 05.10.2026: „auch mit premium leads angezeigt“): große Zahl = freie Premium-Firmen
 * (wie premium_status), Balken frei / in Proben / geliefert, darunter fertige Premium-Proben. Kriterium in der DB.
 */
function PremiumHero({ tanks, seg }: { tanks: PremiumTank[]; seg: string }) {
  const total = tanks.reduce((a, t) => a + t.frei, 0);
  const andere = tanks.reduce((a, t) => a + t.andere, 0);
  return (
    <section className="sp-card pr-card" aria-label="Premium frei">
      <div className="sp-h">
        <h2><Icon name="premium" size={16} /> Premium frei</h2><span className="sp-big pr-big"><CountUp to={total} fmt="int" /></span>
        <span className="sp-note">{seg === ALL ? "alle Zielgruppen" : seg === PREMIUM_FOCUS ? "Webagenturen" : seg}</span>
        <span className="sp-sp" />
        {andere > 0 && <span className="sp-note" title="freie Premium-Firmen in anderen Zielgruppen (zusammengefasst)">+{big(andere)} andere Zielgruppen</span>}
      </div>
      <div className="pr-grid">
        {tanks.map((t) => {
          const sum = t.frei + t.proben + t.geliefert;
          const w = (n: number) => `${sum ? (n / sum) * 100 : 0}%`;
          const tip = `${t.country}: ${t.frei.toLocaleString("de-DE")} frei · ${t.proben.toLocaleString("de-DE")} in Proben · ${t.geliefert.toLocaleString("de-DE")} geliefert`
            + ` · ${t.zurueck.toLocaleString("de-DE")} zurückgehalten · Premium-Proben ${t.probenPremium}/${t.probenFertig}`
            + (t.andere ? ` · ${t.andere.toLocaleString("de-DE")} frei in anderen Zielgruppen` : "");
          return (
            <Link key={t.country} href={baukastenHref(t.country, seg)} className={`pr-c${t.frei ? "" : " leer"}`} title={tip}>
              <span className="pr-gem" aria-hidden><Icon name="premium" size={26} /><Sparks /></span>
              <span className="pr-land">{t.country}</span>
              <b className="pr-n"><CountUp to={t.frei} /></b>
              <span className="pr-bar" aria-hidden><i className="f" style={{ width: w(t.frei) }} /><i className="p" style={{ width: w(t.proben) }} /><i className="g" style={{ width: w(t.geliefert) }} /></span>
              <span className="pr-s pr-det"><span><b>{big(t.proben)}</b> in Proben</span><span>·</span><span><b>{big(t.geliefert)}</b> geliefert</span></span>
              <span className="pr-s pr-pb" title="fertige Proben, davon reine Premium-Proben (10 von 10)"><Icon name="proben" size={13} /><span><b>{t.probenPremium}</b>/{t.probenFertig}</span><span className="pr-w">Premium-Proben</span></span>
            </Link>
          );
        })}
      </div>
      <Legend items={[{ c: "var(--pr)", label: "frei" }, { c: "var(--pr-p)", label: "in Proben" }, { c: "var(--l-geliefert)", label: "geliefert" }]} />
    </section>
  );
}

/** Datenbank als Ring gegen 8 GB mit Marken Bremse 6 GB / Stopp 7,5 GB / Grenze 8 GB. */
function DbRing({ used }: { used: number }) {
  const r = dbRing(used);
  const R = 52, C = 2 * Math.PI * R;
  const pt = (at: number, rr: number) => {
    const a = at * 2 * Math.PI - Math.PI / 2;
    return [60 + rr * Math.cos(a), 60 + rr * Math.sin(a)] as const;
  };
  return (
    <div className={`sp-ring lvl-${r.level}`} title={`${fmtBytes(used)} belegt · noch ${fmtBytes(r.toBrake)} bis zur Bremse (6 GB)`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`Datenbank ${fmtBytes(used)} von 8 GB`}>
        <circle className="rg-bg" cx="60" cy="60" r={R} />
        <circle className="rg-zone" cx="60" cy="60" r={R} style={{ strokeDasharray: `${C * 0.25} ${C}`, strokeDashoffset: -C * 0.75 }} />
        <circle className="rg-fg" cx="60" cy="60" r={R} style={{ strokeDasharray: `${C * r.pct} ${C}`, "--c0": `${C}` } as CSSProperties} />
        {r.marks.map((m) => {
          const [x1, y1] = pt(m.at, R - 9), [x2, y2] = pt(m.at, R + 9);
          return <line key={m.gb} className={`rg-mk m${String(m.gb).replace(".", "")}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </svg>
      <div className="rg-in"><b>{r.gb.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</b><span>von 8 GB</span></div>
      <div className="rg-lg">
        {r.marks.map((m) => <span key={m.gb} className={`m${String(m.gb).replace(".", "")}`}><i />{m.gb.toLocaleString("de-DE")} {m.label}</span>)}
      </div>
    </div>
  );
}
