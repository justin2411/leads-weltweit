import type { ReactNode } from "react";
import { foldKey } from "@/lib/gehirn";
import { FoldBox } from "./fold-box";

/** Zustand vor dem ersten Zeichnen aus dem Browser übernehmen (läuft beim Parsen direkt hinter dem Abschnitt). */
const restore = (id: string, key: string) =>
  `try{var d=document.getElementById(${JSON.stringify(id)}),v=localStorage.getItem(${JSON.stringify(key)});if(d&&(v==="1"||v==="0"))d.open=v==="1"}catch(e){}`;

/** Abschnitt mit Kopfzeile (Titel, Kurzzusammenfassung) – auf/zu wird je Abschnitt dauerhaft gemerkt. */
export function Fold({ name, title, open, summary, className = "", children, icon }: {
  name: string; title: ReactNode; open: boolean; summary?: ReactNode; className?: string; children: ReactNode; icon?: ReactNode;
}) {
  const id = `gh-${name}`;
  const key = foldKey(name);
  return (
    <>
      <FoldBox id={id} storeKey={key} open={open} className={`gh-fold ${className}`}
        summary={
          <summary className="gh-sum">
            <span className="gh-sum-t">{icon}{title}</span>
            {summary && <span className="gh-sum-s">{summary}</span>}
            <span className="gh-chev" aria-hidden />
          </summary>
        }>
        <div className="gh-body">{children}</div>
      </FoldBox>
      <script dangerouslySetInnerHTML={{ __html: restore(id, key) }} />
    </>
  );
}
