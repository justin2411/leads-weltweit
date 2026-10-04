"use client";

/**
 * Website-Gesundheit (Inhaber 04.10.2026: „wenig text und gute grafiken bzw animationen“): großer Ring = Gesamtwert,
 * sieben kleine Ringe je Bereich (Ampel), Balken = Verlauf der letzten Checks. Klick auf einen Ring zeigt die Funde des
 * Bereichs (rot zuerst). Ringe zeichnen sich beim Laden auf (nur ohne „Bewegung reduzieren“).
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { AREAS, areaTone, findingsFor, ringDash, toneOf, type AreaKey, type SiteCheck, type Tone } from "@/lib/website";
import { Icon } from "@/app/icons";

type V = CSSProperties & Record<`--${string}`, string | number>;
const LEVEL_ICON = { rot: "fehler", gelb: "achtung", info: "info" } as const;

function Ring({ score, tone, r, w, size, children }: { score: number | null | undefined; tone: Tone; r: number; w: number; size: number; children?: ReactNode }) {
  const { c, off } = ringDash(score, r);
  const mid = size / 2;
  return (
    <span className={`ws-ring t-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={mid} cy={mid} r={r} className="bg" strokeWidth={w} />
        <circle cx={mid} cy={mid} r={r} className="fg" strokeWidth={w} strokeDasharray={c} strokeDashoffset={off}
          style={{ "--c": c, "--off": off } as V} transform={`rotate(-90 ${mid} ${mid})`} />
      </svg>
      <span className="in">{children}</span>
    </span>
  );
}

export function Health({ check, total, history, site, at }: {
  check: SiteCheck | null; total: number | null; history: { at: string; total: number | null }[]; site: string; at: string;
}) {
  const [sel, setSel] = useState<AreaKey | null>(null);
  const red = check?.funde.filter((f) => f.stufe === "rot").length ?? 0;
  const yellow = check?.funde.filter((f) => f.stufe === "gelb").length ?? 0;
  // Gesamtring nach Gesamtwert; rote Funde zeigen die Zähler und die Bereichsringe – grün wird dann höchstens gelb
  const tTone = toneOf(total) === "gruen" && red > 0 ? "gelb" : toneOf(total);
  const area = sel ? AREAS.find((a) => a.key === sel) ?? null : null;
  const list = sel ? findingsFor(check, sel) : [];
  const max = Math.max(100, ...history.map((h) => h.total ?? 0));

  return (
    <section className="ws-health" aria-label="Website-Gesundheit">
      <div className="ws-main">
        <Ring score={total} tone={tTone} r={62} w={10} size={148}>
          <b>{total ?? "–"}</b><small>{total === null ? "noch kein Check" : "von 100"}</small>
        </Ring>
        <div className="ws-sum">
          <span className="ws-site"><Icon name="website" size={15} />{site.replace(/^https:\/\/(www\.)?/, "")}</span>
          <span className="ws-pills">
            <em className="p-rot"><Icon name="fehler" size={13} />{red}</em>
            <em className="p-gelb"><Icon name="achtung" size={13} />{yellow}</em>
            <em className="p-n"><Icon name="land" size={13} />{check?.seiten ?? 0} Abrufe</em>
          </span>
          {history.length > 1 && (
            <span className="ws-spark" aria-label={`Verlauf: ${history.map((h) => h.total ?? "–").join(", ")}`}>
              {history.map((h, i) => (
                <i key={i} className={`t-${toneOf(h.total)}`} style={{ "--h": `${Math.max(6, ((h.total ?? 0) / max) * 100)}%`, "--d": `${i * 40}ms` } as V} title={`${h.total ?? "–"}`} />
              ))}
            </span>
          )}
          <span className="ws-at"><Icon name="uhr" size={13} />{at || "Check läuft täglich 06:23"}</span>
        </div>
      </div>

      <ul className="ws-areas" role="list">
        {AREAS.map((a, i) => {
          const s = check?.scores[a.key] ?? null;
          const tone = areaTone(check, a.key);
          const on = sel === a.key;
          return (
            <li key={a.key} style={{ "--d": `${120 + i * 70}ms` } as V}>
              <button type="button" className={`ws-area${on ? " on" : ""}`} aria-pressed={on} onClick={() => setSel(on ? null : a.key)}
                title={`${a.label}: ${s ?? "nicht geprüft"}`}>
                <Ring score={s} tone={tone} r={25} w={5} size={62}><Icon name={a.icon} size={19} /></Ring>
                <b className={`t-${tone}`}>{s ?? "–"}</b>
                <span>{a.short}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {area && (
        <div className="ws-funde" role="region" aria-label={`Funde ${area.label}`}>
          <div className="ws-funde-h"><Icon name={area.icon} size={16} /><b>{area.label}</b>
            <button type="button" onClick={() => setSel(null)} aria-label="Schließen"><Icon name="schliessen" size={15} /></button></div>
          {list.length ? (
            <ul>
              {list.map((f, i) => (
                <li key={i} className={`l-${f.stufe}`}>
                  <Icon name={LEVEL_ICON[f.stufe]} size={14} />
                  <span>{f.text}</span>
                  {f.pfad && <a href={`${site}${f.pfad}`} target="_blank" rel="noopener noreferrer">{f.pfad}</a>}
                </li>
              ))}
            </ul>
          ) : <p className="ws-clean"><Icon name="ok" size={15} />{check?.scores[area.key] === null || !check ? "Noch nicht geprüft" : "Alles sauber"}</p>}
        </div>
      )}
    </section>
  );
}
