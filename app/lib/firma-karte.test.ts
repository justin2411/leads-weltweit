import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { AGENTEN, BEREICHE, FIRMA, WERKE, bahn, bereichVon, werkeVonBereich, agentenVonWerk, stationVonWerk, layoutKante } from "./firma-karte.ts";
import { ORDER } from "./fluss.ts";

const WF = new URL("../../.github/workflows/", import.meta.url);
const linien = JSON.parse(readFileSync(new URL("./werk-linien.json", import.meta.url), "utf8")) as { lanes: { id: string; werk: string }[] };
const mig = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8")).join("\n");

test("jeder Workflow und jeder Nebenlauf existiert", () => {
  for (const w of WERKE) {
    for (const f of [w.workflow, ...(w.neben ?? [])].filter(Boolean) as string[]) assert.ok(existsSync(new URL(f, WF)), `${w.id}: ${f} fehlt`);
  }
  for (const a of AGENTEN) if (a.workflow) assert.ok(existsSync(new URL(a.workflow, WF)), `${a.id}: ${a.workflow} fehlt`);
});

test("jedes linien_werk steht in werk-linien.json, jede Linie (Radar) auch", () => {
  for (const w of WERKE) {
    if (w.linien_werk) assert.ok(linien.lanes.some((l) => l.werk === w.linien_werk), `${w.id}: ${w.linien_werk}`);
    if (w.linie) assert.ok(linien.lanes.some((l) => l.id === w.linie), `${w.id}: Linie ${w.linie}`);
  }
});

test("jede Rolle rolle:* steht in den Migrationen von agent_roles", () => {
  const rollen = new Set([...BEREICHE.flatMap((b) => b.agenten), ...AGENTEN.map((a) => a.id)].filter((x) => x.startsWith("rolle:")).map((x) => x.slice(6)));
  for (const r of rollen) assert.match(mig, new RegExp(`(\\(|select )'${r}', '`), `Rolle ${r} fehlt in supabase/migrations`);
});

test("Bereiche: eindeutige Slugs, Agenten und Werke existieren", () => {
  const slugs = BEREICHE.map((b) => b.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(slugs.length, 9);
  const ids = new Set([...AGENTEN.map((a) => a.id), "gehirn"]);
  for (const b of BEREICHE) {
    for (const a of b.agenten) assert.ok(ids.has(a), `${b.slug}: Agent ${a}`);
    for (const w of b.werke) assert.ok(WERKE.some((x) => x.id === w), `${b.slug}: Werk ${w}`);
  }
});

test("Flüsse und Übergaben verweisen auf bestehende Werke, Agenten und Bereiche", () => {
  const knoten = new Set([...WERKE.map((w) => w.id), ...AGENTEN.map((a) => a.id), "gehirn"]);
  for (const f of FIRMA.fluesse) { assert.ok(knoten.has(f.von), f.von); assert.ok(knoten.has(f.an), f.an); }
  const slugs = new Set(BEREICHE.map((b) => b.slug));
  for (const u of FIRMA.uebergaben) { assert.ok(slugs.has(u.von), u.von); assert.ok(slugs.has(u.an), u.an); if (u.rolle) assert.ok(AGENTEN.some((a) => a.id === `rolle:${u.rolle}`), u.rolle); }
  for (const a of AGENTEN) if (Array.isArray(a.nutzt_werke)) for (const w of a.nutzt_werke) assert.ok(WERKE.some((x) => x.id === w), `${a.id}: ${w}`);
  assert.ok(FIRMA.agenten.some((a) => a.id === FIRMA.scout.id));
  assert.ok(slugs.has(FIRMA.scout.an_bereich));
});

test("jede station steht in fluss.ts ORDER oder ist null; fehlende Werke haben keinen Workflow", () => {
  for (const w of WERKE) {
    if (w.station !== undefined && w.station !== null) assert.ok((ORDER as string[]).includes(w.station), `${w.id}: ${w.station}`);
    if (w.status === "fehlt") assert.equal(w.workflow, null, w.id);
  }
});

test("Helfer: Rolle → Bereich, Werke je Bereich, Agenten je Werk, Bahnen", () => {
  assert.equal(bereichVon("quellen"), "produktion");
  assert.equal(bereichVon("rolle:trichter"), "vertrieb");
  assert.equal(bereichVon(null), "strategie");
  assert.equal(bereichVon("unbekannt"), "strategie");
  assert.ok(werkeVonBereich("vertrieb").includes("versand"));
  assert.ok(werkeVonBereich("vertrieb").includes("antworten"));
  assert.deepEqual(werkeVonBereich("gibtsnicht"), []);
  assert.ok(agentenVonWerk("versand").some((a) => a.id === "rolle:zustellung"));
  assert.equal(stationVonWerk("kunden"), "kwerk");
  assert.deepEqual(bahn("lead").map((g) => g.map((w) => w.id)), [["lead"], ["pruefer", "stichprobe"], ["proben"], ["feedback"]]);
  assert.equal(bahn("kaeufer").at(-1)![0].id, "umsatz");
  assert.ok(layoutKante().some(([a, b]) => a === "versand" && b === "antworten"));
});

test("Python liest dieselbe Datei (scripts/lib/firma_karte.py)", () => {
  const py = readFileSync(new URL("../../scripts/lib/firma_karte.py", import.meta.url), "utf8");
  assert.match(py, /app" \/ "lib" \/ "firma-karte\.json"/);
});
