import { test } from "node:test";
import assert from "node:assert/strict";
import { handleGet, handlePost, langFor, type UnsubDeps } from "./unsubscribe.ts";

const TOKEN = "abcdef0123456789abcdef";
const URL_OK = `https://x.test/api/unsubscribe?t=${TOKEN}`;

function world(country: string | null = "US") {
  const suppressed: string[] = [];
  const events: any[] = [];
  const deps: UnsubDeps = {
    async find(t) { return t === TOKEN ? { id: "m1", to_email: "Info@Acme.com", resend_id: null, country } : null; },
    async suppress(e) { suppressed.push(e); },
    async event(r) { events.push(r); },
  };
  return { deps, suppressed, events };
}

test("GET sperrt nicht, zeigt Knopf mit POST-Formular", async () => {
  const w = world();
  const res = await handleGet(URL_OK, w.deps);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<form method="post" action="\/api\/unsubscribe\?t=abcdef0123456789abcdef">/);
  assert.match(html, /Confirm unsubscribe/);
  assert.doesNotMatch(html, /<img|<script|<link|https?:\/\//);
  assert.deepEqual(w.suppressed, []);
  assert.deepEqual(w.events, []);
});

test("GET auf Französisch für FR-Empfänger", async () => {
  const w = world("FR");
  const html = await (await handleGet(URL_OK, w.deps)).text();
  assert.match(html, /lang="fr"/);
  assert.match(html, /Confirmer la désinscription/);
  assert.equal(langFor(null), "en");
});

test("POST über den Knopf sperrt sofort", async () => {
  const w = world();
  const req = new Request(URL_OK, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `t=${TOKEN}` });
  const res = await handlePost(req, w.deps);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /You are unsubscribed/);
  assert.deepEqual(w.suppressed, ["Info@Acme.com"]);
  assert.equal(w.events[0].type, "unsubscribed");
  assert.equal(w.events[0].note, "Abmeldelink (bestätigt)");
});

test("Ein-Klick-POST aus dem Mailprogramm (RFC 8058) sperrt sofort", async () => {
  const w = world();
  const req = new Request(URL_OK, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click" });
  const res = await handlePost(req, w.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(w.suppressed, ["Info@Acme.com"]);
  assert.match(w.events[0].note, /Ein-Klick/);
});

test("POST ohne Body mit Token in der URL sperrt", async () => {
  const w = world();
  const res = await handlePost(new Request(URL_OK, { method: "POST" }), w.deps);
  assert.equal(res.status, 200);
  assert.equal(w.suppressed.length, 1);
});

test("ungültiger oder unbekannter Token: 404, keine Sperre", async () => {
  const w = world();
  for (const u of ["https://x.test/api/unsubscribe", "https://x.test/api/unsubscribe?t=<script>",
                   "https://x.test/api/unsubscribe?t=ffffffffffffffffffff"]) {
    const g = await handleGet(u, w.deps);
    assert.equal(g.status, 404);
    assert.match(await g.text(), /Link not valid/);
    const p = await handlePost(new Request(u, { method: "POST" }), w.deps);
    assert.equal(p.status, 404);
  }
  assert.deepEqual(w.suppressed, []);
  assert.deepEqual(w.events, []);
});

test("Knopf ist groß und volle Breite (auch am Handy gut zu treffen)", async () => {
  const html = await (await handleGet(URL_OK, world().deps)).text();
  assert.match(html, /button\{display:block;width:100%;min-height:3\.5rem/);
});

test("Ein-Klick-POST mit Token nur in der URL und ohne Bestätigung: sofort gesperrt, kein Formular", async () => {
  const w = world("FR");
  const res = await handlePost(new Request(URL_OK, { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }), w.deps);
  const html = await res.text();
  assert.doesNotMatch(html, /<form/);
  assert.match(html, /Vous êtes désinscrit/);
  assert.equal(w.suppressed.length, 1);
  assert.equal(w.events.length, 1);
});
