/** Welche Umgebungsvariablen die App kennt (nur Namen – Werte werden nie angezeigt). */
export const ENV_VARS: { name: string; purpose: string; required: boolean }[] = [
  { name: "SUPABASE_URL", purpose: "Datenbank-Adresse", required: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Datenbank-Schlüssel (nur serverseitig)", required: true },
  { name: "SESSION_SECRET", purpose: "Login-Cookie und Filter-Links signieren", required: true },
  { name: "DASHBOARD_PASSWORD", purpose: "Dashboard-Login", required: true },
  { name: "SITE_URL", purpose: "Öffentliche Adresse (später https://nextgen-profit.de)", required: true },
  { name: "RESEND_API_KEY", purpose: "Mails mit Einwilligung (Probe, Willkommen)", required: false },
  { name: "MAIL_FROM", purpose: "Absender dieser Mails", required: false },
  { name: "REPLY_TO", purpose: "Antwortadresse", required: false },
  { name: "RESEND_WEBHOOK_SECRET", purpose: "Resend-Zustellereignisse", required: false },
  { name: "STRIPE_SECRET_KEY", purpose: "Bezahlung (sk_test_… zum Testen)", required: false },
  { name: "STRIPE_WEBHOOK_SECRET", purpose: "Stripe-Ereignisse (whsec_…)", required: false },
  { name: "BRAND_NAME", purpose: "Markenname (Standard NextGen Profit)", required: false },
];

export function envStatus(env: Record<string, string | undefined> = process.env) {
  return ENV_VARS.map((v) => ({ ...v, set: !!(env[v.name] && env[v.name]!.trim()) }));
}
