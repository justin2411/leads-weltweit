/**
 * B5 Werke-Karte (immer sichtbar): obere Bahn Leads (Lead-Werk → Prüfer/Stichprobe → Proben → Lieferung, Äste Radar und
 * Premium-Bewertung), untere Bahn Käufer (Kunden-Werk → Versand → Antworten → Lieferung → UMSATZ, die einzige goldene
 * Kachel), Rahmenlinie Wachhund mit Tick alle 15 min, Kontakt-Werk als Ast am Prüfer, Feedback-Werk hinter der Lieferung
 * (Lernschleife zurück zur Premium-Bewertung). Äste zeigen ihre Zahl im Chip (Radar neu 24 h, Premium bereit, Kontakt bestätigt).
 * Partikel = echter Durchsatz der letzten 60 min (lib/zentrale-logik partikel), Stau-Halo ab Faktor 50, abprallende
 * Punkte = blockierte Mails / zurückgehaltene Leads der letzten Stunde, Agent-Kürzel = laufender Auftrag nutzt das Werk.
 */
import Link from "next/link";
import type { KanteBild, WerkBild } from "@/lib/zentrale-modell";
import { begrenzePartikel, kantenDicke, partikel, rateKurz, zahl } from "@/lib/zentrale-logik";
import { Icon } from "@/app/icons";

type L = "breit" | "hoch";
const VIEW: Record<L, [number, number]> = { breit: [1000, 480], hoch: [360, 960] };
/** Mittelpunkte je Werk (Einheiten des viewBox). Gleiche Position = eine Kachel (Prüfer + Stichprobe). */
export const POS: Record<L, Record<string, [number, number]>> = {
  breit: {
    radar: [110, 38], lead: [110, 135], pruefer: [310, 135], stichprobe: [310, 135], premium: [600, 38], proben: [510, 135], feedback: [710, 135],
    kontakt: [410, 230], kunden: [110, 325], versand: [310, 325], antworten: [510, 325], lieferung: [710, 325], umsatz: [895, 325], wachhund: [110, 452],
  },
  hoch: {
    radar: [95, 34], lead: [95, 120], pruefer: [95, 290], stichprobe: [95, 290], premium: [95, 398], proben: [95, 490], feedback: [95, 660],
    kunden: [265, 120], versand: [265, 290], kontakt: [265, 398], antworten: [265, 490], lieferung: [265, 660], umsatz: [265, 820], wachhund: [180, 920],
  },
};
const CHIP = new Set(["radar", "premium", "kontakt", "wachhund"]);
const GRUPPE: Record<string, string[]> = { pruefer: ["pruefer", "stichprobe"] };
/** Kurze Namen auf den Kacheln (voller Name im Tooltip und im Seitenfenster). */
const KURZ: Record<string, string> = { lead: "Leads", pruefer: "Prüfer", proben: "Proben", kunden: "Käufer", lieferung: "Lieferung", premium: "Premium", feedback: "Feedback", kontakt: "Kontakt" };

function pfad(l: L, a: string, b: string): string {
  const [x1, y1] = POS[l][a], [x2, y2] = POS[l][b];
  if (y1 === y2 || x1 === x2) return `M${x1} ${y1} L${x2} ${y2}`;
  const my = (y1 + y2) / 2;
  return `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}

/** Durchsatz-Text frei von Kacheln und Chips: breit über der oberen bzw. unter der unteren Bahn (zwischen den Kacheln ist
 *  nur Platz für die Linie), Kurven in der Mitte; hoch rechts neben der senkrechten Kante, direkt unter der Quell-Kachel. */
function rateY(l: L, y1: number, y2: number): number {
  if (l === "hoch") return y1 + 67;
  if (y1 !== y2) return (y1 + y2) / 2 - 8;
  return y1 < 230 ? y1 - 76 : y1 + 84;
}

function MiniRing({ p }: { p: NonNullable<WerkBild["plaetze"]> }) {
  const C = 2 * Math.PI * 8, f = p.max ? Math.min(1, p.ist / p.max) : 0, s = p.max ? Math.min(1, p.soll / p.max) : 0;
  return (
    <svg className="jz-mr" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="8" className="a" />
      <circle cx="11" cy="11" r="8" className="b" transform="rotate(-90 11 11)" strokeDasharray={`${(f * C).toFixed(1)} ${C.toFixed(1)}`} />
      <circle cx="11" cy="11" r="10.5" className="c" transform="rotate(-90 11 11)" strokeDasharray={`${(s * 2 * Math.PI * 10.5).toFixed(1)} 99`} />
    </svg>
  );
}

function Karte({ l, werke, kanten, href, aktiv, hervor, bewegung, handy, abprall, wachTick }: {
  l: L; werke: Record<string, WerkBild>; kanten: KanteBild[]; href: (w: WerkBild) => string; aktiv: string | null; hervor: Set<string> | null;
  bewegung: boolean; handy: boolean; abprall: { versand: number; pruefer: number }; wachTick: boolean;
}) {
  const [W, H] = VIEW[l];
  const zeig = Object.keys(POS[l]).filter((id) => werke[id] && !(id === "stichprobe"));
  const parts = begrenzePartikel(kanten.map((k) => partikel(k.proStunde, handy)), handy);
  const ab = (n: number) => (n > 0 ? Math.min(3, Math.ceil(Math.log10(1 + n))) : 0);
  return (
    <div className={`jz-wk ${l}`}>
      <svg className="kanten" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {/* Rahmenlinie Wachhund */}
        <line x1={l === "breit" ? 30 : 16} x2={l === "breit" ? 970 : 344} y1={POS[l].wachhund[1]} y2={POS[l].wachhund[1]} className="k rahmen" />
        {wachTick && bewegung && <circle r="3" className="tick" cy={POS[l].wachhund[1]} cx={l === "breit" ? 30 : 16}><animate attributeName="cx" from={l === "breit" ? 30 : 16} to={l === "breit" ? 970 : 344} dur="15s" repeatCount="indefinite" /></circle>}
        {/* Äste und nicht gebaute Werke */}
        <path d={pfad(l, "radar", "lead")} className="k ast" />
        <path d={pfad(l, "premium", "proben")} className="k ast" />
        {/* Kontakt-Werk: prüft freigegebene Leads gegen Register + Firmenwebsite (Ast am Prüfer) */}
        <path d={pfad(l, "pruefer", "kontakt")} className={`k ast${werke.kontakt?.fehlt ? " grau" : ""}`} />
        {/* Feedback-Werk: Kunden bewerten gelieferte Leads → Premium-Reihenfolge lernt (Schleife nur breit, hoch läge sie über den Proben) */}
        <path d={pfad(l, "lieferung", "feedback")} className={`k ast${werke.feedback?.fehlt ? " grau" : ""}`} />
        {l === "breit" && werke.feedback && !werke.feedback.fehlt && <path d={pfad(l, "feedback", "premium")} className="k ast" />}
        {kanten.map((k, i) => {
          const d = pfad(l, k.von, k.an);
          const p = bewegung ? parts[i] : null;
          const [x1, y1] = POS[l][k.von], [x2, y2] = POS[l][k.an];
          return (
            <g key={k.id}>
              <path d={d} className={`k${k.proStunde > 0 ? "" : " leer"}`} style={!bewegung ? { strokeWidth: kantenDicke(k.proStunde) } : undefined}>
                <title>{`${k.was}: ${k.proStunde > 0 ? `${zahl(k.proStunde)} in der letzten Stunde` : "gerade kein Durchfluss"}`}</title>
              </path>
              {p && Array.from({ length: p.n }, (_, j) => (
                <circle key={j} r={handy ? 3 : 4} className="pt">
                  <animateMotion dur={`${p.dauer}s`} begin={`${-(j * p.dauer) / p.n}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
              <text x={l === "breit" ? (x1 + x2) / 2 : x1 + 8} y={rateY(l, y1, y2)} className={`rate${l === "hoch" ? " seite" : ""}`}>{rateKurz(k.proStunde)}</text>
            </g>
          );
        })}
        {/* Abprallen an einer Leitplanke: blockierte Mails (Versand) und zurückgehaltene Leads (Prüfer), letzte Stunde */}
        {bewegung && ([["versand", abprall.versand], ["pruefer", abprall.pruefer]] as [string, number][]).flatMap(([id, n]) => Array.from({ length: ab(n) }, (_, j) => {
          const [x, y] = POS[l][id];
          return (
            <circle key={`${id}${j}`} r="3" className="ab" cx={x + 20 + j * 10} cy={y + 30}>
              <animate attributeName="cy" from={y + 30} to={y + 70} dur="1.8s" begin={`${j * 0.5}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" from="1" to="0" dur="1.8s" begin={`${j * 0.5}s`} repeatCount="indefinite" />
              <title>{id === "versand" ? `${n} Mails in der letzten Stunde blockiert` : `${n} Leads in der letzten Stunde zurückgehalten`}</title>
            </circle>
          );
        }))}
      </svg>
      {zeig.map((id) => {
        const w = werke[id];
        const grp = (GRUPPE[id] ?? [id]).map((x) => werke[x]).filter(Boolean);
        const [x, y] = POS[l][id];
        const chip = CHIP.has(id);
        const stau = kanten.some((k) => k.an === id && k.stau);
        const nutzt = grp.flatMap((g) => g.agenten);
        const dim = hervor && !grp.some((g) => hervor.has(g.id));
        const name = KURZ[id] ?? w.name;
        return (
          <Link key={id} href={href(w)} scroll={false}
            className={`jz-w${chip ? " chip" : ""}${w.gold ? " gold" : ""}${w.fehlt ? " grau" : ""}${stau ? " stau" : ""}${nutzt.length ? " nutzt" : ""}${dim ? " dim" : ""}${aktiv && grp.some((g) => g.station === aktiv || g.id === aktiv) ? " on" : ""}`}
            style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
            title={grp.map((g) => g.tip).join(" | ")} aria-label={`${name}: ${w.zahl} ${w.unter}`}>
            <span className="kz">
              {grp.map((g) => <i key={g.id} className={`jz-pp ${g.puls === "live~" ? "live-" : g.puls}`} aria-hidden />)}
              {grp.some((g) => g.puls === "live~") && <span className="tl" title="Puls aus Ersatzquelle">~</span>}
              <span>{chip && w.id === "premium" ? <><Icon name="premium" size={12} /> {name}</> : name}</span>
              {chip && id !== "wachhund" && w.zahl && <b className="cz" title={`${w.zahl} ${w.unter}`}>{w.zahl}</b>}
              {w.plaetze && <MiniRing p={w.plaetze} />}
            </span>
            {w.fehlt ? <em>noch nicht gebaut · {w.auftrag}</em> : !chip && (<>
              <b className="z">{w.zahl}</b>
              <em>{stau ? <span className="stauw">Stau · </span> : null}{w.unter}{grp[1] ? ` · ${grp[1].zahl}` : ""}</em>
            </>)}
            {nutzt.length > 0 && <span className="ags2" aria-label="laufende Aufträge">{[...new Set(nutzt)].map((a) => <i key={a}>A{a}</i>)}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function WerkeKarte(p: {
  werke: Record<string, WerkBild>; kanten: KanteBild[]; href: (w: WerkBild) => string; aktiv: string | null; hervor: Set<string> | null;
  bewegung: boolean; handy: boolean; abprall: { versand: number; pruefer: number }; wachTick: boolean;
  plaetze: { laufend: number; geplant: number; gesamt: number; diffs: { werk: string; linie: string; von: number; nach: number; grund: string | null }[] }; wander: boolean;
}) {
  const { plaetze: pl } = p;
  const tip = pl.diffs.length ? `Autopilot: ${pl.diffs.map((d) => `${d.linie} ${d.von}→${d.nach}${d.grund ? ` (${d.grund})` : ""}`).join(", ")}` : "keine Umverteilung seit dem letzten Lauf";
  return (
    <section className="p jz-werke" id="werke" aria-label="Werke">
      <h2><Icon name="werk" size={16} />Werke
        <span className="r jz-plaetze" title={tip}>
          <span className={`jz-kl${p.wander ? " wander" : ""}`} aria-hidden>
            {Array.from({ length: pl.gesamt }, (_, i) => <i key={i} className={i < pl.laufend ? "l" : i < pl.geplant ? "p" : ""} />)}
          </span>
          <b className="z">{pl.laufend}/{pl.gesamt}</b> Plätze
        </span>
      </h2>
      <Karte l="breit" {...p} />
      <Karte l="hoch" {...p} />
    </section>
  );
}
