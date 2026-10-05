import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ampelLuecke, begrenzePartikel, freigabeTon, kurz, lernPhase, lernSegmente, notbremseAnzeige, partikel, plaetzeDiff, pulsStatus, speicherTon, staus, zielRing,
  cronBerlin, naechsterLauf, rateKurz, taktAnzeige,
} from "./zentrale-logik.ts";
import { bereicheBild, kantenBild, lage, leitplankenBild, plaetzeBild, rechtLaender, werkeBild } from "./zentrale-modell.ts";
import OPS from "./ops-config.json" with { type: "json" };
import type { Langsam, Schnell } from "./zentrale-typen.ts";

const NOW = Date.parse("2026-10-05T10:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const W = (id: string, extra: Record<string, unknown> = {}) => ({ id, status: "laeuft" as const, ...extra });

test("Puls: Herzschlag-Grenze 6 min", () => {
  assert.equal(pulsStatus(W("lead"), NOW, { beats: { "lead-werk": ago(5.9) } }), "live");
  assert.equal(pulsStatus(W("lead"), NOW, { beats: { "lead-werk": ago(6.1) } }), "still");
  assert.equal(pulsStatus(W("lead"), NOW, { beats: {} }), "grau");
});

test("Puls mit Ersatzkennung: Versand 70 min, Antworten 15 min, Wachhund 20 min", () => {
  assert.equal(pulsStatus(W("versand"), NOW, { beats: {}, lastSent: ago(69) }), "live~");
  assert.equal(pulsStatus(W("versand"), NOW, { beats: {}, lastSent: ago(71) }), "still");
  assert.equal(pulsStatus(W("antworten"), NOW, { beats: {}, acks: { antworten: ago(14) } }), "live~");
  assert.equal(pulsStatus(W("antworten"), NOW, { beats: {}, acks: { antworten: ago(16) } }), "still");
  assert.equal(pulsStatus(W("wachhund"), NOW, { beats: {}, cacheAt: ago(19) }), "live~");
  assert.equal(pulsStatus(W("wachhund"), NOW, { beats: {}, cacheAt: null }), "grau");
  assert.equal(pulsStatus(W("stichprobe"), NOW, { beats: {}, runsLast: { stichprobe: ago(60 * 25) } }), "live~");
  assert.equal(pulsStatus(W("kontakt", { status: "fehlt" }), NOW, { beats: { "lead-werk": ago(1) } }), "grau");
});

test("Partikel: 0/h keine, 6/h langsam, 100.000/h schnell, Handy begrenzt", () => {
  assert.equal(partikel(0), null);
  assert.equal(partikel(-3), null);
  const sechs = partikel(6)!;
  assert.equal(sechs.dauer, 8);
  assert.equal(sechs.n, 2);
  const viel = partikel(100_000)!;
  assert.equal(viel.dauer, 1.6);
  assert.equal(viel.n, 3);
  assert.equal(partikel(100_000, true)!.n, 2);
  const alle = begrenzePartikel(Array.from({ length: 30 }, () => ({ n: 3, dauer: 1 })));
  assert.equal(alle.reduce((a, k) => a + (k?.n ?? 0), 0), 40);
  const handy = begrenzePartikel(Array.from({ length: 30 }, () => ({ n: 2, dauer: 1 })), true);
  assert.equal(handy.reduce((a, k) => a + (k?.n ?? 0), 0), 20);
});

test("Lernring: nur Daten der ersten 4 Schritte → Messen und Lehre grau", () => {
  const seg = lernSegmente({ zahlen: "08:10", luecke: 5, auftrag: 2, umsetzen: 1, messen: 0, lehre: 0 });
  assert.deepEqual(seg.map((s) => s.grau), [false, false, false, false, true, true]);
  assert.equal(seg[4].zahl, "0");
  assert.equal(lernSegmente({ zahlen: null, luecke: null, auftrag: null, umsetzen: null, messen: null, lehre: null })[0].grau, true);
});

test("Lernphase: Vorrang unter frischen Ereignissen, sonst jüngstes", () => {
  assert.equal(lernPhase([{ phase: "zahlen", at: ago(5) }, { phase: "umsetzen", at: ago(50) }, { phase: "auftrag", at: ago(2) }], NOW), "umsetzen");
  assert.equal(lernPhase([{ phase: "zahlen", at: ago(500) }, { phase: "lehre", at: ago(300) }], NOW), "lehre");
  assert.equal(lernPhase([{ phase: "messen", at: null }], NOW), null);
});

test("Notbremse: 11/156 = rote Zahl, Status bleibt die Bewertung aus deliverability", () => {
  const a = notbremseAnzeige(11, 156, { stop: null });
  assert.equal(a.zahlTon, "rot");
  assert.equal(a.status, "nicht aktiv");
  assert.equal(a.zahl, "7 % (11/156)");
  assert.equal(a.greift, false);
  const b = notbremseAnzeige(2, 300, { stop: "Bounce-Quote über 5 %" });
  assert.equal(b.status, "aktiv");
  assert.equal(b.zahlTon, "gruen");
  assert.equal(notbremseAnzeige(6, 50, { stop: null }).zahlTon, "grau");
  assert.equal(notbremseAnzeige(13, 300, { stop: null }).zahlTon, "gelb");
  assert.equal(notbremseAnzeige(1, 100, null).status, "unbekannt");
});

test("Stau ab Faktor 50", () => {
  assert.deepEqual(staus([{ id: "a", ein: 9389, aus: 153 }, { id: "b", ein: 7000, aus: 153 }, { id: "c", ein: 50, aus: 0 }, { id: "d", ein: 0, aus: 0 }]), ["a", "c"]);
});

test("plaetzeDiff: nur geänderte Linien", () => {
  assert.deepEqual(plaetzeDiff({ "web-us": 2, "web-uk": 4 }, { "web-us": 4, "web-uk": 4, "web-fr": 1 }), [
    { linie: "web-fr", von: 0, nach: 1, delta: 1 }, { linie: "web-us", von: 2, nach: 4, delta: 2 },
  ]);
  assert.deepEqual(plaetzeDiff({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(plaetzeDiff(null, { a: 1 }), []);
});

test("Ziel mit Quelle „vorschlag“ ist unbestätigt; runter-Ziele rechnen Soll ÷ Ist", () => {
  assert.equal(zielRing({ soll: 1290, quelle: "vorschlag" }, 0).unbestaetigt, true);
  assert.equal(zielRing({ soll: 1290, quelle: "inhaber" }, 645).anteil, 0.5);
  assert.equal(zielRing({ soll: 2, richtung: "runter", quelle: "inhaber" }, 4).anteil, 0.5);
  assert.equal(zielRing(null, 3).leer, true);
});

test("kurz(): Titel ≤ 60, Grund ≤ 160", () => {
  const k = kurz("x".repeat(80), "y".repeat(200));
  assert.equal(k.titel.length, 60);
  assert.equal(k.grund.length, 160);
  assert.ok(k.titel.endsWith("…"));
  assert.deepEqual(kurz("kurz", null), { titel: "kurz", grund: "" });
});

test("Ampeln: Lücke Rang 1 rot, 2–3 gelb; Freigabe/Speicher-Schwellen", () => {
  assert.equal(ampelLuecke(1, 1), "rot");
  assert.equal(ampelLuecke(3, 0.4), "gelb");
  assert.equal(ampelLuecke(5, 0.3), "gruen");
  assert.equal(ampelLuecke(1, 0.01), "gruen");
  assert.equal(ampelLuecke(6, null), "grau");
  assert.equal(freigabeTon(3.14), "gelb");
  assert.equal(freigabeTon(5.1), "rot");
  assert.equal(freigabeTon(null), "grau");
  assert.equal(speicherTon(5.1), "gruen");
  assert.equal(speicherTon(6), "gelb");
  assert.equal(speicherTon(7.5), "rot");
});

test("Modell ohne Daten: grau statt Fehler (leerer Zustand)", () => {
  const w = werkeBild(null, null, NOW);
  assert.equal(w.lead.puls, "grau");
  assert.equal(w.lead.zahl, "–");
  assert.equal(w.kontakt.fehlt, false);
  assert.equal(w.kontakt.puls, "grau");
  assert.equal(w.feedback.fehlt, true);
  assert.ok(kantenBild(null, null).every((k) => k.proStunde === 0));
  assert.ok(bereicheBild(null).every((b) => b.ton === "grau"));
  assert.ok(leitplankenBild(null, null, []).some((p) => p.id === "notbremse" && p.wort === "unbekannt"));
  assert.equal(lage(null).titel, "Keine Live-Daten");
});

test("Modell mit Daten: Stau am Versand, Lage aus Rang 1", () => {
  const s = {
    now: new Date(NOW).toISOString(), beats: [{ werk: "lead-werk", last_beat: ago(2), plaetze: 4, processed_60m: 900, green_60m: 120 }], tasks: [], handoffs: [],
    gaps: [{ slug: "vertrieb", ziel_key: "antwortquote", ist: 0, soll: 3, luecke: 1, rang: 1, titel: "Antworten fehlen", grund: "0 % statt 3 %", modus: "auftrag", updated_at: ago(5) }],
    owner: {}, brain_enabled: true, plan_log: [], msg: { sent_60m: 4, sent_24h: 153, sent_heute: 20, last_sent_at: ago(10), blocked_60m: 3, freigegeben: 9389 },
    ev24: { sent: 156, bounced: 11 }, replies: { offen: 1, heiss: 0 }, acks: {}, starts: [], subs: { aktiv: 0, neueste: null }, held_60m: 0, ticker: [],
  } as Schnell;
  const k = kantenBild(s, null as Langsam | null);
  assert.equal(k.find((x) => x.id === "kunden-versand")!.stau, true);
  assert.equal(k.find((x) => x.id === "lead-pruefer")!.proStunde, 120);
  assert.equal(lage(s).titel, "Antworten fehlen");
  assert.equal(werkeBild(s, null, NOW).lead.puls, "live");
  assert.equal(bereicheBild(s).find((b) => b.slug === "vertrieb")!.ton, "rot");
});

test("Notbremse-Karte: Zahl eigene Farbe (7 % rot, 4,3 % gelb, unter 100 Mails ohne Farbe)", () => {
  const nb = (bounced: number, sent: number) =>
    leitplankenBild({ ev24: { bounced, sent }, gaps: [] } as unknown as Schnell, { bremse: { stop: null }, sperre: { gesamt: 0, neu_24h: 0 } } as unknown as Langsam, []).find((p) => p.id === "notbremse")!;
  assert.equal(nb(11, 156).zahlTon, "rot");
  assert.equal(nb(11, 156).ton, "gruen");
  assert.equal(nb(13, 300).zahlTon, "gelb");
  assert.equal(nb(3, 50).zahlTon, "grau");
});

test("Kaltmail-Recht: so viele freie Länder wie allowed: true in ops-config.json", () => {
  const countries = (OPS as unknown as { countries: Record<string, { allowed?: boolean }> }).countries;
  const frei = Object.values(countries).filter((c) => c.allowed === true).length;
  const r = leitplankenBild(null, null, rechtLaender(countries)).find((p) => p.id === "recht")!;
  assert.equal(r.zahl, String(frei));
  assert.ok(frei >= 3);
  for (const c of ["DE", "IE", "BE", "NL"]) assert.equal(rechtLaender(countries).find((x) => x.c === c)?.allowed, false, c);
});

test("Takt in Berliner Zeit: Sommer und Winter (Cron bleibt UTC)", () => {
  const sommer = Date.parse("2026-10-05T10:00:00Z"), winter = Date.parse("2026-11-02T10:00:00Z");
  assert.equal(cronBerlin("53 4 * * 1", sommer), "Mo 06:53");
  assert.equal(cronBerlin("53 4 * * 1", winter), "Mo 05:53");
  assert.equal(cronBerlin("47 * * * *", winter), "stündlich :47");
  assert.equal(cronBerlin("*/10 * * * *", winter), null);
  assert.equal(naechsterLauf("53 4 * * 1", Date.parse("2026-10-05T04:54:00Z"))!.toISOString(), "2026-10-12T04:53:00.000Z");
  assert.equal(taktAnzeige({ cron_utc: ["7 5 * * *", "47 * * * *"], takt: "x" }, winter), "06:07 · stündlich :47");
  assert.equal(taktAnzeige({ cron_utc: ["23 */3 * * *"], takt: "alle 3 h :23" }, winter), "alle 3 h :23");
  assert.equal(taktAnzeige({ cron_utc: ["11 * * * *"], takt: "durchgehend" }, winter), "durchgehend");
  assert.equal(werkeBild(null, null, winter).lieferung.zahl, "Mo 05:53");
  assert.equal(werkeBild(null, null, sommer).lieferung.zahl, "Mo 06:53");
});

test("Durchsatz kurz: höchstens 6 Zeichen", () => {
  assert.equal(rateKurz(4200), "4,2k/h");
  assert.equal(rateKurz(7900), "7,9k/h");
  assert.equal(rateKurz(12_500), "13k/h");
  assert.equal(rateKurz(6), "6/h");
  assert.equal(rateKurz(0), "0/h");
  for (const n of [0.4, 9, 999, 1000, 9999, 99_999, 2_500_000]) assert.ok(rateKurz(n).length <= 6, rateKurz(n));
});

test("Plätze: je Werk die letzte Verteilung (Kunden-Werk zählt mit), Diff zwischen zwei verschiedenen Plänen", () => {
  const s = { beats: [], tasks: [], acks: {}, owner: {}, msg: { sent_60m: 0, sent_24h: 0, sent_heute: 0, last_sent_at: null, blocked_60m: 0 }, replies: { offen: 0, heiss: 0 }, plan_log: [
    { werk: "lead-werk", at: ago(10), mode: "autopilot", bremse: "aus", plan: { "web-us": 4 }, reasons: { "web-us": "mehr grün" } },
    { werk: "kunden-werk", at: ago(20), mode: "autopilot", bremse: "aus", plan: { kunden: 3 }, reasons: null },
    { werk: "lead-werk", at: ago(200), mode: "autopilot", bremse: "aus", plan: { "web-us": 2 }, reasons: null },
  ] } as unknown as Schnell;
  const p = plaetzeBild(s);
  assert.equal(p.geplant, 7);
  assert.deepEqual(p.diffs.map((d) => [d.werk, d.linie, d.von, d.nach]), [["lead-werk", "web-us", 2, 4]]);
  assert.equal(werkeBild(s, null, NOW).kunden.plaetze!.ist, 3);
});
