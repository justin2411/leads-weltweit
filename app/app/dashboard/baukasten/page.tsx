import { FIELDS, TEMPLATES, parseFlow, type Flow } from "@/lib/flow";
import { loadFlow, loadFlows } from "@/lib/flow-data";
import { requireOwner } from "../actions";
import { Builder, type BuilderInit, type SavedFlow } from "./builder";
import { BAUKASTEN_CSS } from "./css";

export const metadata = { title: "Baukasten" };
// Server-Actions (Stichprobe bis 5000 Zeilen in 1000er-Seiten) erben das Zeitlimit der Seite
export const maxDuration = 60;
type SP = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEG_LABEL = Object.fromEntries((FIELDS.find((f) => f.key === "segment")?.options ?? []).map((o) => [o.v, o.label.replace(/^S\d+\s*/, "")]));

/** Neuer Flow aus einer Vorlage, Quelle optional vorbelegt (?land=US&seg=S2&quelle=kaeufer – Links aus dem Speicher). */
function preset(land: string | null, seg: string | null, quelle: string | null, vorlage: string | null): BuilderInit {
  const buyer = quelle === "kaeufer";
  const tpl = TEMPLATES.find((t) => t.id === vorlage) ?? TEMPLATES.find((t) => t.id === (buyer ? "kaeufer-frei" : "us-telefon")) ?? TEMPLATES[0];
  const flow: Flow = structuredClone(tpl.flow);
  if (!land && !seg && !quelle) return { id: null, name: tpl.id === "us-telefon" ? "US Webagenturen" : tpl.label.slice(0, 60), flow };
  const segment = seg ?? (land ? null : "S2");
  flow.nodes = flow.nodes.map((n) => {
    if (n.kind === "quelle") return { ...n, source: buyer ? "kaeufer" : n.source, status: buyer ? ["ok"] : n.status, countries: land ? [land] : n.countries, segment };
    if (n.kind === "pipeline") return { ...n, name: `${land ?? "Alle"} mit Telefon` };
    return n;
  });
  const what = segment ? SEG_LABEL[segment] ?? segment : "alle Zielgruppen";
  return { id: null, name: `${buyer ? "Käufer " : ""}${land ?? "Alle Länder"} ${what}`.slice(0, 60), flow };
}

/**
 * Baukasten (Inhaber 03.10.2026: „Ich will Flows per Drag & Drop selber bauen, alles visualisiert … ich sehe die ganze
 * Zeit Daten … nicht nur Filter, auch andere Elemente“). Server: Sitzung, gespeicherte Flows, Startzustand.
 * Der Editor selbst läuft im Browser (builder.tsx); geschrieben wird nur über die Server Actions in actions.ts.
 */
export default async function Baukasten({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const flowParam = UUID.test(one("flow")) ? one("flow").toLowerCase() : null;
  const land = /^[A-Za-z]{2}$/.test(one("land")) ? one("land").toUpperCase() : null;
  const seg = /^S\d{1,2}$/i.test(one("seg")) ? one("seg").toUpperCase() : null;
  const quelle = one("quelle") === "kaeufer" ? "kaeufer" : null;
  const vorlage = TEMPLATES.some((t) => t.id === one("vorlage")) ? one("vorlage") : null;

  const [rows, opened] = await Promise.all([
    loadFlows().catch(() => []),
    flowParam ? loadFlow(flowParam).catch(() => null) : Promise.resolve(null),
  ]);
  const flows: SavedFlow[] = rows.map((r) => ({ id: r.id, name: r.name, status: r.status, updated_at: r.updated_at }));

  let notice: string | null = null;
  let initial: BuilderInit = preset(land, seg, quelle, vorlage);
  if (flowParam) {
    const def = opened?.def ? parseFlow(opened.def) : null;
    if (opened && def?.ok) initial = { id: opened.id, name: opened.name, flow: def.flow };
    else notice = opened ? `Flow „${opened.name}“ ist beschädigt – Vorlage geladen` : "Flow nicht gefunden – Vorlage geladen";
  }
  const navKey = flowParam ? `flow:${flowParam}` : `neu:${land ?? ""}|${seg ?? ""}|${quelle ?? ""}|${vorlage ?? ""}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BAUKASTEN_CSS }} />
      <Builder navKey={navKey} initial={initial} flows={flows} notice={notice} />
    </>
  );
}
