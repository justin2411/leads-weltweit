import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as recht from "./zentrale/recht.ts";
import * as betrieb from "./zentrale/betrieb.ts";
import * as protokoll from "./zentrale/protokoll.ts";
// @ts-expect-error – Erzeuger ist .mjs ohne Typen
import { parseCountryRules, parseRechtTabelle } from "../scripts/ops-config.mjs";

const now = new Date("2026-10-04T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

// ------------------------------------------------------------------------------------------------- Recht
const cfg: recht.RechtCfg = {
  laender: {
    US: { allowed: true, never: false, generic_only: false, company_forms_only: false, daily_limit: 110, open_question: null },
    UK: { allowed: true, never: false, generic_only: true, company_forms_only: true, daily_limit: 100, open_question: "Reicht info@?" },
    SE: { allowed: true, never: false, generic_only: true, company_forms_only: true, daily_limit: 20, open_question: null },
    IE: { allowed: false, never: true, generic_only: true, company_forms_only: true, daily_limit: 30, open_question: "nie gefragt" },
    DE: { allowed: false, never: false, generic_only: false, company_forms_only: false, daily_limit: null, open_question: null },
  },
  tabelle: [
    { code: "US", name: "USA", einzel: "Ja", firmen: "Ja", bedingung: "Opt-out", risiko: "gering" },
    { code: "UK", name: "UK", einzel: "Nein", firmen: "Ja", bedingung: "Opt-out", risiko: "mittel" },
    { code: "IE", name: "Irland", einzel: "Nein", firmen: "Ja", bedingung: "", risiko: "sehr hoch" },
    { code: "DE", name: "Deutschland", einzel: "Nein", firmen: "Nein", bedingung: "–", risiko: "Abmahnung" },
  ],
};

test("Recht: Länder-Ampel – sendet grün, frei gelb, gesperrt grau, nie rot; strengere Regel gilt", () => {
  const l = recht.laender(cfg, { versandAn: true, fokus: ["US", "UK", "FR"], aus: [] });
  const by = Object.fromEntries(l.map((x) => [x.code, x]));
  assert.equal(by.US.ampel, "green");
  assert.equal(by.US.einzel, true);
  assert.equal(by.UK.ampel, "green");
  assert.equal(by.UK.einzel, false, "UK: Einzelunternehmer nein");
  assert.equal(by.UK.nurAllgemein, true);
  assert.equal(by.SE.ampel, "gold", "erlaubt, aber nicht im Fokus");
  assert.equal(by.SE.name, "SE", "ohne Tabellenzeile: Code");
  assert.equal(by.IE.ampel, "red");
  assert.equal(by.IE.firmen, false, "nie = niemand");
  assert.equal(by.DE.ampel, "grey");
  assert.deepEqual(l.map((x) => x.stand), ["sendet", "sendet", "frei", "gesperrt", "nie"]);
});

test("Recht: Versand aus oder Land aus → nur noch gelb", () => {
  assert.ok(recht.laender(cfg, { versandAn: false, fokus: ["US"], aus: [] }).every((x) => x.stand !== "sendet"));
  const l = recht.laender(cfg, { versandAn: true, fokus: ["US", "UK"], aus: ["UK"] });
  assert.equal(l.find((x) => x.code === "UK")!.ampel, "gold");
});

test("Recht: Sperrliste je Grund, 7 Tage und Trend", () => {
  const s = recht.sperren([
    { reason: "unsubscribe", created_at: ago(2) }, { reason: "bounce", created_at: ago(30) }, { reason: "complaint", created_at: ago(24 * 9) },
    { reason: "bounce", created_at: ago(24 * 20) }, { reason: "manuell", created_at: ago(1) },
  ], now);
  assert.equal(s.gesamt, 5);
  assert.equal(s.d7, 3);
  assert.equal(s.vorher7, 1);
  assert.deepEqual(s.je.bounce, { gesamt: 2, d7: 1 });
  assert.deepEqual(s.je.beschwerde, { gesamt: 1, d7: 0 });
  assert.equal(s.je.sonst.gesamt, 1);
  assert.equal(recht.trendVon(s.d7, s.vorher7), "hoch");
  assert.equal(recht.trendVon(0, 0), null);
});

test("Recht: Abmelde-Check", () => {
  const ok = { probe: 404, sent7: 100, ohneToken: 0, siteHttps: true };
  assert.equal(recht.abmeldeCheck(ok).ampel, "green");
  assert.equal(recht.abmeldeCheck({ ...ok, ohneToken: 2 }).ampel, "red");
  assert.equal(recht.abmeldeCheck({ ...ok, probe: 500 }).ampel, "red");
  assert.equal(recht.abmeldeCheck({ ...ok, probe: null }).ampel, "grey");
  assert.equal(recht.abmeldeCheck({ ...ok, probe: 200 }).ampel, "gold");
  assert.equal(recht.abmeldeCheck({ ...ok, siteHttps: false }).ampel, "gold");
  for (const c of [ok, { ...ok, ohneToken: 3 }]) assert.ok(recht.abmeldeCheck(c).titel.length <= 60 && recht.abmeldeCheck(c).grund.length <= 160);
});

test("Recht: Rechtstexte und offene Fragen", () => {
  const doc = (title: string, placeholder = false, laenge = 500) => ({ key: title, title, placeholder, laenge });
  assert.equal(recht.rechtstexte([doc("Impressum"), doc("AGB")], true).ampel, "green");
  assert.equal(recht.rechtstexte([doc("Impressum"), doc("AGB")], false).ampel, "gold");
  const r = recht.rechtstexte([doc("Impressum", true), doc("AGB", false, 10)], true);
  assert.equal(r.ampel, "red");
  assert.deepEqual(r.luecken, ["Impressum", "AGB"]);
  const f = recht.offeneFragen(cfg);
  assert.equal(f[0].titel, "Art. 14 DSGVO bei Lead-Weitergabe");
  assert.equal(f.length, 2, "UK-Frage ja, IE (nie) nein");
  assert.ok(f.every((x) => x.titel.length <= 60 && x.grund.length <= 160));
});

test("Recht: Kennzahl", () => {
  const gruen = { ampel: "green" as const, titel: "", grund: "" };
  const base = { beschwerden30: 0, abmelde: gruen, texte: { ampel: "green" as const }, sperren: recht.sperren([{ reason: "bounce", created_at: ago(1) }], now) };
  assert.deepEqual(recht.kpiAus(base), { titel: "Recht", wert: "0 Beschwerden", ampel: "green", trend: "hoch" });
  assert.equal(recht.kpiAus({ ...base, beschwerden30: 1 }).ampel, "red");
  assert.equal(recht.kpiAus({ ...base, beschwerden30: 1 }).wert, "1 Beschwerde");
  assert.equal(recht.kpiAus({ ...base, texte: { ampel: "gold" } }).ampel, "gold");
  assert.equal(recht.kpiAus({ ...base, beschwerden30: null, sperren: null }).ampel, "grey");
  assert.equal(recht.kpiAus({ ...base, beschwerden30: null }).wert, "–");
});

test("Recht: Generator liest countries.yaml und KALTMAIL-RECHT.md", () => {
  const yaml = readFileSync(new URL("../../countries.yaml", import.meta.url), "utf8");
  const md = readFileSync(new URL("../../docs/KALTMAIL-RECHT.md", import.meta.url), "utf8");
  const l = parseCountryRules(yaml) as Record<string, recht.LandRegel>;
  assert.equal(l.DE.allowed, false);
  assert.equal(l.IE.never, true);
  assert.equal(l.UK.company_forms_only, true);
  assert.ok(l.UK.open_question);
  const t = parseRechtTabelle(md) as recht.TabellenZeile[];
  assert.ok(t.length >= 20);
  assert.equal(t.find((x) => x.code === "UK")!.einzel, "Nein");
  // DE/AT/CH/IT/ES/PL/DK nie erlaubt (CLAUDE.md §2)
  for (const c of ["DE", "AT", "CH", "IT", "ES", "PL", "DK"]) assert.equal(l[c]?.allowed, false, c);
  const json = JSON.parse(readFileSync(new URL("./ops-config.json", import.meta.url), "utf8"));
  assert.deepEqual(json.recht.laender, l, "ops-config.json aktuell (node scripts/ops-config.mjs)");
});

// ------------------------------------------------------------------------------------------------- Betrieb
test("Betrieb: größte Plan-Lücke aus Crons", () => {
  assert.equal(betrieb.maxLueckeH(["41 */2 * * *"], now), 2);
  assert.equal(betrieb.maxLueckeH(["11,41 * * * *", "26,56 * * * *"], now), 0.25);
  assert.equal(betrieb.maxLueckeH(["53 4 * * 1"], now), 168);
  assert.equal(betrieb.maxLueckeH([], now), null);
});

test("Betrieb: Workflow-Zeilen aus GitHub und Datenbank", () => {
  const wfs = [
    { file: "a.yml", name: "A", crons: ["0 * * * *"] }, { file: "b.yml", name: "B", crons: ["0 * * * *"] },
    { file: "c.yml", name: "C", crons: ["0 * * * *"] }, { file: "d.yml", name: "D", crons: [] },
  ];
  const run = (file: string, conclusion: string | null, h: number, status = "completed") => ({ file, name: file, status, conclusion, updated_at: ago(h), url: "u" });
  const z = betrieb.workflowZeilen(wfs, [run("a.yml", "success", 0.5), run("b.yml", "failure", 0.5), run("c.yml", "success", 5)], {}, now);
  assert.deepEqual(z.map((x) => x.ampel), ["green", "red", "gold", "grey"]);
  assert.equal(z[2].text, "überfällig");
  const d = betrieb.workflowZeilen(wfs, null, { "a.yml": ago(0.2), "b.yml": ago(10) }, now);
  assert.deepEqual(d.map((x) => [x.ampel, x.quelle]), [["green", "Datenbank"], ["gold", "Datenbank"], ["grey", null], ["grey", null]]);
  assert.equal(d[2].text, "ohne Token");
  assert.equal(betrieb.workflowZeilen(wfs, [run("a.yml", null, 0.1, "in_progress")], {}, now)[0].text, "läuft");
});

test("Betrieb: Postfächer, Speicher, Website, Schalter", () => {
  const rows = [{ box: "main", label: "Haupt", cap: 90, today: 40, d7: 200, total: 900, first_sent: null, last_sent: null },
    { box: "b@x", label: "b@x", cap: 60, today: 10, d7: 30, total: 30, first_sent: null, last_sent: null }];
  const p = betrieb.postfaecher(rows, [{ box: "info@x", sent: 300, bounced: 6, complained: 0, rate: 0.02, tone: "green", codes: {} }]);
  assert.deepEqual(p.map((x) => [x.heute, x.cap, x.ampel]), [[40, 90, "green"], [10, 60, "grey"]]);
  assert.equal(p[1].rate, null);
  assert.equal(betrieb.speicher(3e9, "aus").ampel, "green");
  assert.equal(betrieb.speicher(3e9, "drossel").ampel, "gold");
  assert.equal(betrieb.speicher(3e9, "stopp").ampel, "red");
  assert.equal(betrieb.speicher(null, null).ampel, "grey");
  assert.equal(betrieb.website(90, ago(2), now).ampel, "green");
  assert.equal(betrieb.website(90, ago(48), now).ampel, "gold");
  assert.equal(betrieb.website(50, ago(2), now).ampel, "red");
  assert.equal(betrieb.website(null, null, now).ampel, "grey");
  const s = betrieb.schalter({ versandAktiv: true, sendPaused: false, followup: true, werkePaused: { "lead-werk": ago(3) }, leadSuche: true, kundenSuche: true,
    autopilot: true, autofix: false, notbremse: null });
  const by = Object.fromEntries(s.map((x) => [x.key, x]));
  assert.equal(by.versand.an, true);
  assert.equal(by["lead-werk"].an, false);
  assert.equal(by["lead-werk"].seit, ago(3));
  assert.equal(by.autofix.an, false);
  assert.ok(["abmeldung", "sperrliste", "notbremse", "freigabe"].every((k) => by[k].an && by[k].fest), "Schutz nie aus");
  const stop = betrieb.schalter({ versandAktiv: true, sendPaused: false, followup: true, werkePaused: {}, leadSuche: true, kundenSuche: true, autopilot: true, autofix: true, notbremse: "x" });
  assert.equal(stop.find((x) => x.key === "versand")!.an, false);
});

test("Betrieb: Kennzahl = schlechtester Baustein, grau zählt nicht", () => {
  const lage: betrieb.BetriebLage = {
    workflows: [{ file: "a", name: "A", last: null, ampel: "green", text: "ok", quelle: "GitHub", url: null }, { file: "b", name: "B", last: null, ampel: "grey", text: "", quelle: null, url: null }],
    boxen: [], speicher: betrieb.speicher(3e9, "aus"), web: betrieb.website(90, ago(1), now),
    still: [{ key: "leads", name: "Neue Leads", station: "lead", stufe: "ok", still_h: 1, intervall_h: 1 }], notbremse: null,
  };
  assert.deepEqual(betrieb.kpiAus(lage), { titel: "Betrieb", wert: "4/5 grün", ampel: "green", trend: null });
  assert.equal(betrieb.kpiAus({ ...lage, notbremse: "Bounce" }).ampel, "red");
  assert.equal(betrieb.kpiAus({ ...lage, still: [{ ...lage.still[0], stufe: "gelb" }] }).ampel, "gold");
  assert.equal(betrieb.schlechteste([]), "grey");
});

// ------------------------------------------------------------------------------------------------- Protokoll
test("Protokoll: Quellen → Einträge mit kurzen Texten", () => {
  const d = protokoll.ausDecisions([{ id: 1, created_at: ago(1), status: "done", subject: "Sitzung 12:00: Preis für UK getestet und angepasst auf neue Stufe",
    reasoning: "Mehr Klicks auf Pro. Zweiter Satz mit Details.", kurz_titel: null, kurz_grund: null }]);
  assert.equal(d[0].bereich, "gehirn");
  assert.ok(d[0].titel.length <= 60 && d[0].grund.length <= 160);
  assert.ok(d[0].details);
  const kurz = protokoll.ausDecisions([{ id: 2, created_at: ago(1), subject: "Tagesnotiz", reasoning: "Alles im Plan.", kurz_titel: null, kurz_grund: null }]);
  assert.equal(kurz[0].details, null, "nichts Neues → keine Details");
  const t = protokoll.ausTasks([
    { id: "a", created_at: ago(3), finished_at: ago(2), agent: 2, kind: "leads", market: "UK", brief: "Neue Leads für UK holen", status: "fertig", result: "120 neue Leads." },
    { id: "b", created_at: ago(3), finished_at: null, agent: 1, kind: "leads", market: null, brief: "x", status: "laeuft", result: null },
  ]);
  assert.equal(t.length, 1);
  assert.equal(t[0].at, ago(2));
  assert.match(t[0].titel, /^A2: /);
  const o = protokoll.ausOwnerLog([{ id: 5, action: "setting:send_paused", target: null, new_value: true, created_at: ago(1) },
    { id: 6, action: "jarvis:message", target: null, new_value: { text: "geheim lang" }, created_at: ago(1), created_by: "Inhaber Dashboard" }]);
  assert.equal(o[0].titel, "Einstellung: Versand pausiert");
  assert.equal(o[0].grund, "an");
  assert.ok(!o[1].grund.includes("geheim"), "Chat-Text nur in den Details");
  const w = protokoll.ausWissen([{ id: "k", titel: "Preise", quelle: "Gehirn", created_at: ago(5), updated_at: ago(1) }]);
  assert.equal(w[0].titel, "Wissen aktualisiert: Preise");
});

test("Protokoll: Plan-Log nur bei Änderungen", () => {
  const p = protokoll.ausPlanLog([
    { id: 1, werk: "lead-werk", at: ago(5), mode: "autopilot", bremse: "aus", plan: { a: 1, b: 2 }, reasons: null },
    { id: 2, werk: "lead-werk", at: ago(4), mode: "autopilot", bremse: "aus", plan: { a: 1, b: 2 }, reasons: null },
    { id: 3, werk: "lead-werk", at: ago(3), mode: "autopilot", bremse: "aus", plan: { a: 3, b: 0 }, reasons: { a: "mehr Ertrag" } },
    { id: 4, werk: "kunden-werk", at: ago(3), mode: "autopilot", bremse: "aus", plan: { k: 1 }, reasons: null },
    { id: 5, werk: "lead-werk", at: ago(2), mode: "autopilot", bremse: "drossel", plan: { a: 3, b: 0 }, reasons: null },
  ]);
  assert.deepEqual(p.map((x) => x.id), ["p3", "p5"]);
  assert.equal(p[0].grund, "a 1→3, b 2→0");
  assert.equal(p[0].details, "a: mehr Ertrag");
  assert.equal(p[1].titel, "Lead-Werk: Speicher-Bremse drossel");
});

test("Protokoll: Zeitleiste filtern, zählen, Kennzahl", () => {
  const e = (id: string, h: number, bereich: protokoll.Bereich): protokoll.Eintrag => ({ id, at: ago(h), bereich, titel: id, grund: "", details: null, status: null });
  const all = [e("a", 1, "gehirn"), e("b", 30, "agenten"), e("c", 24 * 10, "werke"), e("d", 2, "inhaber")];
  assert.deepEqual(protokoll.zeitleiste(all, { bereich: null, tage: 7, now }).map((x) => x.id), ["a", "d", "b"]);
  assert.deepEqual(protokoll.zeitleiste(all, { bereich: "werke", tage: 30, now }).map((x) => x.id), ["c"]);
  assert.deepEqual(protokoll.zaehlen(all, 7, now), { gehirn: 1, agenten: 1, werke: 0, inhaber: 1 });
  assert.equal(protokoll.nachTag(protokoll.zeitleiste(all, { bereich: null, tage: 30, now })).length, 3);
  assert.deepEqual(protokoll.kpiAus(all, now), { titel: "Protokoll", wert: "2 in 24 h", ampel: "green", trend: "hoch" });
  assert.equal(protokoll.kpiAus([], now).ampel, "grey");
});
