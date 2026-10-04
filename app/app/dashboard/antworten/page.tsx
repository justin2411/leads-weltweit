import Link from "next/link";
import { loadReplies } from "@/lib/antworten-data";
import { STATUSES, STATUS_LABEL, intentMeta, isOverdue, isStatus } from "@/lib/antworten";
import { COUNTRY_COLOR } from "@/lib/dashboard-logic";
import { Icon } from "@/app/icons";
import { requireOwner } from "../actions";
import { Age } from "./age";
import { ANTWORTEN_CSS } from "./css";
import { PushAlarm } from "./push-alarm";
import { PageHead } from "../v2";

/**
 * Antworten-Cockpit (Nachtschicht 03./04.10.2026): jede menschliche Antwort auf unsere Mails an einem Ort. Offene
 * zuerst, Kaufinteresse > Frage > Unklar > Probe, dann wartet am längsten. Rot: Kaufinteresse/Frage wartet > 15 min.
 */
export default async function Antworten({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const sp = await searchParams;
  const raw = Array.isArray(sp.s) ? sp.s[0] : sp.s;
  const status = isStatus(raw) ? raw : "offen";
  const { rows, counts, error } = await loadReplies(status).catch((e) => ({
    rows: [], counts: { offen: 0, spaeter: 0, erledigt: 0 }, error: String((e as Error)?.message ?? e),
  }));
  const now = new Date();
  const hot = rows.filter((r) => isOverdue(r, now)).length;

  return (
    <div className="v2 aw">
      <style dangerouslySetInnerHTML={{ __html: ANTWORTEN_CSS }} />
      <PageHead title="Antworten" icon="antworten">
        {hot > 0 && status === "offen" && <span className="aw-age late"><Icon name="warnung" size={14} /> {hot} warten</span>}
      </PageHead>
      <PushAlarm />
      {error && <div className="aw-err" role="alert"><Icon name="fehler" size={16} /> Antworten nicht lesbar: {error.slice(0, 160)}</div>}

      <nav className="aw-tabs" aria-label="Status">
        {STATUSES.map((s) => (
          <Link key={s} href={s === "offen" ? "/dashboard/antworten" : `/dashboard/antworten?s=${s}`}
                className={`${s === status ? "on" : ""}${s === "offen" && counts.offen > 0 ? " hot" : ""}`} aria-current={s === status ? "page" : undefined}>
            <b>{counts[s]}</b>{STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      <div className="aw-list">
        {rows.map((r) => {
          const m = intentMeta(r.intent);
          const late = isOverdue(r, now);
          const company = r.prospects?.company_name ?? r.from_email ?? "unbekannt";
          const cc = r.prospects?.country ?? null;
          return (
            <Link key={r.id} href={`/dashboard/antworten/${r.id}`} className={`aw-row${late ? " late" : ""}`}>
              <span className={`aw-ic ${m.tone}`} title={m.label}><Icon name={m.icon} size={20} title={m.label} /></span>
              <span className="aw-mid">
                <span className="aw-co">{company}</span>
                <span className="aw-sum">{r.summary_de || r.subject || "–"}</span>
              </span>
              <span className="aw-meta">
                <Age received={r.received_at} processed={r.processed_at} urgent={m.urgent} open={r.status === "offen"} />
                <span className="aw-cc">{cc && <i style={{ background: COUNTRY_COLOR[cc] ?? "#c3bcae" }} />}{cc ?? "?"}</span>
              </span>
            </Link>
          );
        })}
        {!error && rows.length === 0 && (
          <div className="aw-empty"><Icon name="ok-kreis" size={28} />{status === "offen" ? "Alles beantwortet" : "Keine"}</div>
        )}
      </div>
    </div>
  );
}
