// Bildschirmfotos der Landingpages (Handy + Desktop). Zählt keine Aufrufe (/api/events wird blockiert),
// klickt nichts an und sendet keine Formulare.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const base = process.env.BASE || "http://localhost:3000";
const paths = readFileSync(".github/ansicht.txt", "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
mkdirSync("docs/ansicht", { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport] of [["handy", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: name === "handy" ? 2 : 1 });
  await ctx.route("**/api/events", (r) => r.abort());
  const page = await ctx.newPage();
  for (const p of paths) {
    const res = await page.goto(`${base}/${p}`, { waitUntil: "networkidle" });
    const file = `docs/ansicht/${p.split("?")[0].replace(/\//g, "_")}${p.includes("?r=") ? "_persoenlich" : ""}_${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(res?.status(), file);
  }
  await ctx.close();
}
await browser.close();
