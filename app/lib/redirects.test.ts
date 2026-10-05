import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Navigation der Zentrale (05.10.2026): jeder Link auf /dashboard/… in app/, scripts/ und docs/HILFE* zeigt auf eine
 * bestehende Seite (page.tsx), alte Adressen leiten um statt 404 (firma, werke, kunden-agenten).
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const APP = join(ROOT, "app/app");

function dateien(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) dateien(p, ext, out); else if (ext.test(f)) out.push(p);
  }
  return out;
}

/** Gibt es zu /dashboard/a/b eine Seite? Unbekannte Segmente dürfen auf einen [param]-Ordner fallen. */
function route(pfad: string): boolean {
  const teile = pfad.replace(/^\//, "").split("/").filter(Boolean);
  let dir = APP;
  for (let i = 0; i < teile.length; i++) {
    const direkt = join(dir, teile[i]);
    if (existsSync(direkt) && statSync(direkt).isDirectory()) { dir = direkt; continue; }
    const dyn = readdirSync(dir).find((f) => /^\[.+\]$/.test(f));
    if (!dyn) return false;
    dir = join(dir, dyn);
  }
  return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"));
}

test("alle /dashboard/…-Links zeigen auf eine bestehende Seite", () => {
  const quellen = [
    ...dateien(join(ROOT, "app/app"), /\.(tsx?|mjs)$/), ...dateien(join(ROOT, "app/lib"), /\.(tsx?|json)$/), ...dateien(join(ROOT, "scripts"), /\.py$/),
    ...readdirSync(join(ROOT, "docs")).filter((f) => /^HILFE/.test(f)).map((f) => join(ROOT, "docs", f)),
  ];
  const fehler: string[] = [];
  for (const q of quellen) {
    const text = readFileSync(q, "utf8");
    for (const m of text.matchAll(/["'`(]\/dashboard((?:\/[a-z0-9_-]+)*)(\/?)/g)) {
      const pfad = `/dashboard${m[1]}`;
      if (m[2] === "/" && !m[1]) continue;
      // „/dashboard/kontakte/${id}“: Schrägstrich am Ende = dynamisches Segment folgt
      const ziel = m[2] === "/" ? `${pfad}/x` : pfad;
      if (!route(ziel)) fehler.push(`${q.replace(ROOT, "")}: ${pfad}${m[2]}`);
    }
  }
  assert.deepEqual([...new Set(fehler)], []);
});

test("alte Adressen leiten um (redirect) statt 404", () => {
  for (const f of ["firma/page.tsx", "firma/[bereich]/page.tsx", "werke/page.tsx", "kunden-agenten/page.tsx"]) {
    assert.match(readFileSync(join(APP, "dashboard", f), "utf8"), /redirect\(/, f);
  }
  assert.match(readFileSync(join(APP, "dashboard/jarvis/page.tsx"), "utf8"), /teil === "mehr"\) redirect\("\/dashboard\/buero"\)/);
  assert.ok(existsSync(join(APP, "dashboard/kunden-agenten/[id]/page.tsx")), "Detailseite der Kunden-Agenten bleibt");
});

test("Menü: genau 5 Einträge, gleich am Rechner und Handy", () => {
  const nav = readFileSync(join(APP, "dashboard/nav.tsx"), "utf8");
  const block = nav.slice(nav.indexOf("export const SECTIONS"), nav.indexOf("];", nav.indexOf("export const SECTIONS")));
  const eintraege = [...block.matchAll(/\["(\/dashboard\/[a-z-]+)", "([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual(eintraege, ["JARVIS", "Antworten", "Kunden", "Regler", "Büro"]);
  assert.doesNotMatch(nav, /msheet|Mehr-Blatt|bmore/);
});
