// Mini-PostgREST für den Layout-Wächter: beantwortet GET/HEAD/RPC aus fixtures.mjs, alles andere leer.
// Schreibt nie etwas; unbekannte Aufrufe landen im Protokoll (LAYOUT_DEBUG=1), damit fehlende Testdaten auffallen.
import http from "node:http";
import { makeFixtures } from "./fixtures.mjs";

/** Einfache PostgREST-Filter (eq/neq/in/gte/lte), genug für die Dashboard-Abfragen. */
function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const m = /^(eq|neq|gte|lte|gt|lt|in)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, op, raw] = m;
    out = out.filter((r) => {
      const x = r[k];
      if (x === undefined) return true;
      if (op === "eq") return String(x) === raw;
      if (op === "neq") return String(x) !== raw;
      if (op === "in") return raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(x));
      if (op === "gte") return String(x) >= raw;
      if (op === "lte") return String(x) <= raw;
      if (op === "gt") return String(x) > raw;
      return String(x) < raw;
    });
  }
  const limit = Number(params.get("limit") ?? 0);
  return limit ? out.slice(0, limit) : out;
}

export function startMock(port = 0, { debug = !!process.env.LAYOUT_DEBUG } = {}) {
  const fx = makeFixtures();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const u = new URL(req.url, "http://mock");
      const path = u.pathname.replace(/^\/rest\/v1\//, "");
      const single = /vnd\.pgrst\.object/.test(req.headers.accept ?? "");
      const send = (status, data, count) => {
        res.writeHead(status, { "content-type": "application/json", "content-range": `0-0/${count ?? (Array.isArray(data) ? data.length : 0)}` });
        res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
      };
      if (path.startsWith("rpc/")) {
        const fn = path.slice(4);
        if (!(fn in fx.rpc)) { if (debug) console.error(`[mock] rpc ${fn} → null`); return send(200, null); }
        return send(200, fx.rpc[fn]);
      }
      if (req.method !== "GET" && req.method !== "HEAD") return send(201, []);  // Schreiben wird ignoriert
      const rows = fx.tables[path];
      if (!rows && debug) console.error(`[mock] ${req.method} ${path} → []`);
      const out = filterRows(rows ?? [], u.searchParams);
      if (single) return out.length ? send(200, out[0]) : send(406, { code: "PGRST116", message: "no rows", details: null, hint: null });
      return send(200, out);
    });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startMock(Number(process.env.MOCK_PORT ?? 54398), { debug: true });
  console.log(`Mock-Supabase auf http://127.0.0.1:${port}`);
}
