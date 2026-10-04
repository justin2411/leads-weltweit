import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FlowInputError, branchOf, catalog, defaultFlow, edgesOf, freeTile, hrefOf, insertNode, mergeSetting, moveNode, normalize,
  removeNode, replaceNode, sameFlow, savedFlow, sideNodes, stageLabel, stagesOf, swapNodes, validateFlow, type LivePage,
} from "./website-flow.ts";

const PAGES: LivePage[] = [
  { slug: "fr/agences-web", segment: "S2", country: "FR" },
  { slug: "uk/web-agencies", segment: "S2", country: "UK" },
  { slug: "us/web-agencies", segment: "S2", country: "US" },
  { slug: "uk/recruitment", segment: "S1", country: "UK" },
];
const ids = (l: { id: string }[]) => l.map((n) => n.id);
const base = () => defaultFlow("S2", PAGES);

test("Standardfluss Webagenturen: Landing je Land → Tarif → Checkout → Danke, Recht als Nebenzweig", () => {
  const st = stagesOf(base());
  assert.equal(st.length, 4);
  assert.deepEqual(ids(st[0]), ["lp:us/web-agencies", "lp:uk/web-agencies", "lp:fr/agences-web"]);
  assert.deepEqual(ids(st[1]), ["tarif:us/web-agencies", "tarif:uk/web-agencies", "tarif:fr/agences-web"]);
  assert.equal(st[1][1].path, "/uk/web-agencies/start");
  assert.deepEqual(ids(st[2]), ["checkout"]);
  assert.deepEqual(ids(st[3]), ["danke"]);
  assert.deepEqual(sideNodes(base()).map((n) => n.title), ["Impressum", "Datenschutz", "AGB"]);
  assert.deepEqual(st.map(stageLabel), ["Einstieg", "Tarif", "Zahlung", "Abschluss"]);
  assert.ok(!base().some((n) => n.id.includes("recruitment")), "andere Branche nicht im Standardfluss");
});

test("Ohne Live-Seiten: Checkout und Danke bleiben", () => {
  assert.deepEqual(stagesOf(defaultFlow("S2", [])).map(ids), [["checkout"], ["danke"]]);
});

test("Branche: nur aktive, sonst Webagenturen", () => {
  assert.equal(branchOf("s2"), "S2");
  assert.equal(branchOf("S1"), "S2");
  assert.equal(branchOf(undefined), "S2");
});

test("Katalog enthält alle Seiten aller Branchen, ohne Doppel", () => {
  const c = catalog(PAGES);
  assert.ok(c.some((p) => p.id === "lp:uk/recruitment"));
  assert.ok(c.some((p) => p.id === "recht:mentions-legales"));
  assert.equal(new Set(ids(c)).size, c.length);
});

test("Leitungen nur zum gleichen Land; ohne Land zu allen; Nebenzweig gestrichelt", () => {
  const e = edgesOf(base());
  const from = (id: string) => e.filter((x) => x.from === id && !x.side).map((x) => x.to);
  assert.deepEqual(from("lp:uk/web-agencies"), ["tarif:uk/web-agencies"]);
  assert.deepEqual(from("tarif:fr/agences-web"), ["checkout"]);
  assert.deepEqual(from("checkout"), ["danke"]);
  assert.equal(e.filter((x) => x.side).length, 3);
  assert.ok(e.filter((x) => x.side).every((x) => x.from === "lp:fr/agences-web"));
});

test("Vertauschen: zwei Seiten tauschen Platz, auch mit dem Nebenzweig", () => {
  const s = swapNodes(base(), "lp:us/web-agencies", "lp:fr/agences-web");
  assert.deepEqual(ids(stagesOf(s)[0]), ["lp:fr/agences-web", "lp:uk/web-agencies", "lp:us/web-agencies"]);
  const t = swapNodes(base(), "danke", "recht:agb");
  assert.deepEqual(ids(stagesOf(t)[3]), ["recht:agb"]);
  assert.equal(sideNodes(t)[2].id, "danke");
  assert.equal(t.find((n) => n.id === "recht:agb")!.side, undefined);
});

test("Verschieben: in andere Stufe, neue Stufe, Nebenzweig; leere Stufen fallen weg", () => {
  // einzige Seite einer Stufe ans Ende einer späteren Stufe: Stufen-Nummer bleibt gültig
  const a = moveNode(base(), "checkout", { kind: "stage", stage: 3 });
  assert.deepEqual(stagesOf(a).map(ids).slice(2), [["danke", "checkout"]]);
  const b = moveNode(base(), "danke", { kind: "newStage", at: 0 });
  assert.deepEqual(ids(stagesOf(b)[0]), ["danke"]);
  assert.equal(stagesOf(b).length, 4);
  const c = moveNode(base(), "lp:uk/web-agencies", { kind: "stage", stage: 0, index: 0 });
  assert.deepEqual(ids(stagesOf(c)[0]), ["lp:uk/web-agencies", "lp:us/web-agencies", "lp:fr/agences-web"]);
  const d = moveNode(base(), "checkout", { kind: "side", index: 0 });
  assert.equal(sideNodes(d)[0].id, "checkout");
  assert.equal(stagesOf(d).length, 3);
  const e = moveNode(base(), "recht:agb", { kind: "stage", stage: 99 });
  assert.deepEqual(ids(stagesOf(e)[4]), ["recht:agb"]);
  assert.deepEqual(moveNode(base(), "fehlt", { kind: "side" }), normalize(base()));
});

test("Einfügen aus der Liste und freie Kachel; doppelt verboten", () => {
  const c = catalog(PAGES);
  const start = c.find((p) => p.id === "seite:start")!;
  const a = insertNode(base(), start, { kind: "newStage", at: 0 });
  assert.deepEqual(ids(stagesOf(a)[0]), ["seite:start"]);
  assert.throws(() => insertNode(a, start, { kind: "side" }), FlowInputError);
  const f = freeTile("  Blog  ", "/blog", "ab12");
  assert.deepEqual(f, { id: "frei:ab12", kind: "frei", title: "Blog", path: "/blog", country: "" });
  const b = insertNode(base(), f, { kind: "stage", stage: 2, index: 0 });
  assert.deepEqual(ids(stagesOf(b)[2]), ["frei:ab12", "checkout"]);
  assert.throws(() => freeTile("", "/x"), /Titel fehlt/);
  assert.throws(() => freeTile("X", "javascript:alert(1)"), /Pfad/);
  assert.throws(() => freeTile("X", "//evil.example"), /Pfad/);
  assert.throws(() => freeTile("<b>", "/x"), /Titel/);
});

test("Ersetzen: Platz bleibt, Inhalt neu; schon vorhandene Seite verboten", () => {
  const c = catalog(PAGES);
  const r = replaceNode(base(), "lp:uk/web-agencies", c.find((p) => p.id === "lp:uk/recruitment")!);
  assert.equal(stagesOf(r)[0][1].id, "lp:uk/recruitment");
  assert.throws(() => replaceNode(base(), "checkout", c.find((p) => p.id === "danke")!), /schon im Flow/);
  assert.throws(() => replaceNode(base(), "fehlt", c[0]), FlowInputError);
});

test("Entfernen nur aus der Anzeige", () => {
  const r = removeNode(base(), "checkout");
  assert.deepEqual(stagesOf(r).map(ids).slice(2), [["danke"]]);
});

test("Prüfung: gültige Anordnung, Fehler bei Unsinn", () => {
  assert.deepEqual(validateFlow(base()), normalize(base()));
  assert.throws(() => validateFlow("x"), FlowInputError);
  assert.throws(() => validateFlow([{ id: "a:b", kind: "x", title: "T", path: "", country: "", order: 0 }]), /Seitenart/);
  assert.throws(() => validateFlow([{ id: "a:b", kind: "frei", title: "T", path: "", country: "", order: -1 }]), /Stufe/);
  assert.throws(() => validateFlow([...base(), base()[0]]), /doppelt/);
  assert.throws(() => validateFlow(Array.from({ length: 61 }, (_, i) => ({ id: `frei:a${i}`, kind: "frei", title: "T", path: "", country: "", order: 0 }))), /Höchstens/);
});

test("Speichern: nur die Branche ersetzen; Laden fällt bei Unsinn auf Standard zurück", () => {
  const s1 = mergeSetting({ S1: { nodes: base() }, XX: { nodes: [] }, S4: { nodes: "kaputt" } }, "S2", base());
  assert.deepEqual(Object.keys(s1).sort(), ["S1", "S2"]);
  assert.throws(() => mergeSetting({}, "S7", base()), /Branche/);
  assert.deepEqual(savedFlow(s1, "S2"), normalize(base()));
  assert.equal(savedFlow({ S2: { nodes: "x" } }, "S2"), null);
  assert.equal(savedFlow(null, "S2"), null);
});

test("Gleich-Vergleich und Links", () => {
  assert.ok(sameFlow(base(), normalize(base())));
  assert.ok(!sameFlow(base(), removeNode(base(), "danke")));
  assert.equal(hrefOf({ path: "/uk/web-agencies" }, "https://www.nextgen-profit.de/"), "https://www.nextgen-profit.de/uk/web-agencies");
  assert.equal(hrefOf({ path: "" }, "https://x.de"), "");
  assert.equal(hrefOf({ path: "https://checkout.stripe.com" }, "https://x.de"), "https://checkout.stripe.com");
});
