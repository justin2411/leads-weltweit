import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { berlinDay } from "@/lib/dashboard-logic";
import { loadFlow, loadSourceRows, logOwner } from "@/lib/flow-data";
import { csvFileName, exportColumns, exportRows, isSize, isUuid, NODE_ID_RE, queryOf, toCsv, type ExportPart } from "@/lib/flow-io";

/**
 * CSV eines Bausteins (Baukasten): GET ?flow=<id>&node=<baustein>[&size=1000|2000|5000][&teil=ein|aus|ja|nein].
 * Nur mit Inhaber-Sitzung (sonst normale 404). Zeilen frisch aus der Datenbank, MIT Export-Spalten (Telefon, E-Mail,
 * Website, Adresse, Ansprechperson) – nie zwischengespeichert, nie indexiert. Standard: Ziele → was ankommt,
 * Schritte → was sie verlassen. Jeder Export → owner_log.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_FOUND = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const bad = (msg: string) => new Response(msg, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(token, process.env.SESSION_SECRET?.trim())) return NOT_FOUND();

  const sp = new URL(req.url).searchParams;
  const id = sp.get("flow") ?? "", nodeId = sp.get("node") ?? "";
  if (!isUuid(id)) return bad("Flow unbekannt");
  if (!NODE_ID_RE.test(nodeId)) return bad("Baustein unbekannt");
  const teil = sp.get("teil");
  if (teil !== null && !["ein", "aus", "ja", "nein"].includes(teil)) return bad("teil: ein, aus, ja oder nein");
  const sizeRaw = sp.get("size");
  if (sizeRaw !== null && !isSize(Number(sizeRaw))) return bad("Stichprobe: 1000, 2000 oder 5000");

  const f = await loadFlow(id);
  if (!f || !f.def) return bad("Flow unbekannt oder unlesbar – erst speichern");
  if (!f.def.nodes.some((n) => n.id === nodeId)) return bad("Baustein nicht im gespeicherten Flow – erst speichern");
  const q0 = queryOf(f.def);
  if (!q0) return bad("Quelle fehlt");
  const q = { ...q0, size: sizeRaw !== null ? (Number(sizeRaw) as typeof q0.size) : q0.size };

  let rows;
  try {
    rows = exportRows(f.def, await loadSourceRows(q, true), nodeId, teil as ExportPart | null) ?? [];
  } catch (e) {
    console.error("baukasten export:", e);
    return new Response("Datenbank gerade nicht erreichbar – bitte gleich noch einmal", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const csv = toCsv(exportColumns(q.source, rows), rows);
  await logOwner("flow:export", f.id, null, { node: nodeId, teil: teil ?? null, size: q.size, rows: rows.length, source: q.source })
    .catch((e) => console.error("baukasten export log:", e));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileName(f.name, nodeId, berlinDay(new Date()))}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}
