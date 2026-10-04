/**
 * JARVIS „Team“ (Inhaber 04.10.2026: „Welche agenten machen sinn bei gehirn testing und bei leadqualität. Bau die bitte
 * direkt in jarvis alle rein, damit ich es dort sehen kann“). Je Fach-Agent eine Karte: Rolle (1 Zeile), Ziel-Kennzahl
 * mit Ampel und 7-Tage-Trend, letzter Auftrag + Ergebnis, nächster Termin, Wirkung, Knopf „Jetzt beauftragen“.
 * Token-freie Prüfer (Lead-/Käufer-Prüfer) zeigen statt Auftrag die Tageswerte und „ohne Tokens“.
 * Reine Darstellung, Daten aus lib/fach-agenten.ts. Karten je Reihe gleich hoch (Grid stretch), Knopf unten bündig.
 */
import { AMPEL_TEXT } from "@/lib/ampel";
import { GRUPPEN, fmtWert, kurz, type Karte } from "@/lib/fach-agenten";
import { arrow } from "@/lib/trend";
import { sparkPath } from "@/lib/spark";
import { assignRole } from "../control-actions";
import { Icon } from "@/app/icons";

const STATUS: Record<string, string> = { offen: "startet bald", laeuft: "arbeitet", fertig: "fertig", fehler: "Fehler", abgebrochen: "zurückgezogen" };
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "–");
const W = 64, H = 18;

function Spark({ k }: { k: NonNullable<Karte["kz"]> }) {
  const p = sparkPath(k.points, W, H, 2);
  const a = arrow(k.trend);
  if (!p.d && !a) return null;
  return (
    <span className="tm-tr" title={`${k.label}: 7 ${k.label.startsWith("Engpass") ? "Wochen" : "Tage"}${a ? `, ${a} zur Vorwoche` : ""}`}>
      {p.d && <svg viewBox={`0 0 ${W} ${H}`} className="tm-sp" aria-hidden><path d={p.d} />{p.last && <circle cx={p.last[0]} cy={p.last[1]} r={2} />}</svg>}
      {a && <em className={k.gut === null ? "" : k.gut ? "up" : "down"}>{a}</em>}
    </span>
  );
}

function Card({ c }: { c: Karte }) {
  const k = c.kz;
  const py = c.r.typ === "python";
  return (
    <article className={`tm-c t-${k?.ampel ?? "grey"}`} aria-label={c.r.name}>
      <header>
        <b>{c.r.name}</b>
        <span className={`tm-tag ${py ? "py" : ""}`}>{py ? "ohne Tokens" : c.r.takt}</span>
      </header>
      <p className="tm-rolle">{c.r.rolle}</p>
      <div className="tm-kz">
        <span className="tm-v">{k ? k.text : "–"}</span>
        <span className="tm-l">{k ? k.label : c.r.kennzahl}<small>{k ? (k.ampel === "grey" ? "keine Basis" : AMPEL_TEXT[k.ampel]) : "noch keine Daten"}</small></span>
        {k && <Spark k={k} />}
      </div>
      {py ? (
        <dl className="tm-grid">
          <div><dt>heute</dt><dd>{c.pruefer ? c.pruefer.geprueft.toLocaleString("de-DE") : "–"}</dd></div>
          <div><dt>bestanden</dt><dd>{c.pruefer?.bestanden != null ? fmtWert(c.pruefer.bestanden, "quote") : "–"}</dd></div>
          <div><dt>gehalten</dt><dd>{c.pruefer ? c.pruefer.gehalten.toLocaleString("de-DE") : "–"}</dd></div>
          <div><dt>Ø Score</dt><dd>{c.pruefer?.score != null ? fmtWert(c.pruefer.score, "zahl") : "–"}</dd></div>
          <div><dt>mehrfach</dt><dd>{c.pruefer?.mehrfach != null ? fmtWert(c.pruefer.mehrfach, "quote") : "–"}</dd></div>
          <div><dt>Takt</dt><dd>{c.naechster}</dd></div>
        </dl>
      ) : (
        <dl className="tm-rows">
          <div><dt>Letzter Auftrag</dt><dd>{c.letzter ? <>{STATUS[c.letzter.status] ?? c.letzter.status} · {when(c.letzter.finished_at ?? c.letzter.created_at)}</> : "noch keiner"}</dd></div>
          {c.letzter?.result && <div className="tm-res"><dd title={c.letzter.result}>{kurz(c.letzter.result)}</dd></div>}
          <div><dt>Nächster Termin</dt><dd>{c.naechster}</dd></div>
          <div><dt>Wirkung</dt><dd className={c.wirkung === "wirkt" ? "ok" : c.wirkung === "sinkt" ? "bad" : ""}>{c.wirkung ?? "noch nicht gemessen"}</dd></div>
        </dl>
      )}
      <form action={assignRole} className="tm-go">
        <input type="hidden" name="back" value="/dashboard/jarvis" />
        <input type="hidden" name="rolle" value={c.r.slug} />
        <button disabled={c.offen} title={c.offen ? "Auftrag läuft schon" : c.r.auftrag}>
          <Icon name={c.offen ? "warten" : "an-agent"} size={16} /> {c.offen ? "läuft" : py ? "Lauf prüfen" : "Jetzt beauftragen"}
        </button>
      </form>
    </article>
  );
}

export function Team({ cards }: { cards: Karte[] }) {
  if (!cards.length) return null;
  return (
    <section className="tm" id="team" aria-label="Team">
      <h2 className="tm-h"><Icon name="agent" size={18} /> Team</h2>
      {GRUPPEN.map((g) => {
        const cs = cards.filter((c) => c.r.gruppe === g.key);
        if (!cs.length) return null;
        return (
          <div key={g.key} className="tm-g">
            <h3>{g.titel}</h3>
            <div className="tm-row">{cs.map((c) => <Card key={c.r.slug} c={c} />)}</div>
          </div>
        );
      })}
      <p className="tm-lock"><Icon name="schloss" size={14} /> LLM nur für Auswertung, Massenprüfung token-frei. Nie Versand, Kosten, Prüfregeln.</p>
    </section>
  );
}

export const TEAM_CSS = `
.jv .tm{margin:16px 0;padding:16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55))}
.jv .tm-h{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:var(--fs-m);color:#fff}
.jv .tm-g{margin:8px 0 0}
.jv .tm-g h3{margin:0 0 8px;font-size:var(--fs-s);font-weight:600;color:var(--soft);text-transform:none}
.jv .tm-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;align-items:stretch}
.jv .tm-c{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(2,8,20,.55);box-shadow:inset 3px 0 0 var(--ac)}
.jv .tm-c header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0;padding:0;border:0;background:none}
.jv .tm-c header b{color:#fff;font-size:var(--fs-m);font-weight:700}
.jv .tm-tag{font-size:var(--fs-xs);line-height:18px;padding:1px 8px;border-radius:9px;border:1px solid var(--line);color:var(--soft);white-space:nowrap}
.jv .tm-tag.py{border-color:var(--amp-green);color:var(--amp-green)}
.jv .tm-rolle{margin:0;color:var(--soft);font-size:var(--fs-s);line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.jv .tm-kz{display:flex;align-items:center;gap:10px;min-height:44px}
.jv .tm-v{font-size:22px;font-weight:700;color:var(--ac);font-variant-numeric:tabular-nums;white-space:nowrap}
.jv .tm-l{display:flex;flex-direction:column;flex:1;font-size:var(--fs-s);color:var(--text);line-height:1.25;min-width:0}
.jv .tm-l small{font-size:var(--fs-xs);color:var(--ac)}
.jv .tm-tr{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none}
.jv .tm-sp{width:${W}px;height:${H}px;overflow:visible}
.jv .tm-sp path{fill:none;stroke:var(--ac);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.jv .tm-sp circle{fill:var(--ac)}
.jv .tm-tr em{font-style:normal;font-size:var(--fs-xs);color:var(--amp-grey);white-space:nowrap}
.jv .tm-tr em.up{color:var(--amp-green)}.jv .tm-tr em.down{color:var(--amp-red)}
.jv .tm-rows,.jv .tm-grid{margin:0;display:grid;gap:4px}
.jv .tm-rows>div{display:flex;justify-content:space-between;gap:8px;font-size:var(--fs-s);line-height:1.35}
.jv .tm-rows dt{color:var(--soft);white-space:nowrap}
.jv .tm-rows dd{margin:0;color:var(--text);text-align:right;min-width:0}
.jv .tm-rows .tm-res dd{text-align:left;color:var(--soft);font-size:var(--fs-xs)}
.jv .tm-rows dd.ok{color:var(--amp-green)}.jv .tm-rows dd.bad{color:var(--amp-red)}
.jv .tm-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.jv .tm-grid>div{padding:4px 6px;border-radius:8px;background:rgba(139,166,201,.08)}
.jv .tm-grid dt{font-size:var(--fs-xs);color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jv .tm-grid dd{margin:0;font-size:var(--fs-s);font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jv .tm-go{margin:auto 0 0;padding:0}
.jv .tm-go button{width:100%;min-height:40px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:10px;border:1px solid var(--ac);background:var(--ab);color:#fff;font-size:var(--fs-s);font-weight:600;cursor:pointer}
.jv .tm-go button:disabled{opacity:.55;cursor:default}
.jv .tm-lock{display:flex;align-items:center;gap:6px;margin:12px 0 0;color:var(--soft);font-size:var(--fs-xs)}
.jv .tm .t-green{--ac:var(--amp-green);--ab:var(--amp-green-bg)}
.jv .tm .t-gold{--ac:var(--amp-gold);--ab:var(--amp-gold-bg)}
.jv .tm .t-red{--ac:var(--amp-red);--ab:var(--amp-red-bg)}
.jv .tm .t-grey{--ac:var(--amp-grey);--ab:var(--amp-grey-bg)}
@media (max-width:720px){
  .jv .tm{padding:12px}
  .jv .tm-row{grid-template-columns:1fr;gap:8px}
  .jv .tm-v{font-size:20px}
}
`;
