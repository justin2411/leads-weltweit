# Signalwerk: Projektanleitung für Claude Code

Diese Datei ist deine dauerhafte Arbeitsanweisung. Lies sie zu Beginn jeder Sitzung. Sie ist bewusst kurz: Regeln
hier, Wortlaut aller Inhaber-Entscheidungen in `docs/ENTSCHEIDUNGEN-INHABER.md`, Abläufe als Handbücher in
`.claude/skills/` (Schichten: `docs/GEDAECHTNIS.md`). Rangfolge: §2 gilt immer → jüngere Inhaber-Entscheidung vor
älterer → bei zwei gültigen Regeln die **strengere**.

## 1. Worum es geht

Signalwerk (Marke NextGen Profit) verkauft **B2B-Leads mit Anlass** („Trigger-Leads“): Firmen mit einem Ereignis, das
einen Verkaufsanlass schafft (Neugründung, fehlende/veraltete Website, offene Stelle, neuer Standort). Jeder Lead hat
Ereignis, Quelle mit Datum, Dringlichkeit und Einstiegssatz. Käufer sind Dienstleister aus **demselben Markt**. Wir
testen Zielgruppen, bauen Gewinner aus, stoppen Verlierer. Ziel: wiederkehrender Umsatz über Abos bei minimalem
Aufwand für den Inhaber (Justin). Fokus heute: **Webagenturen (S2) in US, UK, FR**.

## 2. Unverrückbare Regeln

Diese Regeln gelten immer, auch wenn eine Aufgabe dadurch langsamer wird.

**Geld**
- Keine kostenpflichtigen Tarife, Upgrades, Projekte, Domains oder Dienste abschließen oder anlegen. Wenn etwas Geld kostet, beschreibe es dem Inhaber und warte auf sein Ja. Keine kostenpflichtige Claude-Extranutzung.
- Rechnungen (PayPal) nur als Entwurf anlegen. Der Inhaber verschickt sie.

**Kontaktaufnahme**
- E-Mails nur in Länder, die in `countries.yaml` mit `allowed: true` stehen, und nur nach der Rechts-Tabelle `docs/KALTMAIL-RECHT.md` (strengere Regel gilt). Deutschland, Österreich, Schweiz, Italien, Spanien, Polen, Dänemark: niemals Kaltmails. Dort bereitest du nur Anruflisten und Briefe vor. Nie: IE, BE, NL und jedes Land mit Risiko hoch/sehr hoch. UK nur Firmen (Ltd/LLP/PLC).
- Kein Live-Versand ohne Freigabe durch den Inhaber (erteilt 26.09./03.10.2026 für Entwürfe, die alle Prüfungen bestehen; Notbremse oder Spam-Beschwerde stoppen und gehen zurück an den Inhaber).
- Keine automatischen Anrufe, keine Kontaktformulare, keine LinkedIn- oder Xing-Automatisierung.
- Jede Mail ist individuell, ehrlich, ohne Garantien, ohne erfundene Zahlen oder Referenzen, ohne gefälschte „Re:“-Betreffzeilen. Pflichtfußzeile und Abmeldelink kommen vom System, nie weglassen.
- Abmeldungen, Bounces und Spam-Beschwerden sperren eine Firma dauerhaft. Diese Sperren nie aufheben oder umgehen.
- Keine Tracking-Pixel für Öffnungen. Kaltmails nie über Resend.

**Schutz, nie lockern, nie Testvariante:** Abmeldelink, Sperrliste, Resend-Webhook-Sperren, Notbremse, Spam-Stopp,
Drei-Stufen-Freigabe (`scripts/lib/release_gate.py`), Prüfregeln (QC/SC, `check_prospect`), Länderregeln. Sie sind
nie per Schalter abschaltbar; Inhaber-Regeln (Baukasten-Stufe 4) machen nur strenger.

**Daten**
- Lead-Inhalte (die Firmen, über die wir berichten): Firmendaten (Name, Adresse, Website, Telefon, E-Mail, Ereignis, Quelle) und **alle Kontaktdaten, die die erlaubten Quellen (unten) zur Firma und zu ihren Inhabern, Geschäftsführern oder Officers veröffentlichen**, auch Handynummern und Freemail-Adressen (Inhaber 01.10.2026). Die Quellen-Regeln gelten unverändert.
- Quellen: öffentliche Register, amtliche Bekanntmachungen, Firmenwebsites und deren Karriereseiten, offizielle offene Schnittstellen. **Kein Scraping** von LinkedIn, Indeed, StepStone, Glassdoor, Xing, Google Maps oder anderen Plattformen, deren Bedingungen es verbieten. robots.txt beachten, höchstens einmal täglich pro Seite abrufen.
- Keine geheimen Schlüssel im Code oder in Commits. Alles über Umgebungsvariablen.
- **Keine Lead-Daten ins Repo** (öffentlich): keine Lead-Dateien, Proben oder Artefakte; Erkenntnisse mit Zahlen in `signalwerk.brain_knowledge`.
- **Löschen nur der Inhaber** (per Klick): keine Tabellen, Daten oder destruktiven Migrationen. Durchgefallenes wird `held`/markiert, nie gelöscht.
- Supabase: nur Schema `signalwerk` im Projekt `udkkchduyrkzuktlknbc`, andere Schemas nie verändern, kein neues Projekt.

**Ehrlichkeit gegenüber dem Inhaber**
- Berichte echte Zahlen, auch schlechte. Keine geschönten Auswertungen.
- Wenn du bei einer Rechtsfrage unsicher bist: nicht handeln, sondern die Frage dem Inhaber vorlegen (Scout: nicht erweitern, im Logbuch begründen).

## 3. Kommunikation mit dem Inhaber

- Deutsch, kurz. Jeder Text: **Titel ≤ 60 Zeichen** (ohne „Sitzung …:“, Uhrzeit, Dateinamen) + **Grund in 1 Satz
  ≤ 160 Zeichen**; Details nur auf Klick (`scripts/lib/kurz.py`, `app/lib/kurz-schreiben.ts`; Agenten: Ergebnis ≤ 300,
  Schritt ≤ 120 Zeichen).
- Uhrzeiten immer deutsche Zeit (Europe/Berlin, MESZ/MEZ), nie UTC; Cron bleibt technisch UTC.
- Käufer zählen nur mit `prospects.check_status = ok` in Mail-Ländern der Zielgruppe; `call_only` nur getrennt benannt.
- Jeden Selbst-Merge im Chat melden. Erst in `docs/EINRICHTUNG.md` nachsehen, bevor du den Inhaber um einen Zugang bittest.

## 4. Geltende Kernregeln je Thema (Wortlaut und Datum: `docs/ENTSCHEIDUNGEN-INHABER.md`)

- **Versand:** an (03.10.), 24/7 stündlich :37, je Lauf Anteil der Tagesmenge; Tagesziel 90, täglich +15 bis 150; Notbremse Bounce > 5 % ab 100 Mails, auch alle 20 Mails; Spam stoppt sofort. Kaltmails über Strato-SMTP, nie Resend.
- **Kaltmail-Recht:** US Firmen + Einzelunternehmer; FR beides, nur berufsbezogen; UK, SE, FI nur Firmen; DE/NL/IE/BE/AT/CH/IT/ES/PL/DK nie. Einzelunternehmer: keine automatische Nachfassmail.
- **Fokus und Tests:** nur S2; alle Tests (A/B, Preise, Seiten) nur Segment × Land aus `config/fokus.yaml` `tests` (S2 × US/UK/FR). Erweitern nur der Inhaber. Eine Sache pro Test.
- **Leads:** landesweit statt regional; alle Kontaktdaten aus erlaubten Quellen, Ansprechperson (sonst Rolle); widersprüchliche nie liefern; S2 ohne Website-Pflicht.
- **Proben:** immer genau 10 verschiedene Firmen; Proben-Vorrat (S2 ohne Altersverfall, Freigabe < 26 h).
- **Drei-Stufen-Freigabe:** vor Probe, Vorrat, Lieferung; nie abschaltbar; Stichprobe > 2 % gelb, > 5 % rot.
- **Werke:** Lead-Werk, Kunden-Werk (bis 1 Mio. Käufer), Proben-Vorrat, Dauerprüfung; Schalter im Dashboard; Autopilot verteilt Plätze; Speicher-Bremse 6 GB, `stopp` ab 7,5 GB.
- **Scout:** entscheidet allein; neues Land/Branche/Quelle erst nach ≥ 10 grünen Leads im Test **und** klarer Rechtslage; Logbuch `docs/QUELLEN-SCOUT.md`.
- **Antworten:** Antwort-Assistent + Cockpit; nie Preise/Garantien/Zusagen; Abmeldungen immer sperren; Kaufinteresse → Inhaber (Mail + Push).
- **Kunden:** Lieferung montags ~07:00; erste Lieferung je Kunde nur nach Inhaber-Freigabe; jeder Lead höchstens einmal pro Abo.
- **Preise:** Starter 129 (bis 15/Woche), Pro 249 (bis 40/Woche) in £/$/€, alle Länder gleich; netto, 19 % USt. nur bei DE-Rechnungsadresse; bestehende Abos behalten Preis; Preis nie A/B-Variante pro Besucher.
- **Berichte:** Tagescheck täglich 19:37 MESZ (rot zuerst beheben); Wochenbericht montags: Umsatz/Kunden, Tabelle je Experiment, Empfehlung, Probleme, was der Inhaber entscheiden muss.
- **Website:** `/dashboard/website`, Änderungswünsche per Chat → PR mit Selbst-Merge; Preise, Rechtstexte, Versand, Kosten ausgenommen.
- **Gehirn/JARVIS:** JARVIS ist der Kopf, entscheidet selbst innerhalb §2; A/B bei Engpass (6 von 8 Läufen und ≥ 24 h).
- **Oberfläche:** wenig Text; Kästen bündig oben/unten; Schließen-X immer `x-btn`, mittig; vor Merge Screenshot.
- **Infrastruktur:** `main` = Produktion (Vercel); Vercel nur über `vercel.yml` (neue Variablen ja, Werte nie lesen/ändern, nichts löschen); Resend-DNS `send`, `rsend`, `resend._domainkey` nie ändern.

## 5. Zielgruppentest (fest)

1. **Lieferfähigkeit zuerst:** ≥ 10 echte Probe-Leads je Segment und Land in `leads`, ohne echte Probe kein Versand.
2. Experiment in `experiments` (Hypothese in einem Satz, Land, Botschaft, geplant 50). 3. Käufer: kleine/mittlere
   Firmen, jede geprüft (`python scripts/outreach.py check`). 4. Entwürfe nach §7. 5. Senden im Limit. 6. Messen
   14 Tage nach der letzten Mail (Zustellung, Bounces, Spam, Antworten, positiv, Proben, Kunden).
7. **Entscheiden:** stoppen (`killed`) unter 2 % positiv nach 50 zugestellten oder Spam > 0,3 %; 2–5 % ohne Proben →
   einmal Betreff und Einstieg ändern, weitere 50; ausbauen (`winner`) über 5 % positiv oder ≥ 1 zahlender Kunde.
   Diese Regel ändert nur der Inhaber.
8. Immer nur eine Sache pro Experiment ändern (Segment, Land oder Botschaft).

## 6. Berechtigungen

| Selbst (Hauptsitzung, Gehirn, JARVIS, Agenten, Scout) | Nur Inhaber |
|---|---|
| Recherche, Quellen, Leads, Käufer, Proben, Entwürfe, Freigabe geprüfter Entwürfe | Geld ausgeben, Tarife, Rechnungen verschicken |
| Senden und Tagesmengen anpassen im Rahmen von Versand-Plan, Anbietergrenze, Notbremse | Versand nach Notbremse/Spam wieder starten |
| Code, Tests, PR, **Selbst-Merge nach `main` bei grüner CI** (mit Layout-Screenshot) | Daten oder Tabellen löschen, destruktive Migrationen |
| Nicht destruktive Migrationen im Schema `signalwerk` anwenden | Sperrliste, Abmeldung, Notbremse, Freigabe, Prüf-/Länderregeln lockern |
| Workflows starten, Einstellungen, Werke, Flows, Speicher, Autopilot | Test-Freigabe (`fokus.yaml tests`) erweitern, §5-Stopp-Regel ändern |
| Länder/Quellen nach Scout-Regeln, Vercel-Variablen neu anlegen | Rechtstexte, Kundenpreise bestehender Abos |
| Preise testen (alle Länder gleich), Seiten live, wenn `legal_ready` | Erste Lieferung je Kunde freigeben |

## 7. Schreibregeln für Mails

- 70–120 Wörter, kurze Absätze; HTML nur ohne Bilder, externe Ressourcen und Tracking, immer mit Text-Version (`scripts/lib/html_email.py`).
- Betreff konkret (Nische und Land), höchstens 60 Zeichen, keine Emojis.
- Erster Satz zeigt, dass wir die Firma kennen; Kern: welche Firmen wir finden und warum das ein Anlass ist (1–2 Signale).
- Angebot: kostenlose Probe mit 10 Leads aus ihrem Land, unverbindlich, landesweit. Schluss: eine einfache Ja/Nein-Frage.
- Sprache des Landes (FR Französisch, sonst Englisch); Anrede ohne Personennamen, wenn nur allgemeine Adressen erlaubt sind.
- Verboten: Garantien, Dringlichkeit, erfundene Zahlen, Übertreibungen. **Bauplan 1:1:** `docs/KALTMAIL-VORLAGE.md`.

## 8. Wo steht was

| Thema | Ort |
|---|---|
| Wortlaut aller Inhaber-Entscheidungen, Grundauftrag (alte §3–§10) | `docs/ENTSCHEIDUNGEN-INHABER.md`; Tageslogbuch `docs/ENTSCHEIDUNGEN.md` |
| Gedächtnis-Schichten, was wann gepflegt wird | `docs/GEDAECHTNIS.md` |
| Handbücher (Abläufe, Abteilungen) | `.claude/skills/*/SKILL.md` |
| JARVIS, Agenten, Gehirn | `docs/JARVIS.md`, `docs/AGENTEN.md`, `docs/GEHIRN-SITZUNG.md`, `docs/GEHIRN-PLAN.md`, `BRAIN.md` |
| Kaltmail-Recht, Länder | `docs/KALTMAIL-RECHT.md`, `countries.yaml` |
| Kaltmail-Bauplan | `docs/KALTMAIL-VORLAGE.md` |
| Quellen, Scout-Logbuch | `docs/QUELLEN-SCOUT.md`, `docs/EXTRAKTOR.md` |
| Technik, Datenmodell, Lehren, Tests | `docs/WISSEN.md`, `docs/WORKFLOW.md` |
| Kunden-Agenten | `docs/KUNDEN-AGENTEN.md` |
| Strategie, Design, Zugänge | `docs/STRATEGIE.md`, `docs/DESIGN.md`, `docs/EINRICHTUNG.md` |
| Schalter | `config/versand.yaml`, `config/fokus.yaml`, `config/pipeline.yaml`, `config/proben.yaml`, `owner_settings` |
| Wissen mit Zahlen (nicht im Repo) | `signalwerk.brain_knowledge` (`scripts/brain_knowledge.py`), `signalwerk.decisions` |
