import Link from "next/link";
import { berlin } from "@/lib/dashboard-logic";
import { AMPEL_TEXT } from "@/lib/ampel";
import { ART_TEXT, STATUS_TEXT, bilder, geschaeftsbericht, type BereichBild } from "@/lib/firma";
import { loadFirma, type FirmaDaten, type UebergabeTask } from "@/lib/firma-data";
import { Icon, isIconName } from "@/app/icons";
import { requireOwner } from "../actions";
import { ZX_CSS } from "../zentrale/css";
import { Card, Dot, Head, amp } from "../zentrale/ui";
import type { SP } from "../params";
import { FIRMA_CSS } from "./css";

export const metadata = { title: "Firma" };

/**
 * Firma (Inhaber 04.10.2026: „gib verschiedene bereiche wie in einem unternehmen … bau daraus ein unternehmen was geld
 * verdient“ + „zu viel text … vereinfache es“): Geschäftsbericht in 5 Zahlen, Organigramm (Bereiche → Leitung und
 * Mitglieder, Ziel mit Ampel) und die letzten Übergaben zwischen den Bereichen. Details nur auf Klick (?b=<Bereich>).
 * Nicht im Menü – Zugang über „Organigramm“ in den JARVIS-Abteilungen. Nur Anzeige: Regeln ändert hier niemand.
 */
export default async function FirmaPage({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const sel = typeof sp.b === "string" ? sp.b : null;
  let d: FirmaDaten | null = null;
  try {
    d = await loadFirma();
  } catch (e) {
    console.error("firma:", e); // Details nur im Server-Protokoll
  }
  return (
    <div className="v2 zx fa">
      <style dangerouslySetInnerHTML={{ __html: ZX_CSS + FIRMA_CSS }} />
      <Head name="Firma" icon="agent" at={d ? `Stand ${berlin(new Date(), false)}` : undefined} />
      {d ? <Body d={d} sel={sel} /> : <div className="zx-err" role="alert">Firma gerade nicht lesbar – gleich noch einmal laden.</div>}
    </div>
  );
}

function Body({ d, sel }: { d: FirmaDaten; sel: string | null }) {
  const b = bilder(d.bereiche, d.lage, d.ziele, d.uebergaben);
  const g = geschaeftsbericht(d.lage);
  const name = Object.fromEntries(b.map((x) => [x.slug, x.name]));
  const offen = b.find((x) => x.slug === sel) ?? null;
  return (
    <>
      <section className="fa-gb" aria-label="Geschäftsbericht">
        <h2>{g.titel}</h2>
        <ol className="fa-kette">
          {g.zeilen.map((z) => (
            <li key={z.key}><b>{z.wert}</b><span>{z.label}</span></li>
          ))}
        </ol>
      </section>

      <section className="fa-org" aria-label="Organigramm">
        <div className="fa-top"><Icon name="jarvis" size={16} /><b>Inhaber · JARVIS</b></div>
        <ul className="fa-grid">
          {b.map((x) => <li key={x.slug}><Bereich x={x} aktiv={x.slug === offen?.slug} /></li>)}
        </ul>
      </section>

      {offen && <Detail x={offen} d={d} name={name} />}

      <Card title="Übergaben" icon="pfeil" sum={`${d.uebergaben.length} in 7 Tagen`}>
        <Liste items={d.uebergaben.slice(0, 8)} name={name} />
      </Card>
    </>
  );
}

function Bereich({ x, aktiv }: { x: BereichBild; aktiv: boolean }) {
  return (
    <Link href={`/dashboard/firma?b=${x.slug}#bereich`} scroll={false} className={`fa-b ${amp(x.ziel.ampel)}${aktiv ? " on" : ""}`}
      title={`${x.ziel_titel}: ${AMPEL_TEXT[x.ziel.ampel]}`} aria-current={aktiv ? "true" : undefined}>
      <span className="fa-bh">{isIconName(x.icon) && <Icon name={x.icon} size={15} />}<span>{x.name}</span><Dot a={x.ziel.ampel} /></span>
      <b>{x.ziel.text}</b>
      <small>{x.ziel_titel}</small>
      <em><Icon name="agent" size={12} /><span>{x.leitung_name}</span>{x.mitglieder.length > 1 && <i>+{x.mitglieder.length - 1}</i>}</em>
    </Link>
  );
}

function Detail({ x, d, name }: { x: BereichBild; d: FirmaDaten; name: Record<string, string> }) {
  const ueb = d.uebergaben.filter((u) => u.von === x.slug || u.an === x.slug).slice(0, 5);
  return (
    <section className="zx-card fa-det" id="bereich" aria-label={x.name}>
      <div className="zx-h"><h2>{isIconName(x.icon) && <Icon name={x.icon} size={14} />}{x.name}</h2>
        <span className="zx-sum">{x.zweck}</span>
        <Link href="/dashboard/firma" scroll={false} className="x-btn" aria-label="Schließen"><Icon name="schliessen" size={16} /></Link>
      </div>
      <div className="fa-kz">
        <div className={`zx-tile ${amp(x.ziel.ampel)}`}><span>Ziel · {x.ziel_titel}</span><b>{x.ziel.text}</b>
          <em>{x.ziel.quelle === "inhaber" ? "Soll vom Inhaber" : x.ziel.quelle === "vorschlag" ? "Soll: Vorschlag" : "Bereichs-Ziel"}</em></div>
        <div className="zx-tile zx-a-grey"><span>Wirkung · {x.wirkung_titel}</span><b>{x.wirkung}</b><em>Richtung Umsatz</em></div>
        <div className="zx-tile zx-a-grey"><span>Leitung</span><b className="fa-t">{x.leitung_name}</b><em>{x.leitung_takt}</em></div>
      </div>
      <ul className="zx-rows">
        {x.mitglieder.map((m) => {
          const st = d.stand[`${m.art}:${m.ref}`] ?? null;
          const a = st ? (st.aktiv ? "green" : "grey") : "grey";
          return (
            <li key={`${m.art}:${m.ref}`} className="zx-row">
              <Dot a={a} tip={st ? (st.aktiv ? "aktiv" : "pausiert") : "läuft als Workflow"} />
              <span className="n">{m.name}</span>
              <span className="m">{ART_TEXT[m.art]}{st?.zuletzt ? ` · zuletzt ${berlin(st.zuletzt)}` : ""}</span>
              <span className="v">{m.takt}</span>
            </li>
          );
        })}
      </ul>
      {ueb.length > 0 && <div className="fa-sub"><Liste items={ueb} name={name} /></div>}
    </section>
  );
}

function Liste({ items, name }: { items: UebergabeTask[]; name: Record<string, string> }) {
  if (!items.length) return <p>Keine Übergaben – alle Bereiche im Plan.</p>;
  return (
    <ul className="zx-rows">
      {items.map((u) => {
        const a = u.status === "wartet" ? "gold" : u.task_status === "fertig" || u.status === "gemeldet" ? "green" : u.task_status === "fehler" ? "red" : "grey";
        const st = u.status === "beauftragt" && u.task_status ? (u.task_status === "fertig" ? "erledigt" : u.task_status === "laeuft" ? "läuft" : u.task_status) : STATUS_TEXT[u.status] ?? u.status;
        return (
          <li key={u.id} className="zx-row" title={u.grund}>
            <Dot a={a} tip={st} />
            <span className="n">{u.titel}</span>
            <span className="m fa-pf">{name[u.von] ?? u.von}<Icon name="weiter" size={12} />{name[u.an] ?? u.an}</span>
            <span className="v">{berlin(u.created_at)}</span>
          </li>
        );
      })}
    </ul>
  );
}
