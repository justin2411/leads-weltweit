"use client";
/**
 * JARVIS-Zentrale „Organigramm live“ (Inhaber 04.10.2026: „ich will das neue system ganz einfach visuell verstehen …
 * Du → Gehirn → Agenten + Scout → Werke, rechts Leitplanken, immer live“). Raster 12 Spalten: Karte 9 (Du + Gehirn,
 * Bereiche + Agenten, Werke) und Leitplanken 3, oben Kopfzeile und Ziel-Ringe, unten Ticker; Handy eine Spalte.
 * Daten: Startwerte vom Server (loadZentrale), danach useZentrale (10 s / 60 s). Seitenfenster über die URL.
 * Grundsatz: Was sich nicht bewegt, läuft nicht. Grau = keine Daten / nicht gebaut. „~“ = Puls aus Ersatzquelle.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentTask } from "@/lib/agents";
import type { ZentraleDaten } from "@/lib/zentrale-typen";
import { BEREICHE, werkeVonBereich } from "@/lib/firma-karte";
import { LERN_PHASEN, type LernPhase } from "@/lib/zentrale-logik";
import {
  bereicheBild, gehirnBild, istVeraltet, kantenBild, lage, leitplankenBild, lernBild, neueAuftraege, nowMs, plaetzeBild, werkeBild, zieleBild,
} from "@/lib/zentrale-modell";
import { useHandy, usePauseHidden, useWenigBewegung, useZentrale } from "./use-zentrale";
import { Kopfzeile } from "./kopfzeile";
import { ZielRinge } from "./ziel-ringe";
import { GehirnKern, type Lampe } from "./gehirn-kern";
import { Bereiche } from "./bereiche";
import { WerkeKarte } from "./werke-karte";
import { Leitplanken } from "./leitplanken";
import { Ticker } from "./ticker";
import { BereichFenster, DuFenster, LernFenster, PlankeFenster, WerkFenster, ZielFenster, sVonWerk, werkVonS } from "./seitenfenster";
import { ChatKnopf } from "./kopf";
import { agentStartLabel } from "@/lib/agents";

const RUN_NAME: Record<string, string> = { lead: "lead-werk", pruefer: "pruefer-werk", proben: "proben-vorrat", kunden: "kunden-werk", stichprobe: "dauerpruefung" };

export function Zentrale({ initial, recht, agentDrawer, chatNeu }: {
  initial: ZentraleDaten; recht: { c: string; allowed: boolean }[]; agentDrawer: ReactNode; chatNeu: number;
}) {
  const z = useZentrale(initial);
  const sp = useSearchParams();
  const root = useRef<HTMLDivElement>(null);
  usePauseHidden(root);
  const wenig = useWenigBewegung();
  const handy = useHandy();
  const { schnell: s, langsam: l } = z;
  const now = nowMs(s, z.abruf);

  const werke = useMemo(() => werkeBild(s, l, now), [s, l, now]);
  const kanten = useMemo(() => kantenBild(s, l), [s, l]);
  const gehirn = gehirnBild(s, l, now);
  const lern = useMemo(() => lernBild(s, l, now), [s, l, now]);
  const bereiche = useMemo(() => bereicheBild(s), [s]);
  const planken = useMemo(() => leitplankenBild(s, l, recht), [s, l, recht]);
  const ziele = useMemo(() => zieleBild(s, l), [s, l]);
  const pl = plaetzeBild(s);
  const satz = lage(s);

  // Klötzchen wandern einmal (300 ms), wenn der Autopilot neu verteilt hat
  const [wander, setWander] = useState(false);
  const letzte = useRef(pl.schluessel);
  useEffect(() => {
    if (pl.schluessel && pl.schluessel !== letzte.current) {
      letzte.current = pl.schluessel;
      setWander(true);
      const t = setTimeout(() => setWander(false), 320);
      return () => clearTimeout(t);
    }
  }, [pl.schluessel]);

  // Goldener Funke bei echter Zahlung: neues Abo seit dem letzten Abruf
  const abo = useRef(s?.subs.neueste ?? null);
  const [funke, setFunke] = useState(false);
  useEffect(() => {
    const n = s?.subs.neueste ?? null;
    if (n && abo.current && n !== abo.current) { setFunke(true); const t = setTimeout(() => setFunke(false), 2500); abo.current = n; return () => clearTimeout(t); }
    abo.current = n;
  }, [s?.subs.neueste]);

  const owner = s?.owner ?? {};
  const werkePaused = owner.werke_paused ?? {};
  const lampen: Lampe[] = [
    { key: "werke", name: "Werke", an: s ? Object.keys(werkePaused).length === 0 : null, anker: "werke" },
    { key: "versand", name: "Versand", an: s ? !owner.send_paused : null, anker: "versand" },
    { key: "nachfass", name: "Nachfass", an: s ? owner.followup_enabled !== false : null, anker: "nachfass" },
    { key: "gehirn", name: "Gehirn", an: s ? s.brain_enabled !== false : null, anker: "gehirn" },
    { key: "autopilot", name: "Autopilot", an: s ? owner.slot_autopilot?.on !== false : null, anker: "plaetze" },
  ];
  const ack = !!s && Object.values(s.acks).some((a) => now - Date.parse(a) < 2 * 60_000);
  const tasks = (s?.tasks ?? []) as unknown as AgentTask[];
  const neu = Object.fromEntries(neueAuftraege(s, now).map((x) => [x.agent, x.gold ? "gold" : "cy"])) as Record<number, "cy" | "gold">;
  const bd = l?.bd ?? [];
  const bdN = bd.length;

  // ------------------------------------------------------------------ URL → Seitenfenster
  const sParam = sp.get("s");
  const bereich = sp.get("bereich");
  const p = sp.get("p");
  const t = sp.get("t") === "set" ? "set" : "info";
  const agent = sp.get("a");
  const hervor = bereich && BEREICHE.some((b) => b.slug === bereich) ? new Set(werkeVonBereich(bereich)) : null;
  let fenster: ReactNode = agent ? agentDrawer : null;
  let aktivWerk: string | null = null;
  if (!agent && sParam === "du") fenster = <DuFenster bd={bd} lampen={lampen} />;
  else if (!agent && sParam === "ziel") fenster = <ZielFenster ziele={ziele} />;
  else if (!agent && sParam === "lern" && (LERN_PHASEN as readonly string[]).includes(p ?? "")) fenster = <LernFenster p={p as LernPhase} rows={lern.liste[p as LernPhase]} now={now} />;
  else if (!agent && sParam === "planke") { const pk = planken.find((x) => x.id === p); if (pk) fenster = <PlankeFenster p={pk} />; }
  else if (!agent && sParam) {
    const id = werkVonS(sParam);
    if (id && werke[id]) {
      aktivWerk = sParam;
      const w = werke[id];
      const rn = RUN_NAME[id];
      const letzter = (rn && (l?.runs?.[rn]?.last ?? s?.beats.find((b) => b.werk === rn)?.last_beat)) || (id === "versand" ? s?.msg.last_sent_at ?? null : id === "wachhund" ? l?.stand ?? null : null);
      fenster = <WerkFenster w={w} tab={t} s={sParam} now={now} letzter={letzter ?? null} paused={!!owner.send_paused}
        kanten={kanten.filter((k) => k.von === id || k.an === id).map((k) => ({ was: k.was, proStunde: k.proStunde }))} />;
    }
  } else if (!agent && bereich) {
    const b = bereiche.find((x) => x.slug === bereich);
    if (b) fenster = <BereichFenster b={b} now={now} tasks={(s?.tasks ?? []).filter((x) => (b.slug === "strategie" ? !x.rolle : false) || BEREICHE.find((y) => y.slug === b.slug)!.agenten.includes(`rolle:${x.rolle}`))} />;
  }

  const bewegung = !wenig;
  const veraltet = istVeraltet(l, now);
  return (
    <div className={`jz${fenster ? " has-drw" : ""}`} ref={root}>
      <Kopfzeile abruf={z.abruf} ok={z.ok} lage={satz} bd={bdN} antworten={s ? s.replies.offen : null} heiss={s?.replies.heiss ?? 0} />
      <ZielRinge ziele={ziele} />
      <div className="jz-raster">
        <div className="jz-links">
          <GehirnKern g={gehirn} lern={lern.segmente} aktiv={lern.aktiv} bd={bdN} lampen={lampen} ack={ack}
            offen={(s?.tasks ?? []).filter((x) => x.status === "offen").length} laeuft={(s?.tasks ?? []).filter((x) => x.status === "laeuft").length} />
          <Bereiche bereiche={bereiche} aktiv={bereich} handoffs={s?.handoffs ?? []} tasks={tasks} startAt={agentStartLabel(new Date(now))} neu={neu}
            handy={handy} bewegung={bewegung} scoutAn={(s?.beats ?? []).some((b) => b.werk === "lead-werk" && b.last_beat && now - Date.parse(b.last_beat) < 6 * 60_000)} agent={agent} />
          <WerkeKarte werke={werke} kanten={kanten} href={(w) => (aktivWerk === sVonWerk(w) ? "/dashboard/jarvis" : `/dashboard/jarvis?s=${sVonWerk(w)}`)}
            aktiv={aktivWerk} hervor={hervor} bewegung={bewegung} handy={handy} abprall={{ versand: s?.msg.blocked_60m ?? 0, pruefer: s?.held_60m ?? 0 }}
            wachTick={werke.wachhund?.puls === "live~" || werke.wachhund?.puls === "live"} plaetze={pl} wander={wander} />
        </div>
        <Leitplanken planken={planken} />
      </div>
      <Ticker rows={s?.ticker ?? []} now={now} />
      {veraltet && l && <p className="lock" style={{ margin: 0, fontSize: 12 }}>Zahlen der Werke: Stand {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(l.stand))}</p>}
      {funke && <p className="jz-funke" role="status">Neue Zahlung</p>}
      {fenster}
      <ChatKnopf neu={chatNeu} />
    </div>
  );
}
