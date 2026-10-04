import { test } from "node:test";
import assert from "node:assert/strict";
import { GRUND_MAX, TITEL_MAX, grundVon, hatMehr, kurzGrund, kurzTitel, titelVon } from "./kurz.ts";
import { kurzTitelText } from "./kurz-schreiben.ts";

const LANG = [
  "Sitzung 27.09. 16:30 UTC: Not-Aus geprueft (ok), Probe-Anfrage jetzt 4h+ unbeantwortet, taeglicher Kaltmail-Versand heute offenbar nicht gelaufen",
  "Technisches Problem: Diese Sitzung kann nicht nach GitHub pushen (Repo nicht in Session-Quellen autorisiert)",
  "Probe-Anfrage Forward Role Recruitment (S1/UK) liegt seit ~12:24 UTC unbeantwortet",
  "Gehirn hat heute die Bounce-Quote aller Versand-Postfächer überprüft und keine Auffälligkeiten gefunden außer einer",
];

test("Titel: gleiche Regel wie beim Schreiben, höchstens 60 Zeichen, ohne Präfix", () => {
  for (const s of LANG) {
    const t = kurzTitel(s);
    assert.equal(t, kurzTitelText(s));
    assert.ok(t.length <= TITEL_MAX, t);
    assert.ok(!/^Sitzung|UTC/.test(t), t);
  }
  assert.equal(kurzTitel("Vorschlag: Versand nur Di–Do zur Bürozeit der Empfänger"), "Versand nur Di–Do zur Bürozeit der Empfänger");
  assert.equal(kurzTitel(null), "");
});

test("Grund: erster Satz, ohne Klammer-Zahlen, höchstens 140 Zeichen", () => {
  assert.equal(kurzGrund("Alle 350 Mails gingen am Wochenende raus, US-Mails teils nachts Ortszeit. B2B-Antworten kommen werktags."),
    "Alle 350 Mails gingen am Wochenende raus, US-Mails teils nachts Ortszeit.");
  const g = kurzGrund("Not-Aus: brain_enabled=true, keine Abschaltregel ausgeloest (Bounces 24h 4/83=4,8% unter 5%, 0 Beschwerden). Rest.");
  assert.ok(!g.includes("4/83"), g);
  const lang = kurzGrund("Overture Maps Places hat sehr viele Orte mit Website, Telefon, teils E-Mail, Lizenz CDLA Permissive, freier Download, Abgleich per Firmenname und Postleitzahl wäre der größte Hebel für alles");
  assert.ok(lang.length <= GRUND_MAX, lang);
  assert.equal(kurzGrund(undefined), "");
});

test("Spalten kurz_titel/kurz_grund haben Vorrang, Details nur bei mehr Text", () => {
  const d = { subject: "Sitzung 27.09. 16:30 UTC: Sehr lang", reasoning: "Lang. Und mehr.", kurz_titel: "Klarer Titel", kurz_grund: "Kurzer Grund" };
  assert.equal(titelVon(d), "Klarer Titel");
  assert.equal(grundVon(d), "Kurzer Grund");
  assert.equal(titelVon({ ...d, kurz_titel: null }), "Sehr lang");
  assert.equal(grundVon({ ...d, kurz_grund: " " }), "Lang.");
  assert.ok(grundVon({ ...d, kurz_grund: "x ".repeat(100) }).length <= GRUND_MAX);
  assert.ok(hatMehr(d));
  assert.ok(!hatMehr({ subject: "Kurz", reasoning: "Grund." }));
  assert.ok(hatMehr({ subject: "Kurz", reasoning: "Grund.", action: "insert" }));
});
