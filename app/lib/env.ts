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
  { name: "STRIPE_SECRET_KEY", purpose: "Stripe LIVE (sk_live_/rk_live_) – echte Zahlungen", required: false },
  { name: "STRIPE_WEBHOOK_SECRET", purpose: "Stripe LIVE-Webhook (whsec_…)", required: false },
  { name: "STRIPE_TEST_SECRET_KEY", purpose: "Stripe TEST (sk_test_/rk_test_) – Vorschau und Tests", required: false },
  { name: "STRIPE_TEST_WEBHOOK_SECRET", purpose: "Stripe TEST-Webhook (whsec_…)", required: false },
  { name: "BRAND_NAME", purpose: "Markenname (Standard NextGen Profit)", required: false },
  { name: "GH_DISPATCH_TOKEN", purpose: "Probe-Lauf sofort anstoßen, wenn kein Vorrat passt (GitHub-Token, nur Actions: write)", required: false },
  // Handy-Alarm (Web-Push), angelegt von vercel.yml env-add-vapid (Nachtschicht 04.10.2026)
  { name: "VAPID_PUBLIC_KEY", purpose: "Handy-Alarm: öffentlicher Schlüssel", required: false },
  { name: "VAPID_PRIVATE_KEY", purpose: "Handy-Alarm: privater Schlüssel (sensitiv)", required: false },
  { name: "VAPID_SUBJECT", purpose: "Handy-Alarm: Kontakt (mailto:)", required: false },
  // Sofort-Antworten im JARVIS-Chat (Inhaber 04.10.2026): nur serverseitig, nie geloggt; fehlt er, antwortet die Routine
  { name: "ANTHROPIC_API_KEY", purpose: "JARVIS-Chat Sofort-Antworten (Claude-API, nur serverseitig)", required: false },
];

export function envStatus(env: Record<string, string | undefined> = process.env) {
  return ENV_VARS.map((v) => ({ ...v, set: !!(env[v.name] && env[v.name]!.trim()) }));
}
