import type { CSSProperties } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/app/icons";
import { berlin } from "@/lib/dashboard-logic";
import { tageBis } from "@/lib/strategie";
import { loadStrategie } from "@/lib/strategie-data";
import { requireOwner } from "../actions";
import { PageHead } from "../v2";
import { CountUp } from "../speicher/count-up";
import { STRATEGIE_CSS } from "./css";

export const metadata = { title: "Strategie" };
export const dynamic = "force-dynamic";

const C_GROSS = 2 * Math.PI * 88;
const C_KLEIN = 2 * Math.PI * 22;
const eur = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;
const datum = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Berlin" }) : "–");
const tagLang = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const ART_ICON: Record<string, IconName> = { meilenstein: "stern", versand: "versand", premium: "premium", quelle: "quelle", schritt: "ok-kreis", lehre: "gehirn" };
const ART_NAME: Record<string, string> = { meilenstein: "Meilenstein", versand: "Versand", premium: "Premium", quelle: "Quelle", schritt: "Schritt", lehre: "Gelernt" };
const STATUS_TEXT = { erreicht: "erreicht", verfehlt: "verfehlt", geplant: "geplant" } as const;

/**
 * Strategie (Inhaber 05.10.2026: „strategie zusammenfassung … visualisierungen und wenig text … ziele jederzeit visuell
 * mit animationen … auf sachen aus der vergangenheit blicken … regelmäßig geupdatet“). Alles aus der Datenbank
 * (brain_knowledge, strategy_milestones, strategy_rueckblick, dashboard_cache 'strategie'); das Gehirn pflegt es
 * (docs/GEHIRN-SITZUNG.md, scripts/strategie.py), der Wachhund setzt messbare Meilensteine selbst.
 */
export default async function Strategie() {
  await requireOwner();
  const d = await loadStrategie();
  const now = new Date();
  const stufe = d.treppe.find((s) => s.aktuell);
  const stand = d.zfStand && d.at ? (d.zfStand > d.at ? d.zfStand : d.at) : d.zfStand ?? d.at;
  const z = d.zaehler;
  const zaehler: { icon: IconName; n: number | null; label: string }[] = [
    { icon: "versand", n: z.mails, label: "Mails gesendet" },
    { icon: "premium", n: z.premium, label: "Premium-Leads frei" },
    { icon: "stern", n: z.meilensteine, label: "Meilensteine erreicht" },
    { icon: "gehirn", n: z.lehren, label: "Lehren gelernt" },
    { icon: "dokument", n: z.entscheidungen, label: "Entscheidungen" },
  ];

  return (
    <div className="v2 stg">
      <style dangerouslySetInnerHTML={{ __html: STRATEGIE_CSS }} />
      <PageHead title="Strategie" icon="stern" at={stand ? `Stand ${berlin(stand, false)} · aktualisiert von ${d.zfVon}` : undefined}
        crumbs={[["JARVIS", "/dashboard/jarvis"], ["Büro", "/dashboard/buero"], ["Strategie", ""]]}>
        <Link href="/dashboard/gehirn" className="stg-hl"><Icon name="gehirn" size={16} />Gehirn</Link>
      </PageHead>

      {/* 1 – Strategie in einem Satz + Nordstern */}
      <section className="stg-hero" aria-label="Strategie in einem Satz">
        <div className="stg-card stg-nord" title={`Nordstern: ${eur(d.nord.mrr)} von 25.000 € pro Monat (≈ ${d.nord.kunden_aequivalent} von 100 Pro-Kunden)`}>
          <svg viewBox="0 0 200 200" aria-hidden>
            <defs><linearGradient id="stg-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3dcae" /><stop offset="1" stopColor="#c99b4f" /></linearGradient></defs>
            <circle cx="100" cy="100" r="88" className="tr" />
            {[0.25, 0.5, 0.75].map((t) => (
              <line key={t} x1="100" y1="6" x2="100" y2="18" className="tk" transform={`rotate(${t * 360} 100 100)`} />
            ))}
            <circle cx="100" cy="100" r="88" className="vl" transform="rotate(-90 100 100)"
              style={{ "--c": `${C_GROSS.toFixed(1)}px`, "--o": `${((1 - Math.max(d.nord.anteil, 0.004)) * C_GROSS).toFixed(1)}px` } as CSSProperties}
              strokeDasharray={C_GROSS.toFixed(1)} />
          </svg>
          <div className="stg-nord-t">
            <b className="z"><CountUp to={d.nord.mrr} fmt="int" /> €</b>
            <span>von 25.000 €/Monat</span>
            <em>{d.kunden ?? 0} / 100 Kunden</em>
          </div>
        </div>
        <div className="stg-card stg-satz">
          <span className="stg-eyebrow">Strategie in einem Satz</span>
          <p className="stg-big">{d.zf.satz || "Noch keine Zusammenfassung – das Gehirn legt sie in der nächsten Sitzung an."}</p>
          {d.zf.saetze.length > 0 && (
            <ul className="stg-kern">
              {d.zf.saetze.map((s, i) => <li key={i} style={{ "--i": i } as CSSProperties}><Icon name="weiter" size={14} />{s}</li>)}
            </ul>
          )}
          {stufe && <a href="#treppe" className="stg-chip"><Icon name="puls" size={14} />Jetzt: Stufe {stufe.nr} · {stufe.titel}</a>}
        </div>
      </section>

      {/* 2 – Skalier-Treppe */}
      <section id="treppe" className="stg-card" aria-label="Skalier-Treppe">
        <h2 className="stg-h"><Icon name="trend-hoch" size={16} />Skalier-Treppe</h2>
        <div className="stg-weg" aria-hidden>
          {d.treppe.map((s, i) => {
            const f = stufe ? (s.nr < stufe.nr ? 1 : s.nr === stufe.nr ? s.anteil : 0) : 0;
            return <span key={s.nr} className={`seg${stufe && s.nr <= stufe.nr ? " on" : ""}`} style={{ "--i": i, "--f": `${f * 100}%` } as CSSProperties}><i /></span>;
          })}
          {stufe && <i className="hier" style={{ "--x": `${(stufe.nr - 1 + stufe.anteil) * 25}%`, "--y": `${54 - (stufe.nr - 1) * 14}px` } as CSSProperties} />}
        </div>
        <ol className="stg-treppe">
          {d.treppe.map((s, i) => (
            <li key={s.nr} className={`stg-stufe${s.aktuell ? " jetzt" : ""}${s.erfuellt ? " ok" : ""}`} style={{ "--i": i } as CSSProperties}>
              <div className="stg-stufe-k">
                <span className="nr">{s.erfuellt ? <Icon name="ok" size={16} /> : s.nr}</span>
                <b>{s.titel}</b>
                {s.aktuell && <span className="hier">jetzt</span>}
              </div>
              <span className="wert z">{s.wert}</span>
              <span className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.anteil * 100)} aria-label={`Fortschritt Stufe ${s.nr}`}>
                <i style={{ "--w": `${Math.max(s.anteil > 0 ? 3 : 0, s.anteil * 100)}%` } as CSSProperties} />
              </span>
              <details><summary>Bedingung</summary><p>{s.bedingung}</p></details>
            </li>
          ))}
        </ol>
      </section>

      {/* 3 + 4 – Plan und Ziele */}
      <div className="stg-zwei">
        <section className="stg-card" aria-label="Plan">
          <h2 className="stg-h"><Icon name="karte" size={16} />Plan · {d.plan.erreicht}/{d.plan.gesamt} erreicht</h2>
          {d.plan.alle.length === 0 ? <p className="stg-leer">Noch keine Meilensteine.</p> : (
            <ol className="stg-plan">
              {d.plan.alle.map((m, i) => {
                const t = tageBis(m.ziel_datum, now);
                const wann = m.status === "erreicht" ? `erreicht ${datum(m.erreicht_am)}`
                  : t === null ? "ohne Datum" : t < 0 ? `${-t} T überfällig` : t === 0 ? "heute" : `in ${t} T`;
                return (
                  <li key={m.key} className={`s-${m.status}${d.plan.naechster === m.key ? " next" : ""}`} style={{ "--i": i } as CSSProperties}>
                    <span className="dot" aria-hidden>{m.status === "erreicht" ? <Icon name="ok" size={12} /> : m.status === "verfehlt" ? <Icon name="achtung" size={12} /> : null}</span>
                    <details>
                      <summary><b>{m.titel}</b><span className="z">{m.ziel_datum ? datum(m.ziel_datum) : ""}</span><span className="st">{wann}</span></summary>
                      <p>{m.grund ?? "–"} · {STATUS_TEXT[m.status]}{m.updated_by === "auto" ? " (automatisch gemessen)" : ""}</p>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="stg-card" aria-label="Ziele">
          <h2 className="stg-h"><Link href="/dashboard/ziele"><Icon name="stern" size={16} />Ziele</Link></h2>
          <div className="stg-ringe">
            {d.ziele.map((g, i) => (
              <Link key={g.key} href="/dashboard/ziele" className={`stg-ring${g.gold ? " gold" : ""}${g.unbestaetigt ? " unb" : ""}`}
                title={`${g.titel}: ${g.ist} von ${g.soll}${g.unbestaetigt ? " · Ziel unbestätigt" : ""}`} style={{ "--i": i } as CSSProperties}>
                <svg viewBox="0 0 56 56" aria-hidden>
                  <circle cx="28" cy="28" r="22" className="tr" />
                  <circle cx="28" cy="28" r="22" className="vl" transform="rotate(-90 28 28)" strokeDasharray={C_KLEIN.toFixed(1)}
                    style={{ "--c": `${C_KLEIN.toFixed(1)}px`, "--o": `${((1 - g.anteil) * C_KLEIN).toFixed(1)}px` } as CSSProperties} />
                </svg>
                <span><b className="z">{g.ist}</b><small>Soll {g.soll}</small><span>{g.titel}</span></span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* 5 – Rückblick */}
      <section className="stg-card" aria-label="Was wir geschafft haben">
        <h2 className="stg-h"><Icon name="uhr" size={16} />Was wir geschafft haben{z.seit ? <small> · Versand seit {datum(z.seit)}</small> : null}</h2>
        <div className="stg-zahlen">
          {zaehler.map((x) => (
            <div key={x.label} className="stg-zahl"><Icon name={x.icon} size={18} /><b className="z">{x.n === null ? "–" : <CountUp to={x.n} fmt="int" />}</b><span>{x.label}</span></div>
          ))}
        </div>
        {d.rueckblick.length === 0 ? <p className="stg-leer">Noch keine Einträge.</p> : (
          <ol className="stg-rb">
            {d.rueckblick.map((t, ti) => {
              const sicht = t.eintraege.slice(0, 5), rest = t.eintraege.slice(5);
              return (
                <li key={t.tag} style={{ "--i": Math.min(ti, 10) } as CSSProperties}>
                  <span className="tag z">{tagLang(t.tag)}<small>{t.eintraege.length}</small></span>
                  <ul>
                    {sicht.map((e, i) => <Eintrag key={i} e={e} />)}
                    {rest.length > 0 && (
                      <li className="mehr"><details><summary>+{rest.length} weitere</summary><ul>{rest.map((e, i) => <Eintrag key={i} e={e} />)}</ul></details></li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Eintrag({ e }: { e: { titel: string; grund: string | null; art: string; zahl: number | null } }) {
  const kopf = <><Icon name={ART_ICON[e.art] ?? "ok-kreis"} size={14} /><span className="t">{e.titel}</span>{e.zahl !== null && <b className="z">{e.zahl.toLocaleString("de-DE")}</b>}</>;
  return (
    <li className={`a-${e.art}`} title={ART_NAME[e.art] ?? e.art}>
      {e.grund ? <details><summary>{kopf}</summary><p>{e.grund}</p></details> : <div className="k">{kopf}</div>}
    </li>
  );
}
