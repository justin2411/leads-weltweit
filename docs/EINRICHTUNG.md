# Einmalige Einrichtung (Inhaber) – danach macht Claude alles selbst

Regel (Inhaber, 26.09.2026): Der Inhaber richtet jeden Zugang **genau einmal** ein. Danach nutzt Claude/das Gehirn ihn
selbst über GitHub-Workflows, Secrets und Connectoren und fragt nicht erneut. Neue Zugänge werden hier eingetragen
(was, wo, Status, welcher Workflow ihn nutzt). Vor jeder Bitte an den Inhaber zuerst hier nachsehen.

| Zugang | Wo eingerichtet | Genutzt von | Status |
|---|---|---|---|
| Supabase (Service-Key) | GitHub-Secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | alle Workflows | erledigt |
| Supabase (Connector) | claude.ai → Connectoren + Routine „Gehirn“ → Connectors | stündliche Gehirn-Sitzung | Routine: offen |
| Vercel | GitHub-Secret `VERCEL_TOKEN` | `vercel.yml` (Status, Preview-Variablen, Redeploy) | erledigt |
| Vercel-Umgebungsvariablen | Vercel → Settings → Environment Variables | App | erledigt |
| Stripe Test + Live | Vercel-Variablen | App | erledigt |
| Resend (nur Einwilligung/Kunden) | GitHub-Secrets `RESEND_API_KEY`, `MAIL_FROM` | Antworten, Lieferungen | erledigt |
| DNS für Strato-Mail | Vercel → Domains → nextgen-profit.de (MX, SPF, DMARC, DKIM) | Empfang info@, Versand | offen |
| Strato-Postfach SMTP/IMAP | GitHub-Secrets `SMTP_*`, `IMAP_*` | `send.yml`, `antworten.yml`, `postfach-test.yml` | offen |

Selbst prüfen statt fragen: `postfach-test` (DNS, SMTP, Empfang), `vercel.yml` status, `/api/health`, `scripts/dns_check.py`.
