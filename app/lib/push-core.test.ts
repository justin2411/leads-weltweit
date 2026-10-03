import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asKind, buildPayload, isGoneStatus, MAX_SKEW_S, RateLimiter, ReplayGuard, safePath, sign, validSubscription, verifySigned,
} from "./push-core.ts";

const KEY = "service-role-test-key";
const NOW = Date.UTC(2026, 9, 4, 3, 0, 0);
const body = (o: Record<string, unknown>) => JSON.stringify(o);

test("HMAC: gültige Signatur und frischer Zeitstempel werden angenommen", () => {
  const raw = body({ title: "Kaufinteresse", body: "Acme Ltd", url: "/dashboard/antworten/x", kind: "buy", ts: NOW / 1000 - 10 });
  const sig = sign(raw, KEY);
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(verifySigned(raw, sig, KEY, NOW)?.kind, "buy");
  assert.equal(verifySigned(raw, `sha256=${sig.toUpperCase()}`, KEY, NOW)?.title, "Kaufinteresse");
});

test("HMAC: falsche Signatur, falscher Schlüssel, veränderter Body, fehlender Schlüssel", () => {
  const raw = body({ title: "x", ts: NOW / 1000 });
  const sig = sign(raw, KEY);
  assert.equal(verifySigned(raw, sign(raw, "anderer"), KEY, NOW), null);
  assert.equal(verifySigned(raw + " ", sig, KEY, NOW), null);
  assert.equal(verifySigned(raw, sig.slice(0, 63), KEY, NOW), null);
  assert.equal(verifySigned(raw, "zz".repeat(32), KEY, NOW), null);
  assert.equal(verifySigned(raw, null, KEY, NOW), null);
  assert.equal(verifySigned(raw, sig, undefined, NOW), null);
  assert.equal(verifySigned(raw, sig, "", NOW), null);
});

test("HMAC: abgelaufen, aus der Zukunft, ohne ts, kein Objekt", () => {
  const old = body({ title: "x", ts: NOW / 1000 - MAX_SKEW_S - 1 });
  assert.equal(verifySigned(old, sign(old, KEY), KEY, NOW), null);
  const future = body({ title: "x", ts: NOW / 1000 + MAX_SKEW_S + 1 });
  assert.equal(verifySigned(future, sign(future, KEY), KEY, NOW), null);
  const edge = body({ title: "x", ts: NOW / 1000 - MAX_SKEW_S });
  assert.ok(verifySigned(edge, sign(edge, KEY), KEY, NOW));
  const nots = body({ title: "x" });
  assert.equal(verifySigned(nots, sign(nots, KEY), KEY, NOW), null);
  for (const raw of ["[1,2]", "null", "nicht json"]) assert.equal(verifySigned(raw, sign(raw, KEY), KEY, NOW), null);
  const big = body({ title: "x".repeat(5000), ts: NOW / 1000 });
  assert.equal(verifySigned(big, sign(big, KEY), KEY, NOW), null);
});

test("Ratenbegrenzung: 30 pro Stunde, danach frei nach Ablauf des Fensters", () => {
  const rl = new RateLimiter(30, 3600_000);
  for (let i = 0; i < 30; i++) assert.equal(rl.take(NOW + i * 1000), true, `Alarm ${i + 1}`);
  assert.equal(rl.take(NOW + 31_000), false);
  assert.equal(rl.take(NOW + 3599_000), false);
  assert.equal(rl.take(NOW + 3600_000), true); // erster Treffer ist aus dem Fenster
  assert.equal(rl.take(NOW + 3600_500), false);
});

test("Wiederholungsschutz: dieselbe Signatur nur einmal", () => {
  const g = new ReplayGuard(600_000);
  const sig = sign("a", KEY);
  assert.equal(g.fresh(sig, NOW), true);
  assert.equal(g.fresh(`sha256=${sig}`, NOW + 1000), false);
  assert.equal(g.fresh(sig, NOW + 600_001), true);
});

test("Payload: Form, Kürzung, Steuerzeichen, Art", () => {
  const p = buildPayload({ title: "  Kauf\ninteresse ", body: "a".repeat(500), url: "/dashboard/antworten/1", kind: "buy" }, "", NOW);
  assert.deepEqual(Object.keys(p!).sort(), ["body", "kind", "title", "ts", "url"]);
  assert.equal(p!.title, "Kauf interesse");
  assert.equal(p!.body.length, 240);
  assert.equal(p!.ts, NOW / 1000);
  assert.equal(p!.kind, "buy");
  assert.equal(buildPayload({ title: "x".repeat(200) }, "", NOW)!.title.length, 80);
  assert.equal(buildPayload({ title: "  " }, "", NOW), null);
  assert.equal(asKind("hack"), "other");
  assert.equal(asKind("question"), "question");
});

test("Ziel-Adresse: nur Pfade der eigenen Website", () => {
  const site = "https://www.nextgen-profit.de";
  assert.equal(safePath("/dashboard/antworten/abc?x=1", site), "/dashboard/antworten/abc?x=1");
  assert.equal(safePath(`${site}/dashboard/antworten/abc`, site), "/dashboard/antworten/abc");
  for (const bad of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "", null,
                     "/x y", `${site}.evil.example/x`]) {
    assert.equal(safePath(bad, site), "/dashboard/antworten", String(bad));
  }
});

test("Abo prüfen: nur bekannte Push-Dienste per https, Schlüssel in Base64url", () => {
  const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
  assert.ok(validSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys }));
  assert.ok(validSubscription({ endpoint: "https://web.push.apple.com/QG-abc", keys }));
  assert.ok(validSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc", keys }));
  assert.equal(validSubscription({ endpoint: "http://fcm.googleapis.com/x", keys }), null);
  assert.equal(validSubscription({ endpoint: "https://169.254.169.254/latest", keys }), null);
  assert.equal(validSubscription({ endpoint: "https://evilgoogleapis.com/x", keys }), null);
  assert.equal(validSubscription({ endpoint: "https://fcm.googleapis.com:8443/x", keys }), null);
  assert.equal(validSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "kurz", auth: keys.auth } }), null);
  assert.equal(validSubscription(null), null);
});

test("Empfänger gibt es nicht mehr: 404/410/403, sonst vorübergehend", () => {
  assert.ok(isGoneStatus(410) && isGoneStatus(404) && isGoneStatus(403));
  assert.ok(!isGoneStatus(500) && !isGoneStatus(429) && !isGoneStatus(undefined));
});
