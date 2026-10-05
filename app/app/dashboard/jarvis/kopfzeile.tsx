"use client";
/** B0 Kopfzeile der Zentrale: Marke, Uhr (Berlin, Minutentakt), Live-Punkt, Lage in einem Satz, „Braucht dich“, Antworten, Abmelden. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/app/icons";
import { logout } from "../actions";

const WTAG = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short" });
const HM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

export function Kopfzeile({ abruf, ok, lage, bd, antworten, heiss }: {
  abruf: string; ok: boolean; lage: { titel: string; grund: string }; bd: number; antworten: number | null; heiss: number;
}) {
  const [jetzt, setJetzt] = useState<number | null>(null);
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    const tick = () => setJetzt(Date.now());
    tick();
    // Minutentakt: Uhr springt zur vollen Minute, Live-Punkt prüft dabei das Alter des letzten Abrufs
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, []);
  const alt = jetzt !== null ? jetzt - Date.parse(abruf) : 0;
  const live = ok && alt < 20_000;
  return (
    <header className="jz-kopf">
      <div className="jz-marke">
        <b>JARVIS</b>
        <span className="jz-uhr" suppressHydrationWarning>{jetzt !== null ? <><span className="wt">{WTAG.format(new Date(jetzt))} </span>{HM.format(new Date(jetzt))}</> : ""}</span>
        <span className={`jz-live${live ? " an" : ""}`} title={live ? "live · Abruf alle 10 s" : "kein frischer Abruf"} suppressHydrationWarning>
          <i aria-hidden /><span className="lt">{live ? "live" : `Stand ${HM.format(new Date(abruf))}`}</span>
        </span>
      </div>
      <button type="button" className="jz-lage" aria-expanded={offen} onClick={() => setOffen((x) => !x)} title={lage.grund || lage.titel}>
        <span>{lage.titel}</span>{lage.grund && <em>{lage.grund}</em>}
      </button>
      <div className="jz-zaehl">
        <Link href="/dashboard/jarvis?s=du" scroll={false} className="bd" title="Braucht dich" aria-label={`Braucht dich: ${bd}`}>
          <Icon name="achtung" size={16} /><b className="z">{bd}</b>
        </Link>
        <Link href="/dashboard/antworten" className="an" title="Offene Antworten" aria-label={`Antworten offen: ${antworten ?? "–"}`}>
          <Icon name="antworten" size={16} /><b className="z">{antworten ?? "–"}</b>{heiss > 0 && <i className="heiss" title={`${heiss} mit Kaufinteresse`} />}
        </Link>
        <form action={logout}><button type="submit" title="Abmelden" aria-label="Abmelden"><Icon name="stopp" size={16} /></button></form>
      </div>
    </header>
  );
}
