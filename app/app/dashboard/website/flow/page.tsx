import { requireOwner } from "../../actions";
import { Crumbs } from "../../v2";
import { Icon } from "@/app/icons";
import { db } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";
import { BRANCHES, branchOf, catalog, defaultFlow, savedFlow, type LivePage } from "@/lib/website-flow";
import { FlowBoard, type Counts } from "./board";
import { WF_CSS } from "./css";

export const metadata = { title: "Seiten-Flow" };
type SP = Promise<Record<string, string | string[] | undefined>>;

const OWN = "https://www.nextgen-profit.de";
const DAYS = 30;

/** Abfrage mit Zeitgrenze: langsame Datenbank → leere Antwort statt hängender Seite. */
function timed<T>(p: PromiseLike<T>, fallback: T, ms = 4000): Promise<T> {
  return Promise.race([Promise.resolve(p).catch(() => fallback), new Promise<T>((ok) => setTimeout(() => ok(fallback), ms))]);
}

/**
 * Seiten-Flow (Inhaber 04.10.2026: „flows … branche auswählen … jetzt erstmal nur webagencys … wie bei jarvis am anfang
 * nur mit vierecken weil es seiten sind … einfügen und ersetzen … verschieben und vertauschen (nur für meine anzeige)“).
 * Standardfluss aus den Live-Landingpages der Branche; die eigene Anordnung liegt in owner_settings.website_flow.
 * Zahlen: eindeutige Besucher je Tag (summiert) für Landingpage und Tarif, gestartete Checkouts und Käufe der letzten
 * 30 Tage (web_daily uv/pe, nur Zählungen, ohne Cookies).
 */
export default async function WebsiteFlowPage({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const segment = branchOf(typeof sp.b === "string" ? sp.b : null);
  const since = new Date(Date.now() - (DAYS - 1) * 86_400_000).toISOString().slice(0, 10);

  const [pagesRes, settingRes, dailyRes] = await Promise.all([
    timed(db().from("landing_pages").select("slug, segment_id, country").eq("status", "live").order("slug"), { data: null, error: { message: "Zeit" } } as any),
    timed(db().from("owner_settings").select("value, updated_at").eq("key", "website_flow").maybeSingle(), { data: null, error: { message: "Zeit" } } as any),
    timed(db().from("web_daily").select("slug, dim, key, n").gte("day", since).in("dim", ["uv", "pe"]).limit(5000), { data: null, error: null } as any),
  ]);
  const pages: LivePage[] = ((pagesRes?.data ?? []) as { slug: string; segment_id: string; country: string }[])
    .map((p) => ({ slug: p.slug, segment: p.segment_id, country: String(p.country ?? "").toUpperCase() }));
  const segOf = new Map(pages.map((p) => [p.slug, p.segment]));

  // Zahlen je Seite (nur wenn lesbar; sonst ohne Zahlen)
  const counts: Counts = {};
  const add = (id: string, n: number, label: string) => { counts[id] = { n: (counts[id]?.n ?? 0) + n, label }; };
  for (const r of (dailyRes?.data ?? []) as { slug: string; dim: string; key: string; n: number }[]) {
    if (r.dim === "uv" && r.key === "landing") add(`lp:${r.slug}`, r.n, "Besucher");
    else if (r.dim === "uv" && r.key === "tarif") add(`tarif:${r.slug}`, r.n, "Besucher");
    else if (segOf.get(r.slug) === segment && r.key === "checkout_started") add("checkout", r.n, "gestartet");
    else if (segOf.get(r.slug) === segment && r.key === "purchase") add("danke", r.n, "Käufe");
  }

  const defaults = defaultFlow(segment, pages);
  const saved = savedFlow(settingRes?.data?.value ?? null, segment);
  const site = siteUrl().startsWith("https://") ? siteUrl() : OWN;
  const error = pagesRes?.error ? "Seiten gerade nicht lesbar – Standardfluss unvollständig" : settingRes?.error ? "Gespeicherte Anordnung nicht lesbar" : "";

  return (
    <div className="v2 wf">
      <style dangerouslySetInnerHTML={{ __html: WF_CSS }} />
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], ["Website", "/dashboard/website"], ["Flow", ""]]} />
      <div className="wf-head">
        <h1><Icon name="pipeline" size={22} /> Seiten-Flow</h1>
        <nav className="wf-chips" aria-label="Branche">
          {BRANCHES.map((b) => b.active
            ? <a key={b.id} href={`/dashboard/website/flow?b=${b.id}`} className={b.id === segment ? "on" : undefined} aria-current={b.id === segment ? "true" : undefined}>{b.label}</a>
            : <span key={b.id} className="off" aria-disabled="true" title="Kommt später">{b.label}<em>bald</em></span>)}
        </nav>
      </div>
      {error && <div className="wf-err" role="alert"><Icon name="achtung" size={16} />{error}</div>}
      <FlowBoard key={segment} segment={segment} defaults={defaults} initial={saved ?? defaults} isSaved={!!saved}
        savedAt={saved ? settingRes?.data?.updated_at ?? null : null} catalog={catalog(pages)} counts={counts} site={site} days={DAYS} />
    </div>
  );
}
