"use client";
/**
 * JARVIS-Zentrale, Kennzahlen (Inhaber 05.10.2026: „alle benötigten KPIs sehen … Website-Daten wie bei Google Analytics
 * mit einem Trichter“ + Ziel 25.000 €/Monat). Drei Teile, alle live aus der Datenbank, wenig Text, große Grafik:
 *  - KPI-Leiste: zehn Kacheln (Mails … Werke belegt/40), Zeitraum wie der Trichter (Heute/7/30 T)
 *  - Ziel-Ring 25.000 €/Monat (Gold = Geld): MRR, Lücke und Weg als Punkte – ein Punkt = ein Pro-Kunde (249)
 *  - Website-Trichter Besucher → Probe-Klick → Probe-Anfrage → Checkout → Kunde je Land, Quellen und Seiten
 * Bewegung nur mit Bedeutung: Balken und Ring füllen einmal (300 ms), Lichtpunkt-Tempo im Trichter = Durchsatz je Stunde;
 * „Bewegung reduzieren“: alles statisch. Daten des Trichters: GET /api/jarvis/trichter (eigene Messung, kein Pixel).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/app/icons";
import {
  STUFEN, TRICHTER_LAENDER, TRICHTER_TAGE, tageLabel, stundenIm, kpiLeiste, stufenBreite, zielWeg, type Kpi, type LandWahl, type Tage, type TrichterPaket,
} from "@/lib/jarvis-kpi";
import { partikel } from "@/lib/zentrale-logik";
import type { Extra } from "@/lib/zentrale-typen";

const de = (n: number) => Math.round(n).toLocaleString("de-DE");
const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: x * 100 < 10 ? 1 : 0 })} %`);
const QUELLE: Record<string, string> = { mail: "Mail", direkt: "Direkt", suche: "Suche", andere: "Andere" };
const uhr = (iso: string | null) => (iso ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "–");
const TRICHTER_MS = 5 * 60_000;

/** Einmal füllen: false beim ersten Zeichnen, danach true (CSS-Übergang 300 ms). */
function useErst(): boolean {
  const [da, setDa] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setDa(true)); return () => cancelAnimationFrame(t); }, []);
  return da;
}

function KpiKachel({ k, da }: { k: Kpi; da: boolean }) {
  return (
    <Link href={k.href} className={`jz-kpi-k t-${k.ton}`} title={k.tip} aria-label={`${k.label}: ${k.wert} ${k.unter}`}>
      <span className="l">{k.label}</span>
      <b className="z">{k.wert}</b>
      <span className="u">{k.unter}</span>
      {k.anteil !== null && <i className="bar" aria-hidden><i style={{ transform: `scaleX(${da ? k.anteil : 0})` }} /></i>}
    </Link>
  );
}

function ZielRing({ mrr, kunden, da }: { mrr: number | null; kunden: number | null; da: boolean }) {
  const w = zielWeg(mrr, kunden);
  const R = 70, C = 2 * Math.PI * R;
  const haben = Math.max(0, Math.min(w.kundenGesamt, Math.round((w.ist ?? 0) / w.preis)));
  return (
    <section className="p jz-ring25" aria-label="Umsatz-Ziel">
      <h2><Icon name="flagge" size={16} />Ziel 25.000 €/Monat<span className="r">{pct(w.ist === null ? null : w.anteil)}</span></h2>
      <div className="in">
        <Link href="/dashboard/finanzen" className="rg" title={`MRR ${w.ist === null ? "–" : de(w.ist)} € von ${de(w.ziel)} €`}>
          <svg viewBox="0 0 168 168" aria-hidden>
            <circle cx="84" cy="84" r={R} className="tr" />
            <circle cx="84" cy="84" r={R} className="vl" transform="rotate(-90 84 84)" strokeDasharray={`${((da ? w.anteil : 0) * C).toFixed(1)} ${C.toFixed(1)}`} />
          </svg>
          <span className="mitte">
            <b className="z">{w.ist === null ? "–" : `${de(w.ist)} €`}</b>
            <span>von {de(w.ziel)} €</span>
          </span>
        </Link>
        <div className="weg">
          <p className="zeile"><b className="z">{de(w.kundenNoch)}</b> Kunden fehlen <span>bei Pro {de(w.preis)}</span></p>
          <div className="pkt" role="img" aria-label={`${haben} von ${w.kundenGesamt} Pro-Kunden`} title={`ein Punkt = ein Pro-Kunde (${de(w.preis)} €/Monat)`}>
            {Array.from({ length: w.kundenGesamt }, (_, i) => <i key={i} className={i < haben ? "an" : ""} />)}
          </div>
          <p className="fuss"><span className="mono">{w.kunden === null ? "–" : de(w.kunden)}</span> zahlend · Lücke <span className="mono">{de(w.fehlt)} €</span></p>
        </div>
      </div>
    </section>
  );
}

function WebTrichter({ paket, tage, setTage, land, setLand, laedt, bewegung, da }: {
  paket: TrichterPaket | null; tage: Tage; setTage: (t: Tage) => void; land: LandWahl; setLand: (l: LandWahl) => void;
  laedt: boolean; bewegung: boolean; da: boolean;
}) {
  const t = paket?.je[land] ?? null;
  const stufen = t?.stufen ?? STUFEN.map((s) => ({ ...s, n: 0, quote: null }));
  const breite = stufenBreite(stufen);
  const leer = !t || stufen.every((s) => s.n === 0);
  const qMax = Math.max(1, ...(t?.quellen ?? []).map((q) => q.n));
  const sMax = Math.max(1, ...(t?.seiten ?? []).map((q) => q.n));
  return (
    <section className={`p jz-tri${laedt ? " laedt" : ""}`} aria-label="Website-Trichter">
      <h2><Icon name="website" size={16} />Website-Trichter
        <span className="r jz-wahl">
          <span className="grp" role="group" aria-label="Zeitraum">
            {TRICHTER_TAGE.map((d) => <button key={d} type="button" className={d === tage ? "on" : ""} aria-pressed={d === tage} onClick={() => setTage(d)}>{tageLabel(d)}</button>)}
          </span>
          <span className="grp" role="group" aria-label="Land">
            {(["alle", ...TRICHTER_LAENDER] as LandWahl[]).map((l) => (
              <button key={l} type="button" className={l === land ? "on" : ""} aria-pressed={l === land} onClick={() => setLand(l)}
                title={l === "alle" ? "alle Länder" : `${l}: ${de(paket?.je.alle.laender.find((x) => x.c === l)?.besucher ?? 0)} Besucher`}>{l === "alle" ? "Alle" : l}</button>
            ))}
          </span>
        </span>
      </h2>
      <ol className="stufen">
        {stufen.map((s, i) => {
          const p = bewegung && s.n > 0 ? partikel(s.n / stundenIm(tage)) : null;
          return (
            <li key={s.id} className={`tst${s.id === "kunde" ? " gold" : ""}`} title={s.tip}>
              <span className="nm">{s.label}</span>
              <span className="bahn">
                <i className="fill" style={{ transform: `scaleX(${da ? breite[i] / 100 : 0})` }}>
                  {p && <i className="licht" style={{ animationDuration: `${p.dauer}s` }} />}
                </i>
              </span>
              <b className="z">{de(s.n)}</b>
              <span className="q">{i === 0 ? (t ? `${de(t.aufrufe)} Aufrufe` : "") : `→ ${pct(s.quote)}`}</span>
            </li>
          );
        })}
      </ol>
      <p className="scan" title="Aufrufe aus Mails bis 2 min nach dem Versand: Sicherheits-Scanner der Empfänger, nicht als Besucher gezählt">
        <Icon name="filter" size={12} />Scanner abgezogen <b className="z">{t?.scanner ? de(t.scanner.besuche) : "–"}</b>
        {t?.scanner && t.scanner.klicks > 0 ? <span> · {de(t.scanner.klicks)} Klicks</span> : null}
      </p>
      {leer && <p className="hinweis">{paket ? "Noch keine Messung in diesem Zeitraum." : "Messung gerade nicht erreichbar."}</p>}
      <div className="mehr">
        <div>
          <h3>Quellen</h3>
          <ul className="bars">
            {(t?.quellen ?? []).slice(0, 4).map((q) => (
              <li key={q.k}><span>{QUELLE[q.k] ?? q.k}</span><i><i style={{ width: `${(q.n / qMax) * 100}%` }} /></i><b className="z">{de(q.n)}</b></li>
            ))}
            {!(t?.quellen ?? []).length && <li className="nix">–</li>}
          </ul>
        </div>
        <div>
          <h3>Seiten</h3>
          <ul className="bars">
            {(t?.seiten ?? []).slice(0, 4).map((q) => (
              <li key={q.k}><span title={q.k}>{q.k}</span><i><i style={{ width: `${(q.n / sMax) * 100}%` }} /></i><b className="z">{de(q.n)}</b></li>
            ))}
            {!(t?.seiten ?? []).length && <li className="nix">–</li>}
          </ul>
        </div>
      </div>
      <p className="stand"><Link href="/dashboard/website/auswertung">Auswertung</Link><span>Stand {uhr(paket?.at ?? null)}</span></p>
    </section>
  );
}

export function Kennzahlen({ initial, extra, mrr, kunden, bestanden, laufend, gesamt, bewegung }: {
  initial: TrichterPaket | null; extra: Extra | null | undefined; mrr: number | null; kunden: number | null; bestanden: number | null | undefined;
  laufend: number | null; gesamt: number; bewegung: boolean;
}) {
  const [tage, setTageS] = useState<Tage>(initial?.tage ?? 7);
  const [land, setLand] = useState<LandWahl>("alle");
  const [pakete, setPakete] = useState<Partial<Record<Tage, TrichterPaket | null>>>(initial ? { [initial.tage]: initial } : {});
  const [laedt, setLaedt] = useState(false);
  const da = useErst();
  const lauf = useRef(0);

  const hole = useCallback(async (d: Tage) => {
    const id = ++lauf.current;
    setLaedt(true);
    try {
      const r = await fetch(`/api/jarvis/trichter?d=${d}`, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { paket: TrichterPaket | null };
      setPakete((x) => ({ ...x, [d]: j.paket ?? x[d] ?? null }));
    } catch {
      setPakete((x) => ({ ...x, [d]: x[d] ?? null }));
    } finally {
      if (id === lauf.current) setLaedt(false);
    }
  }, []);

  const setTage = (d: Tage) => { setTageS(d); if (!(d in pakete)) void hole(d); };

  // alle 5 min neu (nur bei sichtbarem Tab), Tab wieder sichtbar → sofort
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === "visible") void hole(tage); }, TRICHTER_MS);
    const vis = () => { if (document.visibilityState === "visible") void hole(tage); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [hole, tage]);

  const kpis = kpiLeiste({ tage, extra, mrr, kunden, bestanden, laufend, gesamt });
  return (
    <>
      <section className="jz-kpi" aria-label="Kennzahlen">
        {kpis.map((k) => <KpiKachel key={k.id} k={k} da={da} />)}
      </section>
      <div className="jz-umsatz">
        <ZielRing mrr={mrr} kunden={kunden} da={da} />
        <WebTrichter paket={pakete[tage] ?? null} tage={tage} setTage={setTage} land={land} setLand={setLand} laedt={laedt} bewegung={bewegung} da={da} />
      </div>
    </>
  );
}
