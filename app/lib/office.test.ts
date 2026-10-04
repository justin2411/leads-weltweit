import { test } from "node:test";
import assert from "node:assert/strict";
import { agentNummern, bereichPrefix, kachelWert, plaetze, statusAus, zielProzent, type TaskLite } from "./office.ts";
import { stroeme, stromAmpel } from "./puls.ts";
import type { Bereich } from "./firma.ts";

const B: Bereich = {
  slug: "qualitaet", name: "Qualität", icon: "freigabe", zweck: "", leitung_rolle: "qualitaet", leitung_name: "Qualitäts-Agent", leitung_takt: "",
  mitglieder: [
    { art: "rolle", ref: "qualitaet", name: "Qualitäts-Agent", takt: "täglich 07:50" },
    { art: "workflow", ref: "freigabe-stichprobe.yml", name: "Freigabe-Stichprobe", takt: "täglich" },
    { art: "routine", ref: "Meta", name: "Meta-Review", takt: "21:10" },
    { art: "workflow", ref: "unbekannt.yml", name: "Unbekannt", takt: "" },
  ],
  ziel_key: "lead_fehler", ziel_titel: "Lead-Fehlerquote", ziel_soll: 2, ziel_richtung: "runter", wirkung_key: "bestanden", wirkung_titel: "bestanden", sort: 40,
};
const t = (o: Partial<TaskLite>): TaskLite => ({ id: "x", created_at: "2026-10-04T10:00:00Z", agent: 1, brief: "Auftrag", status: "fertig", result: null, step: null, finished_at: null, ...o });

test("statusAus: läuft vor wartet vor jüngstem Ergebnis", () => {
  assert.equal(statusAus([t({ status: "fertig" }), t({ status: "laeuft" })]), "arbeitet");
  assert.equal(statusAus([t({ status: "fertig" }), t({ status: "offen" })]), "wartet");
  assert.equal(statusAus([t({ status: "fehler", finished_at: "2026-10-04T12:00:00Z" }), t({ status: "fertig", finished_at: "2026-10-04T11:00:00Z" })]), "fehler");
  assert.equal(statusAus([t({ status: "abgebrochen" })]), null);
});

test("agentNummern liest Bereiche und Einzelne", () => {
  assert.deepEqual(agentNummern("1-8"), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(agentNummern("9"), [9]);
  assert.deepEqual(agentNummern("x"), []);
});

test("plaetze: Status aus Aufträgen, Werken und Routinen; fehlende Quellen = –", () => {
  const tasks = [
    t({ id: "a", rolle: "qualitaet", status: "laeuft", brief: "Fehlerquote prüfen" }),
    t({ id: "b", brief: `${bereichPrefix("Qualität")} Stichprobe FR`, status: "offen" }),
    t({ id: "c", routine_id: "r1", status: "fertig", result: "3 Funde" }),
  ];
  const p = plaetze(B, {
    roles: [{ slug: "qualitaet", name: "Qualitäts-Agent", aktiv: true, department: "qualitaet", takt: null }, { slug: "lead_pruefer", name: "Lead-Prüfer", aktiv: true, department: "qualitaet", takt: "stündlich" }],
    routines: [{ id: "r1", name: "Meta", aktiv: true, last_run_at: null, last_task_id: null, last_result: null }], web: [], tasks, werkLive: { freigabe: false },
  });
  const by = Object.fromEntries(p.map((x) => [x.name, x]));
  assert.equal(p[0].name, "Qualitäts-Agent");
  assert.equal(by["Qualitäts-Agent"].leitung, true);
  assert.equal(by["Qualitäts-Agent"].status, "arbeitet");
  assert.equal(by["Qualitäts-Agent"].zeilen.length, 2);
  assert.equal(by["Freigabe-Stichprobe"].status, "wartet");
  assert.equal(by["Unbekannt"].status, "–");
  assert.equal(by["Meta-Review"].status, "fertig");
  assert.equal(by["Meta-Review"].zeilen[0].ergebnis, "3 Funde");
  assert.ok(by["Lead-Prüfer"], "Fach-Agent mit department kommt dazu");
  const ohne = plaetze(B, { roles: null, routines: null, web: null, tasks: null, werkLive: null });
  assert.ok(ohne.every((x) => x.status === "–"));
});

test("Zeilen sind kurz (1 Zeile)", () => {
  const p = plaetze(B, { roles: [], routines: [], web: [], werkLive: null, tasks: [t({ rolle: "qualitaet", brief: "x".repeat(200), result: "y".repeat(300) })] });
  const z = p.find((x) => x.ref === "qualitaet")!.zeilen[0];
  assert.ok(z.text.length <= 60 && z.ergebnis.length <= 90);
});

test("zielProzent und kachelWert", () => {
  const bild = { ziel: { ist: 4, soll: 2, text: "4 % / 2 %", ampel: "gold" as const, quelle: "bereich" as const }, ziel_richtung: "runter" as const };
  assert.equal(zielProzent(bild), 0.5);
  assert.equal(kachelWert(bild), "4 %");
  assert.equal(zielProzent({ ...bild, ziel: { ...bild.ziel, soll: null } }), null);
  assert.equal(kachelWert({ ziel: { ...bild.ziel, text: "–" } }), "–");
});

test("Puls: Ampeln und fehlende Zahlen", () => {
  assert.equal(stromAmpel("live"), "green");
  assert.equal(stromAmpel("idle"), "gold");
  assert.equal(stromAmpel("off"), "red");
  assert.equal(stromAmpel(null), "grey");
  const s = stroeme({ leads24: null, leadState: "live", kaeufer24: 12, kaeuferState: "idle", sentToday: 40, cap: 90, versandState: "live", versandAus: "Notbremse",
    replies7: 3, offen: 2, antwortState: "live", umsatz: "0", kunden: 0 });
  const by = Object.fromEntries(s.map((x) => [x.key, x]));
  assert.equal(by.leads.wert, "–");
  assert.equal(by.leads.ampel, "grey");
  assert.equal(by.kaeufer.ampel, "gold");
  assert.equal(by.versand.ampel, "red");
  assert.equal(by.antworten.wert, "2");
  assert.equal(by.antworten.ampel, "gold");
  assert.equal(by.umsatz.ampel, "grey");
  assert.ok(s.every((x) => x.label.length <= 60));
});
