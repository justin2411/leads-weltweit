import Link from "next/link";
import { Icon } from "@/app/icons";
import { bueroGruppen, type Kachel, type Viz } from "@/lib/buero-kacheln";
import { canDispatch, loadFunnelCache } from "@/lib/dashboard-data";
import { db } from "@/lib/supabase";
import { loadZentrale } from "@/lib/zentrale-data";
import type { Ton } from "@/lib/zentrale-logik";
import { nowMs } from "@/lib/zentrale-modell";
import { requireOwner } from "../actions";
import { PageHead } from "../v2";
import { BUERO_CSS } from "./buero-css";
import { Countdown, ZahlHoch } from "./zahl";

export const metadata = { title: "Büro" };
export const dynamic = "force-dynamic";

/**
 * Büro (JARVIS-Zentrale 05.10.2026, hochwertig 05.10.2026): alle Detail-Seiten als Kacheln nach Bereichen
 * (firma-karte.json). Je Kachel eine Live-Kennzahl groß + Mini-Grafik (lib/buero-kacheln.ts), je Bereich Akzentfarbe
 * und Ampel. Nur Caches und kleine Zählungen mit Zeitlimit – fällt etwas aus, steht „–“ statt einer falschen Zahl.
 */
const mitLimit = <T,>(p: Promise<T>, ms: number, dflt: T): Promise<T> =>
  Promise.race([p.catch(() => dflt), new Promise<T>((ok) => setTimeout(() => ok(dflt), ms))]);

async function flowsAnzahl(): Promise<number | null> {
  const { count, error } = await db().from("flows").select("id", { count: "exact", head: true }).neq("status", "archiv")
    .abortSignal(AbortSignal.timeout(1500));
  return error ? null : count ?? null;
}

const TON_WORT: Record<Ton, string> = { gruen: "läuft", gelb: "Achtung", rot: "Engpass", grau: "keine Messung" };

function VizBild({ v }: { v: Viz }) {
  if (v.art === "ring") {
    const r = 17, u = 2 * Math.PI * r;
    return (
      <svg className="bu-ring" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} className="bg" />
        <circle cx="22" cy="22" r={r} className="fg" strokeDasharray={`${(v.anteil * u).toFixed(1)} ${u.toFixed(1)}`} transform="rotate(-90 22 22)" />
        <text x="22" y="26" textAnchor="middle">{Math.round(v.anteil * 100)}%</text>
      </svg>
    );
  }
  if (v.art === "saeulen") {
    const max = Math.max(1, ...v.werte);
    return (
      <span className="bu-saeulen" aria-hidden="true">
        {v.werte.map((w, i) => (
          <i key={i} title={`${v.namen[i]}: ${Math.round(w).toLocaleString("de-DE")}`}
            style={{ height: `${Math.max(8, (w / max) * 100)}%`, opacity: 0.55 + 0.45 * ((i + 1) / v.werte.length) }} />
        ))}
      </span>
    );
  }
  if (v.art === "ampel") return <span className={`bu-ampel t-${v.ton}`} aria-hidden="true"><i /><i /><i /></span>;
  return null;
}

function KachelBild({ k, i }: { k: Kachel; i: number }) {
  const balken = k.viz?.art === "balken" ? k.viz.anteil : null;
  const seite = k.viz && k.viz.art !== "balken" ? k.viz : null;
  return (
    <Link href={k.href} className={`bu-t t-${k.ton}${k.gold ? " gold" : ""}`} title={k.tip} style={{ ["--i" as string]: i }}>
      <span className="bu-th">
        <span className="ic"><Icon name={k.icon} size={16} /></span>
        <b>{k.titel}</b>
        <span className={`dot t-${k.ton}`} title={TON_WORT[k.ton]} />
      </span>
      <span className="bu-tm">
        <span className={`z${k.text.length > 7 ? " lang" : ""}`}>
          {k.bis ? <Countdown bis={k.bis} text={k.text} /> : k.wert !== null ? <ZahlHoch wert={k.wert} dez={k.dez} vor={k.vor} nach={k.nach} /> : k.text}
        </span>
        {seite && <VizBild v={seite} />}
      </span>
      <span className="u">{k.unter}</span>
      {balken !== null && <span className="bu-bar" aria-hidden="true"><i style={{ width: `${Math.round(balken * 100)}%` }} /></span>}
    </Link>
  );
}

export default async function Buero() {
  await requireOwner();
  const [z, funnel, flows] = await Promise.all([
    loadZentrale("alle"),
    mitLimit(loadFunnelCache(), 2500, null),
    mitLimit(flowsAnzahl(), 2000, null),
  ]);
  const { schnell: s, langsam: l } = z;
  const all = (p: "24h" | "7d" | "30d") => { const x = funnel?.p?.[p]?.all; return typeof x === "number" ? x : null; };
  const besucher = funnel?.p ? { h24: all("24h"), d7: all("7d"), d30: all("30d") } : null;
  const gruppen = bueroGruppen(s, l, { besucher, flows, dispatch: canDispatch(), now: nowMs(s, z.abruf) });
  let i = 0;
  return (
    <div className="v2 buero">
      <style dangerouslySetInnerHTML={{ __html: BUERO_CSS }} />
      <PageHead title="Büro" icon="buero" sub="Alle Bereiche auf einen Blick" crumbs={[["JARVIS", "/dashboard/jarvis"], ["Büro", ""]]} />
      <div className="bu-grid">
        {gruppen.map((g) => (
          <section key={g.slug} className={`bu-g n${g.kacheln.length}`} aria-label={g.name} style={{ ["--ac" as string]: g.farbe }}>
            <h2>
              <Link href={`/dashboard/buero/bereich/${g.slug}`} title={`Büro ${g.name}: Team, Kohorten, Vorschläge`}>
                <span className="ic"><Icon name={g.icon} size={16} /></span><span className="nm">{g.name}</span><Icon name="weiter" size={14} />
              </Link>
              <span className={`dot t-${g.ton}`} title={`Bereich: ${TON_WORT[g.ton]}`} role="img" aria-label={`Bereich: ${TON_WORT[g.ton]}`} />
            </h2>
            <div className="bu-k">
              {g.kacheln.map((k) => <KachelBild key={k.href} k={k} i={i++} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
