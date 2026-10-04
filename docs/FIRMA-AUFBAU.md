# Firma-Aufbau: Stand und nächster Schritt

Auftrag Inhaber 04.10.2026: „das gehirn soll ein komplettes unternehmen bauen, ich will so wenig wie möglich überhaupt noch machen müssen“.

Das Gehirn (Geschäftsführung) baut bei jedem Aufwachen **einen** Bereich weiter: schwächste Ampel zuerst, Bereiche nah am Umsatz vor den anderen. Bereiche, Leitung und Übergaben: `signalwerk.departments`, `scripts/uebergaben.py`, `docs/JARVIS.md` „Firma“. Ziele: `signalwerk.company_goals` (Soll nur vom Inhaber oder als Vorschlag). Bauplan Gedächtnis, Lernschleife, Abteilungs-Motor und Premium-Ausbau: `docs/GEHIRN-AUFBAU.md`.

Keine Zahlen zu Leads oder Käufern in dieser Datei (Repo öffentlich). Zahlen stehen im Dashboard und in `brain_knowledge`.

## Regeln für jeden Schritt

- Ein Bereich je Sitzung, höchstens 3 Änderungen.
- Jeder Schritt hat ein messbares Ziel und ein Prüfdatum (Lernschleife).
- Laufende Arbeit anderer Agenten nicht überschreiben; im Zweifel nur einen Auftrag anlegen.
- Grenzen unverändert: Geld, Kaltmail-Recht, Sperrliste, Abmeldung, Notbremse, Drei-Stufen-Freigabe, Prüfregeln, Löschen.

## Stand je Bereich

| Bereich | Hauptziel | Ampel | Läuft | Nächster Schritt |
|---|---|---|---|---|
| Vertrieb | Antwortquote | rot (noch keine Antworten) | Versand 24/7, A/B Betreff in US/UK/FR | Opt-out-Gründe auswerten, dann Einstieg testen (Auftrag A5, 05.10.) |
| Marketing | Probe-Anfragen 7 T | gelb | Website-Agenten, Website-Check | erst nach ersten Antworten: Probe-Seite testen |
| Produktion | grüne Leads 7 T | grün | Lead-, Kunden-Werk, Proben-Vorrat | Premium-Radar, Kontakt-Werk (A3) |
| Qualität | Lead-Fehlerquote | gelb (Ausreißer > 5 % bei Käufern US/FR) | Freigabe, Dauerprüfung, Übergaben | Premium-Bewertung prüfen, sobald `premium.py` gemergt ist |
| Kundenservice | Kaufinteresse offen | grün | Antwort-Assistent, Cockpit | Feedback-Werk (A4) |
| Finanzen | Umsatz pro Monat | rot (noch kein Kunde) | Stripe, Wochenbericht | folgt dem Vertrieb |
| Recht | Spam-Beschwerden | grün | Notbremse, Rechts-Wache | nur Wache |
| Strategie | zahlende Kunden | rot | Gehirn, Scout, Agenten | FI/SG vorbereiten (A2), Versand erst nach Freigabe |

## Verlauf

| Datum | Bereich | Schritt | Ziel / Prüfdatum |
|---|---|---|---|
| 05.10.2026 | Vertrieb | Auftrag A5: Opt-outs und Auto-Antworten auswerten, A/B-Entwurf Einstieg | Opt-out-Quote < 1 % bis 12.10. |
