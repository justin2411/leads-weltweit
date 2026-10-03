# Einmalige Einrichtung (Inhaber) – danach macht Claude alles selbst

Regel (Inhaber, 26.09.2026): Der Inhaber richtet jeden Zugang **genau einmal** ein. Danach nutzt Claude/das Gehirn ihn
selbst über GitHub-Workflows, Secrets und Connectoren und fragt nicht erneut. Neue Zugänge werden hier eingetragen
(was, wo, Status, welcher Workflow ihn nutzt). Vor jeder Bitte an den Inhaber zuerst hier nachsehen.

| Zugang | Wo eingerichtet | Genutzt von | Status |
|---|---|---|---|
| Supabase (Service-Key) | GitHub-Secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | alle Workflows | erledigt |
| Supabase (Gehirn-Routine) | Claude-Umgebung „pläne“ → Umgebungsvariablen `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Connectoren für Routinen im Konto gesperrt) | stündliche Gehirn-Sitzung | eingetragen 27.09. |
| Vercel | GitHub-Secret `VERCEL_TOKEN` | `vercel.yml` (Status, Preview-Variablen, Redeploy) | erledigt |
| Vercel-Umgebungsvariablen | Vercel → Settings → Environment Variables | App | erledigt |
| Inhaber-Dashboard (Login) | Vercel-Variablen `DASHBOARD_PASSWORD` (das Passwort, das der Inhaber unter `/login` eingibt) und `SESSION_SECRET` (Production) | `/login` → `/dashboard` (Übersicht: Engpässe, Trichter, Wer ist wo, Bestand, Versand, Kunden). Nur über die direkte Adresse `/login` erreichbar, nirgends verlinkt, nicht in robots.txt/Sitemap; `/dashboard` ohne Anmeldung = 404. Passwort ändern: Variable in Vercel ändern und neu deployen (`vercel.yml` redeploy) | erledigt; optional zeigt `GH_DISPATCH_TOKEN` (s. u., braucht dafür auch „Actions: Read“) die letzten GitHub-Läufe im Dashboard |
| Stripe Test + Live | Vercel-Variablen | App | erledigt |
| Resend (nur Einwilligung/Kunden) | GitHub-Secrets `RESEND_API_KEY`, `MAIL_FROM` | Antworten, Lieferungen | erledigt |
| DNS für Strato-Mail | Vercel → Team → Domains → nextgen-profit.de → DNS Records (MX, SPF, DMARC) | Empfang info@, Versand | erledigt 27.09.; DKIM erledigt 02.10.: CNAME `strato-dkim-0002._domainkey` und `strato-dkim-0003._domainkey` → `…._domainkey.strato.de` in Vercel DNS; Gmail-Test 02.10.: SPF, DKIM (strato-dkim-0002, d=nextgen-profit.de) und DMARC PASS. Prüfung automatisch im `postfach-test` (Schritt 4) |
| Strato-Postfach SMTP/IMAP | GitHub-Secrets `SMTP_*`, `IMAP_*` | `send.yml`, `antworten.yml`, `postfach-test.yml` | erledigt 27.09., Postfach-Test grün |
| Weitere Versand-Postfächer (optional, zum Hochskalieren) | GitHub-Secrets `SMTP_USER_2`, `SMTP_PASSWORD_2`, `SMTP_FROM_2` (bis `_5`; Host/Port wie Postfach 1) | `send.yml`, `scripts/lib/mailboxes.py` | offen – nur wenn mehr als ~150 Mails/Tag nötig; jedes neue Postfach fährt drei Wochen hoch. Antworten gehen per Reply-To ans Hauptpostfach |
| Anthropic-API (Guthaben 15 $, Inhaber 27.09.) | GitHub-Secret `ANTHROPIC_API_KEY`, optional Variable `CLAUDE_MODEL` (Standard `claude-sonnet-5`) | `antworten.yml` (Einordnung eingehender Antworten, ca. 1 Cent pro Antwort); Test: `ki-test.yml` | erledigt 27.09., Test grün |
| Website physiotherapie-oehlke (Subdomain) | Vercel-Projekt `physiotherapie-oehlke`, Root Directory `sites/physiotherapie-oehlke`, Domain `physiotherapie-oehlke.nextgen-profit.de` (Inhaber 03.10.2026) | `vercel.yml` mit `site-setup physiotherapie-oehlke` (legt Projekt/Subdomain an, baut aus `main`), danach automatisch bei jedem Push | eingerichtet über Workflow |
| Probe-Lauf und Werke sofort anstoßen (optional, kostenlos) | Vercel-Variable `GH_DISPATCH_TOKEN` (Production): fein granulares GitHub-Token (github.com → Settings → Developer settings → Fine-grained tokens → nur Repository `justin2411/leads-weltweit`, Berechtigung „Actions: Read and write“, Ablauf 1 Jahr), danach neu deployen | `app/api/sample-request` → `proben-vorrat.yml`, nur wenn nach dem Klick kein fertiger Vorrat passt; „Jetzt starten“ / „Übernehmen & sofort anwenden“ in JARVIS und Regler (Lead-Werk, Kunden-Werk, Proben-Vorrat) | **offen** – ohne Token startet der Wachhund angeforderte Läufe spätestens nach 15 min (`signalwerk.start_requests`); Proben kommen fast immer sofort aus dem Vorrat |
| Companies House API (kostenlos) | GitHub-Secret `COMPANIES_HOUSE_API_KEY` (developer.company-information.service.gov.uk → Application → REST API key) | `anreichern.yml` (UK: Geschäftsführer, Adresse, Status aus dem Register) | **offen** – beim ersten Anreichern-Lauf 27.09. leer |

Selbst prüfen statt fragen: `postfach-test` (DNS, SMTP, Empfang), `vercel.yml` status, `/api/health`, `scripts/dns_check.py`.
