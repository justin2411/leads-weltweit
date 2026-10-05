import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Der Status-Endpunkt der Zentrale liest nur: keine Schreib-Aufrufe, nur erlaubte Lese-RPCs, nie die großen Tabellen. */
const QUELLEN = ["./zentrale-data.ts", "../app/api/jarvis/zentrale/route.ts"].map((p) => [p, readFileSync(new URL(p, import.meta.url), "utf8")] as const);
const LESE_RPC = new Set(["zentrale_schnell", "zentrale_langsam"]);

test("kein .insert/.update/.upsert/.delete im Status-Pfad", () => {
  for (const [p, src] of QUELLEN) assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/, p);
});

test("rpc( nur für erlaubte Lese-Funktionen", () => {
  for (const [p, src] of QUELLEN) {
    for (const m of src.matchAll(/rpc\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      if (arg === "fn") continue; // Helfer lies(fn) – Name ist auf LESE_RPC beschränkt (Typ unten geprüft)
      assert.ok(LESE_RPC.has(arg.replace(/["']/g, "")), `${p}: rpc(${arg})`);
    }
    for (const m of src.matchAll(/lies<[^>]+>\("([a-z_]+)"/g)) assert.ok(LESE_RPC.has(m[1]), `${p}: ${m[1]}`);
  }
  const data = QUELLEN[0][1];
  assert.match(data, /const LESE_RPC = \["zentrale_schnell", "zentrale_langsam"\] as const;/);
  assert.match(data, /fn: \(typeof LESE_RPC\)\[number\]/);
});

test("nie live: observations, leads, watch_companies, prospects", () => {
  for (const [p, src] of QUELLEN) {
    for (const t of ["observations", "leads", "watch_companies", "prospects"]) assert.doesNotMatch(src, new RegExp(`from\\("${t}"\\)`), `${p}: ${t}`);
  }
  // die SQL-Funktionen selbst lesen die großen Tabellen auch nicht
  const sql = readFileSync(new URL("../../supabase/migrations/20261005130000_signalwerk_jarvis_zentrale.sql", import.meta.url), "utf8");
  for (const t of ["observations", "watch_companies", "prospects", "leads "]) assert.doesNotMatch(sql, new RegExp(`signalwerk\\.${t}`), t);
  assert.doesNotMatch(sql.slice(sql.indexOf("zentrale_schnell")), /\b(insert|update|delete)\b(?![\s\S]*zentrale_cache_refresh)/i);
});

test("Endpunkt: Inhaber-Sitzung, kein Zwischenspeicher, immer dynamisch", () => {
  const route = QUELLEN[1][1];
  assert.match(route, /verifySession\(token, process\.env\.SESSION_SECRET/);
  assert.match(route, /status: 404/);
  assert.match(route, /Cache-Control": "no-store/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
});
