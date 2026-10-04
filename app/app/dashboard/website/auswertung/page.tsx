import { requireOwner } from "../../actions";
import { loadWebsiteStats } from "@/lib/dashboard-data";
import { berlin } from "@/lib/dashboard-logic";
import { buildView, countryOfSlug, type Device, type WebsiteStats } from "@/lib/website-stats";
import { AUSWERTUNG_CSS } from "./css";
import { Auswertung, type Chip } from "./view";

export const metadata = { title: "Website-Auswertung" };
type SP = Promise<Record<string, string | string[] | undefined>>;

const PERIODS = [7, 30, 90] as const;
const one = (x: string | string[] | undefined) => (typeof x === "string" ? x : undefined);

/**
 * Website-Auswertung (Inhaber 04.10.2026: „grafiken zu den websitenaufrufen … heatmaps … brauch ich dafür google
 * analytics“ – nein): eigene, anonyme Messung der Landingpages. Aufrufe je Tag und Land, Herkunft, Trichter Landingpage → Tarif → Stripe → Danke (eindeutige Besucher), Probe-Weg,
 * Mail-Klicks je Betreff-Variante, Gerät, Scrolltiefe, Verweildauer, Heatmap je Seite. Filter über Chips (?d=&c=&p=&g=).
 */
export default async function WebsiteAuswertung({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const days = PERIODS.find((d) => String(d) === one(sp.d)) ?? 30;
  let st: WebsiteStats | null = null;
  try {
    st = await loadWebsiteStats(days);
  } catch (e) {
    console.error("website-auswertung:", e); // Details nur im Server-Protokoll
  }
  if (!st) {
    return (
      <div className="wa">
        <style dangerouslySetInnerHTML={{ __html: AUSWERTUNG_CSS }} />
        <div className="wa-head"><h1>Website</h1><span className="wa-at">Auswertung</span></div>
        <section className="wa-card"><p className="wa-empty">Auswertung gerade nicht erreichbar – gleich noch einmal laden.</p></section>
      </div>
    );
  }
  return <Page st={st} sp={sp} days={days} />;
}

function Page({ st, sp, days }: { st: WebsiteStats; sp: Record<string, string | string[] | undefined>; days: number }) {
  const slugs = [...new Set([...st.pages.filter((p) => p.st === "live").map((p) => p.s), ...st.rows.map((r) => r.s)])].sort();
  const countries = [...new Set(slugs.map(countryOfSlug))].sort((a, b) => ["US", "UK", "FR"].indexOf(a) - ["US", "UK", "FR"].indexOf(b) || a.localeCompare(b));
  const cRaw = one(sp.c)?.toUpperCase();
  const country = cRaw && countries.includes(cRaw) ? cRaw : null;
  const pRaw = one(sp.p);
  const page = pRaw && slugs.includes(pRaw) && (!country || countryOfSlug(pRaw) === country) ? pRaw : null;
  const device: Device = one(sp.g) === "mobil" ? "mobil" : "desktop";
  const v = buildView(st, { country, page, device });

  const href = (o: { d?: number; c?: string | null; p?: string | null; g?: Device }) => {
    const q = new URLSearchParams();
    const d = o.d ?? days, c = o.c === undefined ? country : o.c, p = o.p === undefined ? page : o.p, g = o.g ?? device;
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
    period: PERIODS.map((d) => ({ label: `${d} T`, href: href({ d }), on: d === days })),
    country: [{ label: "alle", href: href({ c: null, p: null }), on: !country }, ...countries.map((c) => ({ label: c, href: href({ c, p: null }), on: c === country }))],
    page: pageChips,
    device: (["desktop", "mobil"] as Device[]).map((g) => ({ label: g === "desktop" ? "Desktop" : "Mobil", href: href({ g }), on: g === device })),
  };
  const pageLabel = page ?? (country ? `alle Seiten ${country}` : "alle Seiten");
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AUSWERTUNG_CSS }} />
      <Auswertung v={v} stand={berlin(st.now)} chips={chips} device={device} pageLabel={pageLabel} />
    </>
  );
}
