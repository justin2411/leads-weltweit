import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchSampleWorkflow, personalize, PLACEHOLDER, previewFromStock, recipientDomain, sendFromStock,
         type StockDeps } from "./sample-stock.ts";

const PAYLOAD = JSON.stringify({
  version: 1, placeholder: PLACEHOLDER, lang: "en", subject: "Your 10 free leads from across the US",
  text: `Hello,\n\nHere are your 10 free leads.\n\n—\nYou requested a free sample. Reply "unsubscribe" and we will not contact ${PLACEHOLDER} again.`,
  html: `<p>Hello</p><p>not contact ${PLACEHOLDER} again</p>`, headers: {},
  attachments: [{ filename: "Your-10-Free-Leads-US.pdf", content: "JVBERg==" }, { filename: "sample-leads.csv", content: "YQ==" }],
});

/** Vorrat im Speicher mit derselben Bedeutung wie claim/finish_sample_stock in der Datenbank. */
function world(stock = 1) {
  const rows = Array.from({ length: stock }, (_, i) => ({ id: `st${i + 1}`, storage_path: `p${i + 1}.json`, status: "ready",
                                                          request: null as string | null }));
  const calls: { fn: string; args: any }[] = [];
  const sent: any[] = [];
  let resendStatus = 200;
  let resendThrows = false;
  const deps: StockDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "claim_sample_stock") {
        const s = rows.find((r) => r.status === "ready");
        if (!s) return { data: [], error: null };
        s.status = "claimed"; s.request = String(args.p_request);
        return { data: [{ id: s.id, storage_path: s.storage_path, subject: "s", lang: "en" }], error: null };
      }
      if (fn === "finish_sample_stock") {
        const s = rows.find((r) => r.id === args.p_stock)!;
        if (s.status !== "claimed") return { data: null, error: null };
        s.status = args.p_ok ? "sent" : args.p_release ? "ready" : "failed";
        if (args.p_release) s.request = null;
      }
      return { data: null, error: null };
    },
    download: async () => PAYLOAD,
    fetch: (async (_url: string, init: any) => {
      if (resendThrows) throw new Error("Netz weg");
      sent.push({ headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "re_1" }), { status: resendStatus });
    }) as typeof fetch,
    env: { RESEND_API_KEY: "re_test", MAIL_FROM: "NextGen Profit <hello@nextgen-profit.de>", REPLY_TO: "info@nextgen-profit.de" },
  };
  return { rows, calls, sent, deps, set: (s: number, t = false) => { resendStatus = s; resendThrows = t; } };
}

const REQ = { id: "r1", segment: "S2", country: "US", email: "Jo@WWW.Agency.com", wish: ["no_website"] };

test("Empfänger-Domain wie normalize_domain in Python", () => {
  assert.equal(recipientDomain("jo@www.Agency.com"), "agency.com");
  assert.equal(recipientDomain("a@b.co.uk"), "b.co.uk");
  const p = personalize(JSON.parse(PAYLOAD), "x@shop.fr");
  assert.ok(!p.text.includes(PLACEHOLDER) && !p.html.includes(PLACEHOLDER));
  assert.ok(p.text.includes("not contact shop.fr again"));
});

test("Sofortversand: fertige Probe mit allen Anhängen, nie doppelt (Idempotency-Key), Probe danach verbraucht", async () => {
  const w = world(1);
  const r = await sendFromStock(w.deps, REQ);
  assert.equal(r.status, "sent");
  assert.equal(r.resendId, "re_1");
  assert.equal(w.sent.length, 1);
  const { headers, body } = w.sent[0];
  assert.equal(headers["Idempotency-Key"], "sample-r1");
  assert.deepEqual(body.to, ["Jo@WWW.Agency.com"]);
  assert.equal(body.subject, "Your 10 free leads from across the US");
  assert.deepEqual(body.attachments.map((a: any) => a.filename), ["Your-10-Free-Leads-US.pdf", "sample-leads.csv"]);
  assert.equal(body.reply_to, "info@nextgen-profit.de");
  assert.ok(body.text.includes("agency.com again"));
  assert.equal(w.rows[0].status, "sent");
  assert.deepEqual(w.calls[0].args.p_wish, ["no_website"]);
  // zweite Anfrage: Vorrat leer -> Warteschlange, keine Mail
  const r2 = await sendFromStock(w.deps, { ...REQ, id: "r2" });
  assert.equal(r2.status, "none");
  assert.equal(w.sent.length, 1);
});

test("gleichzeitige Klicks: jede Probe geht nur an einen", async () => {
  const w = world(2);
  const res = await Promise.all(["a", "b", "c"].map((id) => sendFromStock(w.deps, { ...REQ, id })));
  assert.deepEqual(res.map((r) => r.status).sort(), ["none", "sent", "sent"]);
  assert.equal(new Set(w.rows.map((r) => r.request)).size, 2);
});

test("Resend lehnt ab -> Probe wieder bereit; Netzfehler -> Probe nie wieder vergeben", async () => {
  const w = world(1);
  w.set(422);
  assert.equal((await sendFromStock(w.deps, REQ)).status, "error");
  assert.equal(w.rows[0].status, "ready");
  w.set(200, true);
  assert.equal((await sendFromStock(w.deps, REQ)).status, "error");
  assert.equal(w.rows[0].status, "failed");
});

test("ohne Resend-Zugang kein Abruf aus dem Vorrat", async () => {
  const w = world(1);
  w.deps.env = {};
  assert.equal((await sendFromStock(w.deps, REQ)).status, "none");
  assert.equal(w.calls.length, 0);
});

test("Inhaber-Vorschau: nur an den Inhaber, verbraucht nichts", async () => {
  const w = world(1);
  const r = await previewFromStock({ ...w.deps, peek: async () => "p1.json" }, "owner@example.com", "S2", "US");
  assert.equal(r.status, "sent");
  assert.ok(typeof r.ms === "number");
  assert.deepEqual(w.sent[0].body.to, ["owner@example.com"]);
  assert.ok(w.sent[0].body.subject.startsWith("[TEST] "));
  assert.equal(w.calls.length, 0, "kein claim/finish");
  assert.equal(w.rows[0].status, "ready");
});

test("Probe-Lauf anstoßen nur mit Token", async () => {
  const seen: string[] = [];
  const f = (async (url: string) => { seen.push(url); return new Response(null, { status: 204 }); }) as typeof fetch;
  assert.equal(await dispatchSampleWorkflow(f, undefined), false);
  assert.equal(await dispatchSampleWorkflow(f, "  "), false);
  assert.equal(await dispatchSampleWorkflow(f, "ghp_x"), true);
  assert.ok(seen[0].endsWith("/actions/workflows/proben-vorrat.yml/dispatches"));
});
