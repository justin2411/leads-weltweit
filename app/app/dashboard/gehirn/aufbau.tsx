"use client";

/**
 * Gehirn-Seite oben „Aufbau“ (Inhaber 05.10.2026: „gehirn ist oben auch mit animation des gehirn darunter sind die
 * agenten … dann werke bzw wie das ganze aufgebaut ist … wann beim gehirn automatisierungen beginnen, wenig texte
 * schöne grafiken und animationen“). Ein Organigramm von oben nach unten, verbunden durch leuchtende Drähte:
 *   ① Gehirn (animiert, Status, letzte/nächste Sitzung, letzte Kurzmeldung) → ② Agenten (alle echten, live) →
 *   ③ Werke (Plätze, letzter/nächster Lauf, Fehler rot) → ④ Zeitplan (24-h-Leiste deutsche Zeit, Jetzt-Zeiger, Countdown).
 * Details nur per Klick (Fenster mit x-btn). Daten: lib/gehirn-aufbau-data.ts; Zeiten: lib/gehirn-aufbau.ts.
 * prefers-reduced-motion: alles still (aufbau-css.ts).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/app/icons";
import { alsNaechstes, berlinMinute, countdown, hm, type Termin } from "@/lib/gehirn-aufbau";
import type { AgentKarte, AufbauBild, Verlauf, WerkKarte } from "@/lib/gehirn-aufbau-data";
import { GYRI, HEMI, NODES, PATHS } from "./brain-form";
import { AUFBAU_CSS } from "./aufbau-css";

type V = CSSProperties & Record<`--${string}`, string | number>;
type Offen = { titel: string; icon: IconName; zeilen: Verlauf[]; leer: string; link?: [string, string] } | null;

const TAG_DE = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
/** „10:17“, mit Datum wenn nicht heute (deutsche Zeit). */
function zeit(iso: string | null | undefined, now: Date): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return TAG_DE.format(d) === TAG_DE.format(now) ? hm(d) : `${TAG_DE.format(d)} ${hm(d)}`;
}
const STATUS_WORT: Record<string, string> = { arbeitet: "arbeitet", wartet: "wartet", aus: "aus" };
const TASK_TON: Record<string, string> = { fertig: "gruen", laeuft: "cy", offen: "gelb", fehler: "rot", abgebrochen: "grau" };

function Gehirn({ mode }: { mode: string }) {
  const half = (mirror: boolean) => (
    <g transform={mirror ? "translate(400 0) scale(-1 1)" : undefined}>
      <path d={HEMI} className="ga-hemi" />
      {GYRI.map((d, i) => <path key={i} d={d} className="ga-gyr" />)}
      {PATHS.map((d, i) => <path key={i} d={d} className="ga-sig" pathLength={100} style={{ "--i": i + (mirror ? 3 : 0) } as V} />)}
      {NODES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.4} className="ga-syn" style={{ "--i": (i * 7 + (mirror ? 5 : 0)) % 12 } as V} />)}
    </g>
  );
  return (
    <svg viewBox="40 60 320 260" className={`ga-brain m-${mode}`} aria-hidden>
      <circle cx="200" cy="196" r="118" className="ga-aura" />
      {half(false)}{half(true)}
      <circle cx="200" cy="196" r="9" className="ga-kern" />
    </svg>
  );
}

function Draht({ n = 3 }: { n?: number }) {
  return <div className="ga-draht" aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} style={{ "--i": i } as V} />)}</div>;
}

function Punkt({ s }: { s: string }) {
  return <i className={`ga-pt s-${s}`} aria-hidden />;
}

function AgentBtn({ a, now, auf }: { a: AgentKarte; now: Date; auf: (o: Offen) => void }) {
  const zeile = a.auftrag || (a.next ? `nächste ${zeit(a.next, now)}` : a.status === "aus" ? "aus" : "frei");
  return (
    <button type="button" className={`ga-ag s-${a.status}`} title={`${a.name}: ${STATUS_WORT[a.status]}`}
      onClick={() => auf({ titel: a.name, icon: a.icon as IconName, zeilen: a.verlauf, leer: "Noch keine Aufträge in 7 Tagen." })}>
      <span className="ga-ag-h">
        <span className="ga-ic">{a.marke ? <b>{a.marke}</b> : <Icon name={a.icon as IconName} size={16} />}</span>
        <span className="ga-ag-n">{a.name}</span>
        <Punkt s={a.status} />
      </span>
      <span className="ga-ag-a">{zeile}</span>
      <span className="ga-ag-z" title="erledigt in 7 Tagen"><b>{a.erledigt ?? "–"}</b> <small>7 T</small></span>
    </button>
  );
}

function Ring({ ist, max }: { ist: number; max: number }) {
  const r = 15, u = 2 * Math.PI * r, p = max > 0 ? Math.min(1, ist / max) : 0;
  return (
    <svg viewBox="0 0 36 36" className="ga-ring" aria-hidden>
      <circle cx="18" cy="18" r={r} className="bg" />
      <circle cx="18" cy="18" r={r} className="fg" strokeDasharray={`${(p * u).toFixed(1)} ${u.toFixed(1)}`} />
    </svg>
  );
}

function Werk({ w, now }: { w: WerkKarte; now: Date }) {
  const ton = w.fehler ? "rot" : w.puls === "live" || w.puls === "live~" ? "live" : w.puls === "still" ? "still" : "grau";
  return (
    <div className={`ga-werk t-${ton}`} title={`${w.name}${w.fehler ? " · letzter Lauf mit Fehler" : ""}`}>
      <span className="ga-ag-h">
        <span className="ga-ic"><Icon name={w.icon as IconName} size={16} /></span>
        <span className="ga-ag-n">{w.name}</span>
        <Punkt s={ton} />
      </span>
      <span className="ga-werk-m">
        {w.max ? (
          <span className="ga-ringw" title={`Plätze: ${w.ist} laufen · ${w.soll} geplant · ${w.max} max`}>
            <Ring ist={w.ist ?? 0} max={w.max} /><b className="ds-zahl">{w.ist}</b>
          </span>
        ) : <span className="ga-zahl ds-zahl" title={w.unter}>{w.zahl}</span>}
        <span className="ga-werk-t">
          <span title="letzter Lauf"><Icon name="ok" size={12} /> {zeit(w.last, now)}</span>
          <span title="nächster Lauf"><Icon name="uhr" size={12} /> {zeit(w.next, now)}</span>
        </span>
      </span>
    </div>
  );
}

const STUNDEN = [0, 6, 12, 18, 24];
function Spur({ t, jetzt, naechst }: { t: Termin; jetzt: number; naechst: boolean }) {
  const dicht = t.marken.length > 96;
  return (
    <div className={`ga-spur a-${t.art}${naechst ? " next" : ""}`}>
      <span className="ga-spur-n" title={`${t.name} · ${t.takt}`}><Icon name={t.icon as IconName} size={14} /><span>{t.name}</span></span>
      <span className={`ga-spur-b${dicht ? " dicht" : ""}`}>
        {!dicht && t.marken.map((m) => (
          <i key={m} className={m < jetzt ? "morgen" : ""} style={{ left: `${(m / 1440) * 100}%` }} />
        ))}
      </span>
      <span className="ga-spur-t ds-zahl">{t.next ? hm(new Date(t.next)) : "–"}</span>
    </div>
  );
}

export function Aufbau({ d }: { d: AufbauBild }) {
  const [now, setNow] = useState(() => new Date(d.now));
  const [offen, setOffen] = useState<Offen>(null);
  const [mehr, setMehr] = useState(false);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!offen) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOffen(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [offen]);

  const g = d.gehirn;
  const mode = g.an === false ? "aus" : g.wort === "ARBEITET" ? "hot" : g.wort === "WARTET" ? "wartet" : g.wort === "AUS" ? "aus" : "ruhig";
  const alle = d.gruppen.flatMap((x) => x.agenten);
  const arbeiten = alle.filter((a) => a.status === "arbeitet").length;
  const jetzt = berlinMinute(now);
  const termine = [...d.zeitplan.haupt, ...(mehr ? d.zeitplan.weitere : [])];
  const next = alsNaechstes(d.zeitplan.haupt, 4).filter((t) => Date.parse(t.next!) > now.getTime() - 30_000);
  const erst = next[0] ?? null;

  return (
    <section className="ga" aria-label="Aufbau: Gehirn, Agenten, Werke, Zeitplan">
      <style dangerouslySetInnerHTML={{ __html: AUFBAU_CSS }} />

      {/* ① Gehirn */}
      <div className="ga-box ga-kopf">
        <h2 className="ga-h"><Icon name="gehirn" size={16} /> Gehirn</h2>
        <button type="button" className="ga-hirn" aria-label="Gehirn: letzte Meldungen"
          onClick={() => setOffen({ titel: "Gehirn", icon: "gehirn", zeilen: g.meldungen.map((m) => ({ titel: m.text, status: "fertig", at: m.at, ergebnis: "" })),
            leer: "Noch keine Meldung.", link: [g.chatId ? `/dashboard/jarvis/chat?s=${g.chatId}` : "/dashboard/jarvis/chat", "Mit dem Gehirn sprechen"] })}>
          <Gehirn mode={mode} />
        </button>
        <div className="ga-fakten">
          <span className={`ga-chip ${g.an === false ? "aus" : "an"}`}><Punkt s={g.an === false ? "aus" : mode === "hot" ? "arbeitet" : "wartet"} />{g.an === null ? "?" : g.an ? "an" : "aus"} · Autopilot {g.autopilot ? "an" : "aus"}</span>
          <span className="ga-chip" title="letzte Sitzung (deutsche Zeit)"><Icon name="ok" size={13} /> zuletzt <b className="ds-zahl">{zeit(g.letzte, now)}</b></span>
          <span className="ga-chip" title="nächste Sitzung (deutsche Zeit)"><Icon name="uhr" size={13} /> nächste <b className="ds-zahl">{zeit(g.naechste, now)}</b>
            {g.naechste && <small>{countdown(Date.parse(g.naechste) - now.getTime())}</small>}</span>
        </div>
        {g.meldung && (
          <button type="button" className="ga-meld" title={g.meldung.text}
            onClick={() => setOffen({ titel: "Gehirn", icon: "gehirn", zeilen: g.meldungen.map((m) => ({ titel: m.text, status: "fertig", at: m.at, ergebnis: "" })),
              leer: "Noch keine Meldung.", link: [g.chatId ? `/dashboard/jarvis/chat?s=${g.chatId}` : "/dashboard/jarvis/chat", "Mit dem Gehirn sprechen"] })}>
            <time className="ds-zahl">{zeit(g.meldung.at, now)}</time><span>{g.meldung.text}</span><Icon name="weiter" size={14} />
          </button>
        )}
      </div>

      <Draht />

      {/* ② Agenten */}
      <div className="ga-box">
        <h2 className="ga-h"><Icon name="agent" size={16} /> Agenten <span className="ga-gross ds-zahl">{arbeiten}<small>/{alle.length} arbeiten</small></span></h2>
        <div className="ga-gruppen">
          {d.gruppen.map((gr) => (
            <section key={gr.key} className={`ga-gr g-${gr.key}`}>
              <h3><Icon name={gr.icon as IconName} size={14} /> {gr.titel}</h3>
              <div className="ga-ags">{gr.agenten.map((a) => <AgentBtn key={a.key} a={a} now={now} auf={setOffen} />)}</div>
            </section>
          ))}
        </div>
      </div>

      <Draht />

      {/* ③ Werke */}
      <div className="ga-box">
        <h2 className="ga-h"><Icon name="werk" size={16} /> Werke
          <span className="ga-gross ds-zahl" title={`${d.plaetze.geplant} geplant · ${d.plaetze.gesamt} max`}>{d.plaetze.laufend}<small>/{d.plaetze.gesamt} Plätze laufen</small></span></h2>
        <div className="ga-bar" aria-hidden><i style={{ width: `${d.plaetze.gesamt ? Math.min(100, (100 * d.plaetze.laufend) / d.plaetze.gesamt) : 0}%` }} /></div>
        <div className="ga-werke">{d.werke.map((w) => <Werk key={w.id} w={w} now={now} />)}</div>
      </div>

      <Draht />

      {/* ④ Zeitplan */}
      <div className="ga-box">
        <h2 className="ga-h"><Icon name="uhr" size={16} /> Wann das Gehirn loslegt</h2>
        {erst && (
          <div className="ga-next">
            <span className="ga-cd ds-zahl">{countdown(Date.parse(erst.next!) - now.getTime())}</span>
            <span className="ga-next-n"><Icon name={erst.icon as IconName} size={16} /> {erst.name} · {hm(new Date(erst.next!))}</span>
            <span className="ga-next-l">{next.slice(1).map((t) => <span key={t.key}>{hm(new Date(t.next!))} {t.name}</span>)}</span>
          </div>
        )}
        <div className="ga-plan">
          <div className="ga-skala" aria-hidden>
            <span />
            <span className="ga-skala-b">{STUNDEN.map((h) => <b key={h} style={{ left: `${(h / 24) * 100}%` }}>{h}</b>)}</span>
            <span />
          </div>
          <div className="ga-spuren">
            <div className="ga-jetzt" style={{ "--x": jetzt / 1440 } as V} aria-hidden><b className="ds-zahl">{hm(now)}</b></div>
            {termine.map((t) => <Spur key={t.key} t={t} jetzt={jetzt} naechst={t.key === erst?.key} />)}
          </div>
        </div>
        <p className="ga-fuss">
          <span><i className="ga-lg r" /> Claude-Routine</span><span><i className="ga-lg w" /> GitHub-Werk</span><span><i className="ga-lg m" /> morgen</span>
          {d.zeitplan.weitere.length > 0 && (
            <button type="button" className="ga-mehr" onClick={() => setMehr((x) => !x)} aria-expanded={mehr}>
              {mehr ? "weniger" : `+${d.zeitplan.weitere.length} weitere`}</button>
          )}
          <span className="ga-hinweis" title="GitHub startet geplante Läufe oft einige Minuten später">GitHub startet oft verspätet</span>
        </p>
      </div>

      {offen && (
        <div className="ga-bg" onClick={() => setOffen(null)}>
          <div className="ga-dlg" role="dialog" aria-modal="true" aria-label={offen.titel} onClick={(e) => e.stopPropagation()}>
            <header>
              <span className="ga-ic"><Icon name={offen.icon} size={16} /></span><b>{offen.titel}</b>
              <button type="button" className="x-btn" aria-label="Schließen" onClick={() => setOffen(null)}><Icon name="schliessen" size={16} /></button>
            </header>
            {offen.zeilen.length ? (
              <ol className="ga-vl">
                {offen.zeilen.map((z, i) => (
                  <li key={i}>
                    <i className={`ga-pt s-${TASK_TON[z.status] ?? "grau"}`} title={z.status} />
                    <span className="ga-vl-t">{z.titel}{z.ergebnis && <small>{z.ergebnis}</small>}</span>
                    <time className="ds-zahl">{zeit(z.at, now)}</time>
                  </li>
                ))}
              </ol>
            ) : <p className="ga-leer">{offen.leer}</p>}
            {offen.link && <a className="ga-link" href={offen.link[0]}><Icon name="gehirn" size={14} /> {offen.link[1]}</a>}
          </div>
        </div>
      )}
    </section>
  );
}
