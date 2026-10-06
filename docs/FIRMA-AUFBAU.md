# Firma-Aufbau: Stand und nächster Schritt

Auftrag Inhaber 04.10.2026: „das gehirn soll ein komplettes unternehmen bauen, ich will so wenig wie möglich überhaupt noch machen müssen“.

Das Gehirn (Geschäftsführung) baut bei jedem Aufwachen **einen** Bereich weiter: schwächste Ampel zuerst, Bereiche nah am Umsatz vor den anderen. Bereiche, Leitung und Übergaben: `signalwerk.departments`, `scripts/uebergaben.py`, `docs/JARVIS.md` „Firma“. Ziele: `signalwerk.company_goals` (Soll nur vom Inhaber oder als Vorschlag). Bauplan Gedächtnis, Lernschleife, Abteilungs-Motor und Premium-Ausbau: `docs/GEHIRN-AUFBAU.md`.

Zuordnung Bereiche → Agenten → Werke → Flüsse: einzige Quelle `app/lib/firma-karte.json` (Zentrale, Abteilungs-Motor; Test erzwingt Einträge für neue Agenten/Werke).

Keine Zahlen zu Leads oder Käufern in dieser Datei (Repo öffentlich). Zahlen stehen im Dashboard und in `brain_knowledge`.

## Regeln für jeden Schritt

- Ein Bereich je Sitzung, höchstens 3 Änderungen.
- Jeder Schritt hat ein messbares Ziel und ein Prüfdatum (Lernschleife).
- Laufende Arbeit anderer Agenten nicht überschreiben; im Zweifel nur einen Auftrag anlegen.
- Grenzen unverändert: Geld, Kaltmail-Recht, Sperrliste, Abmeldung, Notbremse, Drei-Stufen-Freigabe, Prüfregeln, Löschen.

## Stand je Bereich

| Bereich | Hauptziel | Ampel | Läuft | Nächster Schritt |
|---|---|---|---|---|
| Vertrieb | Antwortquote | rot (noch keine Antworten; nur 1 Postfach sendet) | Versand 24/7, A/B Betreff in US/UK/FR, Kontrollmails, US-Reihenfolge nach Postfach-Anbieter (06.10.) | US-Rückläufer senken (A3 klärt Adressen), dann Nachfass-Schlussfrage testen |
| Marketing | Probe-Anfragen 7 T | gelb | Website-Agenten, Website-Check | erst nach ersten Antworten: Probe-Seite testen |
| Produktion | grüne Leads 7 T | gelb (Quellen weitgehend durchgeprüft, Werke unter 30 Plätzen) | Lead-, Kunden-Werk, Proben-Vorrat, FR-Umzüge (06.10.) | neue Premium-Quellen UK/FR (Scout), Ertrag FR-Umzüge messen |
| Qualität | Lead-Fehlerquote | gelb (Ausreißer > 5 % bei Käufern US/FR) | Freigabe, Dauerprüfung, Übergaben | Premium-Bewertung prüfen, sobald `premium.py` gemergt ist |
| Kundenservice | Kaufinteresse offen | grün | Antwort-Assistent, Cockpit | Feedback-Werk (A4) |
| Finanzen | Umsatz pro Monat | rot (noch kein Kunde) | Stripe, Wochenbericht | folgt dem Vertrieb |
| Recht | Spam-Beschwerden | grün | Notbremse, Rechts-Wache | nur Wache |
| Strategie | zahlende Kunden | rot | Gehirn, Scout, Agenten | FI/SG vorbereiten (A2), Versand erst nach Freigabe |

## Verlauf

| Datum | Bereich | Schritt | Ziel / Prüfdatum |
|---|---|---|---|
| 05.10.2026 | Vertrieb | Versandmenge halbiert durch Bounce-Bremsen geklärt, Postfach 3 als Inhaber-Entscheidung vorgelegt | ≥ 140 Erstmails/Tag bis Mi 07.10. |
| 05.10.2026 | Vertrieb | Kontrollmails mit einem Klick einordnen (#441), Meilenstein erste Probe geprüft (echt, S1) | ≥ 6 eingeordnet bis Mi 07.10. |
| 05.10.2026 | Vertrieb | Beleg-Einstieg vorbereitet (nur US, 2 Belege, nur Firmen), SG-Auftrag ruht | Antwortquote US B ≥ 1 % bis 21.10. |
| 05.10.2026 | Vertrieb | Auftrag A5: Opt-outs und Auto-Antworten auswerten, A/B-Entwurf Einstieg | Opt-out-Quote < 1 % bis 12.10. |
