import { CONFIG } from "@/lib/dashboard-data";
import { CARDS, cardNext, fmtWhen, leadTotal, status, versandStopText } from "@/lib/regler";
import { slotCounts } from "@/lib/owner-settings";
import { REG, loadRegler, reglerCtx } from "@/lib/regler-data";
import { entryOf, type Entry } from "@/lib/regler-verlauf";
import { requireOwner } from "../actions";
import { setPaused, toggleAutopilot } from "../control-actions";
import { updateSetting } from "../brain-actions";
import { loadSchnell } from "@/lib/zentrale-data";
import Link from "next/link";
import { Icon } from "@/app/icons";
import { REGLER_CSS } from "./css";
import { Regler, type CardView } from "./regler";

export const metadata = { title: "Regler" };

/**
 * Regler (Inhaber 03.10.2026: „einfache anpassungen direkt einstellen … immer mit einem button, dass die änderungen
 * auch übernommen werden“). Eine Seite für alle Werke: Schalter und Knöpfe, „Übernehmen“ unten, und je Werk der Weg
 * ① eingestellt → ② übernommen → ③ angewandt (Quittung des Werks aus settings_ack). Zeiten in deutscher Zeit.
 */
export default async function Page() {
  await requireOwner();
  const [d, zs] = await Promise.all([loadRegler(), loadSchnell()]);
  const now = new Date(d.now);
  const ctx = reglerCtx(d.pages);
  const plan = slotCounts(REG, d.saved.slot_plan);
  const soll = (k: string) => d.saved.sample_targets[k] ?? (CONFIG.fokus.includes(k) ? CONFIG.proben.fokus_je_seite : CONFIG.proben.andere_je_seite);
  // gemessen: jede Live-Seite hat ihr Soll (zählt im Status nur nach einem Lauf seit dem Speichern)
  const reached = d.pages.length > 0 && d.pages.every((k) => (d.ready[k] ?? 0) >= soll(k));
  const effect: Record<string, { text: string; tone?: "bad" | "off" } | null> = {
    "lead-werk": { text: `läuft ${d.running["lead-werk"] ?? 0} · geplant ${leadTotal(plan, REG)}` },
    "kunden-werk": { text: `läuft ${d.running["kunden-werk"] ?? 0} · geplant ${plan.kunden ?? 0}` },
    "proben-vorrat": { text: `Vorrat ${d.pages.reduce((a, k) => a + (d.ready[k] ?? 0), 0)}/${d.pages.reduce((a, k) => a + soll(k), 0)}` },
    versand: versandStopText(CONFIG) ? { text: versandStopText(CONFIG)!, tone: "bad" }
      : d.saved.send_paused ? { text: `pausiert · ${d.versand?.today ?? 0} heute`, tone: "off" }
      : d.versand ? { text: `läuft · ${d.versand.today} heute / ${d.versand.cap}` } : null,
  };
  const cards: CardView[] = CARDS.map((c) => {
    const st = status(c.key, { updatedAt: d.updatedAt, acks: d.acks, startRequests: d.starts, now, saved: d.saved, reg: REG, reached: c.key === "proben-vorrat" && reached });
    return {
      key: c.key, kind: st.kind, text: st.text,
      saved: st.savedAt ? fmtWhen(st.savedAt, now) : null,
      at: st.at ? fmtWhen(st.at, now) : null,
      next: fmtWhen(cardNext(c, now), now),
      effect: effect[c.key] ?? null, // „nächster Lauf“ steht in der Statuszeile
    };
  });
  const history = d.log.map((r) => entryOf(r, ctx)).filter((x): x is Entry => !!x).map((e) => ({ ...e, when: fmtWhen(e.at, now) }));
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REGLER_CSS }} />
      <Schaltstelle paused={!!d.saved.send_paused} brain={zs ? zs.brain_enabled !== false : null} autopilot={d.saved.slot_autopilot?.on !== false} />
      <Regler ctx={ctx} saved={d.saved} seen={d.updatedAt} cards={cards} ready={d.ready} history={history} error={d.error} dispatch={d.dispatch} />
    </>
  );
}

/**
 * Oben (JARVIS-Zentrale 05.10.2026): Not-Aus Versand (Pause wirkt sofort; Wiederanlauf nur über die Karte „Versand“ mit
 * „Übernehmen“) und Gehirn (an/aus, Autopilot der Plätze). Prüfregeln, Freigabe, Notbremse, Sperrliste: nie schaltbar.
 */
function Schaltstelle({ paused, brain, autopilot }: { paused: boolean; brain: boolean | null; autopilot: boolean }) {
  return (
    <div className="rg-top">
      <section id="notaus" className="rg-card" aria-label="Not-Aus Versand">
        <div className="rg-h"><span className="rg-ic" aria-hidden><Icon name="stopp" size={22} /></span><div style={{ minWidth: 0 }}><h2>Not-Aus Versand</h2>
          <span className={`rg-eff${paused ? " off" : ""}`}>{paused ? "Pause · Wiederanlauf unten in „Versand“ mit Übernehmen" : "an · 24/7"}</span></div></div>
        {!paused && <form action={setPaused}><input type="hidden" name="back" value="/dashboard/regler#notaus" /><input type="hidden" name="paused" value="1" />
          <button className="rg-stop" title="wirkt sofort"><Icon name="pause" size={16} /> Versand pausieren</button></form>}
      </section>
      <section id="gehirn" className="rg-card" aria-label="Gehirn">
        <div className="rg-h"><Link href="/dashboard/gehirn" className="rg-ic rg-hl" aria-label="Gehirn öffnen" title="Gehirn öffnen"><Icon name="gehirn" size={22} /></Link><div style={{ minWidth: 0 }}><h2><Link href="/dashboard/gehirn" className="rg-hl" title="Gehirn öffnen">Gehirn</Link></h2>
          <span className="rg-eff">{brain === null ? "nicht lesbar" : brain ? "an" : "aus"} · Autopilot {autopilot ? "an" : "aus"}</span></div></div>
        <div className="rg-row2">
          {brain !== null && <form action={updateSetting}><input type="hidden" name="key" value="brain_enabled" /><input type="hidden" name="value" value={brain ? "false" : "true"} />
            <button className="rg-tog" aria-pressed={brain}>{brain ? "Gehirn ausschalten" : "Gehirn einschalten"}</button></form>}
          <form action={toggleAutopilot}><input type="hidden" name="back" value="/dashboard/regler#gehirn" /><input type="hidden" name="on" value={autopilot ? "0" : "1"} />
            <button className="rg-tog" aria-pressed={autopilot}>{autopilot ? "Autopilot aus" : "Autopilot an"}</button></form>
        </div>
      </section>
    </div>
  );
}
