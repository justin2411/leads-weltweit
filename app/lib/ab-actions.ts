import "server-only";
import { db } from "@/lib/supabase";
import { TEST_SCOPE } from "@/lib/test-scope-data";
import { insertDecision } from "@/lib/kurz-schreiben";
import { AB_REG } from "@/lib/ab-data";
import { checkTest, variantValue, type AbTest } from "@/lib/ab";

/**
 * A/B je Schritt – Tests anlegen, starten, stoppen (Chat-Werkzeug ab_test im Gehirn-Modus; gleiche Regeln wie
 * scripts/ab.py). Nur Webagenturen US/UK/FR, genau EIN Element (A = heutiger Stand), höchstens ein laufender Test je
 * Schritt und Land (auch per Datenbank-Index), Texte ohne Garantien, Druck, Preise oder Zahlen außer der 10.
 * Jede Entscheidung in decisions (kurz_titel/kurz_grund) und kurz im goldenen Gehirn-Chat. Löscht nichts.
 */
export class AbActionError extends Error {}

const label = (t: Pick<AbTest, "step" | "country">) => `${AB_REG.schritte.find((s) => s.key === t.step)?.titel ?? t.step} ${t.country}`;

async function note(body: string) {
  try {
    const { data } = await db().from("jarvis_sessions").select("id").eq("kind", "gehirn").limit(1);
    const sid = data?.[0]?.id;
    if (sid) await db().from("jarvis_messages").insert({ session_id: sid, role: "jarvis", body: body.slice(0, 400), status: null,
      links: [{ label: "A/B je Schritt", url: "/dashboard/gehirn#ab" }] });
  } catch { /* Meldung ist nie Pflicht für den Test */ }
}

async function decide(titel: string, grund: string, subject: string, metrics: Record<string, unknown>) {
  await insertDecision(db(), { type: "note", subject, reasoning: grund, metrics, status: "done", kurz_titel: titel, kurz_grund: grund });
  await note(`A/B: ${titel}\n${grund}`.slice(0, 400));
}

export type AbCreateInput = { step: string; country: string; element: string; b: unknown; a?: unknown; hypothese: string; by: string };

export async function createAbTest(x: AbCreateInput): Promise<AbTest> {
  const country = x.country.toUpperCase();
  const errs = checkTest(AB_REG, TEST_SCOPE, { step: x.step, segment: "S2", country, element: x.element, b: x.b, a: x.a, hypothese: x.hypothese });
  if (errs.length) throw new AbActionError(errs.slice(0, 4).join(" · "));
  const s = AB_REG.schritte.find((y) => y.key === x.step)!;
  const val = (v: unknown) => (s.elemente[x.element].art === "zahl" ? Number(v) : typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);
  const row = {
    step: x.step, segment_id: "S2", country, element: x.element, hypothese: x.hypothese.replace(/\s+/g, " ").trim(), messung: s.messung,
    varianten: [{ key: "A", ...(x.a !== undefined && x.a !== null && x.a !== "" ? { [x.element]: val(x.a) } : {}) }, { key: "B", [x.element]: val(x.b) }],
    status: "entwurf", min_n: s.min_n, created_by: x.by,
  };
  const { data, error } = await db().from("ab_tests").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as AbTest;
}

/** Landingpage: Variante B als eigene page_variant (live, 50/50) – nur mit „Seiten selbst live“ und Rechtstexten. */
async function landingSetup(t: AbTest) {
  const { data: st } = await db().from("settings").select("auto_publish_pages, legal_ready").eq("id", 1).maybeSingle();
  if (!st?.auto_publish_pages || !st?.legal_ready) throw new AbActionError("Seiten selbst live ist aus – Landingpage-Test geht erst danach");
  const { data: pages } = await db().from("landing_pages").select("id").eq("segment_id", t.segment_id).eq("country", t.country).eq("status", "live").limit(1);
  const page = pages?.[0];
  if (!page) throw new AbActionError("keine Live-Seite für dieses Land");
  const { data: vs } = await db().from("page_variants").select("*").eq("page_id", page.id);
  const live = (vs ?? []).filter((v) => v.status === "live");
  if (live.length !== 1) throw new AbActionError("auf der Seite läuft schon ein Varianten-Test");
  if (variantValue(t, "A") !== undefined) throw new AbActionError("A muss bei der Landingpage der heutige Stand sein (A leer lassen)");
  const base = live[0];
  const used = new Set((vs ?? []).map((v) => v.variant_key));
  const key = "BCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((k) => !used.has(k))!;
  const b = variantValue(t, "B");
  const copy = Object.fromEntries(["headline", "subheadline", "signals", "sample_leads", "pricing", "cta_label", "faq", "value_block"].map((c) => [c, base[c]]));
  const { data: nv, error } = await db().from("page_variants").insert({ ...copy, page_id: page.id, variant_key: key, [t.element]: b, status: "live",
    traffic_share: 50, changed_element: t.element, created_by: "brain" }).select("id").single();
  if (error) throw new Error(error.message);
  await db().from("page_variants").update({ traffic_share: 50 }).eq("id", base.id);
  return [{ key: "A", variant_id: base.id }, { key: "B", variant_id: nv.id, [t.element]: b }];
}

export async function startAbTest(id: string): Promise<AbTest> {
  const { data: t } = await db().from("ab_tests").select("*").eq("id", id).maybeSingle();
  if (!t) throw new AbActionError("Test unbekannt");
  if (t.status !== "entwurf") throw new AbActionError(`Test ist schon ${t.status}`);
  const errs = checkTest(AB_REG, TEST_SCOPE, { step: t.step, segment: t.segment_id, country: t.country, element: t.element,
    b: variantValue(t, "B"), a: variantValue(t, "A"), hypothese: t.hypothese });
  if (errs.length) throw new AbActionError(errs.slice(0, 4).join(" · "));
  const { data: running } = await db().from("ab_tests").select("id").eq("step", t.step).eq("country", t.country).eq("status", "laeuft").limit(1);
  if (running?.length) throw new AbActionError("für diesen Schritt und dieses Land läuft schon ein Test (höchstens einer)");
  const upd: Record<string, unknown> = { status: "laeuft", gestartet: new Date().toISOString() };
  if (t.step === "landing") Object.assign(upd, { varianten: await landingSetup(t as AbTest), quelle: "page_variants" });
  const { error } = await db().from("ab_tests").update(upd).eq("id", id).eq("status", "entwurf");
  if (error) throw new AbActionError(error.code === "23505" ? "für diesen Schritt und dieses Land läuft schon ein Test" : error.message);
  await decide(`Test gestartet: ${label(t)}`, t.hypothese, `Test: ${label(t)} · ${t.element}`,
    { test_id: t.id, step: t.step, element: t.element, varianten: t.varianten, min_n: t.min_n });
  return { ...(t as AbTest), ...(upd as Partial<AbTest>) };
}

/** Test stoppen (A bleibt). Gewinner übernimmt die Auswertung (scripts/ab.py auswerten, Wachhund) nach festen Regeln. */
export async function stopAbTest(id: string, grund: string): Promise<AbTest> {
  const g = grund.replace(/\s+/g, " ").trim();
  if (g.length < 3 || g.length > 160) throw new AbActionError("Grund: 3–160 Zeichen");
  const { data: t } = await db().from("ab_tests").select("*").eq("id", id).maybeSingle();
  if (!t) throw new AbActionError("Test unbekannt");
  if (t.status !== "laeuft" && t.status !== "entwurf") throw new AbActionError(`Test ist schon ${t.status}`);
  const upd = { status: "gestoppt", beendet: new Date().toISOString(), grund: g, gewinner: null };
  const { error } = await db().from("ab_tests").update(upd).eq("id", id);
  if (error) throw new Error(error.message);
  if (t.quelle === "page_variants" && t.status === "laeuft") {
    for (const v of (t.varianten ?? []) as { key: string; variant_id?: string }[]) {
      if (!v.variant_id) continue;
      await db().from("page_variants").update(v.key === "A" ? { traffic_share: 100 } : { status: "retired", traffic_share: 0 }).eq("id", v.variant_id);
    }
  }
  await decide(`Test gestoppt: ${label(t)}`, g, `Test-Ergebnis: ${label(t)} · ${t.element}`, { test_id: t.id, status: "gestoppt" });
  return { ...(t as AbTest), ...(upd as Partial<AbTest>) };
}
