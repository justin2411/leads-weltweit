/**
 * B2 Du + B3 Gehirn: links der Inhaber (Kreis „Du“, 5 Lämpchen nur zur Anzeige, gelber Ruf bei „Braucht dich“), in der
 * Mitte das Gehirn mit Zustandswort (ARBEITET/WARTET/BEREIT/AUS), Score und nächster Runde, außen der Lernring;
 * rechts der Strang Gehirn → Agenten (offen/laufend) und ein Partikel Du → Gehirn bei frischer Regler-Quittung.
 */
import Link from "next/link";
import type { GehirnBild } from "@/lib/zentrale-modell";
import type { LernPhase, LernSegment } from "@/lib/zentrale-logik";
import { LernRing } from "./lern-ring";

export type Lampe = { key: string; name: string; an: boolean | null; anker: string };

export function GehirnKern({ g, lern, aktiv, bd, lampen, ack, offen, laeuft }: {
  g: GehirnBild; lern: LernSegment[]; aktiv: LernPhase | null; bd: number; lampen: Lampe[]; ack: boolean; offen: number; laeuft: number;
}) {
  const kern = (
    <Link href="/dashboard/gehirn" className="jz-kernfeld" title="Gehirn öffnen">
      <b className="w">{g.wort}</b>
      {g.still ? <span>{g.still}</span> : <span className="z mono">Score {g.score}</span>}
      <span>nächste Runde {g.runde}</span>
    </Link>
  );
  return (
    <section className="p jz-kern" aria-label="Du und Gehirn">
      <div className="jz-du">
        <Link href="/dashboard/jarvis?s=du" scroll={false} className={`du${bd > 0 ? " ruf" : ""}`} title={bd ? `${bd} Punkte brauchen dich` : "Nichts offen für dich"}>
          Du{bd > 0 && <b>{bd}</b>}
        </Link>
        <div className="jz-lampen" aria-label="Schalter (nur Anzeige)">
          {lampen.map((l) => (
            <Link key={l.key} href={`/dashboard/regler#${l.anker}`} className={l.an === null ? "" : l.an ? "an" : "aus"} title={`${l.name}: ${l.an === null ? "unbekannt" : l.an ? "an" : "aus"} – im Regler feinjustieren`}>
              <i aria-hidden />
            </Link>
          ))}
        </div>
        {ack && <span className="jz-live an" title="Regler-Änderung in den letzten 2 min von einem Werk quittiert"><i aria-hidden />Quittung</span>}
      </div>
      <LernRing segmente={lern} aktiv={aktiv} drehen={g.wort === "ARBEITET"} herz={g.takt} wort={g.wort} kern={kern}
        href={(k) => `/dashboard/jarvis?s=lern&p=${k}`} />
      <div className="jz-strang">
        <span>Aufträge</span>
        <b className="z">{offen} offen · {laeuft} läuft</b>
        <Link href="/dashboard/jarvis?a=neu" scroll={false} className="jz-live" title="Neuen Auftrag an A1–A8">+ Auftrag</Link>
      </div>
    </section>
  );
}
