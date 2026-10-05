import { test } from "node:test";
import assert from "node:assert/strict";
import { BEISPIEL, fillPlaceholders, kassePeek, mailPeek, markHtml, MARK_OFF, MARK_ON, pagePeek, peekKind } from "./ab-vorschau.ts";

test("Platzhalter: neutrales Beispiel je Land, unbekannte nie roh", () => {
  assert.equal(fillPlaceholders("I'm writing to the team at {firma} directly.", "UK"), "I'm writing to the team at Example Ltd directly.");
  assert.equal(fillPlaceholders("Bonjour {Firma}, partout en {land}", "FR"), "Bonjour Exemple SARL, partout en toute la France");
  assert.equal(fillPlaceholders("{ company } across {area}", "US"), "Example LLC across the US");
  assert.equal(fillPlaceholders("Hallo {vorname}", "UK"), "Hallo …");
  assert.ok(!/\{|\}/.test(fillPlaceholders("{a}{b}{firma}", "US")));
});

test("Markierung wird zu <mark> und nur einmal gesetzt", () => {
  assert.equal(markHtml(`x ${MARK_ON}a &amp; b${MARK_OFF} y`), `x <mark data-ab-mark style="${"background:#F6E7C1;color:inherit;border-radius:3px;padding:1px 2px;box-shadow:0 0 0 2px #D8BD8A;"}">a &amp; b</mark> y`);
});

test("Betreff-Test: Betreff markiert, Mail ohne Markierung", () => {
  const m = mailPeek("mail_betreff", "betreff", "US", "No website yet: local businesses across the US");
  assert.equal(m.subject, "No website yet: local businesses across the US");
  assert.equal(m.subjectMarked, true);
  assert.equal(m.marked, false);
  assert.ok(m.html.includes("Hi Example team,"));
});

test("Einstieg-Test: getesteter Text mit Beispiel-Firma golden markiert, escaped", () => {
  const m = mailPeek("mail_einstieg", "einstieg", "UK", "I'm writing to the team at {firma} directly. <b>x</b>");
  assert.equal(m.subjectMarked, false);
  assert.match(m.html, /<mark data-ab-mark[^>]*>I&#39;m writing|<mark data-ab-mark[^>]*>I'm writing to the team at Example Ltd directly\. &lt;b&gt;x&lt;\/b&gt;<\/mark>/);
  assert.ok(!m.html.includes("{firma}"));
  assert.ok(!m.html.includes(MARK_ON) && !m.html.includes(MARK_OFF));
});

test("Kontrolle ohne Wert zeigt heutigen Standard markiert; FR auf Französisch", () => {
  const m = mailPeek("mail_einstieg", "einstieg", "FR", null);
  assert.match(m.html, /<mark data-ab-mark[^>]*>Je me permets d&#39;écrire|<mark data-ab-mark[^>]*>Je me permets d'écrire directement à Exemple SARL/);
  assert.equal(m.subject, "Entreprises en France sans site web");
});

test("Nachfass-Tage markieren den Zeitpunkt, Frage den Schluss", () => {
  const t = mailPeek("nachfass", "tage", "US", "6");
  assert.equal(t.chip, "after 6 days");
  assert.equal(t.chipMarked, true);
  const f = mailPeek("probe_nachfrage", "frage", "UK", "Shall we begin on Monday?");
  assert.ok(f.html.includes(">Shall we begin on Monday?</mark>"));
  assert.equal(f.chip, "after 3 days");
});

test("Probe-Mail und Antwort markieren Tipp bzw. Frage", () => {
  assert.ok(mailPeek("probe_mail", "tipp", "UK", "Call the first one today.").html.includes(">Call the first one today.</mark>"));
  assert.ok(mailPeek("antwort", "faq_frage", "US", null).html.includes("A simple &quot;yes&quot; is enough.</mark>"));
});

test("Seiten: Inhaber-Vorschau, zählt nie (vorschau=1), Stelle je Element", () => {
  assert.deepEqual(pagePeek("landing", "headline", "UK", "S2", "B", "B"), { src: "/uk/web-agencies?vorschau=1&v=B", selector: "h1", fallback: "#video, .sec" });
  assert.equal(pagePeek("landing", "value_block", "FR", "S2", "A")?.src, "/fr/agences-web?vorschau=1&v=A");
  assert.equal(pagePeek("landing", "value_block", "FR", "S2", "A")?.selector, "#wert");
  assert.equal(pagePeek("tarif", "lede", "US", "S2", "B")?.src, "/us/web-agencies/start?vorschau=1&abv=B");
  assert.equal(pagePeek("landing", "headline", "UK", "S9", "A"), null);
  assert.equal(pagePeek("landing", "headline", "UK", "S2", "A", "x\"><script>")?.src, "/uk/web-agencies?vorschau=1&v=A");
});

test("Art je Schritt und Kasse ohne Preise", () => {
  assert.equal(peekKind("mail_betreff"), "mail");
  assert.equal(peekKind("landing"), "page");
  assert.equal(peekKind("checkout"), "kasse");
  const k = kassePeek("UK", "Cancel any time <b>");
  assert.ok(k.includes("Cancel any time &lt;b&gt;</mark>"));
  assert.ok(!/[£$€]\s?\d/.test(k));
  assert.equal(BEISPIEL.UK.firma, "Example Ltd");
});
