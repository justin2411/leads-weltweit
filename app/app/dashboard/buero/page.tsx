import Link from "next/link";
import { Icon, type IconName } from "@/app/icons";
import { BEREICHE } from "@/lib/firma-karte";
import { loadZentrale } from "@/lib/zentrale-data";
import { zahl } from "@/lib/zentrale-logik";
import { requireOwner } from "../actions";
import { PageHead } from "../v2";

export const metadata = { title: "Büro" };
export const dynamic = "force-dynamic";

type Kachel = { href: string; titel: string; icon: IconName; zahl: string; tip: string };

/**
 * Büro (JARVIS-Zentrale 05.10.2026): alle Detail-Seiten als Kacheln, nach Bereichen aus firma-karte.json gruppiert
 * (höchstens 18). Je Kachel Symbol, Titel, eine Zahl. Die Bereichs-Überschrift führt ins Büro des Bereichs
 * (Team, Kohorten, Gehirn lernt, Vorschläge). Ersetzt das frühere „Mehr“-Blatt und ?teil=mehr.
 */
export default async function Buero() {
  await requireOwner();
  const { schnell: s, langsam: l } = await loadZentrale("alle");
  const n = (x: unknown) => Number(x ?? 0) || 0;
  const gb = l?.storage?.db_bytes ? `${(n(l.storage.db_bytes) / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB` : "–";
  const fehler = s?.gaps.find((g) => g.ziel_key === "lead_fehler")?.ist;
  const score = [...(l?.kpi ?? [])].filter((k) => k.metric === "gehirn_score").pop();
  const unb = (l?.goals ?? []).filter((g) => !g.quelle || g.quelle === "vorschlag").length;
  const tank = l ? Object.values(l.tank).reduce((a, b) => a + n(b), 0) : null;
  const plaetze = (s?.beats ?? []).reduce((a, b) => a + n(b.plaetze), 0);
  const GRUPPEN: { slug: string; kacheln: Kachel[] }[] = [
    { slug: "vertrieb", kacheln: [
      { href: "/dashboard/versand", titel: "Versand", icon: "versand", zahl: s ? `${zahl(s.msg.sent_heute)} heute` : "–", tip: "Freigaben, Postfächer, Zustellung" },
      { href: "/dashboard/kontakte", titel: "Kontakte", icon: "kontakte", zahl: s ? `${zahl(s.msg.sent_24h)} / 24 h` : "–", tip: "angeschriebene Käufer" },
      { href: "/dashboard/vertrieb", titel: "Vertrieb", icon: "trend-hoch", zahl: s ? `${zahl(n(s.ev24.reply_positive))} positiv` : "–", tip: "Trichter je Land" },
    ] },
    { slug: "marketing", kacheln: [
      { href: "/dashboard/website", titel: "Website", icon: "website", zahl: "Flow · Auswertung", tip: "Gesundheit, Website-Agenten, Trichter" },
      { href: "/dashboard/proben", titel: "Proben", icon: "proben", zahl: tank === null ? "–" : `${zahl(tank)} bereit`, tip: "fertige, geprüfte Proben" },
    ] },
    { slug: "produktion", kacheln: [
      { href: "/dashboard/speicher", titel: "Speicher", icon: "speicher", zahl: gb, tip: "Leads, Premium, Käufer, Proben, Datenbank je Land" },
      { href: "/dashboard/buero/werke", titel: "Werke-Details", icon: "werk", zahl: `${plaetze} Plätze`, tip: "Läufe, Herzschläge, Prüfstufen" },
      { href: "/dashboard/bestand", titel: "Bestand", icon: "bestand", zahl: l?.runs["lead-werk"] ? `+${zahl(l.runs["lead-werk"].green_24h)}` : "–", tip: "lieferbare Leads und Käufer" },
      { href: "/dashboard/liste", titel: "Liste", icon: "filter", zahl: "Leads", tip: "Leads und Käufer als Liste" },
      { href: "/dashboard/baukasten", titel: "Baukasten", icon: "baukasten", zahl: "Flows", tip: "eigene Regeln (Stufe 4 der Freigabe)" },
    ] },
    { slug: "qualitaet", kacheln: [
      { href: "/dashboard/betrieb", titel: "Betrieb", icon: "freigabe", zahl: fehler === undefined || fehler === null ? "–" : `${n(fehler).toLocaleString("de-DE")} % Fehler`, tip: "Prüfungen, Läufe, Fehlerquote" },
      { href: "/dashboard/protokoll", titel: "Protokoll", icon: "dokument", zahl: l?.lern.last_decision ? "Entscheidungen" : "–", tip: "Entscheidungen und Änderungen" },
    ] },
    { slug: "finanzen", kacheln: [
      { href: "/dashboard/finanzen", titel: "Finanzen", icon: "trend-hoch", zahl: l?.mrr === null || l?.mrr === undefined ? "–" : `${zahl(l.mrr)} MRR`, tip: "Umsatz, Kosten" },
      { href: "/dashboard/ziele", titel: "Ziele", icon: "stern", zahl: unb ? `${unb} unbestätigt` : "bestätigt", tip: "Ziele bestätigen" },
    ] },
    { slug: "recht", kacheln: [
      { href: "/dashboard/recht", titel: "Recht", icon: "recht", zahl: l ? `${zahl(l.sperre.gesamt)} gesperrt` : "–", tip: "Kaltmail-Recht, Sperrliste" },
    ] },
    { slug: "strategie", kacheln: [
      { href: "/dashboard/gehirn", titel: "Gehirn", icon: "gehirn", zahl: score ? `Score ${n(score.value).toLocaleString("de-DE", { maximumFractionDigits: 1 })}` : "–", tip: "Lernschleife, Lehren, Prüffälle" },
      { href: "/dashboard/hilfe", titel: "Hilfe", icon: "frage", zahl: "Anleitung", tip: "Hilfe und Einrichtung" },
    ] },
  ];
  return (
    <div className="v2 buero">
      <style dangerouslySetInnerHTML={{ __html: BUERO_CSS }} />
      <PageHead title="Büro" icon="buero" sub="Alle Details, nach Bereichen" crumbs={[["JARVIS", "/dashboard/jarvis"], ["Büro", ""]]} />
      <div className="bu-grid">
        {GRUPPEN.map((g) => {
          const b = BEREICHE.find((x) => x.slug === g.slug)!;
          return (
            <section key={g.slug} className="bu-g" aria-label={b.name}>
              <h2><Link href={`/dashboard/buero/bereich/${g.slug}`} title={`Büro ${b.name}: Team, Kohorten, Vorschläge`}>{b.name}<Icon name="weiter" size={14} /></Link></h2>
              <div className="bu-k">
                {g.kacheln.map((k) => (
                  <Link key={k.href} href={k.href} className="bu-t" title={k.tip}>
                    <Icon name={k.icon} size={22} /><b>{k.titel}</b><span className="z">{k.zahl}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const BUERO_CSS = `
.buero .bu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;align-items:stretch}
.buero .bu-g{margin:0;padding:8px 16px 16px;border:1px solid rgba(95,212,255,.18);border-radius:12px;background:rgba(9,24,48,.62);display:flex;flex-direction:column}
.buero .bu-g h2{margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.buero .bu-g h2 a{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:#a8ecff;text-decoration:none}
.buero .bu-k{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;align-items:stretch;flex:1}
.buero .bu-t{display:flex;flex-direction:column;gap:4px;min-height:88px;padding:12px;border:1px solid rgba(95,212,255,.18);border-radius:10px;background:rgba(4,14,30,.6);color:#d9ecff;text-decoration:none}
.buero .bu-t:hover,.buero .bu-t:focus-visible{border-color:#5fd4ff}
.buero .bu-t svg{color:#5fd4ff}
.buero .bu-t b{font-size:15px}
.buero .bu-t .z{font-family:var(--monof,ui-monospace),monospace;font-size:13px;color:#8ba6c9}
@media (max-width:759px){.buero .bu-grid{grid-template-columns:minmax(0,1fr)}.buero .bu-k{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
