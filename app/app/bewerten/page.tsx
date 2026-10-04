import type { Metadata } from "next";
import { BRAND, CONTACT } from "@/lib/site";
import { db } from "@/lib/supabase";
import { signalLabel, TEXT, validToken } from "@/lib/feedback";
import { BrandShell, SiteFooter, SiteHeader } from "../chrome";
import { rateLead } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Rate your leads | ${BRAND}`, robots: { index: false, follow: false } };

// Kästen einer Zeile schließen bündig ab (Grid stretch), Knöpfe gleich hoch
const CSS = `.bx .fb{padding:56px 0 88px}
.bx .fb .card{max-width:1080px;border:1px solid var(--line);border-radius:22px;background:var(--card);padding:30px 32px 32px}
.bx .fb h1{margin:0;font-size:clamp(24px,2.6vw,30px);letter-spacing:-.02em;line-height:1.2}
.bx .fb .sub{margin:8px 0 0;color:var(--soft);font-size:15.5px}
.bx .fb .ok{border-radius:12px;background:rgba(91,212,154,.12);color:#2f6b45;padding:12px 16px;font-weight:600;font-size:14.5px;margin-top:18px}
.bx .fb ul{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:10px}
.bx .fb li{display:grid;grid-template-columns:1fr auto;align-items:stretch;gap:14px;border:1px solid var(--line);border-radius:14px;padding:14px 16px;scroll-margin-top:90px}
.bx .fb li b{display:block;font-size:15.5px}.bx .fb li span{display:block;color:var(--soft);font-size:13.5px;margin-top:2px}
.bx .fb .acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.bx .fb .acts form{margin:0;display:flex}
.bx .fb .acts button{font:inherit;font-size:14px;font-weight:600;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer}
.bx .fb .acts button.on{border-color:rgba(176,141,87,.8);background:rgba(216,189,138,.16)}
.bx .fb .note{margin-top:22px;color:var(--soft);font-size:14.5px}
@media (max-width:760px){.bx .fb .card{padding:24px 18px}.bx .fb li{grid-template-columns:1fr}.bx .fb .acts{justify-content:flex-start}}`;

type Row = { id: string; name: string; signal: string | null; summary: string; rating: string | null; won: boolean };

async function load(token: string): Promise<{ lang: "en" | "fr"; rows: Row[] } | null> {
  const { data: link } = await db().from("lead_feedback_links").select("id, lead_ids, country").eq("token", token).maybeSingle();
  if (!link) return null;
  const ids = (link.lead_ids as string[]).slice(0, 500);
  const [{ data: leads }, { data: fb }] = await Promise.all([
    db().from("leads").select("id, company_id, signal_type, event_summary").in("id", ids),
    db().from("lead_feedback").select("lead_id, rating, won").eq("link_id", link.id),
  ]);
  const coIds = [...new Set((leads ?? []).map((l: any) => l.company_id).filter(Boolean))];
  const { data: cos } = coIds.length ? await db().from("watch_companies").select("id, name").in("id", coIds) : { data: [] };
  const name = new Map((cos ?? []).map((c: any) => [c.id, c.name]));
  const mine = new Map((fb ?? []).map((f: any) => [f.lead_id, f]));
  const byId = new Map((leads ?? []).map((l: any) => [l.id, l]));
  const rows = ids.map((id) => byId.get(id)).filter(Boolean).map((l: any) => ({
    id: l.id, name: name.get(l.company_id) ?? "–", signal: l.signal_type, summary: String(l.event_summary ?? "").slice(0, 160),
    rating: mine.get(l.id)?.rating ?? null, won: !!mine.get(l.id)?.won,
  }));
  return { lang: link.country === "FR" ? "fr" : "en", rows };
}

function Btn({ t, lead, c, on, label }: { t: string; lead: string; c: string; on: boolean; label: string }) {
  return (
    <form action={rateLead}>
      <input type="hidden" name="t" value={t} /><input type="hidden" name="lead" value={lead} /><input type="hidden" name="c" value={c} />
      <button type="submit" className={on ? "on" : undefined} aria-pressed={on}>{label}</button>
    </form>
  );
}

export default async function RatePage({ searchParams }: { searchParams: Promise<{ t?: string; ok?: string }> }) {
  const sp = await searchParams;
  const data = validToken(sp.t) ? await load(sp.t).catch(() => null) : null;
  const T = TEXT[data?.lang ?? "en"];
  return (
    <BrandShell lang={data?.lang ?? "en"} extraCss={CSS}>
      <SiteHeader />
      <main className="fb"><div className="wrap"><section className="card">
        {!data ? (<><h1>{T.expired}</h1><p className="sub">{T.expiredSub}</p></>) : (<>
          <h1>{T.title}</h1>
          <p className="sub">{T.sub}</p>
          {sp.ok && <div className="ok">{T.saved}</div>}
          <ul>
            {data.rows.map((r) => (
              <li key={r.id} id={`l-${r.id}`}>
                <div><b>{r.name}</b><span>{signalLabel(r.signal, data.lang)}{r.summary ? ` · ${r.summary}` : ""}</span></div>
                <div className="acts">
                  <Btn t={sp.t!} lead={r.id} c="gut" on={r.rating === "gut"} label={T.good} />
                  <Btn t={sp.t!} lead={r.id} c="schlecht" on={r.rating === "schlecht"} label={T.bad} />
                  <Btn t={sp.t!} lead={r.id} c={r.won ? "unwon" : "won"} on={r.won} label={r.won ? T.unwon : T.won} />
                </div>
              </li>
            ))}
          </ul>
        </>)}
        <p className="note">Questions? <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      </section></div></main>
      <SiteFooter lang={data?.lang ?? "en"} />
    </BrandShell>
  );
}
