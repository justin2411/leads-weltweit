# Quellen-Scout: Logbuch kostenloser Lead-Quellen

Inhaber 01.10.2026: „einen anderen Lauf … der die ganze Zeit nach kostenfreien Möglichkeiten sucht, weitere Leads für
unsere Bereiche zu besorgen, das dann selber prüft und bei Ergebnissen automatisch an die Werke weitergibt“.

Der Scout ist eine tägliche Claude-Sitzung (Routine „Quellen-Scout“). Je Sitzung:

1. Dieses Logbuch lesen. Keine Quelle erneut testen, die unten schon steht (außer „später erneut prüfen“).
2. Die größten Lücken wählen (Tabelle „Bedarf“). Je Sitzung höchstens zwei neue Quellen.
3. Zulässigkeit prüfen: nur öffentliche Register, amtliche Bekanntmachungen, offizielle offene Schnittstellen oder
   Datensätze mit offener Lizenz, Firmenwebsites. Kein Scraping von LinkedIn, Indeed, Google Maps, Yelp usw.;
   robots.txt und Nutzungsbedingungen lesen. Kostenpflichtig oder Schlüssel nötig → nur notieren, nicht nutzen.
   Rechtlich unklar (z. B. Verkauf von Stellenangeboten in FR, L5331-1) → nicht nutzen, dem Inhaber vorlegen.
4. Kurztest mit echten Daten (ca. 100 Datensätze): Wie viele Firmen? Wie viele mit Telefon/E-Mail/Website/Person?
   Welches Signal, wie frisch? Hochrechnung pro Monat.
5. Brauchbar (Signal passt zur Branche, ≥ 20 % lieferbar nach Anreicherung oder großer Rohbestand): als Quellenmodul
   in `scripts/extraktor/sources/` bzw. als Kategorie im Kunden-Werk einbauen, Tests schreiben, im Lead-Werk
   (`.github/workflows/lead-werk.yml`) bzw. Kunden-Werk eintragen, Pull Request öffnen. Gemergt wird nach den
   Regeln in CLAUDE.md (Inhaber sagt „merge“).
6. Ergebnis hier eintragen – auch Fehlschläge – und dem Inhaber eine kurze Zusammenfassung schicken.

## Bedarf (Stand 01.10.2026)

| Bereich | Stand | Lücke |
|---|---|---|
| S1 Personalvermittlung UK/US | ~100 Firmen/Lauf mit offenen Stellen (Karriereseiten), Form D US | mehr Arbeitgeber mit Einstellungssignal |
| S1 FR | bewusst aus (L5331-1) | – |
| S3 IT-Dienstleister (Leads) | keine Quelle | Neugründungen/Wachstum mit IT-Bedarf, neue Standorte |
| S4/S5/S9 UK, FR | Neugründungen, nur 1–3 % lieferbar | Neugründungen mit Website/Telefon, Wachstumssignale |
| S6 Büro/Coworking, S7 Reinigung (Leads) | keine Quelle | neue Standorte, Umzüge, neue Hallen/Filialen |
| Kunden-Werk | Overture US/UK/FR, ~20 Kategorien | weitere Käufer-Branchen, Kontaktwege |

## Bereits geprüft

| Datum | Quelle | Bereich | Ergebnis |
|---|---|---|---|
| 01.10.2026 | FMCSA Company Census (Socrata az4n-8mr2) | S2/S4/S5 US | **in Nutzung** (Lead-Werk) |
| 01.10.2026 | SEC EDGAR Form D | S1/S5/S9 US | **in Nutzung** |
| 01.10.2026 | Companies House BasicCompanyData + PSC (Bulk) | S4/S5/S9 UK | **in Nutzung**, 1–3 % lieferbar |
| 01.10.2026 | BODACC (opendatasoft) | S4/S5/S9 FR | **in Nutzung**, 1–3 % lieferbar |
| 01.10.2026 | Overture Maps Places | S2 UK/FR, Kunden-Werk | **in Nutzung**, S2 ~85 % lieferbar |
| 01.10.2026 | Web Data Commons JobPosting + Karriereseiten | S1 UK/US | **in Nutzung** (~7 % der Domains mit Stellen) |
| 01.10.2026 | Common Crawl CDX → Workable-Boards | S1 | klein (~7 % mit 3+ Stellen), nur von GitHub erreichbar; später erneut prüfen |
| 01.10.2026 | DOL LCA/PERM (US-Visa-Anträge) | S1 US | Dateien erreichbar (GitHub), noch nicht eingebaut – **Kandidat** |
| 01.10.2026 | UK Contracts Finder (OCDS) | S1/S3 UK | 57 % KMU mit CH-Nummer, keine Kontakte – Kandidat als Zusatzsignal |
| 01.10.2026 | Companies House Accounts Bulk (iXBRL) | S1 UK Wachstum | ~0,5 % mit +20 % Mitarbeitern – klein |
| 01.10.2026 | UK Visa-Sponsorenregister + ATS-Namensraten | S1 UK | < 1 % Treffer – verworfen |
| 01.10.2026 | France Travail / La Bonne Boîte | S1 FR | rechtlich ausgeschlossen (L5331-1) |
| 01.10.2026 | Apprenticeships API (UK) | S1 UK | Schlüssel nötig – nicht genutzt |
| 01.10.2026 | Brave Search API | Websites finden | kostenpflichtig – nicht genutzt |
| 01.10.2026 | Connecticut Business Registry (data.ct.gov n7gp-d28j, Open Data) | S4/S5 US (S2 nein) | ~5.000 aktive Neueintragungen/Monat, 100 % mit E-Mail (~38 % eigene Domain, Rest Freemail), NAICS-Branche, aktuelle Adresse, **kein Telefon, keine Person**. S2-Test (120 Freemail-Firmen): 0 % grün (Telefon fehlt, keine Website) → S2 nicht lieferbar. S4/S5 (eigene Domain, ~1.900/Monat) **eingebaut** als `sources/ct_sos.py`, Lead-Werk-Jobs `us-ct-0..2`; Live-Test S4 (88 Firmen mit eigener Domain): **0 % grün** (Telefon, Website, Ansprechperson fehlen meist; 22 % rot: Anmelde-Dienstleister/Sammel-E-Mail) → liefert vorerst nur Rohbestand (Firma + E-Mail, gelb); erst mit Telefon-/Personen-Anreicherung nützlich (Frage an Inhaber) |
| 01.10.2026 | Colorado Business Entities (data.colorado.gov 4ykn-tg5h) | S4/S5 US | verworfen: weder Telefon noch E-Mail, nur Registered Agent; Datumsfeld enthält Zukunftswerte |
