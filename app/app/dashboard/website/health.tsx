"use client";

/**
 * Website-Gesundheit (Inhaber 04.10.2026: „wenig text und gute grafiken bzw animationen“): großer Ring = Gesamtwert,
 * sieben kleine Ringe je Bereich (Ampel), Balken = Verlauf der letzten Checks. Klick auf einen Ring zeigt die Funde des
 * Bereichs (rot zuerst). Ringe zeichnen sich beim Laden auf (nur ohne „Bewegung reduzieren“).
 */
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AREAS, areaTone, canFixFinding, findingsFor, fixState, recentlyFixed, ringDash, suggestionLine, toneOf, visibleFindings,
  type AreaKey, type Finding, type FixView, type SiteCheck, type TaskStatus, type Tone, type WebsiteFix,
} from "@/lib/website";
import { Icon } from "@/app/icons";
import { fixWebsiteFinding, ignoreWebsiteFinding, setWebsiteAutofix } from "./actions";

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

export type FixProps = {
  fixes: WebsiteFix[]; tasks: Record<string, { status: TaskStatus }>; autofix: boolean; ignored: Record<string, string>;
  now: string; startAt: string;
};

export function Health({ check, total, history, site, at, fix }: {
  check: SiteCheck | null; total: number | null; history: { at: string; total: number | null }[]; site: string; at: string; fix: FixProps;
}) {
  const [sel, setSel] = useState<AreaKey | null>(null);
  const [auto, setAuto] = useState(fix.autofix);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toggleAuto = () => start(async () => {
    const r = await setWebsiteAutofix(!auto);
    if (r.ok) { setAuto(r.on); router.refresh(); }
  });
  const red = check?.funde.filter((f) => f.stufe === "rot").length ?? 0;
  const yellow = check?.funde.filter((f) => f.stufe === "gelb").length ?? 0;
  // Gesamtring nach Gesamtwert; rote Funde zeigen die Zähler und die Bereichsringe – grün wird dann höchstens gelb
  const tTone = toneOf(total) === "gruen" && red > 0 ? "gelb" : toneOf(total);
  const area = sel ? AREAS.find((a) => a.key === sel) ?? null : null;
  const list = sel ? findingsFor(check, sel, 40) : [];
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
          <button type="button" className={`ws-auto${auto ? " on" : ""}`} aria-pressed={auto} disabled={busy} onClick={toggleAuto}
            title={auto ? "JARVIS behebt neue Funde selbst (höchstens 3 Aufträge pro Tag, nie Rechtstexte oder Preise)" : "Funde nur anzeigen"}>
            <Icon name="jarvis" size={14} />Auto-Fix {auto ? "an" : "aus"}
          </button>
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
          <FindingList list={list} area={area.key} site={site} check={check} fix={fix} />
        </div>
      )}
    </section>
  );
}

/**
 * Fund-Liste mit Lösungsvorschlag (Inhaber 04.10.2026: „direkt anpassungen machen … mit lösungsvorschlägen“): je Fund eine
 * Zeile Vorschlag, Knopf „Beheben“ (Auftrag an einen freien Agenten) und „Ignorieren“ (30 Tage ausblenden), danach der
 * Stand des Auftrags. Rechtstexte nur melden.
 */
function FindingList({ list, area, site, check, fix }: { list: Finding[]; area: AreaKey; site: string; check: SiteCheck | null; fix: FixProps }) {
  const now = new Date(fix.now);
  const [local, setLocal] = useState<Record<string, FixView | "weg">>({});
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { shown, hidden } = visibleFindings(list, fix.ignored, now);
  const rows = shown.filter((f) => local[f.key] !== "weg");
  const done = recentlyFixed(fix.fixes, area, now);

  const act = (f: Finding, what: "fix" | "ignore") => start(async () => {
    setErr(null);
    const r = what === "fix" ? await fixWebsiteFinding(f.key) : await ignoreWebsiteFinding(f.key);
    if (!r.ok) { setErr(r.error); return; }
    setLocal((m) => ({ ...m, [f.key]: what === "fix" ? { text: `JARVIS behebt · startet um ${fix.startAt}`, tone: "wait", canFix: false } : "weg" }));
    router.refresh();
  });

  if (!rows.length && !done.length) {
    return <p className="ws-clean"><Icon name="ok" size={15} />{check?.scores[area] === null || !check ? "Noch nicht geprüft" : hidden ? `Alles sauber · ${hidden} ausgeblendet` : "Alles sauber"}</p>;
  }
  return (
    <>
      {err && <p className="ws-ferr" role="alert"><Icon name="fehler" size={14} />{err}</p>}
      <ul>
        {rows.map((f) => {
          const l = local[f.key];
          const st = (l && l !== "weg" ? l : null) ?? fixState(f, fix.fixes, fix.tasks, check?.at ?? "", fix.startAt);
          const can = st ? st.canFix : canFixFinding(f);
          return (
            <li key={f.key} className={`l-${f.stufe}`}>
              <Icon name={LEVEL_ICON[f.stufe]} size={14} />
              <span className="ws-ftext">
                <span>{f.text}</span>
                <small className="ws-sug" title={f.vorschlag?.alt ? `Jetzt: ${f.vorschlag.alt}` : undefined}>
                  <Icon name="pfeil" size={12} />{suggestionLine(f)}
                </small>
              </span>
              <span className="ws-fact">
                {f.pfad && <a href={`${site}${f.pfad}`} target="_blank" rel="noopener noreferrer">{f.pfad}</a>}
                {st && <em className={`ws-fst t-${st.tone}`}>{st.text}</em>}
                {can && <button type="button" className="ws-fix" disabled={pending} onClick={() => act(f, "fix")}><Icon name="jarvis" size={13} />Beheben</button>}
                {!st && !canFixFinding(f) && <em className="ws-fst t-wait">nur melden</em>}
                <button type="button" className="ws-ign" disabled={pending} onClick={() => act(f, "ignore")} aria-label="30 Tage ausblenden" title="30 Tage ausblenden">
                  <Icon name="schliessen" size={13} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {(done.length > 0 || hidden > 0) && (
        <p className="ws-fdone">
          {done.length > 0 && <><Icon name="ok" size={13} />{done.length} behoben</>}
          {done.length > 0 && hidden > 0 && " · "}
          {hidden > 0 && `${hidden} ausgeblendet`}
        </p>
      )}
    </>
  );
}
