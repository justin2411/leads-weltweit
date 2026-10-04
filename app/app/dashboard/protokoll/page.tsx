import Link from "next/link";
import { berlin } from "@/lib/dashboard-logic";
import { BEREICHE, BEREICH_TEXT, nachTag, zaehlen, zeitleiste, type Bereich } from "@/lib/zentrale/protokoll";
import { loadProtokoll, type ProtokollDaten } from "@/lib/zentrale/protokoll-data";
import { requireOwner } from "../actions";
import { ZX_CSS } from "../zentrale/css";
import { Head } from "../zentrale/ui";
import { Leer } from "../v2";

export const metadata = { title: "Protokoll" };
type SP = Promise<Record<string, string | string[] | undefined>>;

const TAG = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "long" });
const UHR = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

/**
 * Unternehmens-Protokoll (Inhaber 04.10.2026: Kommandozentrale): eine Zeitleiste aller Entscheidungen und Änderungen
 * – Gehirn, Agenten, Werke, Inhaber. Filter nach Bereich und 7/30 Tagen, Titel + 1 Satz, Details aufklappbar.
 */
export default async function ProtokollPage({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const b = typeof sp.b === "string" && (BEREICHE as string[]).includes(sp.b) ? (sp.b as Bereich) : null;
  const tage = sp.t === "30" ? 30 : 7;
  let d: ProtokollDaten | null = null;
  try {
    d = await loadProtokoll(tage);
  } catch (e) {
    console.error("protokoll:", e);
  }
  const now = new Date();
  const href = (bb: Bereich | null, tt: number) => {
    const q = new URLSearchParams();
    if (bb) q.set("b", bb);
    if (tt !== 7) q.set("t", String(tt));
    return q.toString() ? `/dashboard/protokoll?${q}` : "/dashboard/protokoll";
  };
  const list = d ? zeitleiste(d.eintraege, { bereich: b, tage, now }) : [];
  const counts = d ? zaehlen(d.eintraege, tage, now) : null;
  const total = counts ? BEREICHE.reduce((a, k) => a + counts[k], 0) : 0;

  return (
    <div className="v2 zx">
      <style dangerouslySetInnerHTML={{ __html: ZX_CSS }} />
      <Head name="Protokoll" icon="dokument" at={`Stand ${berlin(now, false)}`} />
      <nav className="zx-chips" aria-label="Filter">
        <Link href={href(null, tage)} className={!b ? "on" : undefined}>Alle <small>{total}</small></Link>
        {BEREICHE.map((k) => (
          <Link key={k} href={href(k, tage)} className={b === k ? "on" : undefined}>{BEREICH_TEXT[k]} <small>{counts?.[k] ?? 0}</small></Link>
        ))}
        <span className="sp" />
        {[7, 30].map((t) => <Link key={t} href={href(b, t)} className={tage === t ? "on" : undefined}>{t} Tage</Link>)}
      </nav>
      {!d && <div className="zx-err" role="alert">Protokoll gerade nicht lesbar – gleich noch einmal laden.</div>}
      {d && d.fehler.length > 0 && <div className="zx-err" role="status">Nicht lesbar: {d.fehler.join(", ")}</div>}
      {d && !list.length && <Leer icon="uhr" text="Keine Einträge in diesem Zeitraum." />}
      {nachTag(list).map(([day, items]) => (
        <section key={day} className="zx-day">
          <h3>{TAG.format(new Date(`${day}T12:00:00Z`))}</h3>
          {items.map((e) => {
            const body = (
              <>
                <time dateTime={e.at}>{UHR.format(new Date(e.at))}</time>
                <span className="b">{BEREICH_TEXT[e.bereich]}</span>
                <span className="t">{e.titel}</span>
                {e.grund && <span className="g">{e.grund}</span>}
                {e.details && <span className="more">Details</span>}
              </>
            );
            return e.details ? (
              <details key={e.id} className="zx-ev"><summary>{body}</summary><pre>{e.details}</pre></details>
            ) : <div key={e.id} className="zx-ev"><div>{body}</div></div>;
          })}
        </section>
      ))}
    </div>
  );
}
