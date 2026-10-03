import { CONFIG } from "@/lib/dashboard-data";
import { CARDS, fmtWhen, leadTotal, nextRun, status, versandStopText } from "@/lib/regler";
import { slotCounts } from "@/lib/owner-settings";
import { REG, loadRegler, reglerCtx } from "@/lib/regler-data";
import { entryOf, type Entry } from "@/lib/regler-verlauf";
import { requireOwner } from "../actions";
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
  const d = await loadRegler();
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
      next: fmtWhen(nextRun(c.cron, now), now),
      effect: effect[c.key] ?? null, // „nächster Lauf“ steht in der Statuszeile
    };
  });
  const history = d.log.map((r) => entryOf(r, ctx)).filter((x): x is Entry => !!x).map((e) => ({ ...e, when: fmtWhen(e.at, now) }));
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REGLER_CSS }} />
      <Regler ctx={ctx} saved={d.saved} seen={d.updatedAt} cards={cards} ready={d.ready} history={history} error={d.error} dispatch={d.dispatch} />
    </>
  );
}
