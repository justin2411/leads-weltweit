import { test } from "node:test";
import assert from "node:assert/strict";
import { BD_GRUND_MAX, BD_TITEL_MAX, bdZaehler, brauchtDich, type BdInput } from "./braucht-dich.ts";

const OK: BdInput = { decisions: [], seedRows: 3, dispatch: true, legalOpen: 0, legalReady: true, signaturFiles: [], signaturDecided: false, slotPlan: { "s2-neu": 1 } };

test("alles erledigt → keine Punkte", () => {
  assert.deepEqual(brauchtDich(OK), []);
});

test("feste Prüfungen erscheinen und verschwinden mit dem Zustand", () => {
  const all = brauchtDich({ ...OK, seedRows: 0, dispatch: false, legalOpen: 2, signaturFiles: ["scripts/drafts.py"], slotPlan: { "s2-neu": 0 } });
  assert.deepEqual(all.map((x) => x.key), ["legal", "signatur", "seed", "s2neu", "dispatch"]);
  assert.equal(all[0].tone, "red");
  assert.equal(all.at(-1)!.tone, "grey");
  // Signatur entschieden, Prüfung unlesbar (null) → kein Punkt, kein Fehlalarm
  const k = brauchtDich({ ...OK, signaturFiles: ["x"], signaturDecided: true, seedRows: null, slotPlan: null, legalReady: null }).map((x) => x.key);
  assert.deepEqual(k, []);
  assert.deepEqual(brauchtDich({ ...OK, legalReady: false }).map((x) => [x.key, x.title]), [["legal", "Rechtstexte freigeben"]]);
});

test("Inhaber-Entscheidungen: Kurzspalten, Grenzen, Aktion „Erledigt“", () => {
  const long = "x ".repeat(200);
  const [d] = brauchtDich({ ...OK, decisions: [{ id: 50, subject: long, reasoning: `${long}. Zweiter Satz.`, action: "Inhaber liefert Texte" }] });
  assert.equal(d.key, "d50");
  assert.equal(d.act, "erledigt");
  assert.ok(d.title.length <= BD_TITEL_MAX && d.reason.length <= BD_GRUND_MAX);
  assert.match(d.detail, /Inhaber liefert Texte/);
  const [k] = brauchtDich({ ...OK, decisions: [{ id: "7", subject: "lang", kurz_titel: "Kurz", kurz_grund: "Ein Satz." }] });
  assert.deepEqual([k.title, k.reason], ["Kurz", "Ein Satz."]);
});

test("alle Texte halten die Längen ein", () => {
  for (const x of brauchtDich({ ...OK, seedRows: 0, dispatch: false, legalOpen: 3, signaturFiles: ["a", "b", "c"], slotPlan: { "s2-neu": 0 } })) {
    assert.ok(x.title.length <= 60, x.title);
    assert.ok(x.reason.length <= 160, x.reason);
  }
});

test("Zähler-Text", () => {
  assert.equal(bdZaehler(1), "1 braucht dich");
  assert.equal(bdZaehler(2), "2 brauchen dich");
});
