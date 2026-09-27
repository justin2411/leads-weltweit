import "server-only";

/**
 * Mails über Resend – NUR an Empfänger mit Einwilligung (Probe-Bestätigung, Willkommensmail, Lieferungen).
 * Kaltakquise über Resend ist verboten (Resend-Bedingungen, Entscheidung Inhaber 26.09.2026).
 * Ohne RESEND_API_KEY oder MAIL_FROM wird nichts gesendet.
 */
export async function sendConsentMail(to: string, subject: string, text: string, html?: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return null;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}), ...(process.env.REPLY_TO ? { reply_to: process.env.REPLY_TO } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { id?: string }).id ?? null;
}
