import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Layout-Prüfer, statisch (Inhaber 04.10.2026: „bündig oben und unten … das x immer mittig“). Ergänzt den Browser-Prüfer
 * tests/layout (npm run layout): Kasten-Raster setzen align-items:stretch, x-btn rahmenlos und mittig, jede Animation hat
 * einen prefers-reduced-motion-Gegenblock, am Handy keine Schrift unter 12 px.
 */
// Platzhalter ${…} im Template-String entfernen, damit die Klammern des CSS stimmen
const css = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\$\{[^}]*\}/g, "");
const ZENTRALE = css("../app/dashboard/jarvis/zentrale-css.ts");
const HUD = css("../app/dashboard/hud-css.ts");

/** Regeln außerhalb von @media (oberste Ebene des CSS-Texts). */
function regeln(text: string): { sel: string; body: string }[] {
  const out: { sel: string; body: string }[] = [];
  let tiefe = 0, start = 0, sel = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") { if (tiefe === 0) { sel = text.slice(start, i).trim(); start = i + 1; } tiefe++; }
    else if (c === "}") { tiefe--; if (tiefe === 0) { out.push({ sel, body: text.slice(start, i) }); start = i + 1; } }
  }
  return out.filter((r) => !r.sel.includes("@"));
}
const mehrspaltig = (body: string) => {
  const m = /grid-template-columns:([^;}]+)/.exec(body);
  if (!m) return false;
  const cols = m[1];
  if (/repeat\(1,/.test(cols)) return false;
  return /repeat\(/.test(cols) || (cols.match(/minmax\([^)]*\)|[\d.]+(?:px|fr|%)|\bauto\b/g) ?? []).length > 1;
};
/** Inhalts-Raster (Symbol + Text in einem Kasten) – keine nebeneinanderliegenden Kästen, dürfen mittig ausrichten. */
const INHALT = [".jz-ziel", ".jz-kern", ".jz-spur", ".jz-pl", ".jz .drw .ring2"];

test("Zentrale: jedes Kasten-Raster mit mehreren Spalten setzt align-items:stretch", () => {
  const css = ZENTRALE.slice(ZENTRALE.indexOf("`"), ZENTRALE.lastIndexOf("`"));
  for (const r of regeln(css)) {
    if (!mehrspaltig(r.body)) continue;
    const name = r.sel.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (INHALT.includes(name)) continue;
    assert.match(r.body, /align-items:stretch/, `${name} ohne align-items:stretch`);
  }
});

test("hud-css: kein Raster mit mehreren Spalten richtet oben/unten aus (bündig)", () => {
  for (const r of regeln(HUD)) {
    if (!mehrspaltig(r.body)) continue;
    assert.doesNotMatch(r.body, /align-items:(start|end|flex-start|flex-end)\b/, r.sel);
  }
});

test(".x-btn: rahmenlos und exakt mittig (Grid + place-items:center)", () => {
  const r = regeln(HUD).find((x) => x.sel.replace(/\/\*[\s\S]*?\*\//g, "").trim().startsWith(".dash .x-btn,") && x.body.includes("place-items"));
  assert.ok(r, ".x-btn-Regel fehlt");
  assert.match(r!.body, /display:inline-grid/);
  assert.match(r!.body, /place-items:center/);
  assert.match(r!.body, /border:0/);
  assert.match(r!.body, /padding:0/);
});

test("jede @keyframes hat einen prefers-reduced-motion-Gegenblock", () => {
  for (const [name, text] of [["zentrale-css", ZENTRALE], ["hud-css", HUD]] as const) {
    if (!/@keyframes/.test(text)) continue;
    const block = text.slice(text.indexOf("@media (prefers-reduced-motion:reduce)"));
    assert.ok(text.includes("@media (prefers-reduced-motion:reduce)"), `${name}: Gegenblock fehlt`);
    assert.match(block, /animation:none!important/, `${name}: Gegenblock schaltet Animationen nicht ab`);
  }
  // global für alle Bereiche (Gehirn, Website, Speicher, Baukasten, Auswertung)
  assert.match(HUD, /\.dash \*,\.dash \*:before,\.dash \*:after\{animation:none!important;transition:none!important/);
  assert.match(HUD, /\.jv-paused \*/);
});

test("Handy-Regeln der Zentrale: keine Schrift unter 12 px, Ziele ≥ 44 px", () => {
  const handy = ZENTRALE.slice(ZENTRALE.indexOf("@media (max-width:759px)"));
  for (const m of handy.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 12, `Schrift ${m[1]} px`);
  for (const m of ZENTRALE.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `Schrift ${m[1]} px`);
  assert.match(ZENTRALE, /\.jz-zaehl a,\.jz-zaehl button\{[^}]*min-height:44px/);
  const lampe = ZENTRALE.match(/\.jz-lampen a\{[^}]*width:(\d+)px;min-height:(\d+)px/);
  assert.ok(lampe && Number(lampe[1]) >= 44 && Number(lampe[2]) >= 44, "Lämpchen kleiner als 44 px");
});

test("Raster 12 Spalten: Karte 9, Leitplanken 3; Handy eine Spalte", () => {
  assert.match(ZENTRALE, /\.jz-raster\{display:grid;grid-template-columns:repeat\(12,minmax\(0,1fr\)\);gap:8px;align-items:stretch\}/);
  assert.match(ZENTRALE, /\.jz-links\{grid-column:1\/10/);
  assert.match(ZENTRALE, /\.jz-planken\{grid-column:10\/13\}/);
  assert.match(ZENTRALE, /\.jz-raster\{grid-template-columns:minmax\(0,1fr\)\}/);
});
