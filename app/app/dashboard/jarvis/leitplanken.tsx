"use client";
/**
 * B6 Leitplanken: Freigabe, Notbremse, Sperrliste & Abmeldung, Kaltmail-Recht, Speicher, Geld – je Farbe, Wort, Zahl.
 * Keine Dauerbewegung: nur ein Aufleuchten (300 ms) beim Farbwechsel, ein Puls nur solange Notbremse/Speicher-Stopp
 * wirklich eingreifen. Nirgends ein Schalter zum Lockern.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/app/icons";
import type { PlankeBild } from "@/lib/zentrale-modell";

const ICON: Record<string, IconName> = { freigabe: "freigabe", notbremse: "stopp", sperrliste: "abmeldung", recht: "recht", speicher: "speicher", geld: "tarif" };

export function Leitplanken({ planken }: { planken: PlankeBild[] }) {
  const vorher = useRef<Record<string, string>>({});
  const [blitz, setBlitz] = useState<Set<string>>(new Set());
  useEffect(() => {
    const neu = new Set<string>();
    for (const p of planken) {
      if (vorher.current[p.id] && vorher.current[p.id] !== p.ton) neu.add(p.id);
      vorher.current[p.id] = p.ton;
    }
    if (!neu.size) return;
    setBlitz(neu);
    const t = setTimeout(() => setBlitz(new Set()), 320);
    return () => clearTimeout(t);
  }, [planken]);
  return (
    <section className="p jz-planken" aria-label="Leitplanken">
      <h2><Icon name="schloss" size={16} />Leitplanken</h2>
      <ul>
        {planken.map((p) => (
          <li key={p.id} style={{ display: "flex" }}>
            <Link href={`/dashboard/jarvis?s=planke&p=${p.id}`} scroll={false} style={{ flex: 1 }}
              className={`jz-pl t-${p.ton}${p.id === "geld" ? " gold" : ""}${blitz.has(p.id) ? " blitz" : ""}${p.greift ? " greift" : ""}`}
              title={`${p.name}: ${p.wort} · ${p.tip}`} aria-label={`${p.name}: ${p.wort}, ${p.zahl}`}>
              <span className="ic" aria-hidden><Icon name={ICON[p.id] ?? "schloss"} size={20} /></span>
              <b className="nm">{p.name}</b>
              <span className="wd">{p.wort}</span>
              <b className={`z${p.zahlTon === "rot" || p.zahlTon === "gelb" ? ` zt t-${p.zahlTon}` : ""}`}>{p.zahl}</b>
              <em>{p.unter}</em>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
