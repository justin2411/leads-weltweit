import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySvix } from "./signature.ts";

const secretBytes = Buffer.from("test-secret-0123456789");
const secret = "whsec_" + secretBytes.toString("base64");
const body = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });
const id = "msg_1";
const ts = "1760000000";
const sig = createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64");

test("gültige Signatur", () => {
  assert.equal(verifySvix(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body, 1760000010), true);
});

test("mehrere Signaturen, eine gültig", () => {
  assert.equal(verifySvix(secret, { id, timestamp: ts, signature: `v1,AAAA v1,${sig}` }, body, 1760000010), true);
});

test("veränderter Inhalt", () => {
  assert.equal(verifySvix(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body + " ", 1760000010), false);
});

test("zu alt", () => {
  assert.equal(verifySvix(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body, 1760001000), false);
});

test("fehlende Header", () => {
  assert.equal(verifySvix(secret, { id: null, timestamp: ts, signature: `v1,${sig}` }, body, 1760000010), false);
});
