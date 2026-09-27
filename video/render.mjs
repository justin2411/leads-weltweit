// node render.mjs <slug> stills|video [fps]  – Bilder nach out/<slug>/ (Playwright/Chromium)
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); }
const [,, name, mode = "stills", fps = "25"] = process.argv;
const cfg = JSON.parse(readFileSync(`segments/${name}.json`, "utf8"));
const timing = JSON.parse(readFileSync(`out/${name}/timing.json`, "utf8"));
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(`window.TIMING = ${JSON.stringify(timing)}; window.CFG = ${JSON.stringify(cfg)};`);
await page.goto("file://" + process.cwd() + "/" + (cfg.film || "film.html"));
await page.evaluate(() => document.fonts.ready);
const dir = `out/${name}/${mode === "stills" ? "stills" : "frames"}`;
mkdirSync(dir, { recursive: true });
if (mode === "stills") {
  for (const l of timing.lines) { await page.evaluate(t => render(t), l.end - 0.3); await page.screenshot({ path: `${dir}/${l.id}.png` }); }
} else {
  const n = Math.ceil(timing.total * +fps);
  for (let i = 0; i < n; i++) { await page.evaluate(t => render(t), i / +fps);
    await page.screenshot({ path: `${dir}/f${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 }); }
  console.log(name, n, "frames");
}
await browser.close();
