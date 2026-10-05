/**
 * Seitenfenster der Zentrale (URL steuert: ?s=du|ziel|lern|planke|<Station/Werk>, ?bereich=<slug>, ?p=…, ?t=info|set).
 * Zwei Reiter bei Werken: Info (Zahl, letzter Lauf, Prüfen-Inhalte als Link) · Einstellen (nur „Feinjustieren →“ im
 * Regler; einzige Ausnahme „Versand pausieren“ – wirkt sofort, kann nur stoppen). „Jetzt starten“ nur für Lead, Kunden,
 * Proben und Stichprobe. Schließen = x-btn (mittig).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, isIconName, type IconName } from "@/app/icons";
import { BEREICHE, WERKE, agentenVonBereich, agentenVonWerk, werkeVonBereich } from "@/lib/firma-karte";
import type { BereichBild, PlankeBild, WerkBild, ZielBild } from "@/lib/zentrale-modell";
import { LERN_WORT, taktAnzeige, uhr, zahl, type LernPhase } from "@/lib/zentrale-logik";
import type { BdPunkt } from "@/lib/braucht-dich";
import { requestStart, setPaused } from "../control-actions";
import { BrauchtDich } from "./braucht-dich";
import type { Lampe } from "./gehirn-kern";

const ZU = "/dashboard/jarvis";

export function Fenster({ titel, icon, gold, tabs, children }: { titel: string; icon: IconName; gold?: boolean; tabs?: ReactNode; children: ReactNode }) {
  return (
    <aside className="drw" aria-label={titel}>
      <header>
        <span className="drw-ic" aria-hidden style={gold ? { color: "var(--gd)" } : undefined}><Icon name={icon} size={20} /></span><h2>{titel}</h2>
        <Link href={ZU} scroll={false} className="drw-x x-btn" aria-label="Schließen"><Icon name="schliessen" size={16} /></Link>
      </header>
      {tabs}
      <div className="drw-body">{children}</div>
    </aside>
  );
}

const Lnk = ({ to, children }: { to: string; children: ReactNode }) => <Link href={to} className="lnk">{children}<Icon name="weiter" size={14} /></Link>;
const Liste = ({ rows, now, leer }: { rows: { titel: string; grund?: string; at?: string | null }[]; now: number; leer: string }) => (
  rows.length ? <ul className="l">{rows.map((r, i) => <li key={i}><b>{r.titel}</b>{r.grund ? <span>{r.grund}</span> : null}{r.at ? <time>{uhr(r.at, now)}</time> : null}</li>)}</ul>
    : <p className="lock">{leer}</p>
);

/** Station (alte Fluss-Karte) bzw. Werk-ID → Werk der Firma-Karte. */
export const S_ALIAS: Record<string, string> = { bestand: "lead", kaeufer: "kwerk" };
export function werkVonS(s: string): string | null {
  const k = S_ALIAS[s] ?? s;
  const st = WERKE.find((w) => w.station === k && w.workflow) ?? WERKE.find((w) => w.station === k);
  if (st) return st.id;
  return WERKE.find((w) => w.id === k && k !== "kunden")?.id ?? null;
}
export const sVonWerk = (w: Pick<WerkBild, "id" | "station">) => w.station ?? w.id;

const DETAIL: Record<string, [string, string]> = {
  lead: ["/dashboard/bestand", "Bestand"], pruefer: ["/dashboard/betrieb", "Prüfungen"], stichprobe: ["/dashboard/betrieb", "Prüfungen"],
  proben: ["/dashboard/proben", "Proben"], kunden: ["/dashboard/kontakte", "Käufer & Kontakte"], versand: ["/dashboard/versand", "Versand"],
  antworten: ["/dashboard/antworten", "Antworten-Cockpit"], lieferung: ["/dashboard/kunden", "Kunden"], umsatz: ["/dashboard/finanzen", "Finanzen"],
  wachhund: ["/dashboard/betrieb", "Betrieb"], radar: ["/dashboard/buero/werke", "Werke-Details"], premium: ["/dashboard/proben", "Proben"],
  kontakt: ["/dashboard/buero/werke", "Werke-Details"], feedback: ["/dashboard/buero/bereich/qualitaet", "Kunden-Feedback"],
};
const ANKER: Record<string, string> = { lead: "plaetze", pruefer: "werke", stichprobe: "werke", proben: "proben", kunden: "laender", versand: "versand",
  antworten: "werke", lieferung: "werke", wachhund: "werke" };
const START: Record<string, "lead-werk" | "kunden-werk" | "proben-vorrat" | "freigabe-stichprobe"> = {
  // Prüfer-Werk selbst ist nicht direkt startbar: an seiner Kachel startet nur die Freigabe-Stichprobe (so beschriftet)
  lead: "lead-werk", kunden: "kunden-werk", proben: "proben-vorrat", pruefer: "freigabe-stichprobe", stichprobe: "freigabe-stichprobe",
};
const PULS_TEXT = { live: "lebt (Herzschlag < 6 min)", "live~": "lebt laut Ersatzquelle (~)", still: "steht gerade", grau: "keine Daten oder nicht gebaut" } as const;

export function WerkFenster({ w, tab, s, now, letzter, paused, kanten }: {
  w: WerkBild; tab: "info" | "set"; s: string; now: number; letzter: string | null; paused: boolean; kanten: { was: string; proStunde: number }[];
}) {
  const base = `${ZU}?s=${s}`;
  const tabs = (
    <nav className="drw-tabs" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
      <Link href={`${base}&t=info`} scroll={false} className={tab === "info" ? "on" : ""}><Icon name="info" size={16} />Info</Link>
      <Link href={`${base}&t=set`} scroll={false} className={tab === "set" ? "on" : ""}><Icon name="einstellungen" size={16} />Einstellen</Link>
    </nav>
  );
  const ag = agentenVonWerk(w.id);
  const start = START[w.id];
  const back = `${base}&t=${tab}`;
  return (
    <Fenster titel={w.name} icon={w.gold ? "trend-hoch" : "werk"} gold={w.gold} tabs={w.fehlt ? undefined : tabs}>
      {w.fehlt ? (<>
        <p className="big">–</p>
        <p className="lock">Noch nicht gebaut · Auftrag {w.auftrag}. Grau heißt: hier läuft nichts.</p>
      </>) : tab === "info" ? (<>
        <div><p className="big">{w.zahl}</p><p className="lock">{w.unter}</p></div>
        <p className="lock"><i className={`jz-pp ${w.puls === "live~" ? "live-" : w.puls}`} style={{ display: "inline-block", marginRight: 6 }} />{PULS_TEXT[w.puls]}</p>
        <p className="lock">Letzter Lauf: {letzter ? uhr(letzter, now) : "–"}{(() => { const m = WERKE.find((x) => x.id === w.id); const t = m ? taktAnzeige(m, now) : ""; return t ? ` · Takt ${t}` : ""; })()}</p>
        {kanten.length > 0 && <ul className="l">{kanten.map((k) => <li key={k.was}><b>{k.was}</b><span>{k.proStunde > 0 ? `${zahl(k.proStunde)} pro Stunde` : "gerade kein Durchfluss"}</span></li>)}</ul>}
        {w.plaetze && <p className="lock">Plätze: Ist {w.plaetze.ist} (Autopilot) · Soll {w.plaetze.soll} (du) · max {w.plaetze.max}</p>}
        {ag.length > 0 && <p className="lock">Genutzt von: {ag.map((a) => a.name).join(", ")}</p>}
        {DETAIL[w.id] && <Lnk to={DETAIL[w.id][0]}>{DETAIL[w.id][1]} prüfen</Lnk>}
      </>) : (<>
        <div className="reihe">
          {w.id === "versand" && !paused && (
            <form action={setPaused}><input type="hidden" name="back" value={back} /><input type="hidden" name="paused" value="1" />
              <button className="stop" title="wirkt sofort · Wiederanlauf nur im Regler mit „Übernehmen“"><Icon name="pause" size={16} /> Versand pausieren</button></form>
          )}
          {w.id === "versand" && paused && <p className="warn">Versand pausiert · Wiederanlauf im Regler</p>}
          {start && (
            <form action={requestStart}><input type="hidden" name="back" value={back} /><input type="hidden" name="wf" value={start} />
              <button className="go"><Icon name="start" size={16} /> {start === "freigabe-stichprobe" ? "Stichprobe starten" : "Jetzt starten"}</button></form>
          )}
        </div>
        <Lnk to={`/dashboard/regler#${ANKER[w.id] ?? "werke"}`}>Feinjustieren</Lnk>
        <p className="lock"><Icon name="schloss" size={14} /> Prüfregeln, Freigabe, Notbremse und Sperrliste sind nie einstellbar.</p>
      </>)}
    </Fenster>
  );
}

export function DuFenster({ bd, lampen }: { bd: BdPunkt[]; lampen: Lampe[] }) {
  return (
    <Fenster titel="Braucht dich" icon="achtung">
      {bd.length ? <div className="bd"><BrauchtDich items={bd.slice(0, 3)} /></div> : <p className="lock">Nichts offen – JARVIS arbeitet allein.</p>}
      <ul className="l">{lampen.map((l) => <li key={l.key}><b>{l.name}: {l.an === null ? "unbekannt" : l.an ? "an" : "aus"}</b><Link href={`/dashboard/regler#${l.anker}`}>im Regler feinjustieren</Link></li>)}</ul>
    </Fenster>
  );
}

export function ZielFenster({ ziele }: { ziele: ZielBild[] }) {
  return (
    <Fenster titel="Ziele" icon="trend-hoch" gold>
      <ul className="l">{ziele.map((z) => <li key={z.key}><b>{z.titel}: {z.ist} / {z.soll}</b><span>{z.unbestaetigt ? "Vorschlag – noch nicht bestätigt" : "bestätigt"}</span></li>)}</ul>
      <Lnk to="/dashboard/ziele">Ziel bestätigen</Lnk>
    </Fenster>
  );
}

export function LernFenster({ p, rows, now }: { p: LernPhase; rows: { titel: string; grund: string; at: string | null }[]; now: number }) {
  return (
    <Fenster titel={`Lernschleife: ${LERN_WORT[p]}`} icon="gehirn">
      <Liste rows={rows} now={now} leer={p === "messen" ? "0 gemessen – noch keine Entscheidung mit Erwartung ist fällig." : p === "lehre" ? "Noch keine Lehre mit Vertrauen ≥ 0,7." : "Gerade keine Einträge."} />
      <Lnk to="/dashboard/gehirn">Gehirn öffnen</Lnk>
    </Fenster>
  );
}

export function BereichFenster({ b, tasks, now }: { b: BereichBild; tasks: { agent: number | null; brief: string; status: string; created_at: string; rolle: string | null }[]; now: number }) {
  const ag = agentenVonBereich(b.slug);
  const werke = werkeVonBereich(b.slug).map((id) => WERKE.find((w) => w.id === id)?.name ?? id);
  const anteil = b.luecke === null ? null : Math.max(0, Math.min(1, 1 - b.luecke));
  const C = 2 * Math.PI * 40;
  const meta = BEREICHE.find((x) => x.slug === b.slug);
  return (
    <Fenster titel={b.name} icon={meta && isIconName(meta.icon) ? meta.icon : "agent"} gold={b.gold}>
      <div className="ring2">
        <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden>
          <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(95,212,255,.14)" strokeWidth="8" />
          {anteil !== null && <circle cx="48" cy="48" r="40" fill="none" stroke={b.gold ? "#e2c68f" : "#5fd4ff"} strokeWidth="8" strokeLinecap="round" transform="rotate(-90 48 48)" strokeDasharray={`${(anteil * C).toFixed(1)} ${C.toFixed(1)}`} />}
        </svg>
        <div><b>{b.titel}</b><p className="lock">{b.grund || (b.ist !== null ? `Ist ${zahl(b.ist)} · Soll ${zahl(b.soll)}` : "noch keine Messung")}</p></div>
      </div>
      <ul className="l">{ag.map((a) => <li key={a.id}><b>{a.name}</b><span>{a.typ} · {a.takt}{b.agenten.find((x) => x.id === a.id)?.laeuft ? " · arbeitet" : ""}</span></li>)}</ul>
      {werke.length > 0 && <p className="lock">Werke: {werke.join(" · ")}</p>}
      {tasks.length > 0 && <Liste rows={tasks.slice(0, 3).map((t) => ({ titel: `A${t.agent ?? "?"} · ${t.brief.slice(0, 56)}`, grund: t.status, at: t.created_at }))} now={now} leer="" />}
      <div className="reihe">
        <Link href={`${ZU}?a=neu&b=${encodeURIComponent(`${b.name}: ${b.titel}`.slice(0, 200))}${meta?.leitung.startsWith("rolle:") ? `&r=${meta.leitung.slice(6)}` : ""}`} scroll={false} className="lnk">Auftrag an A1–A8<Icon name="weiter" size={14} /></Link>
        <Lnk to={`/dashboard/buero/bereich/${b.slug}`}>Büro-Details</Lnk>
      </div>
    </Fenster>
  );
}

const PLANKE_LINK: Record<string, [string, string]> = {
  freigabe: ["/dashboard/betrieb", "Prüfungen ansehen"], notbremse: ["/dashboard/versand", "Zustellung ansehen"], sperrliste: ["/dashboard/recht", "Recht"],
  recht: ["/dashboard/recht", "Recht"], speicher: ["/dashboard/speicher", "Speicher"], geld: ["/dashboard/finanzen", "Finanzen"],
};
export function PlankeFenster({ p }: { p: PlankeBild }) {
  return (
    <Fenster titel={p.name} icon="schloss" gold={p.id === "geld"}>
      <p className="lock" style={{ fontSize: 15, color: "#d9ecff" }}>{p.regel}</p>
      <div><p className="big">{p.zahl}</p><p className="lock">{p.wort} · {p.unter}</p></div>
      <p className="lock">{p.tip}</p>
      <p className="lock"><Icon name="schloss" size={14} /> Nicht schaltbar – nur Anzeige.</p>
      {PLANKE_LINK[p.id] && <Lnk to={PLANKE_LINK[p.id][0]}>{PLANKE_LINK[p.id][1]}</Lnk>}
    </Fenster>
  );
}
