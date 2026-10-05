import { db } from "@/lib/supabase";
import { bySignal, signalLabel, type StatRow } from "@/lib/feedback";
import { Icon } from "@/app/icons";

/**
 * Büro Qualität: Kunden-Feedback (Feedback-Werk, Inhaber 05.10.2026). Je Anlass: Bewertungen, Anteil gut, gewonnene
 * Aufträge und das Gewicht, mit dem die Premium-Reihenfolge den Anlass umgewichtet (nur Reihenfolge, nie Freigabe).
 */
export const FEEDBACK_CSS = `
.jfb-what{margin:0;font-size:var(--fs-s);line-height:1.45;color:#b6cbe6}
.jfb-t{width:100%;border-collapse:collapse;font-size:var(--fs-s)}
.jfb-t th,.jfb-t td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.jfb-t th:first-child,.jfb-t td:first-child{text-align:left;white-space:normal}
.jfb-t th{font-weight:600;color:#b6cbe6}
.jfb-t td{font-variant-numeric:tabular-nums}
.jfb-up{color:#5bd49a}.jfb-dn{color:#ff8a8a}
`;

export async function loadFeedback(): Promise<StatRow[] | null> {
  const { data, error } = await db().from("lead_feedback_stats")
    .select("signal_type, country, bewertungen, gut, schlecht, gewonnen, gut_pct").limit(2000);
  if (error) return null;
  return (data ?? []) as StatRow[];
}

export function FeedbackPanel({ rows }: { rows: StatRow[] }) {
  const s = bySignal(rows);
  const total = s.reduce((a, r) => a + r.bewertungen, 0);
  const won = s.reduce((a, r) => a + r.gewonnen, 0);
  return (
    <section className="jcard" aria-label="Kunden-Feedback">
      <header className="jcard-h">
        <h2><Icon name="stern" size={18} /> Kunden-Feedback</h2>
        <span className="jfb-what">{total} Bewertungen · {won} gewonnen</span>
      </header>
      <p className="jfb-what">Kunden bewerten Leads per Link in Lieferung und Probe. Ab 5 Bewertungen gewichtet das die Premium-Reihenfolge je Anlass.</p>
      {s.length ? (
        <table className="jfb-t">
          <thead><tr><th>Anlass</th><th>Länder</th><th>Bew.</th><th>gut</th><th>gewonnen</th><th>Gewicht</th></tr></thead>
          <tbody>
            {s.slice(0, 12).map((r) => (
              <tr key={r.signal_type}>
                <td>{signalLabel(r.signal_type, "de")}</td>
                <td>{r.laender.join(" ")}</td>
                <td>{r.bewertungen}</td>
                <td>{r.gut_pct == null ? "–" : `${r.gut_pct.toLocaleString("de-DE")} %`}</td>
                <td>{r.gewonnen}</td>
                <td className={r.weight > 1 ? "jfb-up" : r.weight < 1 ? "jfb-dn" : undefined}>×{r.weight.toLocaleString("de-DE")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="jfb-what">Noch keine Bewertungen.</p>}
    </section>
  );
}
