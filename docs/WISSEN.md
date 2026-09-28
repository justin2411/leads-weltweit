# Wissen: Technik, Daten, Quellen, Lehren

Stand: 28.09.2026. Nachschlagewerk für jede neue Sitzung: **wie das System gebaut ist und was wir schon gelernt haben**
(auch aus Fehlern). Einrichtung der Zugänge: [`EINRICHTUNG.md`](EINRICHTUNG.md).

## 1. Architektur

| Baustein | Aufgabe | Wo |
|---|---|---|
| GitHub-Repo `justin2411/leads-weltweit` | Code, Migrationen, Anleitungen; `main` = Produktion | – |
| GitHub Actions | alle wiederkehrenden Läufe (Versand, Antworten, Lieferungen, Checks) | `.github/workflows/` |
| Python-Skripte | Leads, Käufer, Entwürfe, Versand, Antworten, Lieferungen, Berichte | `scripts/`, `scripts/lib/` |
| Supabase (Projekt `udkkchduyrkzuktlknbc`, Schema `signalwerk`) | Datenbank; Zugriff nur serverseitig mit Service-Schlüssel, RLS an | `supabase/migrations/` |
| Vercel (kostenlos) | Next.js-App: Website, Landingpages, Kasse, Webhooks, Dashboard | `app/` |
| Strato (info@nextgen-profit.de) | Kaltmails (SMTP) und Postfach für Antworten/Bounces (IMAP) | Secrets `SMTP_*`, `IMAP_*` |
| Resend | nur Mails mit Einwilligung: Proben, Bestätigungen, Kunden, Meldungen an den Inhaber | `RESEND_API_KEY`, `MAIL_FROM` |
| Stripe (live + test) | Abo-Kasse; Vercel-Vorschau nutzt den Testmodus („Sandbox“) | `STRIPE_*` |
| Anthropic-API | Einordnung eingehender Antworten (`claude-sonnet-5`, ca. 1 Cent pro Antwort) | `ANTHROPIC_API_KEY` |

**Vercel-Variablen (Namen):** SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, DASHBOARD_PASSWORD, SITE_URL,
RESEND_API_KEY, MAIL_FROM, REPLY_TO, RESEND_WEBHOOK_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET, BRAND_NAME (optional SALE_NOTIFY_EMAIL).
Status ohne Werte: `https://www.nextgen-profit.de/api/health`.

**GitHub-Secrets (Namen):** SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_HOST/PORT/USER/PASSWORD/FROM,
IMAP_HOST/USER/PASSWORD, RESEND_API_KEY, MAIL_FROM, REPLY_TO, OWNER_EMAIL, SENDER_NAME/COMPANY/TITLE/WEBSITE/PHONE/
POSTAL_ADDRESS, LEGAL_NAME, ANTHROPIC_API_KEY, VERCEL_TOKEN, COMPANIES_HOUSE_API_KEY (**noch leer**).
Nie Werte in Code, Commits oder Berichte.

## 2. Datenmodell (Schema `signalwerk`)

| Tabelle | Inhalt |
|---|---|
| `segments`, `experiments` | Zielgruppen und Tests (Segment × Land × Botschaft) |
| `watch_companies`, `observations`, `leads`, `lead_tags` | beobachtete Firmen, Rohbeobachtungen (auch `kind=other`: `website`, `contact`, `person`, `quality`), erkannte Signale |
| `prospects`, `messages`, `email_events`, `suppression` | Käufer, Mails (`kind` initial/followup/sample_followup; `status` draft→approved→sent/blocked), Ereignisse, Sperrliste |
| `landing_pages`, `page_variants`, `page_events`, `sample_requests` | Seiten aus der DB, Ereignisse ohne personenbezogene Daten, Probe-Anfragen (`status` new/sent/rejected) |
| `customers`, `subscriptions`, `customer_filters`, `deliveries` | Kunden (Testkäufe: `status trial`), Abos, Wünsche (max. 10.000 pro Woche), Lieferungen |
| `settings`, `decisions`, `learning_log` | Schalter und Preise, Entscheidungsprotokoll, Lernnotizen |

Wichtige Funktionen: `is_suppressed(p_email)`, `suppress_email(p_email, p_reason, p_source)`.

## 3. Quellen für Leads

| Land | Quellen |
|---|---|
| UK | Companies House (Bulk-Daten Neugründungen; API mit Schlüssel für Geschäftsführer), Karriereseiten |
| US | Register der Bundesstaaten (NY über data.ny.gov), Karriereseiten |
| FR | BODACC, recherche-entreprises (RNE/INPI) inkl. Dirigeants |
| alle | eigene Websites der Firmen (Impressum/Kontakt), DNS/MX |

Regeln: nur öffentliche Register, amtliche Bekanntmachungen, Firmenwebsites und offene Schnittstellen;
robots.txt beachten, höchstens einmal täglich pro Seite; **kein** LinkedIn, Indeed, Google Maps u. Ä.

**Stand der Lieferfähigkeit (27.09.):** tausende Neugründungen (UK ~12.700, US ~1.600, FR ~480), aber nur wenige mit
Website; bei 150 angereicherten Firmen 0 vollständig. Websites liefern meist Telefon, oft keine E-Mail
(Kontaktformular). UK-Geschäftsführer fehlen ohne Companies-House-Schlüssel. → Neuaufbau am 28.09.

## 4. Käufer (Prospects)

`scripts/osm.py` (OpenStreetMap) → `scripts/prospects.py` (Website, allgemeine Adresse) → `outreach.py check`
(Land erlaubt, Rechtsform, Adresse, Sperrliste, MX). UK nur Ltd/LLP/PLC und allgemeine Adressen (PECR).
Vorrat 28.09.: ca. 530 geprüfte Käufer.

## 5. Lehren aus Fehlern (nicht wiederholen)

| Datum | Fehler | Lehre |
|---|---|---|
| 27.09. | `db.update(..., {"id": f"eq.{id}"})` → `eq.eq.` → jeder Versandlauf brach ab | `db.update`/`db.select` setzen `eq.` selbst bei `update`; bei `select` Filter mit Operator angeben. Regressionstest `tests/test_drafts.py` |
| 27.09. | `drafts.py --refresh` hätte Nachfassmails mit dem Erstmail-Text überschrieben | Abfragen immer nach `kind` filtern |
| 27.09. | Web-Probe-Anfragen wurden nie ausgeliefert (nur im abgeschalteten Gehirn) | jede Zusage auf der Website braucht einen geplanten Lauf; Tagescheck prüft offene Anfragen |
| 27.09. | Anreicherung erreichte Firmen mit Website nie (nur 600 neueste geladen) | Auswahl erst filtern, dann begrenzen |
| 27.09. | `taeglich.yml` lief ins Zeitlimit, Nachfassmails/Entwürfe übersprungen | langsame Schritte mit eigenem Zeitlimit und `continue-on-error`; wichtige Schritte zuletzt absichern |
| 28.09. | GitHub ließ geplante Läufe aus (stündlich → 3×/Tag, morgens gar nicht) | Wachhund `wachhund.yml` startet nach; nie auf `schedule` allein verlassen |
| 28.09. | `inbox.py` 409 bei erneut gelesener Bounce-Meldung → Antworten und Proben liefen nicht | Einfügen mit `dedupe_key` immer idempotent (`upsert_on`, `ignore_duplicates`); Folgeschritte mit `!cancelled()` |
| 27.09. | Stripe-Kasse 500: eingeschränkter Schlüssel ohne Rechte | `/api/health?stripe=1` zeigt Kontostatus; Fehlerseite statt 500 |
| 27.09. | Globale CSS-Klassen (`.steps`, `.flow`) überlagerten neue Seiten | seitenspezifische Präfixe (siehe DESIGN.md) |
| 27.09. | Demo-Link ging nicht: Login-Cookie `SameSite=strict` fehlt bei Aufruf aus anderer App | Demo nur mit Beispieldaten, ohne Login-Prüfung |
| 27.09. | `{land}` im Seitentitel, „de de toute la France“ | Platzhalter auch in `generateMetadata` ersetzen; Texte je Sprache prüfen |
| 27.09. | Beispiel-Leads US/FR fehlten: alle Neugründungen eines Tages galten als Duplikat | Duplikat-Schlüssel je Firma (`inc|company_id`) |

## 6. Werkzeuge in der Claude-Umgebung

- **Screenshots:** Playwright mit Chromium unter `/opt/pw-browsers` (nie `playwright install`); Anfragen über den
  Proxy mit Python `requests` weiterleiten, sonst Zertifikatsfehler.
- **ffmpeg:** `imageio_ffmpeg.get_ffmpeg_exe()`.
- **PDF aus HTML:** Playwright `page.pdf(...)` (Beispiel: `docs/workflow/workflow.html`).
- **GitHub:** über MCP-Werkzeuge (PRs, Actions starten/abbrechen, Logs), nicht `gh`.
- **Supabase:** MCP `execute_sql` (nur Schema `signalwerk`), Migrationen erst nach Ja des Inhabers.

## 7. Tests und Prüfungen

```bash
python -m unittest discover -s tests       # Python (u. a. drafts, followups, deliveries, responder, tagescheck, wachhund)
python scripts/lint_templates.py            # Mailvorlagen gegen Schreibregeln
cd app && npx tsc --noEmit -p . && npm test && npx next build
python scripts/tagescheck.py                # Ist-Zustand aller Kontaktpunkte (ohne --send keine Mail)
python scripts/wachhund.py                  # welche Läufe überfällig wären (braucht GITHUB_TOKEN)
```
