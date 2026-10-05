import { requireOwner } from "../../actions";
import { loadAnalyticsCache, loadFunnelCache, loadWebsiteStats } from "@/lib/dashboard-data";
import { berlin } from "@/lib/dashboard-logic";
import { buildView, countryOfSlug, type Device, type WebsiteStats } from "@/lib/website-stats";
import { AUSWERTUNG_CSS } from "./css";
import { Auswertung, WaCrumbs, type Chip } from "./view";
import { Trichter } from "./trichter";
import { Analyse } from "./analyse";
import { hints, slice, tiles, type AnalyticsCache } from "@/lib/website-analytics";
import { FUNNEL_COUNTRIES, FUNNEL_PERIODS, funnelView, type FunnelCache, type FunnelPeriod } from "@/lib/website-funnel";

export const metadata = { title: "Website-Auswertung" };
type SP = Promise<Record<string, string | string[] | undefined>>;

/** 1 = „Heute“ seit 00:00 Berlin (website_stats(1)). */
const PERIODS = [1, 7, 30, 90] as const;
const one = (x: string | string[] | undefined) => (typeof x === "string" ? x : undefined);

/**
 * Website-Auswertung (Inhaber 04.10.2026: „grafiken zu den websitenaufrufen … heatmaps … brauch ich dafür google
 * analytics“ – nein): eigene, anonyme Messung. Oben der große Trichter Startseite → Landingpage → Tarif → Stripe → Danke
 * (eindeutige Besucher, Aufrufe, Absprung, Ø Zeit, Weiter-Quote; ?t=heute|24h|7d|30d), darunter Aufrufe je Tag und Land, Herkunft, Probe-Weg,
 * Mail-Klicks je Betreff-Variante, Gerät, Scrolltiefe, Verweildauer, Heatmap je Seite. Filter über Chips (?d=&c=&p=&g=).
 */
export default async function WebsiteAuswertung({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const days = PERIODS.find((d) => String(d) === one(sp.d)) ?? 30;
  // Trichter (vorgerechnet) und Tagessummen parallel; fällt eins aus, zeigt die Seite das andere
  const [stR, fuR, anR] = await Promise.allSettled([loadWebsiteStats(days), loadFunnelCache(), loadAnalyticsCache()]);
  if (stR.status === "rejected") console.error("website-auswertung:", stR.reason); // Details nur im Server-Protokoll
  const st = stR.status === "fulfilled" ? stR.value : null;
  const fu = fuR.status === "fulfilled" ? fuR.value : null;
  const an = anR.status === "fulfilled" ? anR.value : null;
  return <Page st={st} fu={fu} an={an} sp={sp} days={days} />;
}

function Page({ st, fu, an, sp, days }: { st: WebsiteStats | null; fu: FunnelCache | null; an: AnalyticsCache | null; sp: Record<string, string | string[] | undefined>; days: number }) {
  const slugs = st ? [...new Set([...st.pages.filter((p) => p.st === "live").map((p) => p.s), ...st.rows.map((r) => r.s)])].sort() : [];
  const countries = [...new Set([...FUNNEL_COUNTRIES, ...slugs.map(countryOfSlug)])].sort((a, b) => ["US", "UK", "FR"].indexOf(a) - ["US", "UK", "FR"].indexOf(b) || a.localeCompare(b));
  const cRaw = one(sp.c)?.toUpperCase();
  const country = cRaw && countries.includes(cRaw) ? cRaw : null;
  const pRaw = one(sp.p);
  const page = pRaw && slugs.includes(pRaw) && (!country || countryOfSlug(pRaw) === country) ? pRaw : null;
  const device: Device = one(sp.g) === "mobil" ? "mobil" : "desktop";
  const tRaw = one(sp.t);
  const period: FunnelPeriod = FUNNEL_PERIODS.some((x) => x.id === tRaw) ? (tRaw as FunnelPeriod) : "7d";

  const href = (o: { d?: number; c?: string | null; p?: string | null; g?: Device; t?: FunnelPeriod }) => {
    const q = new URLSearchParams();
    const d = o.d ?? days, c = o.c === undefined ? country : o.c, p = o.p === undefined ? page : o.p, g = o.g ?? device, t = o.t ?? period;
    if (t !== "7d") q.set("t", t);
    if (d !== 30) q.set("d", String(d));
    if (c) q.set("c", c);
    if (p) q.set("p", p);
    if (g !== "desktop") q.set("g", g);
    const s = q.toString();
    return `/dashboard/website/auswertung${s ? `?${s}` : ""}`;
  };
  const pageChips: Chip[] = country
    ? [{ label: "alle", href: href({ p: null }), on: !page }, ...slugs.filter((s) => countryOfSlug(s) === country).map((s) => ({ label: s.slice(3), href: href({ p: s }), on: page === s }))]
    : [];
  const chips = {
    period: PERIODS.map((d) => ({ label: d === 1 ? "Heute" : `${d} T`, href: href({ d }), on: d === days })),
    country: [{ label: "alle", href: href({ c: null, p: null }), on: !country }, ...countries.map((c) => ({ label: c, href: href({ c, p: null }), on: c === country }))],
    page: pageChips,
    device: (["desktop", "mobil"] as Device[]).map((g) => ({ label: g === "desktop" ? "Desktop" : "Mobil", href: href({ g }), on: g === device })),
  };
  const pageLabel = page ?? (country ? `alle Seiten ${country}` : "alle Seiten");
  const fv = funnelView(fu, period, country);
  // Analyse wie GA4 (gleicher Zeitraum und dasselbe Land wie der Trichter): Hinweise, Kacheln mit Vorzeitraum, Details
  const sl = slice(an, period, country);
  const trichter = (
    <>
      <Trichter v={fv} periods={FUNNEL_PERIODS.map((x) => ({ label: x.label, href: href({ t: x.id }), on: x.id === period }))}
        stand={fv.at ? berlin(fv.at) : null} since={fv.since ? berlin(fv.since) : null} />
      <Analyse hints={hints(an, fu, period, country)} tiles={tiles(sl.cur.k, sl.prev)} cur={sl.cur}
        periodLabel={`${FUNNEL_PERIODS.find((x) => x.id === period)?.label ?? ""}${country ? ` · ${country}` : " · alle Länder"}`} />
    </>
  );
  if (!st) {
    return (
      <div className="wa">
        <style dangerouslySetInnerHTML={{ __html: AUSWERTUNG_CSS }} />
        <WaCrumbs />
        <div className="wa-head"><h1>Website</h1><span className="wa-at">Auswertung</span></div>
        {trichter}
        <section className="wa-card"><p className="wa-empty">Weitere Auswertung gerade nicht erreichbar – gleich noch einmal laden.</p></section>
      </div>
    );
  }
  const v = buildView(st, { country, page, device });
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AUSWERTUNG_CSS }} />
      <Auswertung v={v} stand={berlin(st.now)} chips={chips} device={device} pageLabel={pageLabel} trichter={trichter} />
    </>
  );
}
