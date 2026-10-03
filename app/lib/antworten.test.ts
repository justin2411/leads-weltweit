import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_MIN, ageLabel, ageMinutes, answerLang, arrivedAt, cleanAnswer, countByStatus, domainOf, firstLines, intentMeta,
  isOverdue, isStatus, isUuid, lintAnswer, messageId, replyFooter, replySubject, shortHash, sortReplies, suppressTargets,
  threadHeaders,
} from "./antworten.ts";

const NOW = new Date("2026-10-04T03:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const row = (id: string, intent: string | null, min: number, status = "offen") =>
  ({ id, intent, status, received_at: ago(min), processed_at: ago(Math.max(0, min - 1)) });

test("Sortierung: offen zuerst, Kaufinteresse > Frage > Unklar > Probe, dann wartet am längsten", () => {
  const rows = [
    row("probe", "sample", 300), row("frage-neu", "question", 5), row("buy", "buy", 1), row("unklar", "other", 50),
    row("frage-alt", "question", 90), row("spaet", "buy", 999, "spaeter"), row("weg", "buy", 2, "erledigt"),
    row("nein", "not_interested", 600), row("fremd", "irgendwas", 10),
  ];
  assert.deepEqual(sortReplies(rows).map((r) => r.id),
    ["buy", "frage-alt", "frage-neu", "unklar", "fremd", "probe", "nein", "spaet", "weg"]);
});

test("Sortierung: erledigt neueste zuerst", () => {
  const rows = [row("a", "buy", 100, "erledigt"), row("b", "sample", 5, "erledigt")];
  assert.deepEqual(sortReplies(rows).map((r) => r.id), ["b", "a"]);
});

test("Wartezeit und Beschriftung", () => {
  assert.equal(ageMinutes(row("x", "buy", 12), NOW), 12);
  assert.equal(ageLabel(0), "jetzt");
  assert.equal(ageLabel(12), "12 min");
  assert.equal(ageLabel(185), "3 h");
  assert.equal(ageLabel(3 * 1440), "3 T");
  assert.equal(ageLabel(null), "–");
  // Date-Kopfzeile in der Zukunft (falsche Uhr): Verarbeitungszeit gilt
  const future = { received_at: "2026-10-05T00:00:00Z", processed_at: ago(7) };
  assert.equal(arrivedAt(future), future.processed_at);
  assert.equal(ageMinutes({ received_at: null, processed_at: null }, NOW), null);
});

test("rot nur bei offener Kaufinteresse/Frage über 15 min", () => {
  assert.equal(isOverdue(row("a", "buy", ALERT_MIN + 1), NOW), true);
  assert.equal(isOverdue(row("b", "question", 40), NOW), true);
  assert.equal(isOverdue(row("c", "buy", ALERT_MIN), NOW), false);
  assert.equal(isOverdue(row("d", "sample", 400), NOW), false);
  assert.equal(isOverdue(row("e", "other", 400), NOW), false);
  assert.equal(isOverdue(row("f", "buy", 400, "spaeter"), NOW), false);
});

test("Absichten: Unbekanntes ist Unklar; Status-Prüfung; Zählung", () => {
  assert.equal(intentMeta(null).label, "Unklar");
  assert.equal(intentMeta("buy").label, "Kaufinteresse");
  assert.equal(isStatus("spaeter"), true);
  assert.equal(isStatus("später"), false);
  assert.deepEqual(countByStatus([{ status: "offen" }, { status: "offen" }, { status: "erledigt" }, { status: "x" }]),
    { offen: 2, spaeter: 0, erledigt: 1 });
});

test("Antwort-Prüfung: keine Preise, Währungen, Beträge, Garantien", () => {
  assert.deepEqual(lintAnswer("Hello,\n\nThanks! I will send you 10 leads from across the US.\n\nBest regards"), []);
  for (const bad of ["It is €129 a month", "only $249", "£129", "129 EUR", "249 dollars per month", "USD 129",
                     "Our price is low", "Pricing: see site", "Der Preis ist", "le prix", "our tarif", "We guarantee results",
                     "garantie de résultats", "guaranteed leads"]) {
    assert.ok(lintAnswer(bad).length > 0, bad);
  }
  assert.deepEqual(lintAnswer("   "), ["Text fehlt"]);
  assert.ok(lintAnswer("x".repeat(5001)).some((e) => e.includes("5000")));
  // Zahlen ohne Währung sind erlaubt (z. B. „10 Leads“, „Montag 9 Uhr“)
  assert.deepEqual(lintAnswer("10 leads every Monday, 15 per week"), []);
});

test("Antwort prüfen: Tarnung mit Unicode, Beträge ohne Währung, auseinandergezogene Wörter", () => {
  const bad = [
    "Our pri\u200bce is 129",          // Zero-Width-Space
    "We gu\u00adarantee results",      // weiches Trennzeichen
    "It costs \uff04129 a month",      // Vollbreite-$
    "\uff30reis 129",                   // Vollbreite-P
    "129 per month", "Pro plan 249/mo", "249 / month", "129 pro Monat", "129 € par mois", "129 par mois",
    "129 monthly", "1290 a year",
    "only 129\u00a2", "₹ 999", "₩129", "₽500", "\u20bf 1", // ¢, Rupie, Won, Rubel, Bitcoin-Zeichen (U+20A0–20CF)
    "p r i c e on request", "g-u-a-r-a-n-t-e-e", "P.R.E.I.S", "pr\u0456ce",  // kyrillisches і
    "pri\u0301ce", "\u202eecirp\u202c price", "129 USD", "129 bucks", "SEK 900",
  ];
  for (const t of bad) assert.ok(lintAnswer(cleanAnswer(t)).length > 0, JSON.stringify(t));
  for (const t of bad) assert.ok(lintAnswer(t).length > 0, `roh: ${JSON.stringify(t)}`);
  // Normale Antworten bleiben erlaubt
  for (const ok of ["10 leads every Monday, 15 per week", "Happy to call you Tuesday at 3 pm.",
                    "Merci ! Je vous envoie 10 pistes de toute la France.", "We cover the US, the UK and France.",
                    "Thanks, I will send the sample within a month at the latest."]) {
    assert.deepEqual(lintAnswer(cleanAnswer(ok)), [], ok);
  }
});

test("Text säubern: NFKC und unsichtbare Formatzeichen", () => {
  assert.equal(cleanAnswer("pri\u200bce"), "price");
  assert.equal(cleanAnswer("gu\u00adarantee\ufeff"), "guarantee");
  assert.equal(cleanAnswer("\uff30reis \uff04"), "Preis $");
  assert.equal(cleanAnswer("a\u200e\u202eb\u2066c"), "abc");
  assert.equal(cleanAnswer("x\u0085y"), "xy");
});

test("Text säubern: Zeilenenden, Steuerzeichen, Leerzeilen", () => {
  assert.equal(cleanAnswer("a\r\nb\u0007\n\n\n\n\nc  "), "a\nb\n\n\nc");
  assert.equal(cleanAnswer(null), "");
});

test("Betreff: Re: genau einmal, Rückfall auf unseren Betreff, keine Zeilenumbrüche", () => {
  assert.equal(replySubject("Re: New firms in the US", "x"), "Re: New firms in the US");
  assert.equal(replySubject("AW: Hallo", null), "AW: Hallo");
  assert.equal(replySubject("Question", null), "Re: Question");
  assert.equal(replySubject("", "New firms"), "Re: New firms");
  assert.equal(replySubject("a\r\nBcc: x@y.z", null), "Re: a Bcc: x@y.z");
  assert.equal(replySubject(null, null), "Re: your message");
});

test("Verlauf-Kopfzeilen: In-Reply-To = ihre Mail, References = unsere + ihre; Injection abgewiesen", () => {
  assert.deepEqual(threadHeaders("<abc@mail.example.com>", "<ours@nextgen-profit.de>"),
    { inReplyTo: "<abc@mail.example.com>", references: ["<ours@nextgen-profit.de>", "<abc@mail.example.com>"] });
  assert.deepEqual(threadHeaders("abc@x.y", null), { inReplyTo: "<abc@x.y>", references: ["<abc@x.y>"] });
  assert.deepEqual(threadHeaders("<a@b>\r\nBcc: evil@x.y", null), {});
  assert.deepEqual(threadHeaders(null, null), {});
  assert.equal(messageId("imap-12"), null);
});

test("Sprache, Domain, Fußzeile, erste Zeilen, UUID, Hash", () => {
  assert.equal(answerLang("FR", null), "fr");
  assert.equal(answerLang("US", "fr"), "fr");
  assert.equal(answerLang("FR", "en"), "en");
  assert.equal(answerLang("UK", null), "en");
  assert.equal(domainOf("Anna@WWW.Studio.co.uk"), "studio.co.uk");
  const f = replyFooter("en", "NextGen Profit, Inhaber Justin Koch", "Nikolaistraße 3-7, 04109 Leipzig, Germany", "studio.com");
  assert.match(f, /^—\nNextGen Profit/);
  assert.match(f, /unsubscribe/);
  assert.match(f, /studio\.com/);
  assert.match(replyFooter("fr", "N", "A", "x.fr"), /désinscrire/);
  assert.equal(firstLines("a\n\nb\nc\nd\ne", 3), "a\nb\nc");
  assert.ok(firstLines("x".repeat(500), 4, 50).endsWith("…"));
  assert.equal(isUuid("3f2b6a1e-1111-4222-8333-944455556666"), true);
  assert.equal(isUuid("../etc"), false);
  assert.equal(shortHash("abc"), shortHash("abc"));
  assert.notEqual(shortHash("abc"), shortHash("abd"));
});

test("Sperren: Absender und unsere angeschriebene Adresse, ohne Doppelte", () => {
  assert.deepEqual(suppressTargets("joe@gmail.com", "Info@Alpha-Web.com"), ["joe@gmail.com", "info@alpha-web.com"]);
  assert.deepEqual(suppressTargets("info@alpha-web.com", "INFO@alpha-web.com"), ["info@alpha-web.com"]);
  assert.deepEqual(suppressTargets("info@alpha-web.com", null), ["info@alpha-web.com"]);
  assert.deepEqual(suppressTargets("info@alpha-web.com", "kein-mail"), ["info@alpha-web.com"]);
});
