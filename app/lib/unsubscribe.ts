/**
 * Abmeldung über den Link in der Mail (Inhaber 05.10.2026: „Abmeldelink ja“).
 *
 * GET (Link aus der Mail) sperrt NICHT, sondern zeigt nur eine Seite mit einem Knopf „Abmelden bestätigen“ –
 * Link-Scanner der Empfänger-Mailserver öffnen Links sofort nach Zustellung und haben bisher Abmeldungen ausgelöst.
 * POST (Knopf oder RFC-8058-Ein-Klick-Abmeldung aus dem Mailprogramm, „List-Unsubscribe=One-Click“) sperrt sofort.
 * Ohne Abhängigkeiten von Next/Supabase, damit es testbar ist.
 */

export type Lang = "en" | "fr";

export type UnsubDeps = {
  /** Mail zum Token, oder null. country = Land des Empfängers (prospects.country), falls bekannt. */
  find(token: string): Promise<{ id: string; to_email: string; resend_id?: string | null; country?: string | null } | null>;
  suppress(email: string): Promise<void>;
  event(row: { message_id: string; resend_id: string | null; type: "unsubscribed"; note: string }): Promise<void>;
};

const TOKEN_RE = /^[a-f0-9]{16,128}$/;

export function validToken(t: string | null | undefined): t is string {
  return !!t && TOKEN_RE.test(t);
}

export function langFor(country: string | null | undefined): Lang {
  return String(country ?? "").toUpperCase() === "FR" ? "fr" : "en";
}

const TEXT = {
  en: {
    confirmTitle: "Unsubscribe",
    confirmText: "Click the button to stop all further emails from us to this address.",
    button: "Confirm unsubscribe",
    doneTitle: "You are unsubscribed",
    doneText: "Your address and your company domain have been removed. You will not receive any further emails from us.",
    invalidTitle: "Link not valid",
    invalidText: "This unsubscribe link is not valid. Please reply to the email with “unsubscribe” and we will remove you.",
  },
  fr: {
    confirmTitle: "Désinscription",
    confirmText: "Cliquez sur le bouton pour ne plus recevoir aucun e-mail de notre part à cette adresse.",
    button: "Confirmer la désinscription",
    doneTitle: "Vous êtes désinscrit",
    doneText: "Votre adresse et le domaine de votre entreprise ont été retirés. Vous ne recevrez plus aucun e-mail de notre part.",
    invalidTitle: "Lien non valide",
    invalidText: "Ce lien de désinscription n’est pas valide. Répondez simplement à l’e-mail avec « désinscription » et nous vous retirerons.",
  },
} as const;

const STYLE =
  "body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222;background:#fff}" +
  "h1{margin:0 0 .75rem;font-size:1.5rem}p{margin:0 0 1.25rem}" +
  "button{font:inherit;padding:.6rem 1.2rem;border:1px solid #222;border-radius:6px;background:#222;color:#fff;cursor:pointer}";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function htmlPage(lang: Lang, title: string, text: string, form = "", status = 200): Response {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>${STYLE}</style>
</head><body><h1>${esc(title)}</h1><p>${esc(text)}</p>${form}</body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

function invalid(lang: Lang = "en") {
  const t = TEXT[lang];
  return htmlPage(lang, t.invalidTitle, t.invalidText, "", 404);
}

/** GET: nur Bestätigungsseite, sperrt nie. */
export async function handleGet(url: string, deps: UnsubDeps): Promise<Response> {
  const token = new URL(url).searchParams.get("t");
  if (!validToken(token)) return invalid();
  const m = await deps.find(token);
  if (!m) return invalid();
  const lang = langFor(m.country);
  const t = TEXT[lang];
  const form = `<form method="post" action="/api/unsubscribe?t=${token}">` +
    `<input type="hidden" name="t" value="${token}"><button type="submit">${esc(t.button)}</button></form>`;
  return htmlPage(lang, t.confirmTitle, t.confirmText, form);
}

/** POST: Knopf oder Ein-Klick-Abmeldung (RFC 8058) – sperrt sofort. */
export async function handlePost(req: Request, deps: UnsubDeps): Promise<Response> {
  let token = new URL(req.url).searchParams.get("t");
  let oneClick = false;
  const ct = req.headers.get("content-type") ?? "";
  if (/application\/x-www-form-urlencoded|multipart\/form-data/i.test(ct)) {
    try {
      const fd = await req.formData();
      oneClick = String(fd.get("List-Unsubscribe") ?? "") === "One-Click";
      if (!token) token = (fd.get("t") as string | null) ?? null;
    } catch { /* leerer oder kaputter Body: Token aus der URL genügt */ }
  }
  if (!validToken(token)) return invalid();
  const m = await deps.find(token);
  if (!m) return invalid();
  await deps.suppress(m.to_email);
  await deps.event({
    message_id: m.id,
    resend_id: m.resend_id ?? null,
    type: "unsubscribed",
    note: oneClick ? "Abmeldelink (Ein-Klick im Mailprogramm)" : "Abmeldelink (bestätigt)",
  });
  const lang = langFor(m.country);
  return htmlPage(lang, TEXT[lang].doneTitle, TEXT[lang].doneText);
}
