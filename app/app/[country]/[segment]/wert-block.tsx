import DATEN from "@/content/premium-wert.json";
import { beispielSatz, fuell, geld, rechnung, tag, wertLand, type WertDaten, type WertPlan } from "@/lib/premium-wert";

const D = DATEN as unknown as WertDaten;

/**
 * Block „Lohnt sich das?“ (Inhaber 04.10.2026, Wertrechnung): unsere Kosten je Lead gegen belegte Vergleichswerte mit
 * Quelle, darunter ein als „Rechenbeispiel, kein Versprechen“ gekennzeichnetes Beispiel. Nur Webagenturen US/UK/FR und
 * nur auf Varianten mit value_block = an (A/B-Schritt landing). Ohne beide Paketpreise erscheint nichts.
 */
export function WertBlock({ segment, country, lang, plans }: { segment: string; country: string; lang: string; plans: WertPlan[] | null | undefined }) {
  const land = wertLand(D, segment, country);
  if (!land) return null;
  const r = rechnung(D, land, plans);
  if (!r) return null;
  const wl: "en" | "fr" = lang === "fr" ? "fr" : "en";
  const t = D.texte[wl];
  const checked = fuell(t.geprueft, { date: tag(D.geprueft, wl) });
  const max = Math.max(...D.vergleich.map((v) => v.wert));
  const bars = D.vergleich.map((v) => ({ key: v.key, label: t[v.key], value: geld(v.wert, v.sym, wl), w: (v.wert / max) * 100, src: v }));
  // Balken: Starter-Preis je Lead (höchster unserer beiden Werte), mindestens sichtbar
  const starter = Number((plans ?? []).find((p) => p.key === "starter")?.amount_cents ?? 0) / 100 / ((D.pro_woche.starter ?? 1) * 52 / 12);
  const ourW = Math.max(1.5, (starter / max) * 100);
  return (
    <section className="sec wert" id="wert"><div className="wrap">
      <h2>{t.landing_titel}</h2>
      <p className="lede2">{t.landing_lede}</p>
      <div className="wgrid">
        <div className="wcard" data-rv>
          {bars.map((b) => (
            <div className="wrow" key={b.key}>
              <div className="wl"><span>{b.label}</span><b>{b.value}</b></div>
              <div className="wtrack"><i style={{ width: `${b.w.toFixed(1)}%` }} /></div>
              <div className="wsrc">{t.quelle} <a href={b.src.url} target="_blank" rel="noopener noreferrer">{b.src.quelle}</a> · {t.us_daten} · {checked}</div>
            </div>
          ))}
          <div className="wrow us">
            <div className="wl"><span>{t.wir}</span><b>{fuell(t.wir_wert, r.proLead)}</b></div>
            <div className="wtrack"><i style={{ width: `${ourW.toFixed(1)}%` }} /></div>
          </div>
        </div>
        <div className="wcard ex" data-rv>
          <span className="cap gold">{t.beispiel_titel}</span>
          <p className="wex">{beispielSatz(D, wl, r)}</p>
          {land.belegt.map((b) => (
            <p className="wsrc" key={b.url}>{b.text} {t.quelle} <a href={b.url} target="_blank" rel="noopener noreferrer">{b.quelle}</a> · {checked}</p>
          ))}
          <p className="wown">{t.eigene}</p>
        </div>
      </div>
    </div></section>
  );
}
