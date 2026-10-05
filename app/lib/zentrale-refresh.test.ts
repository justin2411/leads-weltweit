import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planeZentraleRefresh, ZENTRALE_PFADE, type Deps } from "./zentrale-refresh.ts";

/** Bug 05.10.2026: Ziele übernommen, JARVIS zeigte „unbestätigt“ (alter Cache). Nach dem Speichern sofort neu rechnen. */
function mock(rpcResult: { error: { message: string } | null } | Error = { error: null }) {
  const calls: string[] = [], logs: string[] = [], tasks: (() => Promise<void>)[] = [], paths: string[] = [];
  const d: Deps = {
    rpc: (fn) => { calls.push(fn); return rpcResult instanceof Error ? Promise.reject(rpcResult) : Promise.resolve(rpcResult); },
    schedule: (t) => { tasks.push(t); },
    revalidate: (p) => { paths.push(p); },
    log: (m) => { logs.push(m); },
  };
  return { d, calls, logs, tasks, paths };
}

test("Refresh wird nach der Antwort ausgeführt und JARVIS neu validiert", async () => {
  const m = mock();
  planeZentraleRefresh(m.d);
  assert.equal(m.calls.length, 0, "nicht im Speichern selbst (blockiert nie)");
  assert.equal(m.tasks.length, 1);
  await m.tasks[0]();
  assert.deepEqual(m.calls, ["zentrale_cache_refresh"]);
  assert.deepEqual(m.paths, [...ZENTRALE_PFADE]);
  assert.ok(m.paths.includes("/dashboard/jarvis"));
  assert.deepEqual(m.logs, []);
});

test("Fehler im Refresh wird nur geloggt, nie geworfen", async () => {
  for (const r of [{ error: { message: "timeout" } }, new Error("netz weg")]) {
    const m = mock(r);
    planeZentraleRefresh(m.d);
    await assert.doesNotReject(m.tasks[0]());
    assert.equal(m.logs.length, 1);
    assert.ok(m.paths.includes("/dashboard/jarvis"));
  }
  const logs: string[] = [];
  assert.doesNotThrow(() => planeZentraleRefresh({ rpc: async () => ({ error: null }), schedule: () => { throw new Error("kein Request"); }, revalidate: () => {}, log: (x) => logs.push(x) }));
  assert.equal(logs.length, 1);
});

test("Ziele-Action löst den Refresh aus, bevor sie weiterleitet", () => {
  const src = readFileSync(new URL("../app/dashboard/ziele/actions.ts", import.meta.url), "utf8");
  assert.match(src, /import \{ zentraleNeuRechnen \} from "@\/lib\/zentrale-refresh-server"/);
  const save = src.slice(src.indexOf("export async function saveGoals"));
  const call = save.indexOf("zentraleNeuRechnen()"), last = save.lastIndexOf("redirect(");
  assert.ok(call > 0 && call < last, "Refresh vor dem letzten redirect (redirect wirft)");
  assert.ok(save.indexOf("company_goals") < call, "erst speichern, dann neu rechnen");
});

test("Alle Inhaber-Einstellungen mit JARVIS-Werten lösen den Refresh aus", () => {
  for (const f of ["../app/dashboard/control-actions.ts", "../app/dashboard/regler/actions.ts", "../app/dashboard/jarvis/chat/actions.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /zentraleNeuRechnen\(\)/, f);
  }
  const srv = readFileSync(new URL("./zentrale-refresh-server.ts", import.meta.url), "utf8");
  assert.match(srv, /after\(/, "per next/server after() – Speichern wartet nie");
  const mig = readFileSync(new URL("../../supabase/migrations/20261005180000_signalwerk_zentrale_cron.sql", import.meta.url), "utf8");
  assert.match(mig, /cron\.schedule\('signalwerk-zentrale-cache', '\*\/5 \* \* \* \*'/);
  assert.doesNotMatch(mig, /\b(drop|delete|truncate)\b/i);
});
