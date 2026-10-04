import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GRUND_MAX, TITEL_MAX, insertDecision, kuerzen, kurzGrundText, kurzTitelText, mitKurz } from "./kurz-schreiben.ts";

const fx = JSON.parse(readFileSync(new URL("../../tests/fixtures/kurz_cases.json", import.meta.url), "utf8")) as Record<string, [string, string][]>;

test("Gemeinsame Fälle mit Python (tests/fixtures/kurz_cases.json)", () => {
  for (const [ein, aus] of fx.titel) assert.equal(kurzTitelText(ein), aus, ein);
  for (const [ein, aus] of fx.grund) assert.equal(kurzGrundText(ein), aus, ein);
});

test("Grenzen werden nie überschritten", () => {
  const lang = "Sitzung 27.09. 16:30 UTC: " + "Wortwortwort ".repeat(40);
  assert.ok(kurzTitelText(lang).length <= TITEL_MAX);
  assert.ok(kurzGrundText(lang).length <= GRUND_MAX);
  assert.ok(kuerzen("x".repeat(500), 60).length <= 60);
  const r = mitKurz({ subject: "s", reasoning: "r", kurz_titel: "t".repeat(90) });
  assert.ok((r.kurz_titel ?? "").length <= TITEL_MAX);
});

test("insertDecision: ohne neue Spalten erneut schreiben (PGRST204)", async () => {
  const rows: Record<string, unknown>[] = [];
  const sb = {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        rows.push(row);
        return { error: "kurz_titel" in row ? { code: "PGRST204", message: "Could not find the 'kurz_grund' column" } : null };
      },
    }),
  };
  const err = await insertDecision(sb, { type: "note", subject: "Vorschlag: Versand nur werktags", reasoning: "B2B antwortet werktags. Mehr Text." });
  assert.equal(err, null);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kurz_titel, "Versand nur werktags");
  assert.equal(rows[0].kurz_grund, "B2B antwortet werktags.");
  assert.ok(!("kurz_titel" in rows[1]));
});

test("insertDecision: anderer Fehler wird zurückgegeben, kein zweiter Versuch", async () => {
  let n = 0;
  const sb = { from: () => ({ insert: async () => { n++; return { error: { code: "23514", message: "check" } }; } }) };
  const err = await insertDecision(sb, { subject: "a", reasoning: "b" });
  assert.equal(err?.code, "23514");
  assert.equal(n, 1);
});
