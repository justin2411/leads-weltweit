import Link from "next/link";
import type { ReactNode } from "react";
import type { Ampel } from "@/lib/ampel";
import { AMPEL_TEXT } from "@/lib/ampel";
import { Icon, type IconName } from "@/app/icons";
import { Crumbs } from "../v2";

/** Bausteine der Abteilungs-Seiten (Recht, Betrieb, Protokoll). Farben nur über zx-a-<ampel> (lib/ampel.ts). */
export const amp = (a: Ampel) => `zx-a-${a}`;

export function Dot({ a, tip }: { a: Ampel; tip?: string }) {
  return <i className={`zx-dot ${amp(a)}`} title={tip ?? AMPEL_TEXT[a]} aria-label={tip ?? AMPEL_TEXT[a]} role="img" />;
}

export function Head({ name, icon, at, children }: { name: string; icon: IconName; at?: string; children?: ReactNode }) {
  return (
    <>
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], [name, ""]]} />
      <div className="zx-head">
        <h1><Icon name={icon} size={22} /> {name}</h1>
        {at && <span className="zx-at">{at}</span>}
        {children}
      </div>
    </>
  );
}

export function Tile({ a, label, value, note, href }: { a: Ampel; label: string; value: ReactNode; note?: ReactNode; href?: string }) {
  const body = <><span>{label}</span><b>{value}</b>{note && <em>{note}</em>}</>;
  return href ? <Link href={href} className={`zx-tile ${amp(a)}`} title={AMPEL_TEXT[a]}>{body}</Link>
    : <div className={`zx-tile ${amp(a)}`} title={AMPEL_TEXT[a]}>{body}</div>;
}

export function Card({ title, icon, sum, children, id }: { title: string; icon?: IconName; sum?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="zx-card" id={id}>
      <div className="zx-h"><h2>{icon && <Icon name={icon} size={14} />}{title}</h2>{sum !== undefined && <span className="zx-sum">{sum}</span>}</div>
      {children}
    </section>
  );
}

export const n = (x: number | null | undefined) => (x === null || x === undefined ? "–" : x.toLocaleString("de-DE"));
