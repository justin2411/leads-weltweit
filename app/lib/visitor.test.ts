import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SaltCache, berlinDay, clientIp, countable, isPreviewRef, visitorHash } from "./visitor.ts";

const SALT = "a".repeat(64);
const SALT2 = "b".repeat(64);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15";
const hdr = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test("Hash: SHA-256 aus Salz | IP | User-Agent | Tag, 64 Hex-Zeichen, nie IP im Ergebnis", () => {
  const h = visitorHash(SALT, "203.0.113.7", UA, "2026-10-04")!;
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, createHash("sha256").update(`${SALT}|203.0.113.7|${UA}|2026-10-04`).digest("hex"));
  assert.ok(!h.includes("203"));
});

test("Eindeutig je Tag: gleicher Besucher gleicher Hash; anderer Tag/Salz/IP/Browser anderer Hash", () => {
  const a = visitorHash(SALT, "203.0.113.7", UA, "2026-10-04");
  assert.equal(visitorHash(SALT, "203.0.113.7", UA, "2026-10-04"), a); // mehrfacher Aufruf zählt einmal
  assert.notEqual(visitorHash(SALT2, "203.0.113.7", UA, "2026-10-05"), a); // nächster Tag, neues Salz
  assert.notEqual(visitorHash(SALT, "203.0.113.7", UA, "2026-10-05"), a);
  assert.notEqual(visitorHash(SALT, "203.0.113.8", UA, "2026-10-04"), a);
  assert.notEqual(visitorHash(SALT, "203.0.113.7", UA + " Mobile", "2026-10-04"), a); // Gerätewechsel zählt doppelt
  // count distinct: 5 Aufrufe, davon 3 vom selben Browser → 3 eindeutige
  const views = [["1.1.1.1", UA], ["1.1.1.1", UA], ["1.1.1.1", UA], ["2.2.2.2", UA], ["1.1.1.1", "Firefox/131.0 (X11; Linux x86_64)"]];
  assert.equal(new Set(views.map(([ip, ua]) => visitorHash(SALT, ip, ua, "2026-10-04"))).size, 3);
});

test("Ohne gültiges Salz, IP oder Tag kein Schlüssel", () => {
  assert.equal(visitorHash("", "1.1.1.1", UA, "2026-10-04"), null);
  assert.equal(visitorHash("xyz", "1.1.1.1", UA, "2026-10-04"), null);
  assert.equal(visitorHash(SALT, "", UA, "2026-10-04"), null);
  assert.equal(visitorHash(SALT, "1.1.1.1", UA, "heute"), null);
});

test("IP aus Plattform-Kopfzeilen: erster Eintrag, ohne Port/Klammern, Unsinn verworfen", () => {
  assert.equal(clientIp(hdr({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(hdr({ "x-forwarded-for": "203.0.113.7:4711" })), "203.0.113.7");
  assert.equal(clientIp(hdr({ "x-forwarded-for": "[2001:DB8::1]:443" })), "2001:db8::1");
  assert.equal(clientIp(hdr({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(hdr({ "x-forwarded-for": "<script>" })), "");
  assert.equal(clientIp(hdr({})), "");
});

test("Inhaber, Vorschau und Bots zählen nie", () => {
  assert.equal(countable({ owner: false, preview: false, bot: false }), true);
  assert.equal(countable({ owner: true, preview: false, bot: false }), false);
  assert.equal(countable({ owner: false, preview: true, bot: false }), false);
  assert.equal(countable({ owner: false, preview: false, bot: true }), false);
  assert.equal(isPreviewRef("https://www.nextgen-profit.de/us/web-agencies?vorschau=1&v=A"), true);
  assert.equal(isPreviewRef("https://www.nextgen-profit.de/us/web-agencies/start?r=abc"), false);
  assert.equal(isPreviewRef(null), false);
  assert.equal(isPreviewRef("kaputt"), false);
});

test("Tag in deutscher Zeit (Mitternacht MESZ = 22:00 UTC)", () => {
  assert.equal(berlinDay(new Date("2026-10-04T21:59:00Z")), "2026-10-04");
  assert.equal(berlinDay(new Date("2026-10-04T22:00:00Z")), "2026-10-05");
});

test("Salz-Zwischenspeicher: einmal je Tag laden, neuer Tag → neu laden, kaputtes Salz nie verwenden", async () => {
  let calls = 0;
  let day = "2026-10-04", salt = SALT;
  const c = new SaltCache(async () => { calls++; return { day, salt }; });
  const t1 = new Date("2026-10-04T10:00:00Z");
  assert.deepEqual(await c.get(t1), { day: "2026-10-04", salt: SALT });
  await c.get(new Date("2026-10-04T10:05:00Z"));
  assert.equal(calls, 1);
  day = "2026-10-05"; salt = SALT2;
  assert.deepEqual(await c.get(new Date("2026-10-04T22:30:00Z")), { day: "2026-10-05", salt: SALT2 });
  assert.equal(calls, 2);
  const bad = new SaltCache(async () => ({ day: "2026-10-04", salt: "kurz" }));
  assert.equal(await bad.get(t1), null);
  const err = new SaltCache(async () => { throw new Error("db weg"); });
  assert.equal(await err.get(t1), null);
});
