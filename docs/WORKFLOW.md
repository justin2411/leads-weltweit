# Workflow: Ablauf, Kontaktpunkte, Zeitplan, Handgriffe

Stand: 28.09.2026. Grafische Fassung: [`workflow/NextGen-Profit-Workflow.pdf`](workflow/NextGen-Profit-Workflow.pdf).
Alle Zeiten in **UTC** (deutsche Sommerzeit = UTC + 2).

## 1. Der Weg eines Kunden

| # | Kontaktpunkt | Wann | Kanal | Code |
|---|---|---|---|---|
| 1 | Entwürfe schreiben und freigeben | täglich 12:17 | intern | `scripts/drafts.py`, `taeglich.yml` |
| 2 | **Erstmail** mit persönlichem Seitenlink (`?r=`) | Di–Do: UK/FR 08:37, US 14:37 (deutsche Zeit) | Strato-SMTP info@ | `scripts/outreach.py send`, `send.yml` |
| 3 | **Persönliche Landingpage** („Vorbereitet für {Firma}“), Branchenfilm, Beispiele, FAQ | Klick | Web | `app/app/[country]/[segment]/page.tsx` |
| 4 | **Probe anfordern**: kurzes Formular auf jeder Landingpage und der Startseite (Firma, E-Mail, „Welche Leads?“ bis 3 Signale, optional ein Satz, Einwilligung; über `?r=` vorbelegt). Wunsch landet als `wunsch:signals=…;text=…` in `sample_requests.note`, `web_samples.py` liefert passende vollständige Leads zuerst + Bestätigung | sofort | Resend | `app/app/sample-form.tsx`, `app/api/sample-request/route.ts`, `app/content/sample-wishes.ts`, `scripts/lib/wishes.py` |
| 5 | **Probe-Mail** (10 Leads, PDF + CSV) | stündlich | Resend | `scripts/web_samples.py`, `antworten.yml` |
| 6 | **Nachfassmail** „Soll ich die Probe schicken?“ | 4 Tage nach der Erstmail ohne Antwort | Strato | `scripts/followups.py` |
| 7 | **Antwort-Assistent**: Ja → Probe, Frage → FAQ, Kauf → Inhaber, Abmeldung → Sperre | stündlich 06–21 | Antwort im Verlauf | `scripts/inbox.py`, `scripts/responder.py` |
| 8 | **Probe-Nachfrage** „Montag starten?“ | 3 Tage nach der Probe | Strato | `scripts/followups.py` |
| 9 | **Preisseite** Starter/Pro/Regler, Ablauf 1-2-3, Angebot per Mail | Link im Proben-PDF | Web | `app/app/[country]/[segment]/start/` |
| 10 | **Stripe-Kasse** (Abo live) | Klick | Stripe | `app/api/checkout/route.ts` |
| 11 | **Danke-Seite** mit Wunsch-Formular | nach Zahlung | Web | `app/app/danke/`, `app/app/kunde/filter/` |
| 12 | **Willkommensmail** (Blau-Gold, Formular-Link 30 Tage) + **Verkaufsmeldung** an den Inhaber | sofort | Resend | `app/api/webhooks/stripe/route.ts`, `app/lib/welcome-mail.ts` |
| 13 | **Erste Lieferung** als Vorschau an den Inhaber, Freigabe per GitHub | Montag | Resend | `scripts/deliveries.py`, `kundenlieferung.yml` |
| 14 | **Wöchentliche Lieferung** PDF + Tabelle | montags 04:53 | Resend | `scripts/deliveries.py` |

**Fehlt noch:** Mail bei fehlgeschlagener Zahlung, bei Kündigung, Rückgewinnung, Erinnerung an das Wunsch-Formular,
Feedback/Upgrade, Kaufabbruch. Siehe offene Entscheidungen in [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md).

## 2. Kontaktpunkte des Inhabers

| Meldung | Wann | An |
|---|---|---|
| Morgenbericht | täglich 04:47 | `OWNER_EMAIL` |
| Tagescheck („alles läuft“ / Hinweise / Probleme) | täglich 17:37 | `OWNER_EMAIL` |
| Kaufinteresse / Rückfrage / Probe nicht lieferbar | sofort | Variable `KAUFINTERESSE_AN` (sonst `OWNER_EMAIL`) |
| Neuer Kunde | sofort nach Zahlung | `SALE_NOTIFY_EMAIL` (sonst `OWNER_EMAIL`) |
| Erste Lieferung zur Freigabe | Montag | `OWNER_EMAIL` |

## 3. Zeitplan aller GitHub-Läufe

| Workflow | Zeit | Aufgabe | Sendet Mails? |
|---|---|---|---|
| `morgenbericht.yml` | täglich 04:47 | Bericht an den Inhaber | nur an den Inhaber |
| `kundenlieferung.yml` | montags 04:53 | Lieferungen vorbereiten und senden | an Kunden (Resend) |
| `kaeufer.yml` | täglich 05:13 | Käufer finden (OpenStreetMap → Website → Prüfregeln); Arbeitgeber-Suche nur bei `lead_suche: true` | nein |
| `sync.yml` | täglich 06:17 | Zustellstatus | nein |
| `antworten.yml` | stündlich :07, 06–21 | Bounces, Antworten, Web-Proben | Antworten, Proben (Resend) |
| `anreichern.yml` | 02:41, 08:41, 15:41, 20:41 | Websites/Kontakte finden (nur bei `lead_suche: true`) | nein |
| `taeglich.yml` | täglich 12:17 | Quellen (nur bei `lead_suche: true`), Proben, Nachfassmails anlegen, Entwürfe | nein |
| `send.yml` | Di–Do 08:37 (UK/FR, Versand bis 11 Uhr) und 14:37 (US, bis 19 Uhr), deutsche Zeit; Plan `app/lib/versandzeit.json` | Kalt- und Nachfassmails senden (nur bei `aktiv: true`); Kopie an Kontrolladressen (`SEED_INBOXES`) | **ja (Strato)** |
| `tagescheck.yml` | täglich 17:37 | alle Kontaktpunkte prüfen | nur an den Inhaber |
| `wachhund.yml` | alle 15–30 min | ausgefallene Läufe nachstarten | nein |
| `gehirn.yml` | nur von Hand | Seiten/Varianten/Entscheidungen | – |
| `ci.yml` | bei Push/PR | Tests (Python, App, Migrationen) | – |

GitHub lässt geplante Läufe unter Last aus. Der **Wachhund** startet sie nach (Versand nur bei `aktiv: true`).

## 4. Schalter

| Schalter | Wirkung | Stand 28.09. |
|---|---|---|
| `config/versand.yaml` `aktiv` | Kalt- und Nachfassversand an/aus | **false** (gestoppt) |
| `config/versand.yaml` `tagesziel`, `anbieter_tageslimit` | Tagesmenge = min(Tagesziel, Anbietergrenze − 10) | 150 / 160 |
| Repo-Variable `SENDEN_AKTIV = nein` | Not-Aus für `send.yml` ohne Code-Änderung | nicht gesetzt |
| `config/pipeline.yaml` `lead_suche` | Lead-Suche (Quellen, Anreicherung, Arbeitgeber) | **false** (pausiert) |
| `countries.yaml` | erlaubte Länder, Tageslimit je Land | US 110, UK 100, FR 60, IE/NL 30 |
| `settings.brain_enabled` (DB) | Gehirn darf handeln | true |
| `settings.auto_publish_pages` / `legal_ready` (DB) | Seiten gehen automatisch live | true / true |

## 5. Sicherheitsnetze

- **Notbremse** (`scripts/lib/deliverability.py`): Bounce-Quote über 5 % (ab 100 Mails in 30 Tagen) oder eine
  Spam-Beschwerde → kein Versand.
- **Sperrliste** (`suppression`): Abmeldung, Bounce, Beschwerde sperren dauerhaft; `is_suppressed` wird vor jedem
  Versand geprüft.
- **Prüfregeln** (`scripts/lib/rules.py`): 70–120 Wörter, Betreff ≤ 60 Zeichen, keine Garantien/Zahlen/„Re:“.
- **Vollständigkeit** (`deliveries.contact_companies`): nur vollständige, widerspruchsfreie Leads gehen in Proben
  und Lieferungen.
- **Tagescheck** (`scripts/tagescheck.py`): rote Punkte zuerst beheben.

## 6. Handgriffe (Runbook)

**Versand stoppen:** `config/versand.yaml` → `aktiv: false` (PR, merge). Sofort ohne Code: Repo-Variable
`SENDEN_AKTIV = nein`.

**Versand wieder starten:** `aktiv: true` mit Datum und Wortlaut der Freigabe im Kommentar; ENTSCHEIDUNGEN.md ergänzen.

**Erste Lieferung eines Kunden freigeben:** GitHub → Actions → `kundenlieferung` → *Run workflow* →
`befehl = approve`, `abo = <Abo-ID aus der Vorschau-Mail>`.

**Kunde von Hand anlegen** (z. B. Überweisung): `python scripts/deliveries.py add-customer …` (Preis vom Inhaber).

**Einen Lauf nachholen:** GitHub → Actions → Workflow → *Run workflow* (oder `wachhund.yml` starten).

**Tagescheck sofort:** Actions → `tagescheck` → *Run workflow*.

**Vercel neu deployen / Variablen prüfen:** Actions → `vercel` → `befehl = status | redeploy`. Live-Status:
`https://www.nextgen-profit.de/api/health` (mit `?stripe=1` inkl. Stripe-Konto).

**Lead-Suche wieder einschalten:** `config/pipeline.yaml` → `lead_suche: true`.

## 7. Entwicklungsablauf

1. Branch von `main` (`claude/<thema>`), Änderungen, Tests lokal: `python -m unittest discover -s tests`,
   `python scripts/lint_templates.py`, in `app/`: `npx tsc --noEmit -p .`, `npm test`, `npx next build`.
2. Pull Request nach `main`, CI abwarten (python, app, migrations).
3. Bei grüner CI mergen (Freigabe des Inhabers 27.09.), danach Live-Seite / `/api/health` prüfen.
4. Datenbank-Migrationen erst nach Zeigen und Ja des Inhabers anwenden.
