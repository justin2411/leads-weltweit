// Layout-Wächter starten: Mock-Supabase + Next (Standard: `next start` nach `npm run build`; `--dev` für next dev;
// `--base http://localhost:3000` für einen schon laufenden Server mit Mock). Exit 1 bei jedem Verstoß.
//   npm run layout                     (nach npm run build)
//   npm run layout -- --dev            (ohne Build)
//   LAYOUT_SHOTS=/pfad npm run layout  (Bildschirmfotos je Seite und Breite)
//   --pages /dashboard/jarvis --widths 721
import { spawn } from "node:child_process";
import { PAGES, WIDTHS, runChecks } from "./check.mjs";
import { startMock } from "./mock-supabase.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const SECRET = "layout-test-secret";
const PORT = Number(opt("--port") ?? 3399);
const list = (v, d) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);
const pages = list(opt("--pages"), PAGES);
const widths = list(opt("--widths"), WIDTHS).map(Number);

let exited = false;
const wait = async (url, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !exited) {
    try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server unter ${url} nicht erreichbar`);
};

let base = opt("--base");
let next, mock;
try {
  if (!base) {
    mock = await startMock(0);
    const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${mock.port}`, SUPABASE_SERVICE_ROLE_KEY: "layout-test", SESSION_SECRET: SECRET,
      DASHBOARD_PASSWORD: "layout-test", SITE_URL: `http://localhost:${PORT}`, GH_DISPATCH_TOKEN: "", ANTHROPIC_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" };
    next = spawn("npx", ["next", args.includes("--dev") ? "dev" : "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let logTail = "";
    const keep = (d) => { logTail = (logTail + d).slice(-4000); };
    next.stdout.on("data", keep); next.stderr.on("data", keep);
    next.on("exit", (c) => { exited = true; if (c) console.error(`next beendet (${c}):\n${logTail}`); });
    base = `http://localhost:${PORT}`;
    await wait(`${base}/login`, 120_000);
  }
  const errors = await runChecks({ base, secret: process.env.LAYOUT_SECRET ?? SECRET, pages, widths });
  if (errors.length) {
    console.error(`\n${errors.length} Layout-Fehler:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exitCode = 1;
  } else console.log(`\nLayout ok: ${pages.length} Seiten × ${widths.length} Breiten`);
} finally {
  if (next) try { process.kill(-next.pid, "SIGTERM"); } catch {}
  mock?.server.close();
}
