import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentStatus, aktuell, alsNaechstes, berlinMinute, countdown, erledigt7, hm, kurzAuftrag, laeufe, naechster, ROUTINEN_LISTE, taktWort, zeitplan,
} from "./gehirn-aufbau.ts";
import OPS from "./ops-config.json" with { type: "json" };

// 05.10.2026 08:00 UTC = 10:00 MESZ
const now = new Date("2026-10-05T08:00:00Z");

test("Gehirn-Sitzung 17 */2 → nächste 10:17 MESZ (08:17 UTC)", () => {
  const t = naechster(["17 */2 * * *"], now)!;
  assert.equal(t.toISOString(), "2026-10-05T08:17:00.000Z");
  assert.equal(hm(t), "10:17");
});

test("Winterzeit: im Dezember ist UTC+1", () => {
  const t = naechster(["17 */2 * * *"], new Date("2026-12-01T08:00:00Z"))!;
  assert.equal(hm(t), "09:17");
});

test("Premium-Labor 10 1-23/2 → ungerade UTC-Stunden", () => {
  const t = naechster(["10 1-23/2 * * *"], now)!;
  assert.equal(t.toISOString(), "2026-10-05T09:10:00.000Z");
  assert.equal(hm(t), "11:10");
  assert.equal(laeufe(["10 1-23/2 * * *"], now).length, 12);
});

test("Agent viermal stündlich → 96 Läufe/Tag, ohne Doppelte", () => {
  const xs = laeufe(["8 * * * *", "23 * * * *", "38 * * * *", "53 * * * *"], now);
  assert.equal(xs.length, 96);
  assert.equal(hm(xs[0]), "10:08");
  assert.equal(laeufe(["11,41 * * * *", "41 * * * *"], now).length, 48);
});

test("berlinMinute und Countdown", () => {
  assert.equal(berlinMinute(now), 600);
  assert.equal(berlinMinute(new Date("2026-10-04T22:30:00Z")), 30);
  assert.equal(countdown(10_000), "jetzt");
  assert.equal(countdown(7 * 60_000), "in 7 min");
  assert.equal(countdown(65 * 60_000), "in 1:05 h");
});

test("Takt in Worten", () => {
  assert.equal(taktWort(144), "alle 10 min");
  assert.equal(taktWort(24), "stündlich");
  assert.equal(taktWort(12), "alle 2 h");
  assert.equal(taktWort(8), "alle 3 h");
  assert.equal(taktWort(1), "1× täglich");
});

test("Zeitplan: Routinen zuerst, Workflows aus ops-config (YAML)", () => {
  assert.deepEqual(ROUTINEN_LISTE.map((r) => r.key), ["gehirn", "agent", "scout", "premium"]);
  const z = zeitplan((OPS as { zeitplan: { file: string; crons: string[] }[] }).zeitplan, now);
  assert.equal(z.haupt[0].name, "Gehirn-Sitzung");
  assert.ok(z.haupt.some((t) => t.key === "w:lead-werk.yml" && t.proTag === 4));
  assert.ok(z.haupt.every((t) => t.marken.every((m) => m >= 0 && m < 1440)));
  assert.ok(!z.weitere.some((t) => t.key === "w:send.yml"));
  const lief = z.haupt.find((t) => t.key === "w:kundenlieferung.yml")!;
  assert.equal(lief.takt, "wöchentlich");
  const n = alsNaechstes(z.haupt, 3);
  assert.equal(n.length, 3);
  assert.ok(Date.parse(n[0].next!) <= Date.parse(n[1].next!));
});

test("Agenten: Status, aktueller Auftrag, kurz, erledigt 7 T", () => {
  const t = (status: string, created_at: string, finished_at: string | null = null) => ({ status, created_at, finished_at });
  assert.equal(agentStatus([t("offen", "2026-10-05T07:00:00Z")]), "wartet");
  assert.equal(agentStatus([t("laeuft", "2026-10-05T07:00:00Z")]), "arbeitet");
  assert.equal(agentStatus([], false), "aus");
  assert.equal(aktuell([t("offen", "2026-10-05T07:00:00Z"), t("laeuft", "2026-10-05T07:30:00Z")])?.status, "laeuft");
  assert.equal(kurzAuftrag("Leads holen für UK Webagenturen heute bitte schnell"), "Leads holen für UK Webagenturen heute …");
  assert.equal(kurzAuftrag("Quellen prüfen."), "Quellen prüfen.");
  assert.equal(erledigt7([t("fertig", "2026-10-04T07:00:00Z", "2026-10-04T08:00:00Z"), t("fertig", "2026-09-20T07:00:00Z", "2026-09-20T08:00:00Z"), t("fehler", "2026-10-05T07:00:00Z")], now), 1);
});
