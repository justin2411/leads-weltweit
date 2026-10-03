import "server-only";

/** Antwort im selben Gesprächsverlauf: In-Reply-To/References; idempotencyKey: dieselbe Mail nie doppelt (Resend, 24 h). */
export type ConsentMailOptions = { inReplyTo?: string; references?: string[]; idempotencyKey?: string };

/** Nur „<…@…>“ ohne Leer-/Steuerzeichen (Schutz vor Header-Injection). */
const okId = (s: string | undefined): s is string => !!s && s.length <= 400 && /^<[^<>@\s]+@[^<>@\s]+>$/.test(s);

/**
 * Mails über Resend – NUR an Empfänger mit Einwilligung (Probe-Bestätigung, Willkommensmail, Lieferungen, Antworten
 * an Leute, die uns selbst geschrieben haben). Kaltakquise über Resend ist verboten (Resend-Bedingungen, Entscheidung
 * Inhaber 26.09.2026). Ohne RESEND_API_KEY oder MAIL_FROM wird nichts gesendet.
 */
export async function sendConsentMail(to: string, subject: string, text: string, html?: string,
                                      attachments?: { filename: string; content: Uint8Array }[],
                                      opts?: ConsentMailOptions): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return null;
  const headers: Record<string, string> = {};
  if (okId(opts?.inReplyTo)) headers["In-Reply-To"] = opts.inReplyTo;
  const refs = (opts?.references ?? []).filter(okId);
  if (refs.length) headers.References = refs.join(" ");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json",
               ...(opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey.slice(0, 256) } : {}) },
    body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}),
      ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(process.env.REPLY_TO ? { reply_to: process.env.REPLY_TO } : {}) }),
    // Antworten aus dem Cockpit warten nie endlos (bisherige Aufrufer ohne opts: unverändert)
    ...(opts ? { signal: AbortSignal.timeout(20000) } : {}),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { id?: string }).id ?? null;
}
