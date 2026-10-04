import Link from "next/link";
import { notFound } from "next/navigation";
import { berlin, berlinDay } from "@/lib/dashboard-logic";
import { AMPEL_TEXT, type Ampel } from "@/lib/ampel";
import { STATUS_TEXT, bilder, type BereichBild } from "@/lib/firma";
import { loadOffice, type OfficeDaten, type UebergabeTask } from "@/lib/firma-data";
import { SEITEN, kurz, plaetze, zielProzent, type Platz } from "@/lib/office";
import { COUNTRIES, loadKohorten } from "@/lib/dashboard-data";
import { loadTeam } from "@/lib/fach-agenten-data";
import { karten, type Karte } from "@/lib/fach-agenten";
import { loadProposals } from "@/lib/vorschlaege-data";
import { loadGehirnLernt } from "@/lib/gehirn-lernt-data";
import { sicher } from "@/lib/abteilungen";
import { Icon, isIconName, type IconName } from "@/app/icons";
import { requireOwner } from "../../actions";
import { assignBereich, assignRole } from "../../control-actions";
import { ZX_CSS } from "../../zentrale/css";
import { amp } from "../../zentrale/ui";
import { Leer, PageHead } from "../../v2";
import { FIRMA_CSS } from "../css";
import { OFFICE_CSS } from "./css";
import { TEAM_CSS, Team } from "../../jarvis/team";
import { KOHORTEN_CSS, Kohorten } from "../../jarvis/kohorten";
import { GEHIRN_LERNT_CSS, GehirnLernt } from "../../jarvis/gehirn-lernt";
import { Vorschlaege } from "../../jarvis/vorschlaege";
import { GatePanel, type GateView } from "../../jarvis/freigabe";
import { FEEDBACK_CSS, FeedbackPanel, loadFeedback } from "./feedback";

export const metadata = { title: "Office" };
type P = Promise<{ bereich: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

const ST_TEXT: Record<Platz["status"], string> = { arbeitet: "arbeitet", wartet: "wartet", fertig: "fertig", fehler: "Fehler", aus: "aus", "–": "–" };

/**
 * Bereichs-Office (Inhaber 04.10.2026: „bei einem klick auf z.b. qualitätsmanagement komme ich dann darein ins office
 * der agenten die in diesem bereich arbeiten“). Kopf mit Ziel (Ring + Ampel), Arbeitsplätze der Agenten (Status aus
 * agent_tasks/agent_roles/brain_routines/Werken, läuft = Animation), Klick → letzte Aufträge je 1 Zeile, Übergaben als
 * Pfeile, „Auftrag geben“. Dazu, was früher auf der JARVIS-Startseite stand und hierher gehört (Team-Karten des
 * Bereichs, Vertrieb: Kohorten, Strategie: Optimiert sich selbst + Vorschläge, Qualität: Freigabe, Produktion: Fluss).
 */
export default async function OfficePage({ params, searchParams }: { params: P; searchParams: SP }) {
  await requireOwner();
  const { bereich } = await params;
  if (!/^[a-z][a-z_]{1,30}$/.test(bereich)) notFound();
  const sp = await searchParams;
  const sel = typeof sp.p === "string" ? sp.p : null;
  let d: OfficeDaten | null = null;
  try {
    d = await loadOffice();
  } catch (e) {
    console.error("office:", e);
  }
  const b = d ? bilder(d.firma.bereiche, d.firma.lage, d.firma.ziele, d.firma.uebergaben).find((x) => x.slug === bereich) ?? null : null;
  if (d && !b) notFound();
  return (
    <div className="v2 zx fa of">
      <style dangerouslySetInnerHTML={{ __html: ZX_CSS + FIRMA_CSS + OFFICE_CSS + TEAM_CSS + KOHORTEN_CSS + GEHIRN_LERNT_CSS + FEEDBACK_CSS }} />
      <PageHead title={b ? b.name : "Office"} icon={b && isIconName(b.icon) ? b.icon : "agent"} at={d ? `Stand ${berlin(new Date(), false)}` : undefined}
        crumbs={[["JARVIS", "/dashboard/jarvis"], ["Firma", "/dashboard/firma"], [b ? b.name : "Office", ""]]} />
      {d && b ? <Body d={d} b={b} sel={sel} /> : <div className="zx-err" role="alert">Office gerade nicht lesbar – gleich noch einmal laden.</div>}
    </div>
  );
}

async function Body({ d, b, sel }: { d: OfficeDaten; b: BereichBild; sel: string | null }) {
  const pl = plaetze(b, { roles: d.roles, routines: d.routines, web: d.web, tasks: d.tasks, werkLive: d.werkLive });
  const offen = pl.find((x) => x.key === sel) ?? null;
  const name = Object.fromEntries(d.firma.bereiche.map((x) => [x.slug, x.name]));
  const rein = d.firma.uebergaben.filter((u) => u.an === b.slug).slice(0, 5);
  const raus = d.firma.uebergaben.filter((u) => u.von === b.slug).slice(0, 5);
  const back = `/dashboard/firma/${b.slug}`;
  const arbeiten = pl.filter((x) => x.status === "arbeitet").length;
  return (
    <>
      <Kopf b={b} n={pl.length} arbeiten={arbeiten} />
      <nav className="of-seiten" aria-label="Seiten des Bereichs">
        <Link href="/dashboard/firma" className="of-chip"><Icon name="agent" size={16} /><span>Organigramm</span></Link>
        {(SEITEN[b.slug] ?? []).map((s) => (
          <Link key={s.href} href={s.href} className="of-chip">{isIconName(s.icon) && <Icon name={s.icon} size={16} />}<span>{s.label}</span></Link>
        ))}
      </nav>

      <section className="of-raum" aria-label="Arbeitsplätze">
        <div className="of-hd"><h2>Arbeitsplätze</h2><span className="zx-sum">{arbeiten ? `${arbeiten} arbeiten` : `${pl.length} Plätze`}</span></div>
        {pl.length ? (
          <ul className="of-grid">
            {pl.map((x) => <li key={x.key}><PlatzKarte x={x} on={x.key === offen?.key} slug={b.slug} /></li>)}
          </ul>
        ) : <Leer icon="agent" text="Noch keine Agenten in diesem Bereich." />}
      </section>

      {offen && <PlatzDetail x={offen} back={back} />}

      <form action={assignBereich} className="of-auftrag">
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="bereich" value={b.slug} />
        <label className="sr" htmlFor="of-text">Auftrag an {b.name}</label>
        <input id="of-text" name="text" maxLength={900} placeholder={`Auftrag an ${b.name} (leer = Ziel verbessern)`} />
        <button><Icon name="an-agent" size={16} /> Auftrag geben</button>
      </form>

      <section className="of-ueb" aria-label="Übergaben">
        <Pfeile titel="Kommt rein" items={rein} name={name} rein />
        <Pfeile titel="Geht raus" items={raus} name={name} />
      </section>

      <Extras b={b} d={d} pl={pl} />
    </>
  );
}

function Ring({ p, a }: { p: number | null; a: Ampel }) {
  const r = 42, c = 2 * Math.PI * r, f = p === null ? 0 : Math.max(0, Math.min(1, p));
  return (
    <svg viewBox="0 0 100 100" className={`of-ring ${amp(a)}`} aria-hidden>
      <circle cx="50" cy="50" r={r} className="of-rt" />
      <circle cx="50" cy="50" r={r} className="of-rv" strokeDasharray={`${(f * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 50 50)" />
    </svg>
  );
}

function Kopf({ b, n, arbeiten }: { b: BereichBild; n: number; arbeiten: number }) {
  const p = zielProzent(b);
  return (
    <section className={`of-kopf ${amp(b.ziel.ampel)}`} aria-label={`Ziel ${b.ziel_titel}`}>
      <div className="of-rw" title={`${b.ziel_titel}: ${AMPEL_TEXT[b.ziel.ampel]}`}>
        <Ring p={p} a={b.ziel.ampel} />
        <span className="of-pct">{p === null ? "–" : `${Math.round(p * 100)} %`}</span>
      </div>
      <div className="of-ziel">
        <span className="of-zt"><i className={`of-amp ${amp(b.ziel.ampel)}`} aria-hidden />{kurz(b.ziel_titel, 40)}</span>
        <b>{b.ziel.text}</b>
        <small>{b.wirkung_titel ? `${kurz(b.wirkung_titel, 30)}: ${b.wirkung}` : AMPEL_TEXT[b.ziel.ampel]}</small>
      </div>
      <div className="of-team" title="Agenten in diesem Bereich">
        <b>{n}</b><span>Agenten</span>
        {arbeiten > 0 && <em><i className="of-live" aria-hidden />{arbeiten} aktiv</em>}
      </div>
    </section>
  );
}

function PlatzKarte({ x, on, slug }: { x: Platz; on: boolean; slug: string }) {
  return (
    <Link href={on ? `/dashboard/firma/${slug}` : `/dashboard/firma/${slug}?p=${encodeURIComponent(x.key)}#platz`} scroll={false}
      className={`of-p s-${x.status === "–" ? "na" : x.status} ${amp(x.ampel)}${on ? " on" : ""}`} aria-current={on ? "true" : undefined}
      title={`${x.name}: ${ST_TEXT[x.status]}`}>
      <span className="of-av" aria-hidden>{isIconName(x.icon) && <Icon name={x.icon as IconName} size={22} />}</span>
      <span className="of-pn">{x.name}{x.leitung && <i className="of-lt">Leitung</i>}</span>
      <span className="of-pt">{x.takt || "–"}</span>
      <span className="of-st"><i className="zx-dot" aria-hidden />{ST_TEXT[x.status]}</span>
    </Link>
  );
}

function PlatzDetail({ x, back }: { x: Platz; back: string }) {
  return (
    <section className="zx-card of-det" id="platz" aria-label={x.name}>
      <div className="zx-h"><h2>{isIconName(x.icon) && <Icon name={x.icon as IconName} size={14} />}{x.name}</h2>
        <span className="zx-sum">{x.zuletzt ? `zuletzt ${berlin(x.zuletzt)}` : ST_TEXT[x.status]}</span>
        <Link href={back} scroll={false} className="x-btn" aria-label="Schließen"><Icon name="schliessen" size={16} /></Link>
      </div>
      {x.zeilen.length ? (
        <ul className="zx-rows">
          {x.zeilen.map((z) => (
            <li key={z.id} className="zx-row" title={z.ergebnis}>
              <i className={`zx-dot ${amp(z.status === "fehler" ? "red" : z.status === "arbeitet" || z.status === "fertig" ? "green" : z.status === "wartet" ? "gold" : "grey")}`} aria-hidden />
              <span className="n">{z.text}</span>
              <span className="m">{z.ergebnis || "–"}</span>
              <span className="v">{z.at ? berlin(z.at) : "–"}</span>
            </li>
          ))}
        </ul>
      ) : <p className="of-none">Noch keine Aufträge.</p>}
      {x.art === "rolle" && (
        <form action={assignRole} className="of-go">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="rolle" value={x.ref} />
          <button disabled={x.status === "arbeitet" || x.status === "wartet"}><Icon name={x.status === "arbeitet" || x.status === "wartet" ? "warten" : "an-agent"} size={16} /> {x.status === "arbeitet" || x.status === "wartet" ? "läuft" : "Jetzt beauftragen"}</button>
        </form>
      )}
    </section>
  );
}

function Pfeile({ titel, items, name, rein = false }: { titel: string; items: UebergabeTask[]; name: Record<string, string>; rein?: boolean }) {
  return (
    <div className="zx-card of-pf">
      <div className="zx-h"><h2><Icon name={rein ? "pfeil-runter" : "pfeil"} size={14} />{titel}</h2><span className="zx-sum">{items.length}</span></div>
      {items.length ? (
        <ul className="of-pl">
          {items.map((u) => {
            const a: Ampel = u.status === "wartet" ? "gold" : u.task_status === "fertig" || u.status === "gemeldet" ? "green" : u.task_status === "fehler" ? "red" : "grey";
            return (
              <li key={u.id} className={amp(a)} title={`${u.titel} · ${u.grund}`}>
                <span className="of-von">{name[rein ? u.von : u.an] ?? (rein ? u.von : u.an)}</span>
                <span className="of-arrow" aria-label={rein ? "nach hier" : "von hier"}><i /></span>
                <span className="of-ut">{u.titel}</span>
                <span className="of-us">{STATUS_TEXT[u.status] ?? u.status} · {berlin(u.created_at)}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="of-none">Keine in 7 Tagen.</p>}
    </div>
  );
}

/** Abschnitte von der JARVIS-Startseite, die zu diesem Bereich gehören (jede Quelle einzeln, Ausfall → weggelassen). */
async function Extras({ b, d, pl }: { b: BereichBild; d: OfficeDaten; pl: Platz[] }) {
  const now = new Date();
  const today = berlinDay(now);
  const rollen = new Set(pl.filter((x) => x.art === "rolle").map((x) => x.ref));
  const khNeed = rollen.size > 0 || b.slug === "vertrieb";
  const kh = khNeed ? await sicher(loadKohorten(8)) : null;
  const team: Karte[] | null = rollen.size
    ? await sicher(async () => { const t = await loadTeam(); return t ? karten({ ...t, kohorten: kh, today, now }).filter((c) => rollen.has(c.r.slug)) : null; })
    : null;
  const gl = b.slug === "strategie" ? await sicher(loadGehirnLernt(now)) : null;
  const vs = b.slug === "strategie" ? await sicher(loadProposals(now)) : null;
  let gate: GateView | null = null;
  if (b.slug === "qualitaet" && d.act) {
    const sp7 = d.act.stichprobe ?? [];
    const c = sp7.reduce((a, r) => a + r.candidates, 0), g = sp7.reduce((a, r) => a + r.green, 0);
    gate = {
      pct: c ? Math.round((g / c) * 1000) / 10 : null, ok: Number(d.act.gate_60m?.released ?? 0), bad: Number(d.act.gate_60m?.failed ?? 0),
      href: "/dashboard/jarvis?s=gate#agenten", reasonsHref: "/dashboard/jarvis?s=gate&t=check&f=rot#agenten",
      countries: COUNTRIES.map((k) => { const r = sp7.filter((x) => x.country === k); const cc = r.reduce((a, x) => a + x.candidates, 0); return { c: k, pct: cc ? Math.round((r.reduce((a, x) => a + x.green, 0) / cc) * 1000) / 10 : null }; }),
    };
  }
  const fb = b.slug === "qualitaet" ? await sicher(loadFeedback()) : null;
  const fluss = b.slug === "produktion" || b.slug === "vertrieb";
  if (!team?.length && !gl && !vs && !gate && !fb && !fluss && !(b.slug === "vertrieb")) return null;
  return (
    <div className="jv of-extra">
      {fluss && (
        <Link href="/dashboard/jarvis?teil=fluss#agenten" className="of-fluss">
          <span className="of-av" aria-hidden><Icon name="pipeline" size={22} /></span>
          <b>Fluss-Karte & Agenten A1–A8</b><Icon name="weiter" size={16} />
        </Link>
      )}
      {gate && <GatePanel g={gate} />}
      {fb && <FeedbackPanel rows={fb} />}
      {b.slug === "vertrieb" && <Kohorten rows={kh} countries={COUNTRIES} today={today} />}
      {gl && <GehirnLernt d={gl} />}
      {vs && <Vorschlaege open={vs.open} done={vs.done} />}
      {team && team.length > 0 && <Team cards={team} />}
    </div>
  );
}
