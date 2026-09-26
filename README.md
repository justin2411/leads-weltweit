# Signalwerk

B2B-Leads mit Anlass. Arbeitsanweisung für Claude: [`CLAUDE.md`](CLAUDE.md).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `app/` | Next.js-App für Vercel: `/api/unsubscribe`, `/api/webhooks/resend`, `/dashboard`, `/login` |
| `supabase/migrations/` | Schema `signalwerk` (nur dieses Schema, nicht destruktiv) und Segmente S1–S8 |
| `scripts/` | `watch.py` (Quellen, Beobachtungen, Leads), `outreach.py` (prüfen, Entwürfe prüfen, senden), `inbox.py` (Bounces/Antworten aus dem Postfach), `lint_templates.py` |
| `scripts/lib/` | Prüfregeln, Signalregeln, höflicher Abruf (robots.txt, 1x/Tag), Website-Prüfung, DB-Zugriff |
| `drafts/` | Entwurfsvorlagen je Segment und Land |
| `samples/` | Probe-Leads je Segment und Land |
| `countries.yaml` | Welche Länder Mails bekommen dürfen, Tageslimits |

## Einrichtung (Inhaber)

1. **Migration anwenden** (erst nach Durchsicht): `supabase/migrations/*.sql` im gewählten Supabase-Projekt
   ausführen. Danach unter *Project Settings → API → Exposed schemas* `signalwerk` ergänzen.
2. **Vercel**: Repo verbinden, *Root Directory* = `app`, Umgebungsvariablen aus `app/.env.example` setzen.
3. **Versand** (eine Variante):
   - SMTP, z. B. Zoho-Postfach auf einer Zweitdomain: `MAIL_TRANSPORT=smtp`, SMTP-/IMAP-Werte aus `.env.example`.
     Bounces und Antworten liest `python scripts/inbox.py --apply` (täglich).
   - Resend: `MAIL_TRANSPORT=resend`, Webhook auf `https://<app>/api/webhooks/resend` mit den Ereignissen
     sent, delivered, delivery_delayed, bounced, complained, failed. Öffnungs- und Klick-Tracking in Resend ausschalten.
4. **Quellen**: kostenlosen Companies-House-API-Schlüssel anlegen (`COMPANIES_HOUSE_API_KEY`).

## Befehle

```bash
pip install -r requirements.txt
python -m unittest discover -s tests          # Tests
python scripts/lint_templates.py               # Vorlagen gegen Schreibregeln prüfen

python scripts/watch.py daily                  # Karriereseiten + Websites + Leads erkennen
python scripts/watch.py uk-incorporations --location Manchester --days 30
python scripts/watch.py ny-incorporations --days 30

python scripts/outreach.py check --db          # Käufer prüfen (Land, Rechtsform, Adresse, Sperrliste)
python scripts/outreach.py lint --db           # Entwürfe prüfen
python scripts/outreach.py send                # Probelauf
python scripts/outreach.py send --live --owner-ok "Freigabe vom <Datum>"
python scripts/inbox.py --days 7 --apply       # Bounces/Antworten (SMTP-Variante)

cd app && npm ci && npm test && npm run build  # App
```
