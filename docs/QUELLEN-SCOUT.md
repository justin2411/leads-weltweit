# Quellen-Scout: Logbuch kostenloser Lead-Quellen

Inhaber 01.10.2026: „einen anderen Lauf … der die ganze Zeit nach kostenfreien Möglichkeiten sucht, weitere Leads für
unsere Bereiche zu besorgen, das dann selber prüft und bei Ergebnissen automatisch an die Werke weitergibt“.

**Ziel (Inhaber 01.10.2026):** „die Basis maximieren, mit der wir später über E-Mail-Marketing mit den Kunden-Leads
Umsatz machen“. Hauptkennzahl: **mail-fähige Käufer** (`prospects.check_status = ok`) in Ländern, in die wir mailen
dürfen UND für die wir Leads liefern können; dazu genug lieferbare Leads je Branche/Land, um sie zu beliefern.
Reihenfolge der Arbeit: (1) mehr mail-fähige Käufer (neue Käufer-Kategorien, bessere E-Mail-Fundquote auf
Firmenwebsites, neue erlaubte Länder samt Lead-Quelle), (2) Lead-Quellen für Branche/Land-Paare mit vielen Käufern,
(3) alles andere. `call_only` und Rohbestand zählen mit, sind aber zweitrangig.

Der Scout ist eine Claude-Sitzung (Routine „Quellen-Scout“). Je Sitzung:

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
   (`.github/workflows/lead-werk.yml`) bzw. Kunden-Werk eintragen, Pull Request öffnen. **Dauerfreigabe
   (Inhaber 01.10.2026: „nein ohne merge … so schnell und so viele leads wie möglich“):** Der Scout mergt solche PRs
   selbst, sobald Tests und GitHub-Prüfungen grün sind – nur für neue Quellen/Kategorien und deren Einbindung in die
   Werke. Versand, Sperrliste, Prüfregeln (QC/SC, check_prospect), Länderregeln und Kosten fasst er nie an; solche
   Änderungen gehen weiter über den Inhaber. Jeder selbst gemergte PR wird dem Inhaber im Chat gemeldet.
6. **Neue Länder und Branchen (Inhaber 01.10.2026):** Nach Recherche darf der Scout bis zu **3 neue Länder** und
   **3 neue Branchen** vorschlagen, in denen wir extrem viele Leads kostenlos bekommen – nur wenn er belastbare
   Zusammenhänge sieht, an denen wir viel verdienen können (große kostenlose Quelle + zahlungskräftige Käufer im
   selben Markt). Findet er keine, ist das in Ordnung. Er darf sie aufnehmen: neue Branche als `segments`-Eintrag
   mit Status `idea` und Begründung, Lead-Quellen dafür ins Lead-Werk, Käufer-Kategorien ins Kunden-Werk.
   Grenzen: Versand in einem neuen Land/einer neuen Branche nur mit Freigabe des Inhabers (CLAUDE.md §6);
   Kaltmails nur in Länder mit `allowed: true` in `countries.yaml` (DE/AT/CH/IT/ES/PL/DK nie); ein Käufer braucht
   Leads aus seinem eigenen Markt. Vorschläge stehen unten in „Vorschläge Länder/Branchen“.
7. Ergebnis hier eintragen – auch Fehlschläge – und dem Inhaber eine kurze Zusammenfassung schicken.

## Sprint 01.10. 21 Uhr – 02.10. 21 Uhr UTC (stündlich)

Inhaber: „bis morgen verschiedene Länder und Branchen und kunden … mit maximal vielen Leads wie es unser system hergibt“.
Reihenfolge: (1) schon erlaubte Länder ohne Abdeckung – IE, NL, BE, SE: kostenlose Lead-Quellen (Register,
amtliche Bekanntmachungen, Overture) und Käufer im Kunden-Werk (`COUNTRIES`, Kategorien, Rechtsform-Regeln aus
`countries.yaml`); (2) Lücken UK/FR (Kontakt für Neugründungen); (3) neue Branchen (`segments` idea); (4) neue Länder
nur als vorbereiteter Vorschlag mit Rechtsgrundlage (Freischaltung in `countries.yaml` = Inhaber). Arbeitspakete, die
länger als eine Stunde dauern, hier mit Stand eintragen und in der nächsten Runde fortsetzen.

**GitHub-Pro-Aufteilung (01.10. 21 Uhr, Inhaber: „maximale Effizienz für GitHub Pro“):** 40 Jobs gleichzeitig =
30 Lead-Werk (eine Welle, `max-parallel` = Zahl der Teile) + 8 Kunden-Werk + 2 frei für Tagesablauf/Tagescheck.
Zeitfenster `--deadline-min` (Lead 75, Kunden 90; Lead von 150 auf 75 gesenkt: S2-Teile sind nach ~60 min fertig, die Register-Teile hielten sonst 27 Plätze 1,5 h leer): danach keine neuen Firmen, Ergebnisse speichern; Job `weiter`
startet das Werk sofort neu (nur bei Schalter an und Laufzeit ≥ 10 min; GitHub lässt geplante Wachhund-Läufe unter Last ausfallen). Neue Quellen als Teil einbauen heißt:
einen bestehenden Teil derselben Quelle abgeben oder die Summe ≤ 38 halten (Test `GithubProTests`).

## Bedarf (Stand 01.10.2026)

| Bereich | Stand | Lücke |
|---|---|---|
| S1 Personalvermittlung UK/US | ~100 Firmen/Lauf mit offenen Stellen (Karriereseiten), Form D US | mehr Arbeitgeber mit Einstellungssignal |
| S1 FR | bewusst aus (L5331-1) | – |
| S3 IT-Dienstleister (Leads) | keine Quelle | Neugründungen/Wachstum mit IT-Bedarf, neue Standorte |
| S4/S5/S9 UK, FR | Neugründungen, nur 1–3 % lieferbar | Neugründungen mit Website/Telefon, Wachstumssignale |
| S6 Büro/Coworking, S7 Reinigung (Leads) | keine Quelle | neue Standorte, Umzüge, neue Hallen/Filialen |
| Kunden-Werk | Overture US/UK/FR, ~20 Kategorien | weitere Käufer-Branchen, Kontaktwege |
| US Neugründungen | FMCSA, Form D, Connecticut-Register | weitere Bundesstaaten-Register mit E-Mail/Telefon |
| Rohbestand ohne Telefon | CT-S2 (Freemail-Gründer) | kostenlose Quelle für Telefonnummern |
| **UK/FR Neugründungen ohne Kontakt (Stand 01.10. abends)** | ~38.000 UK-Leads S4/S5/S9 (Companies House) ohne Telefon/E-Mail, S4/S5 FR je 1 vollständig | **größte Lücke für die Test-Matrix US/UK/FR**: Website + Kontakt für Neugründungen finden |
| Käufer FR | Rechtsform fehlte fast immer -> „nur Anruf/Brief“; FR war für S2/S4/S5 kein Mail-Land | behoben in PR #89 (Register-Abgleich), wirkt nach Merge |

## Vorschläge Länder/Branchen

| Datum | Vorschlag | Quelle(n) | Käufer/Verdienst | Status |
|---|---|---|---|---|

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
| 01.10.2026 | **Connecticut Business Registry** (data.ct.gov n7gp-d28j + Principals ka36-64k6) | S2/S4/S5/S9 US | **eingebaut** (`sources/ct_registry.py`, Lead-Werk `us-ct-0/1`): ~7.700 Neugründungen/44 Tage, alle mit E-Mail (63 % Freemail), Inhaber bei 96 %; Test 480: S4 12 %, S5 11 %, S9 14 % grün, S2 0 % (kein Telefon → Rohbestand). ≈ 230 grüne Leads + 3.500 Rohbestand/Monat |
| 01.10.2026 | **UK Food Hygiene Rating Scheme API** (FSA, „AwaitingInspection“) | S4/S7/S2 UK (neue Betriebe) | **Kandidat**: 35.608 Betriebe warten auf Erstprüfung, kein Telefon, 52 % volle Adresse, kein Datum → braucht Tages-Beobachtung (neue FHRSIDs) + Kontaktabgleich mit Overture (Name + PLZ) |
| 01.10.2026 | Colorado Business Entities (data.colorado.gov 4ykn-tg5h) | US Neugründungen | verworfen: keine Kontaktdaten (geprüft von der Routine-Sitzung, PR #85 als doppelt geschlossen) |
| 01.10.2026 | **Annuaire des entreprises** (recherche-entreprises.api.gouv.fr, SIRENE, ohne Schlüssel) | Käufer FR (Rechtsform) | **eingebaut** (`sources/fr_sirene.py`, Kunden-Werk): Name + PLZ, nur eindeutige aktive Treffer; Test 8 abgelehnte FR-Käufer ohne PLZ: 3 eindeutig, alle Kapitalgesellschaften (SAS/SARL). Zusätzlich Mentions légales („SAS au capital“). PR #89 (Inhaber-Merge nötig: FR neu als Mail-Land) |
| 01.10.2026 | Kunden-Werk Teil 2/7 | Betrieb | 2× hintereinander nach ~2,5 min abgebrochen („runner shutdown“, gleiche Domains je Teil) – vermutlich Riesen-Antwort einer Website; Abruf jetzt auf 2 MB begrenzt (`lib/fetch.capped_get`). Nach dem nächsten Lauf prüfen |
| 01.10.2026 (Sprint R1) | **Overture Places IE/NL/BE/SE** (eigener Auszug `overture_ie_nl_be_se.parquet`, 52 s) | S2 IE/NL/BE/SE | **eingebaut** (Lead-Werk `s2-ie/nl/be/se`): ohne Website + Telefon + E-Mail: IE 13.019, BE 39.191, NL 25.412, SE 24.051 (≈100.000). Test je 60: NL 59, IE 56, SE 57 grün |
| 01.10.2026 (Sprint R1) | Kunden-Werk IE/NL/BE/SE (Overture-Kategorien) | Käufer | **eingebaut** (COUNTRIES, Pool v2, Rechtsform NL B.V./N.V., BE BV/SRL/NV/SA, SE AB + Org.nr 5xxxxx = AB, Kontext KvK/BTW/TVA). Käufer mit Website+Telefon im Auszug z. B. S2: NL 2.790, BE 1.011, SE 568, IE 290; S12 Marketing: NL 8.121. Test 58 Firmen: 10 ok (17 %), Hauptgrund Rechtsform nicht belegt (viele NL/BE-Kleinfirmen sind eenmanszaak/VOF = zu Recht nur Anruf/Brief) |
| 01.10.2026 (Sprint R1) | BE: KBO/BCE Open Data (Rechtsform je Unternehmensnummer) | Käufer BE | **Kandidat**: kostenlos, aber Download nur nach (kostenloser) Registrierung -> Inhaber fragen |
| 01.10.2026 (Sprint R2) | Overture-Abgleich UK-Neugründungen ohne Kontakt (Name + PLZ) | S4/S5/S9 UK | verworfen: 20.281 Companies-House-Firmen ohne Telefon/Website, nur 78 (0,4 %) exakt in Overture (Neugründungen stehen dort noch nicht); Name ohne PLZ 616 eindeutig, aber zu unsicher (Namensgleichheit ≠ dieselbe Firma) |
| 01.10.2026 (Sprint R2) | Betrieb | Werke | us-ct-1 scheiterte an FMCSA-Zeitüberschreitung trotz `--fmcsa-days 0` -> abgeschaltete Quellen werden nicht mehr geladen, FMCSA-Abrufe wiederholt; GitHub startet geplante Wachhund-Läufe seit 20:29 nicht -> Selbst-Neustart der Werke ab 10 min (PR #94). Käufer ok gesamt 36.412 (+16.811 in 1 h), Leads 114.652 (+5.018 in 1 h), DB 417 MB |
| 01.10.2026 (Sprint R3) | **CRO Open Data** (opendata.cro.ie, Massendownload aller irischen Firmen, ohne Schlüssel) | Käufer IE (Rechtsform) | **eingebaut** (`sources/ie_cro.py`, Kunden-Werk): eindeutiger aktiver Name -> Ltd/DAC/CLG/PLC; Test 97.337 irische Overture-Firmen mit Website: 12.842 (13 %) eindeutig, 96 % LTD. Vorher IE nur 6 Käufer ok, Hauptgrund „Rechtsform ?“ |
| 01.10.2026 (Sprint R3) | Betrieb | Lead-Werk | 6 Teile verloren je eine Branche durch 57014 (statement timeout) beim Schreiben in observations, ~8.100 grüne S2-Leads UK/FR -> Blöcke 100, bei Zeitüberschreitung halbieren (PR #95). Stand: Leads 156.726 (+42.074 in 1 h), Käufer ok US 52.599, UK 4.368, FR 1.015, SE 34, BE 23, NL 21, IE 6; DB 655 MB |
| 02.10.2026 (Sprint R4) | Bolagsverket „Värdefulla datamängder“ (SE, Rechtsform) | Käufer SE | nicht nutzbar: Seite hinter Bot-Schutz (F5/TSPD), kein direkter Download erreichbar – später erneut prüfen |
| 02.10.2026 (Sprint R4) | Betrieb | Lead-Werk | Lauf 21:15 endete erst 23:48: 27 Teile nach ~1 h fertig, uk-register hielt 150 min -> Zeitfenster Lead auf 75 min. Käufer ok: US 64.812, UK 5.697, FR 1.360, NL 82, BE 73, SE 77, IE 42 |
| 02.10.2026 (Sprint R5) | Neue Länder CA / AU / NZ (englischsprachig, offene Register) | Mail-Länder | **nicht erweitert** (rechtlich nicht klar Opt-out): CA – CASL verlangt Einwilligung; „implied consent“ für veröffentlichte Geschäftsadressen nur bei Bezug zur Rolle und ohne Hinweis „keine Werbung“ – Einzelfallprüfung, kein sicheres Opt-out. AU – Spam Act 2003 verlangt Einwilligung („inferred consent“ bei veröffentlichter Adresse nur mit Bezug zur Tätigkeit). NZ – Unsolicited Electronic Messages Act 2007, gleiche Logik. Damit Test (b) nicht bestanden |
| 02.10.2026 (Sprint R5) | Stand | – | Leads 175.236 (+18.329 in 1 h, v. a. S2 FR 13.569, S2 SE 3.829, S2 IE 747); Käufer ok US 86.826, UK 7.633, FR 1.496, NL 160, SE 119, BE 115, IE 82 (EU-4 +194 in 1 h, CRO wirkt); DB 826 MB |
