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

- 70–120 Wörter, reiner Text, kurze Absätze
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

## 9. Reihenfolge für den Start

1. Repo-Struktur anlegen (`/app` Vercel-App, `/supabase/migrations`, `/scripts`, `/samples`, `countries.yaml`, diese Datei). Bestehenden Code aus `outreach/` übernehmen und auf Supabase umstellen.
2. Migration für das Schema `signalwerk` schreiben und dem Inhaber zeigen, bevor sie angewendet wird.
3. Vercel-App mit Abmeldung und Webhook bauen. Der Inhaber verbindet das Repo mit Vercel und setzt die Umgebungsvariablen.
4. Segmente S1–S8 in `segments` anlegen.
5. Mit **S1 (Personalvermittlung) in UK** und **S2 (Webagenturen) in US** beginnen: je 10 Probe-Leads bauen, dann das Experiment vorbereiten.
6. Dem Inhaber einen ersten Bericht mit den Proben und 10 Beispiel-Entwürfen vorlegen.
