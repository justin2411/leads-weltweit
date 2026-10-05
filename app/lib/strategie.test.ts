import { test } from "node:test";
import assert from "node:assert/strict";
import { nordstern, plan, rueckblick, stufen, tageBis, treppe, zusammenfassung, STUFEN_STANDARD, type Meilenstein } from "./strategie.ts";

const SKAL = `# Skalier-Reihenfolge

**Grundsatz:** Erst Antworten, dann Postfächer, ganz zuletzt Enterprise.

## Stufen
1. **Zustellung belegen.** Kontrollpostfächer zeigen Posteingang vs. Spam.
   - Weiter wenn: Erstmails landen im Posteingang (Gmail + Outlook). Landen sie im Spam → erst fixen.
2. **Mail finden, die Antworten bringt.** A/B nur S2.
   - Weiter wenn: eine Variante ≥ 1 % echte Antworten.
3. **Postfächer/Domains skalieren.** Zweitdomains.
   - Weiter wenn: Bounce < 3 %, 0 Beschwerden.
4. **Rechenleistung (Enterprise, R2) erst wenn Leads der Engpass sind** – Faustregel.
`;

test("Zusammenfassung: Satz, Stufe, 3–5 Kernsätze; Fallback aus der Skalierung", () => {
  const z = zusammenfassung({ titel: "T", markdown: "Satz: Erst Antworten.\nStufe: 2\n- **Eins**\n- Zwei\n- Drei\n- Vier\n- Fünf\n- Sechs" }, null);
  assert.equal(z.satz, "Erst Antworten.");
  assert.equal(z.stufe, 2);
  assert.deepEqual(z.saetze, ["Eins", "Zwei", "Drei", "Vier", "Fünf"]);
  const f = zusammenfassung(null, { titel: "x", markdown: SKAL });
  assert.equal(f.quelle, "skalierung");
  assert.match(f.satz, /^Erst Antworten/);
  assert.equal(f.saetze.length, 4);
  assert.equal(zusammenfassung(null, null).quelle, "leer");
});

test("Stufen aus Markdown: Titel ≤ 60, Bedingung = erster Satz", () => {
  const s = stufen(SKAL);
  assert.equal(s[0].titel, "Zustellung belegen");
  assert.equal(s[0].bedingung, "Erstmails landen im Posteingang (Gmail + Outlook).");
  assert.ok(s[3].titel.length <= 60);
  assert.equal(s[3].bedingung, STUFEN_STANDARD[3].bedingung);
  assert.deepEqual(stufen(null), STUFEN_STANDARD);
});

test("Treppe: aktuelle Stufe = erste nicht erfüllte, der Reihe nach", () => {
  const leer = treppe(STUFEN_STANDARD, { seeds: {}, p30: { sent: 540, antworten: 0, bounced: 25 }, sent_24h: 190, kunden: 0, premium: 3000 });
  assert.equal(leer.find((s) => s.aktuell)?.nr, 1);
  assert.equal(leer[0].wert, "noch keine Kontrollmail");
  const s2 = treppe(STUFEN_STANDARD, { seeds: { inbox: 5, spam: 1 }, p30: { sent: 500, antworten: 2 }, sent_24h: 200, kunden: 0, premium: 10 });
  assert.equal(s2.find((s) => s.aktuell)?.nr, 2);
  assert.ok(Math.abs(s2[1].anteil - 0.4) < 1e-9);
  const s3 = treppe(STUFEN_STANDARD, { seeds: { inbox: 5 }, p30: { sent: 600, antworten: 7, proben: 2, bounced: 6 }, sent_24h: 400, kunden: 3, premium: 600 });
  assert.equal(s3.find((s) => s.aktuell)?.nr, 3);
  assert.ok(Math.abs(s3[3].anteil - 0.2) < 1e-9);
  const s4 = treppe(STUFEN_STANDARD, { seeds: { inbox: 5 }, p30: { sent: 30000, antworten: 400, proben: 200, bounced: 300, complained: 0 }, sent_24h: 1200, kunden: 10, premium: 100 });
  assert.equal(s4.find((s) => s.aktuell)?.nr, 4);
  assert.equal(s4[3].anteil, 1);
});

test("Plan: erreichte zuerst, nächster = erster geplanter; Tage bis Ziel in Berliner Zeit", () => {
  const m = (key: string, status: Meilenstein["status"], ziel: string | null, at: string | null = null): Meilenstein =>
    ({ key, titel: key, grund: null, ziel_datum: ziel, status, erreicht_am: at, kennzahl: null, updated_by: null });
  const p = plan([m("c", "geplant", "2026-11-06"), m("a", "erreicht", "2026-10-16", "2026-09-27T12:00:00Z"), m("b", "verfehlt", "2026-10-01"), m("d", "geplant", "2026-10-09")]);
  assert.deepEqual(p.alle.map((x) => x.key), ["a", "b", "d", "c"]);
  assert.equal(p.naechster, "d");
  assert.equal(p.erreicht, 1);
  assert.equal(tageBis("2026-10-09", new Date("2026-10-05T22:30:00Z")), 3);
  assert.equal(tageBis(null), null);
});

test("Rückblick: nach Tag gruppiert, Meilensteine zuerst, Dubletten raus, gekürzt", () => {
  const r = rueckblick([
    { tag: "2026-10-04", titel: "Lehre A", grund: null, art: "lehre", zahl: null },
    { tag: "2026-10-05", titel: "Schritt", grund: "x".repeat(200), art: "schritt", zahl: null },
    { tag: "2026-10-05", titel: "Erste Probe", grund: null, art: "meilenstein", zahl: null },
    { tag: "2026-10-05", titel: "schritt", grund: null, art: "schritt", zahl: null },
    { tag: "kaputt", titel: "x", grund: null, art: "schritt", zahl: null },
  ]);
  assert.deepEqual(r.map((t) => t.tag), ["2026-10-05", "2026-10-04"]);
  assert.equal(r[0].eintraege[0].art, "meilenstein");
  assert.equal(r[0].eintraege.length, 2);
  assert.ok(r[0].eintraege[1].grund!.length <= 160);
});

test("Nordstern: Anteil an 25.000 €", () => {
  assert.equal(nordstern(12_500).anteil, 0.5);
  assert.equal(nordstern(null).anteil, 0);
  assert.equal(nordstern(99_999).anteil, 1);
  assert.equal(nordstern(2490).kunden_aequivalent, 10);
});
