// node render.mjs <name> stills|video [fps] [scale]  – Bilder nach out/<name>/ (Playwright/Chromium)
// Layout ist 1920x1080; scale 0.6667 ergibt 1280x720-Bilder (schneller, kleinere Dateien).
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); }
const [,, name, mode = "stills", fps = "25", scale = "0.6667"] = process.argv;
const cfg = JSON.parse(readFileSync(`segments/${name}.json`, "utf8"));
const timing = JSON.parse(readFileSync(`out/${name}/timing.json`, "utf8"));
const exe = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await pw.chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: +scale });
await page.addInitScript(`window.TIMING = ${JSON.stringify(timing)}; window.CFG = ${JSON.stringify(cfg)};`);
await page.goto("file://" + process.cwd() + "/" + (cfg.film || "film.html"));
await page.evaluate(() => document.fonts.ready);
const dir = `out/${name}/${mode === "stills" ? "stills" : "frames"}`;
mkdirSync(dir, { recursive: true });
if (mode === "stills") {
  // je Satz ein Bild kurz vor Satzende, dazu die Mitte
  for (const l of timing.lines) {
    for (const [tag, t] of [["a", (l.start + l.end) / 2], ["b", l.end - 0.2]]) {
      await page.evaluate(t => render(t), t); await page.screenshot({ path: `${dir}/${l.id}-${tag}.png` });
    }
  }
} else {
  const n = Math.ceil(timing.total * +fps);
  for (let i = 0; i < n; i++) { await page.evaluate(t => render(t), i / +fps);
    await page.screenshot({ path: `${dir}/f${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 90 }); }
  console.log(name, n, "frames");
}
await browser.close();
