# Gehirn-Aufbau: wie JARVIS dazulernt und die Firma führt

Auftrag Inhaber 04.10.2026: „bestmöglich aufbauen … JARVIS soll sich selber bauen für viele verschiedene Bereiche … damit er Umsatz vergrößert“.

Das Modell lernt nicht selbst. Klüger wird es nur durch **besseres Gedächtnis** und **gemessene Rückmeldung**. Dafür gibt es vier Bausteine und einen Motor.

## Ablauf alle 2 Stunden (Gehirn = Geschäftsführung)

1. Aufwachen und kurze Regeln lesen (CLAUDE.md).
2. Fällige Entscheidungen nachmessen (Lernschleife).
3. Abteilung mit der größten Lücke zum Ziel wählen (Abteilungs-Motor).
4. Handbuch dieser Abteilung laden und die Lehren mit hohem Vertrauen anwenden.
5. Agenten der Abteilung einen Auftrag geben, mit Erwartung („Antwortquote UK von 0 % auf ≥ 1 % bis 12.10.“).
6. Montags zusätzlich die Rückschau.

## 1. Gedächtnis in Schichten

| Schicht | Ort | Inhalt | Wird geladen |
|---|---|---|---|
| Regeln | `CLAUDE.md` | nur unverrückbare Regeln und eine Landkarte | immer |
| Inhaber-Entscheidungen | `docs/ENTSCHEIDUNGEN-INHABER.md` | alle datierten Entscheidungen wörtlich | bei Bedarf |
| Handbücher (Skills) | `.claude/skills/*/SKILL.md` | Schritte je Aufgabe und je Abteilung | nur passend zur Aufgabe |
| Wissensspeicher | `signalwerk.brain_knowledge` | eine Erkenntnis je Zeile, mit Beleg, Datum und Vertrauen | gefiltert nach Thema |
| Lernjournal | `signalwerk.decisions` | Entscheidung, Erwartung, Ergebnis | fällige und letzte |

Grundsatz: wenig laden, das Richtige laden. Eine lange CLAUDE.md senkt die Befolgung (Doku: unter 200 Zeilen).

Weiter: Skill-Katalog, Abo- und API-Bausteine in `docs/GEHIRN-LERNEN.md`; Wert eines Premium-Leads je Land in `docs/PREMIUM-WERT.md`.

## 2. Lernschleife

- Jede Entscheidung bekommt eine **Erwartung**: Kennzahl, Zielwert und Prüfdatum.
- `scripts/brain_learn.py pruefen` misst täglich nach → `bestaetigt` / `widerlegt` / `unklar`.
- Bestätigt → Lehre im Wissensspeicher, das Vertrauen steigt. Widerlegt → das Vertrauen sinkt.

## 3. Rückschau (montags)

- `brain_learn.py rueckschau`: Veraltetes mit wenig Vertrauen wird archiviert (nie gelöscht) und Widersprüche werden gemeldet.
- Die 3 wichtigsten Lehren der Woche werden als Entscheidung gespeichert (kurzer Titel und Grund).

## 4. Prüffälle (Evals)

- `tests/fixtures/gehirn_faelle.json`: rund 20 echte Situationen aus unserer Geschichte, jeweils mit richtiger und verbotener Entscheidung.
- Feste Regeln (Notbremse, Länder, Rechtsform, Testbereich) prüft `pytest`.
- Das Urteil des Gehirns prüft `scripts/brain_eval.py`. Ergebnis ist eine Punktzahl in `brain_evals`; sie darf nach einer Änderung nicht sinken.

## 5. Abteilungs-Motor (JARVIS baut sich selbst)

- `scripts/abteilungen_motor.py` berechnet je Abteilung Ziel (`company_goals`) gegen Ist und daraus die Lücke in %.
- Die 2–3 größten Lücken bekommen je einen Auftrag an ihren Agenten. Bereiche nah am Umsatz kommen zuerst (Vertrieb, Antworten, Proben).
- Höchstens 6 offene Motor-Aufträge, keine doppelten.
- Jede Dashboard-Seite gehört zu einer Abteilung mit mindestens einem Agenten.
- Im Büro jeder Abteilung: Ring „Lücke zum Ziel“ und „Nächster Auftrag“.
- Bei `brain_enabled = false` wird nur angezeigt, es werden keine Aufträge vergeben.

## Grenzen (unverändert)

Kein Geld ohne Inhaber. Kaltmail-Recht, Sperrliste, Abmeldung, Notbremse, Drei-Stufen-Freigabe und Prüfregeln werden nie gelockert. Tests nur für S2 in US/UK/FR. Löschen nur durch den Inhaber. Keine Lead-Daten im Repo. Das Gehirn schaltet nur der Inhaber wieder ein.

## Stand

| Baustein | Status |
|---|---|
| 1 Gedächtnis | in Arbeit (Agent A) |
| 2 Lernschleife, 3 Rückschau, 4 Prüffälle | läuft (Wachhund: nachmessen, montags Rückschau, täglich Prüffälle) |
| 5 Abteilungs-Motor und Büros | in Arbeit (Agent C) |

## Premium-Ausbau (Inhaber 05.10.2026: „setz deinen Vorschlag und alles, was wir besprochen haben, um … gib es an das Gehirn weiter, damit JARVIS das umsetzen kann und direkt einbaut“)

Ziel: die besten, einzigartigen, frischen Anlässe (Premium-Leads) für S2 Webagenturen. Nur kostenlose Quellen ohne Anmeldung (Inhaber: „mehr Aufwand können wir nicht nutzen“).

**Premium** heißt: frisch (≤ 14 Tage), Kombi-Anlass, Beleg mit Datum, Ansprechperson mit Namen, Kontakt vorhanden. Exklusiv: ein Lead geht nur an einen Kunden je Branche.

### Werke (12, alle kostenlos auf GitHub, 40 Plätze, Autopilot nach Ertrag)

| Werk | Stand |
|---|---|
| Lead-, Kunden-Werk, Versand, Antworten, Proben-Vorrat, Kundenlieferung, Freigabe-Stichprobe, Wachhund/Tagescheck | laufen |
| Radar-Werk: Website kaputt seit Datum, Zertifikat abgelaufen/läuft ab (TLS) – Linie `radar` im Lead-Werk | läuft (05.10.2026); FR-Umzüge ruhen: BODACC per robots.txt gesperrt; Domain-Ablauf (RDAP) bewusst weggelassen, siehe QUELLEN-SCOUT |
| Bewertungs-Werk: `scripts/lib/premium.py` beim Speichern, `scripts/premium_score.py` stündlich (Bestand nachtragen, nach 14 Tagen zurückstufen) | läuft (05.10.2026) |
| Kontakt-Werk: Register + Firmenwebsite zusammenführen und gegenprüfen (`kontakt-werk.yml`, `scripts/kontaktwerk.py`, Ergebnis `leads.kontakt`) | läuft (Agent 3) |
| Feedback-Werk: Kunden bewerten Leads (Link `/bewerten` in Lieferung und Probe, `lib/feedback.py`), Gewicht je Anlass 0,8–1,25 ab 5 Bewertungen nur für die Premium-Reihenfolge, Anzeige Büro Qualität | fertig |

Proben-Vorrat und Kundenlieferung nehmen Premium zuerst; später gibt es neben der Montags-Lieferung einen Sofort-Alarm bei frischem Anlass.

### Nur noch Premium (Inhaber 05.10.2026: „wir brauchen keine normalen leads mehr nur noch premium leads“)

| Stelle | Regel |
|---|---|
| Proben-Vorrat | Premium zuerst, genau 10 bleibt Pflicht; fehlen Premium-Leads, füllen Standard-Leads auf. `sample_stock.premium_n` zählt Premium je Probe, der Abruf nach dem Klick nimmt die Probe mit den meisten Premium-Leads zuerst |
| Kundenlieferung | Premium zuerst, Kundenwünsche sortieren nur innerhalb von Premium bzw. Standard |
| Landingpage-Beispiele | nur Premium, sobald ≥ 3 frische da sind, sonst wie bisher |
| Meldung | `signalwerk.premium_status()`: Tagescheck gelb „Premium-Vorrat zu klein“, Dashboard Proben (Spalte Premium) |
| Lead-Werk-Autopilot | Gewicht nach Premium-Ertrag je Platz·h statt Lead-Menge, reine Standard-Linien wachsen nicht und geben Plätze ab (je 1 bleibt); Summe Lead + Kunden ≤ 38 |
| Nie | Standard-Leads löschen, Drei-Stufen-Freigabe ändern (Premium ist nur Reihenfolge) |

Premium-Stufe: ≥ 70 Punkte und datiertes Ereignis ≤ 14 Tage (Premium-Labor 05.10.2026: vorher zählte der Code bis 30 Tage, lockerer als die Definition oben; 15–30 Tage gibt weiter 20 Punkte, steht damit oben im Standard). Website-Zustände ohne Ereignisdatum (veraltet, nicht handytauglich, Overture ohne Website) sind nie Premium – deshalb das Radar: es macht aus einem Zustand eine Veränderung mit Datum.

Radar-Zeit gewichtet (Premium-Labor 05.10.2026): `--radar-countries FR,UK:2,US` (`lib/radar.py` `share`). Radar ist in UK/FR fast die einzige Premium-Quelle; erste Runde hatte erst 59 % (UK) und 81 % (FR) des Bestands geprüft, US 31 % bei schon ~3.000 Premium. FR zuerst (kleiner Bestand, Restzeit geht weiter), UK doppeltes Gewicht. Nur Zeitverteilung – Abrufgrenzen, robots.txt und Bewertung unverändert.

Ansprechperson im Radar (Premium-Labor 05.10.2026): Ein Radar-Ereignis ohne bekannten Namen sucht den Namen auf der Startseite und höchstens 2 Unterseiten derselben Domain (mentions légales/Impressum, Über uns, Kontakt; FR-Seiten auch `/mentions-legales/`), nur mit ausdrücklichem Label (`websites.person_from_legal_notice`), robots.txt beachtet; gefunden → Beobachtung `person` mit Beleg-Seite (`lib/radar.py` `legal_person`). Vorher hatten 0 % der UK/FR-Premium-Leads einen Namen; Live-Stichprobe 2/15 FR, 0/15 UK, 0/10 US.

Kontakt-Punkte nur mit Beleg (Premium-Labor 05.10.2026): Liest das Kontakt-Werk die Website und findet dort weder Telefon noch E-Mail (Stufe „leer“), entfallen die 15 Kontakt-Punkte (`lib/kontakt.py` `premium_nachtrag`, Grund `kontakt_unbelegt`); ein späterer Beleg gibt sie zurück. Betraf 35 % (UK) bis 56 % (FR) der Radar-Premium-Leads. Nur strenger, Freigabe unverändert.

### Länder (nur Mail-Länder aus `countries.yaml`)

| Schritt | Länder | Versand |
|---|---|---|
| 1 jetzt | US, UK, FR | läuft (Fokus) |
| 2 vorbereiten | FI, SG | erst nach Freigabe durch den Inhaber (Aufträge an Agent 2) |
| 3 später | BR, SE, MX | wenn Schritt 1 Antworten bringt |
| raus | HK | `allowed: false` (Inhaber 05.10.2026: „nimm hk raus“) |

### Wer treibt es

- **Quellen-Scout „Premium-Jagd“:** stündlich (:40), jede Runde eine neue offene Quelle oder einen neuen Anlass testen und selbst einbauen.
- **JARVIS-Agenten:** bearbeiten die Aufträge (FI, SG, Kontakt-Werk, Feedback-Werk, Werke-Karte + Designsystem).
- **Gehirn:** prüft bei jedem Aufwachen den Fortschritt gegen diesen Plan und legt Folgeaufträge an, sobald es eingeschaltet ist.

### Designsystem JARVIS

Nachtblau als Grund, Cyan = läuft, Gold nur für Geld, Rot/Gelb/Grün nur als Status. Dünne 1-px-Linien, Zahlen in Monospace, 8-px-Raster. Animationen nur mit Bedeutung: Puls = lebt, Fluss-Tempo = echter Durchsatz, Ringe füllen sich einmal, 150–300 ms, `prefers-reduced-motion` beachten.
