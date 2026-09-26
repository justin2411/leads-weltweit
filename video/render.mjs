import { createRequire } from "node:module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const [,, mode = "stills", fps = "25"] = process.argv;
const timing = JSON.parse(readFileSync("timing_bf_emma.json", "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(`window.TIMING = ${JSON.stringify(timing)};`);
await page.goto("file://" + process.cwd() + "/film.html");
await page.evaluate(() => document.fonts.ready);
if (mode === "stills") {
  mkdirSync("stills", { recursive: true });
  const at = timing.lines.map(l => [l.id, l.end - 0.3]);
  for (const [id, t] of at) { await page.evaluate(t => render(t), t); await page.screenshot({ path: `stills/${id}.png` }); }
} else {
  mkdirSync("frames", { recursive: true });
  const n = Math.ceil(timing.total * +fps);
  for (let i = 0; i < n; i++) { await page.evaluate(t => render(t), i / +fps);
    await page.screenshot({ path: `frames/f${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 }); }
  console.log(n, "frames");
}
await browser.close();
