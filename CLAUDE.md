# Signalwerk: Projektanleitung für Claude Code

Diese Datei ist deine dauerhafte Arbeitsanweisung. Lies sie zu Beginn jeder Sitzung.

## 1. Worum es geht

Signalwerk verkauft **B2B-Leads mit Anlass** („Trigger-Leads“): Unternehmen, bei denen gerade ein Ereignis passiert, das einen Verkaufsanlass schafft. Beispiele: eine Stelle ist seit 30+ Tagen offen, eine Firma wurde neu gegründet, eröffnet einen Standort oder hat eine veraltete Website. Jeder Lead enthält das Ereignis, die Quelle mit Datum, eine Einschätzung der Dringlichkeit und einen Einstiegssatz.

Käufer sind Dienstleister, die genau diese Firmen als Kunden gewinnen wollen. **Wir wissen noch nicht, welche Käufergruppe am besten zahlt.** Deine Hauptaufgabe ist es deshalb, mehrere Zielgruppen systematisch zu testen, die Gewinner auszubauen und die Verlierer zu stoppen.

Ziel: wiederkehrender Umsatz über Abos (Richtwert 150–400 € pro Kunde und Monat), bei minimalem manuellem Aufwand für den Inhaber.

## 2. Unverrückbare Regeln

Diese Regeln gelten immer, auch wenn eine Aufgabe dadurch langsamer wird.

**Geld**
- Keine kostenpflichtigen Tarife, Upgrades, Projekte, Domains oder Dienste abschließen oder anlegen. Wenn etwas Geld kostet, beschreibe es dem Inhaber und warte auf sein Ja.
- Rechnungen (PayPal) nur als Entwurf anlegen. Der Inhaber verschickt sie.

**Kontaktaufnahme**
- E-Mails nur in Länder, die in `countries.yaml` mit `allowed: true` stehen. Deutschland, Österreich, Schweiz, Italien, Spanien, Polen, Dänemark: niemals Kaltmails. Dort bereitest du nur Anruflisten und Briefe vor.
- Kein Live-Versand ohne Freigabe durch den Inhaber, bis er ausdrücklich eine automatische Freigabe für ein bestimmtes Segment erteilt hat (siehe Abschnitt 6).
- Keine automatischen Anrufe, keine Kontaktformulare, keine LinkedIn- oder Xing-Automatisierung.
- Jede Mail ist individuell, ehrlich, ohne Garantien, ohne erfundene Zahlen oder Referenzen, ohne gefälschte „Re:“-Betreffzeilen. Pflichtfußzeile und Abmeldelink kommen vom System, nie weglassen.
- Abmeldungen, Bounces und Spam-Beschwerden sperren eine Firma dauerhaft. Diese Sperren nie aufheben oder umgehen.
- Keine Tracking-Pixel für Öffnungen.

**Daten**
- Lead-Inhalte (die Firmen, über die wir berichten): **nur Firmendaten** (Name, Adresse, Website, zentrale Telefonnummer, Ereignis, Quelle). Keine Namen, persönlichen E-Mails oder Telefonnummern von Mitarbeitenden.
- Quellen: öffentliche Register, amtliche Bekanntmachungen, Firmenwebsites und deren Karriereseiten, offizielle offene Schnittstellen. **Kein Scraping** von LinkedIn, Indeed, StepStone, Glassdoor, Xing, Google Maps oder anderen Plattformen, deren Bedingungen es verbieten. robots.txt beachten, höchstens einmal täglich pro Seite abrufen.
- Keine geheimen Schlüssel im Code oder in Commits. Alles über Umgebungsvariablen.

**Ehrlichkeit gegenüber dem Inhaber**
- Berichte echte Zahlen, auch schlechte. Keine geschönten Auswertungen.
- Wenn du bei einer Rechtsfrage unsicher bist: nicht handeln, sondern die Frage dem Inhaber vorlegen.

## 3. Technik

| Baustein | Zweck |
|---|---|
| **GitHub-Repo** | gesamter Code, Datenbank-Migrationen, diese Anleitung |
| **Supabase** | Datenbank. Bestehendes Projekt des Inhabers, alle Tabellen im eigenen Schema `signalwerk`. Andere Schemas nie verändern. Kein neues Projekt anlegen (kostet Geld). |
| **Vercel** (kostenloser Tarif) | kleine Next.js-App: Abmeldung mit einem Klick, Empfänger für Resend-Webhooks, Dashboard mit Login für den Inhaber |
| **Resend** | Versand von einer Zweitdomain, nie von der Hauptdomain |
| **Claude Code** | Recherche, Lead-Erzeugung, Entwürfe, Auswertung; wiederkehrende Aufgaben als geplante Aufgaben |

### Datenmodell (Schema `signalwerk`)

- `segments`: Käuferzielgruppen (Name, Beschreibung, passende Signale, Länder, Status: `idea` → `testing` → `winner` / `killed`)
- `experiments`: ein Test pro Segment, Land und Botschaft (Hypothese, Startdatum, geplante Anzahl, Ergebnis, Entscheidung)
- `watch_companies`: Firmen, die wir beobachten (die späteren Lead-Inhalte)
- `observations`: Rohbeobachtungen (z. B. Stelle gesehen am …), mit `first_seen`, `last_seen`, Quelle
- `leads`: erkannte Signale mit Dringlichkeit, Begründung, Einstiegssatz, Segment-Zuordnung
- `prospects`: potenzielle Käufer (Firma, Rechtsform, Land, Website, veröffentlichte Firmenadresse, Quelle, Segment)
- `messages`: Entwürfe und gesendete Mails (Status `draft` → `approved` → `sent` / `blocked`, Experiment-Zuordnung)
- `email_events`: Ereignisse von Resend (delivered, bounced, complained) und manuell erfasste Antworten
- `suppression`: gesperrte Adressen und Domains mit Grund
- `customers`, `subscriptions`, `deliveries`: zahlende Kunden, ihre Filter und jede Lieferung

Row Level Security auf allen Tabellen aktivieren. Die Vercel-App greift nur serverseitig mit dem Service-Schlüssel zu.

### Vercel-App (Minimalumfang)
1. `GET/POST /api/unsubscribe?t=<token>`: trägt in `suppression` ein, zeigt eine schlichte Bestätigung. Unterstützt `List-Unsubscribe-Post` (Abmeldung mit einem Klick).
2. `POST /api/webhooks/resend`: prüft die Signatur, speichert Ereignisse, sperrt bei Bounce oder Beschwerde automatisch.
3. `/dashboard` (Login nur für den Inhaber): Segmente mit Kennzahlen, offene Entwürfe zum Freigeben, letzte Antworten.

## 4. Die Zielgruppen, die du testen sollst

Starte mit diesen Hypothesen. Du darfst weitere vorschlagen, wenn du in der Recherche eine bessere findest; lege sie mit Status `idea` an und begründe sie im Wochenbericht.

| Nr. | Käufer | Signale, die sie brauchen | Länder für E-Mail |
|---|---|---|---|
| S1 | Personalvermittlung und Zeitarbeit | Stellen 30+ Tage offen, wiederholt ausgeschrieben, 3+ Stellen gleichzeitig, neuer Standort | US, UK, IE, NL, SE, BE, FR |
| S2 | Webagenturen | Neugründungen, veraltete oder nicht mobilfähige Website, neuer Standort | US, UK, IE, NL |
| S3 | IT-Dienstleister / Managed Service Provider | Neuer Standort, starkes Wachstum, Stellen für IT-Administration | US, UK, IE, NL |
| S4 | Gewerbliche Versicherungsmakler | Neugründungen, Expansion, neue Fahrzeugflotte oder Lager | US, UK, IE |
| S5 | Buchhaltung und Lohnabrechnung | Stellen für Buchhaltung offen, Neugründungen, schnelles Wachstum | US, UK, IE, NL |
| S6 | Büroausstattung, Coworking, Gewerbeimmobilien | Neuer Standort, Einstellungswelle, Umzug | US, UK, NL |
| S7 | Gebäudereinigung und Facility Services | Neuer Standort, neue Halle oder Filiale | US, UK, IE |
| S8 | Deutschland, alle Segmente | wie oben | **keine E-Mail**: nur Anrufliste und Briefvorlage für den Inhaber |

Wichtig: Ein Käufer braucht Leads **aus seinem eigenen Markt**. Wer US-Agenturen anschreibt, muss US-Leads liefern können.

## 5. So läuft ein Zielgruppentest

Für jedes Segment in jedem Land:

1. **Lieferfähigkeit zuerst.** Baue mindestens 10 echte Probe-Leads für dieses Segment und Land und lege sie in `samples/<Segment>/<Land>/` sowie in `leads` ab. Ohne echte Probe kein Versand.
2. **Experiment anlegen** in `experiments`: Hypothese in einem Satz, Land, Botschaft, geplant 50 Mails.
3. **Käufer recherchieren:** 50 kleine und mittlere Firmen des Segments im Land (keine Konzerne), jede geprüft mit `python outreach.py check` bzw. der gleichen Prüflogik in der Datenbank.
4. **Entwürfe schreiben** nach den Schreibregeln (Abschnitt 7) und dem Inhaber zur Freigabe vorlegen.
5. **Senden** über 2–3 Wochen, im Rahmen der Tageslimits.
6. **Messen** 14 Tage nach der letzten Mail:
   - Zustellrate, Bounce-Rate, Spam-Beschwerden
   - Antwortrate, positive Antworten, angeforderte Proben, zahlende Kunden
7. **Entscheiden** nach festen Regeln:
   - **Stoppen** (`killed`): unter 2 % positive Antworten nach 50 zugestellten Mails, oder Spam-Beschwerden über 0,3 %
   - **Neue Botschaft testen**: 2–5 % positive Antworten, aber keine Proben angefordert → einmal Betreff und Einstieg ändern, weitere 50
   - **Ausbauen** (`winner`): über 5 % positive Antworten oder mindestens ein zahlender Kunde → Volumen erhöhen, weitere Länder testen
8. Nie mehr als **drei Segmente gleichzeitig** im Test. Immer nur eine Sache pro Experiment ändern (Segment, Land oder Botschaft).

## 6. Was du allein darfst und was nicht

| Allein | Nur mit Freigabe des Inhabers |
|---|---|
| Recherche, Beobachtungsliste pflegen, Signale erkennen | Mails live versenden (bis zur Dauerfreigabe) |
| Probe-Leads bauen | Neue Länder oder Segmente mit Versand starten |
| Entwürfe schreiben und prüfen | Tageslimits erhöhen |
| Datenbank-Migrationen im Schema `signalwerk` (nicht destruktiv) | Tabellen oder Daten löschen |
| Code schreiben, testen, auf einem Branch committen, Pull Request öffnen | Nach `main` mergen (löst Vercel-Deployment aus) |
| Wochenbericht, Vorschläge | Alles, was Geld kostet; Rechnungen verschicken; Preise ändern |

**Dauerfreigabe:** Hat der Inhaber für ein Segment und Land schriftlich „automatisch senden“ freigegeben und liegen dort mindestens 30 fehlerfrei gesendete Mails ohne Beschwerde vor, darfst du freigegebene Entwürfe dieses Experiments im Rahmen der Limits selbst senden. Bei einer einzigen Spam-Beschwerde endet die Dauerfreigabe automatisch.

## 7. Schreibregeln für Mails

- 70–120 Wörter, kurze Absätze. Gestaltete HTML-Version erlaubt (Entscheidung Inhaber 26.09.2026), aber nur ohne Bilder, ohne externe Ressourcen und ohne Tracking, immer mit Text-Version (`scripts/lib/html_email.py`)
- Betreff konkret, bezogen auf Nische und Region, höchstens 60 Zeichen, keine Emojis
- Erster Satz zeigt, dass wir die Firma kennen (Spezialisierung, Region)
- Kern: welche Firmen wir finden und warum das für ihr Geschäft ein Anlass ist, mit 1–2 passenden Signalen
- Angebot: kostenlose Probe mit 10 Leads aus ihrer Region, unverbindlich
- Schluss: eine einfache Ja/Nein-Frage
- Sprache des Landes (FR Französisch, sonst Englisch), Anrede ohne Personennamen, wenn nur allgemeine Adressen erlaubt sind
- Verboten: Garantien, Dringlichkeit, erfundene Zahlen, Übertreibungen

## 8. Wiederkehrende Aufgaben

| Wann | Aufgabe |
|---|---|
| täglich | Beobachtete Karriereseiten und Quellen prüfen, `observations` aktualisieren, neue `leads` erkennen |
| täglich | Resend-Ereignisse auswerten, Sperren setzen, freigegebene Entwürfe im Rahmen der Limits senden |
| montags 07:00 | Lieferungen an zahlende Kunden vorbereiten (Inhaber gibt die erste Lieferung jedes Kunden frei) |
| montags | **Wochenbericht** an den Inhaber |

### Wochenbericht (kurz, ehrlich)
1. Umsatz und Kunden (neu, gekündigt)
2. Tabelle pro Experiment: gesendet, zugestellt, Antworten, positiv, Proben, Kunden, Entscheidung
3. Was du empfiehlst: welches Segment ausbauen, welches stoppen, welche neue Hypothese testen
4. Probleme: Quellen, die nicht mehr funktionieren; Zustellbarkeit; offene Rechtsfragen
5. Was du vom Inhaber brauchst (Freigaben, Entscheidungen)

## 8a. Entscheidungen des Inhabers (26.09.2026)

- Erste Welle: **1000 Mails insgesamt** über mehrere Zielgruppen und Länder (UK, US, FR); die Grenze von drei Segmenten gleichzeitig ist dafür aufgehoben. Pro Experiment weiterhin nur eine Sache ändern.
- Versand mit Aufwärmphase und Notbremse (`scripts/lib/deliverability.py`); Schalter `config/versand.yaml`.
- **Antwort-Assistent** (`scripts/responder.py`, antwortet im Namen des Inhabers – Entscheidung 26.09.2026): beantwortet Probe-Anfragen und Standardfragen aus festen Textbausteinen selbst, sperrt Abmeldungen, meldet sich beim Inhaber nur bei Kaufinteresse, Preis-/Terminfragen oder Unklarem. Automatische Antworten nennen nie Preise, Garantien oder Zusagen.

- **Freigabe (26.09.2026, Chat):** „du kannst dann einfach starten wenn du alles hast, musst mich nicht nochmal fragen“. Damit dürfen Entwürfe, die alle Prüfungen bestehen, ohne weitere Rückfrage freigegeben und im Rahmen von Aufwärmphase, Tageslimits und Notbremse versendet werden (bis 1000 Mails). Notbremse oder Spam-Beschwerde stoppen den Versand; dann wieder den Inhaber fragen.

- **Umsatz-Maßnahmen (26.09.2026, „stell alles ein außer Website“):** eine Nachfassmail nach 4 Tagen ohne Antwort, eine Nachfrage 3 Tage nach der Probe (`scripts/followups.py`), täglicher Automatiklauf (`.github/workflows/taeglich.yml`), Arbeitgeber-Suche für S1 (`scripts/employers.py`), Website-Prüfung für Neugründungen (`watch.py sitecheck`). Angebotspakete in `config/angebot.yaml` – Preise nur vom Inhaber.

## 9. Reihenfolge für den Start

1. Repo-Struktur anlegen (`/app` Vercel-App, `/supabase/migrations`, `/scripts`, `/samples`, `countries.yaml`, diese Datei). Bestehenden Code aus `outreach/` übernehmen und auf Supabase umstellen.
2. Migration für das Schema `signalwerk` schreiben und dem Inhaber zeigen, bevor sie angewendet wird.
3. Vercel-App mit Abmeldung und Webhook bauen. Der Inhaber verbindet das Repo mit Vercel und setzt die Umgebungsvariablen.
4. Segmente S1–S8 in `segments` anlegen.
5. Mit **S1 (Personalvermittlung) in UK** und **S2 (Webagenturen) in US** beginnen: je 10 Probe-Leads bauen, dann das Experiment vorbereiten.
6. Dem Inhaber einen ersten Bericht mit den Proben und 10 Beispiel-Entwürfen vorlegen.

- **Kundenlieferung (26.09.2026, „mach einfach“):** `scripts/deliveries.py` + `.github/workflows/kundenlieferung.yml`, montags ca. 07:00. Kunde anlegen mit `add-customer` (Preis nur vom Inhaber). Erste Lieferung jedes Kunden geht als Vorschau an den Inhaber und erst nach `approve` raus; danach automatisch. Jeder Lead höchstens einmal pro Abo, nur aus den gebuchten Regionen.
- **Versand ohne Aufwärmphase (26.09.2026, „ja ändere es und sende … jeden Tag, auch heute 100 Mails“, Upload ausdrücklich bestätigt):** Notbremse: Bounce-Quote über 5 %, bewertet erst ab 100 gesendeten Mails (Nachtrag „lockerer“) (Spam-Beschwerde stoppt weiterhin sofort). Versand und Automatiklauf täglich inkl. Wochenende, Tagesziel 100 (`config/versand.yaml`: `aufwaermphase: false`, `tagesziel`), begrenzt durch `anbieter_tageslimit` − 10.

## 10. Stand 26.09.2026 (Inhaber)

- **Resend verbietet Kaltakquise.** Resend nur für Mails an Empfänger mit Einwilligung: Lieferungen an zahlende Kunden, Bestätigungen von Probe-Anfragen, Willkommensmails, Antworten an Leute, die selbst geschrieben haben. Kaltmails erst wieder über ein eigenes SMTP-Postfach auf einer anderen Zweitdomain (gibt es noch nicht, nichts einrichten). `config/versand.yaml` steht auf `aktiv: false`.
- **Gehirn:** `BRAIN.md` ergänzt diese Datei (bei Widersprüchen gilt CLAUDE.md). Landingpages unter `/[country]/[segment]` aus der Datenbank, Rechtstexte in `app/content/legal.ts` (Platzhalter bis der Inhaber liefert; bis dahin kein Live-Schalten). Stripe nur im Testmodus, solange der Inhaber nichts anderes sagt.
- **Supabase:** Projekt „callcenter“ (`udkkchduyrkzuktlknbc`), Schema `signalwerk`. Migrationen erst nach Zeigen und Ja des Inhabers anwenden.
- **Branches:** `main` ist Produktion (Vercel). Änderungen per Pull Request nach `main`.

- **Domain-Wechsel (sobald die Nameserver von nextgen-profit.de umgestellt sind):** Hauptadresse `https://www.nextgen-profit.de`, `nextgen-profit.de` leitet auf www um. Dann: `SITE_URL` in Vercel auf `https://www.nextgen-profit.de` setzen und neu deployen; Resend-Webhook auf `https://www.nextgen-profit.de/api/webhooks/resend` umstellen (Endpunkt bearbeiten → Secret bleibt; neuer Endpunkt → neues `whsec_…` als `RESEND_WEBHOOK_SECRET` in Vercel eintragen); Stripe-Webhook ebenso auf `/api/webhooks/stripe` (bei neuem Endpunkt neues `STRIPE_WEBHOOK_SECRET`). Resend-DNS-Einträge `send`, `rsend`, `resend._domainkey` nie ändern.
- **Vercel-Zugriff (26.09.2026, Inhaber: „Möglichkeit 2“):** GitHub-Secret `VERCEL_TOKEN`, genutzt nur über `.github/workflows/vercel.yml` / `scripts/vercel_admin.py`: Status (Variablennamen und Umgebungen, nie Werte), Variable zusätzlich für Preview freigeben, neu deployen. Nichts löschen, keine Domains, Live-Stripe-Schlüssel und `SITE_URL` nie in Preview.
- **Gehirn autonom (Inhaber 26.09.2026):** stündliche Claude-Sitzung nach `docs/GEHIRN-SITZUNG.md`, Plan in `docs/GEHIRN-PLAN.md`. **Preise legt das Gehirn selbst fest und testet sie („völlig frei“)** – ersetzt die frühere Regel „Preise nur vom Inhaber“; technische Plausibilität 1–10.000 pro Monat, bestehende Abos behalten ihren Preis, jede Änderung mit Begründung in `decisions`. Seiten gehen automatisch live (`auto_publish_pages = true`), sobald `legal_ready = true`. Das Gehirn testet Seiten, Mails, Anreden und Zielgruppen selbst; alle übrigen Regeln (keine Kaltmails über Resend, Länder, Sperrliste, Kosten, Rechtstexte) gelten weiter.
- **Versand autonom (Inhaber 26.09.2026):** Sobald Kaltmails über ein eigenes SMTP-Postfach laufen, darf das Gehirn selbst senden und Tagesmengen anpassen – innerhalb von Notbremse und Anbietergrenze. Es darf **nie ohne Wissen des Inhabers dessen Geld ausgeben**; Einnahmen von Kunden immer einholen, Ziel Gewinn.

