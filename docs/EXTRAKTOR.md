# Extraktor: Lead-Beschaffung (Stand 01.10.2026)

Eigener Bereich nur für das Beschaffen von Leads (Inhaber 01.10.2026: „bau einmal alles … wichtig ist, dass wir die
Leads kostenfrei bekommen und nur für das jeweilige Anreichern eventuell Geld ausgeben“).
Code: `scripts/extraktor/`, Workflow: `.github/workflows/extraktor.yml`, Tests: `tests/test_extraktor.py`.

## Ablauf

```
Quelle (amtlich, kostenlos) ─► Sicherheitsfilter ─► Branche zuordnen ─► Anreicherung (kostenlos)
   ─► Texte aus Fakten ─► Kontrolle 1: Qualität ─► Kontrolle 2: Signal ─► Ampel ─► CSV / Datenbank
```

| Schritt | Datei | Was passiert |
|---|---|---|
| Quellen | `sources/fmcsa.py`, `sources/formd.py`, `sources/uk_ch.py`, `sources/fr_bodacc.py` | US: FMCSA-Neuzugänge (Transport/Fuhrpark), SEC-Form-D-Kapitalmeldungen; UK: Companies-House-Neugründungen + PSC-Eigentümer; FR: BODACC-Gründungen |
| Sicherheitsfilter | `filters.py`, `qc.py` | Behörden/Vereine raus, Platzhalter raus, Dubletten raus, Sammel-Kontakte (dieselbe Nummer/E-Mail bei ≥ 3 Firmen in 120 Tagen = Anmelde-Dienstleister), FMCSA-Stilllegungen (Out-of-Service) und unzustellbare Adressen, unplausible Flottenzahlen, Sperrliste und vorhandene Leads (mit `--db`) |
| Branche | `segments.fits` | feste Regel je Branche (siehe unten), mit Begründung |
| Anreicherung | `enrich.py` | Website aus der eigenen E-Mail-Domain oder aus dem Firmennamen, nur wenn die Seite die Firma belegt (Name, Ort, Telefon aus der Quelle, PLZ, Ansprechperson); E-Mail/Telefon von der eigenen Website; MX-Prüfung |
| Texte | `segments.texts` | Signal, Firmeninfo, Einstiegssatz, Dringlichkeit – nur aus den Fakten dieses Leads |
| Kontrolle 1 | `qc.py` | Telefon (gültig, kein Muster, Vorwahl ↔ Bundesstaat), E-Mail (Syntax, MX, keine Wegwerf-/Dienstleister-Adresse, Domain = Website), Ansprechperson (echter Vor- und Nachname, keine Firma/Rolle, Namenslexikon), Adresse (PLZ passt zum Bundesstaat), Website geprüft |
| Kontrolle 2 | `sc.py` | Branchenregel erfüllt, Signal höchstens 45 Tage alt, **jede Zahl im Text steht in den Fakten**, Ort im Text = Adresse, Firmenname im Text, keine verbotenen Wörter, kein Text doppelt im Lauf |
| Ausgabe | `run.py` | `leads_gruen.csv` (lieferbar), `leads_alle.csv` (alle mit Gründen), `bericht.json` (Trichter) |
| Datenbank | `store.py` | grüne Leads in `watch_companies`, `observations`, `leads` (nur mit `--apply`) |

**Ampel:** grün = Kontrolle 1 grün **und** Kontrolle 2 bestanden → lieferbar. Gelb = Pflichtangabe fehlt → anreichern.
Rot = falsch oder widersprüchlich → nie liefern.

## Quellen und Branchen

| Branche | Quelle | Regel | Signal |
|---|---|---|---|
| S4 Versicherungsmakler | FMCSA | neuer Carrier mit eigenen Fahrzeugen (for-hire oder Werksverkehr), ≤ 100 Fahrzeuge, eigene E-Mail-Domain | neue USDOT-Registrierung mit Fahrzeugen, Fahrern, Ladung |
| S2 Webagenturen | FMCSA | neue Firma ohne Website (Freemail-Adresse, keine Website unter dem Namen gefunden) | neu registriert, keine Website |
| S1 Personalvermittlung | SEC Form D | operative US-Firma, mind. $1M eingesammelt | Kapitalrunde (Betrag, Investoren, Datum) |
| S5 Buchhaltung/Lohn | SEC Form D | junge Firma (≤ 3 Jahre), kleiner Umsatz, < $5M | erste Kapitalaufnahme |
| S9 Finanzberater | SEC Form D | namentlich genannte Geschäftsführung, mind. $250k | Geschäftsführer einer frisch finanzierten Firma |

| S4/S5/S9 UK | Companies House Massendaten + PSC-Eigentümer | Neugründung (≤ 45 Tage), keine Holding/Immobilien/ruhend; S4 nur Branchen mit Versicherungsbedarf (Bau, Transport, Gastro, Handel, Produktion, Pflege, Reinigung) | Gründung mit Firmennummer und Branche (SIC) |
| S1 UK/US | Eigene Karriereseiten (Firmenliste: Web Data Commons, JobPosting-Domains) | mind. 3 offene Stellen im Land oder eine seit über 30 Tagen; keine Personalvermittler/Jobbörsen, Behörden, Schulen, Kliniken des Staates, Konzerne (> 60 Stellen); abgelaufene oder über ein Jahr alte Anzeigen zählen nicht | Zahl der Stellen, älteste Stelle (Datum aus der Anzeige oder erstes Sehen), Beispiel-Titel |
| S2 UK/FR | Overture Maps Places (offene Lizenz) | eingesessenes Geschäft mit Telefon, ohne Website und ohne eigene E-Mail-Domain; keine Ketten | keine Website |
| S4/S5/S9 FR | BODACC-Gründungen (Gesellschaften) | keine SCI/sociétés civiles/Holdings; S4 nur Tätigkeiten mit Versicherungsbedarf | Gründung mit SIREN, Tätigkeit, Gérant/Président |

UK/FR: Die Register haben kein Telefon und keine E-Mail – beides kommt nur von der eigenen Website. Die gilt als
belegt durch Registernummer, Postleitzahl des Sitzes, Telefon oder exakten Namen mit Rechtsform + Domain = Name
(Firmennamen sind im Register einmalig). Brandneue Firmen haben selten schon eine Website: die grüne Quote liegt dort
bei ~1–3 % (USA 20–90 %), die Menge gleicht das aus. Texte für FR auf Französisch.

Form D: Fonds, Immobilien-Zweckgesellschaften, Banken und Änderungsmeldungen fallen raus. Mit `distinct` (Standard)
steht jede Form-D-Firma nur in einer Branche (S1 vor S5 vor S9).

## Kosten

Alle Quellen und Prüfungen sind kostenlos (amtliche offene Schnittstellen, DNS, die Websites der Firmen selbst).
Kostenpflichtige Anreicherung (z. B. E-Mail-Finder) ist vorbereitet (`enrich.PAID_ENRICHERS`), aber leer – nur nach Ja
des Inhabers.

## Bedienung

```bash
python scripts/extraktor/run.py --segments S1,S2,S4,S5,S9 --per 100 --out out/extraktor
python scripts/extraktor/run.py --segments S4 --per 20 --fmcsa-days 14 --out /tmp/x     # klein
python scripts/extraktor/run.py --countries UK --segments S5 --per 50 --out out/uk          # UK
python scripts/extraktor/run.py --countries FR --segments S4,S5,S9 --per 50 --out out/fr    # Frankreich
python scripts/extraktor/merge.py out/x1 out/x2 out/uk out/fr --out out/extraktor           # Läufe zusammenführen
python scripts/extraktor/store.py out/extraktor/leads_alle.csv            # Probelauf Datenbank
python scripts/extraktor/store.py out/extraktor/leads_alle.csv --apply    # grüne Leads speichern
```

GitHub: Actions → `extraktor` → Run workflow (Branchen, Menge, Tage). Ergebnis als Artefakt `extraktor-leads`.

## Regeln, die gelten

- Nur amtliche/offene Quellen und die Firmenwebsites; keine Plattformen (`lib.fetch.BLOCKED_HOSTS`), robots.txt,
  höchstens 1 Abruf pro Sekunde je Domain, SEC höchstens ~5 Abrufe pro Sekunde mit Absenderkennung.
- Kontaktdaten: alles, was die Quelle zu Firma und Inhaber/Officer veröffentlicht, auch Handy und Freemail
  (Inhaber 01.10.2026).
- Widersprüchliche Daten (PLZ ↔ Bundesstaat, E-Mail-Domain ↔ Website, Sammel-Kontakt) → rot, nie liefern.
- Texte nennen nur Zahlen, die in den Fakten stehen; keine Garantien, kein Druck.

## Hinweise für Kunden (USA)

Handynummern sind markiert (`phone_note`): nur von Hand wählen, keine SMS/Wählautomaten ohne Einwilligung, vorher mit
der Do-Not-Call-Liste abgleichen (TCPA). Gehört in die Lieferbedingungen.

## Nächste Ausbaustufen (Recherche 01.10.2026)

- FMCSA „Motus“-Datensätze (seit Mai 2026): Versicherung fehlt/gekündigt als starkes S4-Signal.
- Connecticut-Firmenregister (`n7gp-d28j`, mit E-Mail) und Florida Sunbiz für US-Neugründungen.
- SSA-Vornamen + Census-Nachnamen statt gender-guesser (bessere Namensprüfung für US-Namen).
- Overture Maps Places (Websites/Telefon, offene Lizenz) für mehr Website-Treffer in UK/FR.
- S1 FR: bewusst nicht (Code du travail L5331-1, Inhaber 01.10.2026).
- S1 Zusatzquellen (getestet 01.10.2026 auf GitHub): Workable-Boards aus Common Crawl (1.725 Boards, ~7 % mit
  3+ Stellen in UK, ~6 % in US); DOL-LCA/PERM-Dateien (US-Arbeitgeber mit Visa-Anträgen) sind abrufbar.

## S1 aus Karriereseiten (`sources/careers.py`, `extraktor-s1.yml`)

Täglich 05:17 UTC. Je Firma: Startseite → Karriere-Link (ggf. Unterseite „Vacancies“) → Stellen aus dem offiziellen
Bewerbungssystem (Lever, Greenhouse, Workable, Recruitee, Breezy, Pinpoint) oder aus JSON-LD der eigenen Seite.
Ohne strukturierte Daten zählen nur Links, deren Text oder Adresse eine Stellenbezeichnung ist, und nur wenn die
Firma selbst im Land sitzt. Das erste Sehen je Stelle steht im Cache (`out/cache/careers_seen.json`), damit
„seit über 30 Tagen offen“ belegt ist; Firmen mit gesehenen Stellen werden täglich geprüft, die übrige Liste reihum.
UK: Registernummer von der eigenen Website (sonst eindeutiger Name) → Sitz und Eigentümer aus Companies House.
Ohne Namen steht die Rolle „Hiring manager (ask for the person responsible for recruiting)“ (CLAUDE.md §9).

## Testlauf 01.10.2026 (ehrliche Zahlen)

Grün = beide Kontrollen bestanden, lieferbar. Gelb = Pflichtangabe fehlt (meist E-Mail/Website) → Reserve zum
Anreichern. Rot = falsch/widersprüchlich, nie liefern.

| Branche | USA grün | UK grün | FR grün | Quelle(n) |
|---|---|---|---|---|
| S1 Personalvermittlung | 46 (von 335) | – | – | SEC Form D (30 Tage) |
| S2 Webagenturen | 100 (129 möglich) | – | – | FMCSA (Firmen ohne Website) |
| S4 Versicherungsmakler | 100 | 10 (von 1.000) | 27 (von 1.000) | FMCSA / Companies House / BODACC |
| S5 Buchhaltung | 100 | 14 (von 1.500) | 27 (von 1.500) | Form D + FMCSA / Companies House / BODACC |
| S9 Finanzberater | 59 (von 441) | 7 (von 1.000) | 24 (von 1.000) | Form D / Companies House / BODACC |

Insgesamt 514 grüne Leads (USA 405, FR 78, UK 31), 8.692 bearbeitet. Gegenprobe: keine fehlenden Pflichtfelder,
Signale höchstens 28 Tage alt. Kosten: 0 €.

Lehren:
- USA liefert, weil FMCSA/SEC Telefon, E-Mail und Namen mitbringen.
- UK/FR-Neugründungen haben selten schon eine Website mit Kontakt: 1–3 % grün. Für Menge in UK/FR braucht es
  Quellen mit Kontaktdaten oder etablierte Firmen mit Ereignis (nächste Ausbaustufe), nicht nur Neugründungen.
- S1 braucht ein Einstellungs-Signal; Form D allein reicht für 100 nicht.
- Läufe parallel je Branche (GitHub/Container-Zeitlimit), danach `merge.py`.
