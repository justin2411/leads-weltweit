/**
 * Sofortversand der Probe nach dem Klick (Inhaber 03.10.2026: „es soll direkt nach dem button klick die probe rausgehen
 * auch immer mit den aktuell besten leads“).
 *
 * scripts/sample_stock.py hält fertige, geprüfte Proben bereit (genau 10 verschiedene Firmen, alle Prüfungen, Leads
 * reserviert). Die fertige Mail liegt als JSON im privaten Storage-Bucket „sample-stock“ – Betreff, Text, HTML,
 * PDF + CSV, exakt wie web_samples.py sie sendet. Hier: eine passende Probe atomar nehmen (claim_sample_stock), die
 * Empfänger-Domain in die Fußzeile setzen, per Resend senden (Idempotency-Key je Anfrage: nie doppelt) und das
 * Ergebnis zurückmelden (finish_sample_stock). Ohne Abhängigkeiten von Next/Supabase, damit es testbar ist.
 */

export const STOCK_BUCKET = "sample-stock";
export const PLACEHOLDER = "__EMPFAENGER_DOMAIN__";

export type StockPayload = {
  version?: number;
  placeholder?: string;
  lang?: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string }[];
  /** A/B „Probe-Mail“ (scripts/sample_stock.py probe_ab): {test_id: A|B} – der Aufrufer zählt den Kontakt */
  ab?: Record<string, string>;
};

export type StockDeps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
  download: (path: string) => Promise<string>;
  fetch: typeof fetch;
  env: { RESEND_API_KEY?: string; MAIL_FROM?: string; REPLY_TO?: string };
};

export type StockResult = { status: "sent" | "none" | "error"; stockId?: string; resendId?: string | null; detail?: string;
  /** A/B-Marken der gesendeten Probe (nur bei „sent“) */
  ab?: Record<string, string> };

/** Wie lib.rules.normalize_domain in Python: Domain der Adresse, klein, ohne www. */
export function recipientDomain(email: string): string {
  let v = (email.split("@").pop() ?? "").trim().toLowerCase();
  v = v.replace(/^[a-z]+:\/\//, "").split("/")[0].split("?")[0].split(":")[0];
  return v.startsWith("www.") ? v.slice(4) : v;
}

/** Fertige Mail für genau diesen Empfänger (Platzhalter in Text und HTML ersetzen). */
export function personalize(p: StockPayload, email: string): StockPayload {
  const ph = p.placeholder || PLACEHOLDER;
  const dom = recipientDomain(email);
  return { ...p, text: p.text.split(ph).join(dom), html: p.html.split(ph).join(dom) };
}

/** Resend-Aufruf mit allen Inhalten der fertigen Probe. */
export function resendBody(p: StockPayload, to: string, env: StockDeps["env"], subjectPrefix = "") {
  const from = env.MAIL_FROM!;
  return {
    from, to: [to], subject: subjectPrefix + p.subject, text: p.text, html: p.html,
    ...(p.headers && Object.keys(p.headers).length ? { headers: p.headers } : {}),
    ...(p.attachments?.length ? { attachments: p.attachments } : {}),
    reply_to: env.REPLY_TO?.trim() || from,
  };
}

/**
 * Probe aus dem Vorrat an den Anfragenden. Die Anfrage muss schon gesperrt sein (sample_requests.claimed_at).
 * - kein passender Vorrat -> "none" (Anfrage bleibt in der Warteschlange)
 * - Resend lehnt ab (sicher nicht gesendet) -> Probe wieder bereit, Sperre frei, "error"
 * - Netzfehler (unklar, ob gesendet) -> Probe failed, Leads vorsichtshalber vergeben, "error"
 */
export async function sendFromStock(deps: StockDeps, req: { id: string; segment: string; country: string; email: string;
                                                             wish: string[] }): Promise<StockResult> {
  if (!deps.env.RESEND_API_KEY || !deps.env.MAIL_FROM) return { status: "none", detail: "Resend nicht eingerichtet" };
  const { data, error } = await deps.rpc("claim_sample_stock", {
    p_segment: req.segment, p_country: req.country, p_wish: req.wish, p_request: req.id,
  });
  if (error) return { status: "error", detail: `claim: ${error.message}` };
  const s = Array.isArray(data) ? data[0] : null;
  if (!s) return { status: "none" };
  const finish = (ok: boolean, release: boolean, note: string, resendId: string | null = null) =>
    deps.rpc("finish_sample_stock", { p_stock: s.id, p_ok: ok, p_release: release, p_resend_id: resendId, p_note: note });

  let payload: StockPayload;
  try {
    payload = personalize(JSON.parse(await deps.download(s.storage_path)) as StockPayload, req.email);
  } catch (e) {
    await finish(false, false, `Datei: ${String(e).slice(0, 150)}`);
    return { status: "error", stockId: s.id, detail: "Datei fehlt" };
  }
  let res: Response;
  try {
    res = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.env.RESEND_API_KEY}`, "Content-Type": "application/json",
                 "Idempotency-Key": `sample-${req.id}` },
      body: JSON.stringify(resendBody(payload, req.email, deps.env)),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    await finish(false, false, `Versand unklar: ${String(e).slice(0, 150)}`);
    return { status: "error", stockId: s.id, detail: "Versand unklar" };
  }
  if (!res.ok) {
    const t = (await res.text().catch(() => "")).slice(0, 150);
    await finish(false, true, `Resend ${res.status}: ${t}`);
    return { status: "error", stockId: s.id, detail: `Resend ${res.status}` };
  }
  const resendId = ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null;
  await finish(true, false, "Sofortversand nach dem Klick", resendId);
  return { status: "sent", stockId: s.id, resendId, ...(payload.ab && Object.keys(payload.ab).length ? { ab: payload.ab } : {}) };
}

/**
 * Inhaber-Vorschau: eine fertige Probe NUR an den Inhaber, ohne Vorrat zu verbrauchen (nichts wird vergeben,
 * reserviert oder als gesendet markiert). Liefert die gemessene Zeit vom Abruf bis zur Annahme durch Resend.
 */
export async function previewFromStock(deps: StockDeps & { peek: (segment: string, country: string) => Promise<string | null> },
                                       owner: string, segment: string, country: string): Promise<StockResult & { ms?: number }> {
  if (!deps.env.RESEND_API_KEY || !deps.env.MAIL_FROM) return { status: "none", detail: "Resend nicht eingerichtet" };
  const t0 = Date.now();
  const path = await deps.peek(segment, country);
  if (!path) return { status: "none" };
  const payload = personalize(JSON.parse(await deps.download(path)) as StockPayload, owner);
  const res = await deps.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(resendBody(payload, owner, deps.env, "[TEST] ")),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { status: "error", detail: `Resend ${res.status}` };
  return { status: "sent", resendId: ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null, ms: Date.now() - t0 };
}

/**
 * Kein Vorrat passte: Probe-Workflow sofort anstoßen (statt bis zum nächsten Stundenlauf zu warten). Nur mit der
 * Vercel-Variable GH_DISPATCH_TOKEN (fein granulares GitHub-Token, nur „Actions: write“ für dieses Repo); ohne sie
 * bleibt der stündliche Lauf (plus Wachhund) als Rückfall.
 */
export async function dispatchSampleWorkflow(fetchFn: typeof fetch, token: string | undefined,
                                             repo = "justin2411/leads-weltweit"): Promise<boolean> {
  if (!token?.trim()) return false;
  const res = await fetchFn(`https://api.github.com/repos/${repo}/actions/workflows/proben-vorrat.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/vnd.github+json",
               "Content-Type": "application/json", "User-Agent": "nextgen-profit-app" },
    body: JSON.stringify({ ref: "main", inputs: { befehl: "run" } }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return !!res && res.status === 204;
}
