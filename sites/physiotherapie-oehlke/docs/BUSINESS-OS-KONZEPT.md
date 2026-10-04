# Oehlke Business OS: Konzept

Zentrale Steuerungsplattform für Mobile Physiotherapie Oehlke
Stand: 04.10.2026 · Version 1.0 · Status: Konzept + Phase 1 als Prototyp

---

## 0. Zielbild und Abgrenzung

**Ziel:** Das Unternehmen kann deutlich wachsen, ohne dass der Verwaltungsaufwand des Inhabers proportional mitwächst. Die Plattform informiert nicht nur, sie erkennt Engpässe früh, zeigt Handlungsmöglichkeiten und führt sichere Routineprozesse automatisch aus.

**Grundsatz:** MediFox DAN (Produkt *MD Therapie*) bleibt das führende System für die therapeutischen Kernprozesse. Das Business OS liegt darüber und baut **keine zweite Termin-, Dokumentations- oder Abrechnungssoftware**.

| Bereich | Führendes System | Business OS |
|---|---|---|
| Patientenstammdaten, Verordnungen, Dokumentation | MediFox DAN | nur pseudonymisierte Kennungen, PLZ, Leistung, Kostenträger |
| Termine, Teamkalender, Fahrzeiten je Termin | MediFox DAN | liest, analysiert, schlägt vor (keine Schreibzugriffe) |
| Abrechnung, Rechnungen, TI (eAU, E-Rezept, KIM) | MediFox DAN | liest Erlöse und offene Posten über Export |
| Kosten, Zahlungseingang, Liquidität | Buchhaltung / Bank | liest über Export (DATEV, CAMT) |
| Unternehmenssteuerung, Controlling, Prognosen | – | **führend** |
| Anfragen vor der Aufnahme, Warteliste, Zuweisung | – | **führend** (bis zur Anlage in MediFox) |
| Personal- und Kapazitätsplanung, Einstellungsrechner | – | **führend** |
| Tourenoptimierung (Reihenfolge, Regionen) | – | **führend** (Vorschläge, Umsetzung in MediFox) |
| Marketing, SEO, Partner-CRM | – | **führend** |
| Automationen, Freigaben, Protokoll | – | **führend** |

---

## 1. Technische Schnittstellenprüfung MediFox DAN

Recherche vom 04.10.2026, nur öffentliche Quellen. **Verbindlich wird es erst mit schriftlicher Antwort von MediFox DAN.**

### 1.1 Befund

| Thema | Ergebnis | Beleg |
|---|---|---|
| Produkt | *MD Therapie*, reine Cloud-Lösung, Hosting in Deutschland, PC/Tablet/Smartphone | [medifoxdan.de/software-therapeuten](https://www.medifoxdan.de/software-therapeuten) |
| Pakete | Basis (bis 3 Nutzer, **ohne** Controlling und Fibu-Export), Premium (bis 20 Nutzer, mit Fibu-Export), Complete | [Mietmodell](https://medifoxdan.de/software-therapeuten/mietmodell) |
| Öffentliche API, Entwicklerportal, Webhooks | **nicht gefunden** | – |
| Partnerplattform MD Orbit / Connect | nur für Pflege (MD Ambulant/Stationär), **nicht** für MD Therapie | [MD Orbit](https://www.medifoxdan.de/md-orbit) |
| Exporte | Auswertungen als Excel oder PDF (Controlling), Adressdaten als CSV | [Controlling](https://www.medifoxdan.de/software-therapeuten/funktionen/controlling), [Verwaltung](https://www.medifoxdan.de/software-therapeuten/funktionen/verwaltung) |
| Buchhaltung | Fibu-Export im DATEV-Format (ab Premium, als „neu“ markiert) | Mietmodell |
| Terminplanung | Hausbesuche mit Fahrzeiten, Ressourcen, Online-Buchung, Erinnerungen | [Terminplanung](https://www.medifoxdan.de/software-therapeuten/funktionen/terminplanung) |
| Tourenoptimierung (Reihenfolge) | nicht belegt | – |
| Kalender-Sync (iCal/Outlook), FHIR/HL7, lexoffice | nicht belegt | – |
| „Schnittstellen App“ | Geräteanbindung (Kartenleser, SumUp), **keine** Daten-API | [bridge.medifox-therapie.de](https://bridge.medifox-therapie.de/) |
| AVV | digital anfragbar über av-vertrag@medifoxdan.de | [AV-Vertrag](https://www.medifoxdan.de/av-vertrag/) |

### 1.2 Schlussfolgerung

1. **Es darf keine API vorausgesetzt werden.** Bidirektionaler Austausch ist ausgeschlossen, bis MediFox ihn schriftlich anbietet.
2. **Belegter Datenweg:** Export aus dem Controlling (Excel/CSV) und DATEV-Fibu-Export. Beides nur, wenn das gebuchte Paket es enthält (Premium oder höher).
3. **Nicht automatisierbar ohne Zusage:** Echtzeit-Termine, Schreibzugriff (z. B. Termin verschieben), automatischer Export-Auslöser.
4. **Ausgeschlossen:** Screen-Scraping, automatisierte Browser-Logins (RPA), Datenbankzugriff. Bei einer Cloud-Lösung ohnehin nicht möglich und vertraglich nicht geklärt.

### 1.3 Fragen an MediFox DAN (schriftlich)

1. Gibt es für MD Therapie eine dokumentierte API (REST/FHIR), Webhooks oder einen Partnerzugang? Ab welchem Paket, zu welchen Kosten?
2. Wird MD Therapie in MD Orbit aufgenommen, wann?
3. Welche Exporte sind in **unserem Paket** enthalten: Termine (mit Mitarbeiter, Dauer, Fahrzeit, Status), Leistungen/Erlöse, Ausfälle, Verordnungsstatus, offene Posten? Mit festem Spaltenformat? Zeitgesteuert möglich?
4. DATEV-Export: welches Format, welche Konten, lexoffice/sevDesk?
5. Gibt es einen Kalender-Abo-Link (iCal) oder Terminexport?
6. Lassen sich Adressen/Koordinaten für die Tourenplanung exportieren?
7. Sind automatisierte Zugriffe (RPA) laut AGB erlaubt? (Erwartung: nein)
8. AVV: Unterauftragnehmer, Rechenzentrum, Zertifikate (ISO 27001, C5)?
9. Vollexport bei Kündigung: Format und Kosten?
10. Werden Exportformate bei Updates stabil gehalten oder angekündigt?

### 1.4 Integrationsstrategie

| Stufe | Weg | Automatisierungsgrad | Voraussetzung |
|---|---|---|---|
| **A (sofort)** | Datei-Import: regelmäßiger CSV/Excel-Export aus MediFox, Upload ins Business OS (später: Ablage in überwachtem Ordner/Postfach) | halbautomatisch, 1 Klick pro Tag/Woche | Exportumfang im Paket bestätigt |
| **B** | DATEV-Fibu-Export + Bank-Kontoauszug (CAMT.053/CSV) | halbautomatisch | Premium-Paket bzw. Buchhaltungszugang |
| **C** | offizielle API, falls angeboten | automatisch | schriftliche Zusage, Partnervertrag, AVV |

Jeder Import läuft durch dieselbe **Prüfstrecke** (im Prototyp unter *System → Datenquellen* testbar): Pflichtspalten, Datumsformat, PLZ, Duplikate, Plausibilität (Summen gegen MediFox-Controlling), Fehlerquote über 2 % stoppt den Lauf, fehlerhafte Zeilen gehen in eine Klärungsliste, jeder Lauf wird protokolliert.

---

## 2. Systemarchitektur

```
 Datenquellen                Integrationsschicht              Kern                         Oberfläche
 ─────────────               ────────────────────             ─────                        ──────────
 MediFox DAN ──Export──►┐    Connector je Quelle              Zentrale Datenbank           Web-App (Desktop,
 DATEV/Buchhaltung ─────┤──► (austauschbar):                  (PostgreSQL, EU)             Tablet, Smartphone)
 Bank (CAMT) ───────────┤    Import → Prüfung → Staging  ──►  Kennzahlen-Schicht    ──►   Rollen & Rechte
 Website-Formular ──────┤    Protokoll, Klärungsliste         (versionierte Defini-        je Modul und
 Google (GSC, GA4, Ads, ┘    Retry, Dead-Letter               tionen, Snapshots)           Datenbereich
 Unternehmensprofil)                                          Automations-Engine
                                                              (Ereignisse, Zeitpläne,
                                                              Regeln, Freigaben)
 ─────────────────────────── Querschnitt ─────────────────────────────────────────────────────────────
 Anmeldung mit 2FA · Rechteprüfung im Server (Row Level Security) · Audit-Log · Verschlüsselung
 (Transport und Ruhe) · tägliche Backups + Wiederherstellungstest · Monitoring + Fehleralarme
 · Testumgebung mit Testdaten · Export aller eigenen Daten (CSV/XLSX)
```

**Empfohlener Technikstapel** (passt zur vorhandenen Website, kann ohne Neubau erweitert werden):

| Baustein | Empfehlung | Begründung |
|---|---|---|
| Web-App | Next.js (TypeScript) | gleiche Technik wie die vorhandenen Projekte, Server-Funktionen für Rechteprüfung |
| Hosting | EU-Region (Frankfurt), z. B. Vercel `fra1` + EU-Datenbank, oder Hetzner (DE) | Gesundheitsbezug, kurze Wege, AVV verfügbar |
| Datenbank | PostgreSQL (z. B. Supabase EU oder selbst betrieben) mit Row Level Security | Mandanten- und Rollenmodell direkt in der Datenbank |
| Anmeldung | E-Mail + Passwort + Zwei-Faktor (TOTP), kurze Sitzungen | Pflicht für Finanz- und Personaldaten |
| Jobs/Automationen | Warteschlange + Zeitplaner (z. B. Postgres-basiert) | Wiederholungsversuche, Idempotenz, Protokoll |
| Dateien | verschlüsselter Speicher in der EU | Importdateien, PDFs |

**Wichtig:** Bevor echte Daten fließen, braucht es (Inhaber-Entscheidung): Hosting-Anbieter mit AVV, ggf. Kosten für Datenbank/Hosting, Datenschutz-Folgenabschätzung (siehe Abschnitt 8).

---

## 3. Datenmodell

Alle Tabellen tragen `mandant_id` (Unternehmen), optional `region_id`/`team_id`, sowie **Herkunftsfelder**: `quelle`, `quelle_id`, `importiert_am`, `import_lauf_id`, `gueltig_ab`. So ist jede Zahl bis zur Quelle nachvollziehbar und mehrere Teams/Regionen sind ohne Umbau möglich.

### 3.1 Organisation und Personal
| Entität | Wichtige Felder |
|---|---|
| `mandant` | Name, Rechtsform, Steuernummer, Einstellungen |
| `region` | Name, PLZ-Liste/Polygon, Zielauslastung |
| `team` | Region, Leitung |
| `mitarbeiter` | Kürzel (wie in MediFox), Rolle, Team, Eintritt/Austritt, Qualifikationen |
| `arbeitszeitmodell` | Mitarbeiter, gültig ab, Wochenstunden, Arbeitstage, Anteil Leitung/Organisation, Dokumentationsanteil, Pausen |
| `abwesenheit` | Mitarbeiter, Art (Urlaub/Krank/Fortbildung), von/bis |
| `personalkosten` | Mitarbeiter, Monat, Arbeitgeberkosten (**nur Rolle Inhaber lesbar**) |
| `qualifikation` / `fortbildung` | Zertifikate (MLD, MT …), Punkte, Fristen |

### 3.2 Nachfrage und Patienten (datensparsam)
| Entität | Wichtige Felder |
|---|---|
| `anfrage` | Eingangskanal, Datum, Status (neu, Rückruf offen, Erstgespräch, angenommen, Warteliste, abgelehnt, abgeschlossen), gewünschte Leistung, PLZ/Ort, Verfügbarkeit, Dringlichkeit, Kostenträger, Zuständig |
| `kontakt_anfrage` | Name, Telefon (nur solange nötig, Löschfrist) |
| `patient_ref` | **Pseudonym** (MediFox-ID gehasht), PLZ, Kostenträgerart, Startdatum, aktiv ja/nein |
| `zuweisungsvorschlag` | Anfrage, Mitarbeiter, Tag, Umweg km, Begründung, Status (vorgeschlagen/freigegeben/abgelehnt) |

### 3.3 Leistung und Touren (aus MediFox gelesen)
| Entität | Wichtige Felder |
|---|---|
| `termin` | Datum, Uhrzeit, Mitarbeiter, patient_ref, PLZ, Leistung, Dauer, Status (geplant/erbracht/ausgefallen), Fahrzeit laut MediFox |
| `leistung` | Kürzel, Name, Dauer, Preis je Kostenträger, gültig ab |
| `tour` | Mitarbeiter, Tag, Reihenfolge, km, Fahrtzeit, Behandlungszeit |
| `tourvorschlag` | Tour, neue Reihenfolge, Ersparnis km/min, Status |

### 3.4 Finanzen
| Entität | Wichtige Felder |
|---|---|
| `erloes` | Leistungsdatum, Termin/Leistung, Betrag, Kostenträger (**Umsatz**) |
| `forderung` | Rechnungsnummer, Betrag, Fälligkeit, Mahnstufe |
| `zahlung` | Valutadatum, Betrag, Zuordnung (**Zahlungseingang**) |
| `kosten` | Monat, Konto (DATEV), Kostenart, Kostenstelle, Betrag, Zuordnung direkt/Gemeinkosten |
| `ziel` | Kennzahl, Zeitraum, Zielwert |

### 3.5 Marketing und Partner
| Entität | Wichtige Felder |
|---|---|
| `kanal` | Website, Google, Arzt, Partner, Empfehlung … |
| `kanal_kosten` | Kanal, Monat, Betrag |
| `kanal_kennzahl` | Kanal, Datum, Klicks, Impressionen, Anfragen |
| `partner` | Organisation, Art (Pflegedienst, Klinik, Praxis), Status, nächster Schritt mit Datum |
| `partner_kontakt` / `partner_aktivitaet` | Ansprechpartner:in, Gespräche, Vereinbarungen (**keine Patientendaten**) |

### 3.6 System
| Entität | Wichtige Felder |
|---|---|
| `datenquelle` | Art, Modus (API/Export/Formular/manuell), Status |
| `import_lauf` | Quelle, Zeit, Zeilen gesamt/ok/fehlerhaft, Status, Datei-Prüfsumme |
| `klaerungsfall` | Import-Lauf, Zeile, Problem, Status |
| `kennzahl_definition` | Schlüssel, Name, Formel, Quellen, Version, gültig ab |
| `kennzahl_wert` | Definition, Zeitraum, Wert, Datenqualität (vollständig/unvollständig/veraltet), berechnet am |
| `automation` | Auslöser, Regel, Aktion, Kontrolle, Stufe, Status |
| `automation_lauf` | Zeit, Ergebnis, Fehler, Versuch Nr. |
| `freigabe` | Automation, Vorschlag, Entscheidung, entschieden von/am |
| `aufgabe` | Titel, zuständig, fällig, Herkunft |
| `benutzer`, `rolle`, `berechtigung` | Rolle je Modul und Datenbereich (voll/lesen/eigene/zusammengefasst/kein) |
| `audit_log` | Zeit, Benutzer, Aktion, Objekt, vorher/nachher (unveränderbar) |

---

## 4. Kennzahlen: einheitliche Definitionen

| Kennzahl | Definition | Quelle |
|---|---|---|
| **Umsatz** | Summe der Erlöse erbrachter Behandlungen nach **Leistungsdatum** | MediFox |
| **Zahlungseingang** | tatsächlich eingegangene Zahlungen nach Valutadatum | Bank/Buchhaltung |
| **Forderungen** | abgerechnet, noch nicht bezahlt | MediFox/Buchhaltung |
| **Direkte Kosten** | Arbeitgeberkosten der behandelnden Angestellten + Fahrzeugkosten | Buchhaltung + Touren |
| **Deckungsbeitrag** | Umsatz − direkte Kosten (je Mitarbeiter, Leistung, Region möglich) | berechnet |
| **Gemeinkosten** | Verwaltung, Büro, Software, Versicherung, Marketing. **Personalkosten der Therapeut:innen nie zusätzlich hier** | Buchhaltung |
| **Ergebnis** | Deckungsbeitrag − Gemeinkosten (vor Steuern, ohne Unternehmerlohn, ausgewiesen) | berechnet |
| **Behandlungsfähige Nettozeit** | Vertragsstunden − Abwesenheit − Leitung/Organisation − Dokumentation − Pausen − Fahrtzeit | Arbeitszeitmodell + Termine |
| **Auslastung** | geplante bzw. erbrachte Behandlungsstunden ÷ Nettozeit | berechnet |
| **Offene Kapazität** | 1 − Auslastung, in Stunden und Prozent | berechnet |
| **Fahrzeit-Anteil** | Fahrtzeit ÷ (Fahrtzeit + Behandlungszeit) | Touren |
| **Ausfallquote** | ausgefallene ÷ geplante Termine | MediFox |
| **Conversion** | Anfrage → Erstgespräch → regelmäßige Behandlung | Anfragen + MediFox |
| **Kosten pro Neupatient:in** | Kanalkosten ÷ gewonnene Patient:innen je Kanal | Marketing |

**Regeln:** Jede Kennzahl hat eine Version. Änderungen der Definition gelten ab Datum und werden nicht rückwirkend still angewendet. Fehlt eine Quelle, wird die Kennzahl als *unvollständig* markiert statt scheinbar genau berechnet. Jede Kennzahl ist im Dashboard anklickbar (Formel, Eingangswerte, Quelle, Stand, Vergleich Vormonat/Vorjahr/Ziel).

---

## 5. Dashboard-Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Mobile Physiotherapie Oehlke · Unternehmensübersicht           Ansicht [Inhaber ▾]  (R) │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [Heute] [Diese Woche] [Dieser Monat]              Datenstand: vor 2 Std. · Qualität ●   │
├──────────────────┬──────────────────┬──────────────────┬─────────────────────────────────┤
│ MONATSUMSATZ  ●  │ OFFENE KAPAZITÄT │ AKTIVE THERAP.   │ OFFENE AUFGABEN                 │
│ 18.420 €         │ 12 %             │ 4                │ 7                               │
│ Prognose 31.400  │ 11,7 Std. frei   │ 136 Std./Woche   │ 4 Freigaben, 3 Aufgaben         │
│ ▲ 4 % ggü. Vorm. │ ▼ 3 Pp. ggü. Ziel│ ▲ 1 ggü. Vorjahr │                                 │
├──────────────────┴──────────────────┴──────────────────┼─────────────────────────────────┤
│ HANDLUNGSBEDARF (nach Priorität)                       │ PROGNOSE MONATSENDE             │
│ [HOCH]   Warteliste: Frau R. → Jonas, Mo   [Prüfen]    │ konservativ │ realistisch │ opt.│
│ [HOCH]   Automation fehlgeschlagen         [Ansehen]   │ ▸ Annahmen anzeigen             │
│ [MITTEL] Kapazität nächste Woche prüfen    [Öffnen]    ├─────────────────────────────────┤
│ [MITTEL] Rechnung 27 Tage überfällig       [Freigabe]  │ DATENABGLEICH                   │
├────────────────────────────────────────────────────────┤ ● MediFox   in Prüfung · 3 Std.│
│ UMSATZENTWICKLUNG (13 Monate)                          │ ● Website   ok · 4 Std.         │
│  Umsatz ── Zahlungseingang - - Ziel ‥‥                 │ ○ Buchhaltung nicht verbunden   │
│                                                        │ ○ Bank       nicht verbunden    │
└────────────────────────────────────────────────────────┴─────────────────────────────────┘
 Woche:  Auslastung · Freie Behandlungsstunden · Fahrzeit-Anteil · Warteliste
 Monat:  Umsatz · Zahlungseingang · Deckungsbeitrag · Ergebnis (getrennt!)
```

Live umgesetzt im Prototyp: https://physiotherapie-oehlke.vercel.app/dashboard (Demo-Zugang ramon / demo).

---

## 6. Modulübersicht

| Nr. | Modul | Zweck | Kernfunktionen | Phase |
|---|---|---|---|---|
| 01 | Dashboard | Zustand in 5 Sekunden erfassen | Kennzahlen Heute/Woche/Monat, Vergleiche, Drill-down, Handlungsbedarf, Prognose, Datenstand | **1** (Fundament), 2 (Controlling-Zahlen) |
| 02 | Patienten & Nachfrage | keine Anfrage geht verloren | Erfassung aus Website/Telefon/E-Mail, Status, Warteliste, Doppelanlagen-Erkennung, Zuweisungsvorschläge, Erinnerungen, Conversion | 3 |
| 03 | Personal & Kapazitäten | Wachstum planbar machen | Arbeitszeitmodelle, Auslastung, Abwesenheiten, Fortbildung, Einstellungsrechner, Engpasswarnung | 3 |
| 04 | Touren & Einsatzplanung | mehr Behandlungs-, weniger Fahrzeit | PLZ-Gruppierung, Fahrtzeiten, Reihenfolge-Optimierung, Lückenfüller bei Ausfällen, Wirtschaftlichkeit je Tour | 4 |
| 05 | Controlling & Finanzen | belastbare Zahlen | Umsatz/Zahlung/Kosten/DB/Ergebnis getrennt, Liquidität 13 Wochen, Ziele | 2 |
| 06 | Marketing & Wachstum | messen, was Patient:innen bringt | GSC, Web-Statistik, Google-Profil, Ads, Kosten pro Neupatient:in, KI-Beiträge mit Freigabe | 5 |
| 07 | Partner & Zuweiser | Kooperationen steuern | CRM ohne Patientendaten, nächste Schritte, Nachfass-Erinnerungen, Anfragen je Partner | 5 |
| 08 | Aufgaben & Automationen | Routinen automatisieren | Automations-Engine, Freigaben, Aufgaben, Fehlerbearbeitung | **1** |
| 09 | Berichte & Prognosen | vorausschauen | Wochen-/Monatsberichte, Szenarien (konservativ/realistisch/optimistisch), Annahmen offen | 6 (erste Prognose in 1) |
| 10 | System & Einstellungen | sicherer Betrieb | Datenquellen, Import-Prüfung, Sync-Protokoll, Rollen/Rechte, Audit-Log, Datenschutz | **1** |

---

## 7. Automationskonzept

### 7.1 Aufbau jeder Automation
| Element | Frage | Beispiel |
|---|---|---|
| **Auslöser** | Was ist passiert? | Anfrage seit 24 Std. im Status neu |
| **Regel** | Unter welchen Bedingungen? | keine Rückruf-Notiz vorhanden |
| **Aktion** | Was führt das System aus? | Erinnerung an Verwaltung, nach 48 Std. an Inhaber |
| **Kontrolle** | Woran erkennt man Erfolg/Fehler? | Statuswechsel oder protokollierte Eskalation |

Status: **aktiv**, **pausiert**, **fehlgeschlagen**, **Freigabe nötig**, **geplant**. Jede Automation ist einzeln pausierbar; jeder Lauf und jede Freigabe wird protokolliert.

### 7.2 Automatisierungsstufen
| Stufe | Bedeutung | Beispiele |
|---|---|---|
| **1 · vollautomatisch** | läuft ohne Bestätigung | Kennzahlen aktualisieren, Import prüfen, Fristen überwachen, Erinnerungen, Berichte erstellen, Fehler protokollieren |
| **2 · Vorschlag + Freigabe** | System bereitet vor, Mensch bestätigt | Patient zuweisen, Tour ändern, externe Nachricht/Mahnung senden, Beitrag veröffentlichen, Budget ändern, Personalmaßnahme |
| **3 · kontrollierte Autonomie** | ohne Einzelbestätigung, aber nur mit geprüften Regeln, Rechten, Protokoll, Rückfall und getesteter Fehlerbehandlung | z. B. Standard-Erinnerungen an Patient:innen, wenn Stufe 2 über 3 Monate fehlerfrei lief |

Aufstieg von Stufe 2 auf 3 nur per bewusster Entscheidung des Inhabers mit messbarer Fehlerquote.

### 7.3 Engine (technisch)
- Ereignisse (z. B. `anfrage.erstellt`, `import.abgeschlossen`, `termin.ausgefallen`) und Zeitpläne lösen Automationen aus.
- Regeln als konfigurierbare Bedingungen, keine Programmierung je Prozess.
- Ausführung idempotent, mit Wiederholungsversuchen (z. B. 3× mit wachsendem Abstand), danach Fehlerliste mit „erneut verarbeiten“.
- Neue Prozesse = neuer Eintrag (Auslöser, Regel, Aktion, Kontrolle), kein Umbau.

### 7.4 Startkatalog
| Automation | Stufe | Phase |
|---|---|---|
| Kennzahlen aktualisieren | 1 | 1 |
| MediFox-Export prüfen und übernehmen | 1 | 1 |
| Unbearbeitete Anfrage erinnern | 1 | 3 |
| Zuweisungsvorschlag für Warteliste | 2 | 3 |
| Verordnungsfristen überwachen | 1 | 3 |
| Zahlungserinnerung vorbereiten | 2 | 2 |
| Wochenbericht an Inhaber | 1 | 2 |
| Tourvorschlag bei Ausfall | 2 | 4 |
| KI-Beitrag veröffentlichen | 2 | 5 |
| Partner nachfassen | 1 | 5 |
| Bewertung anfragen | 2 | 5 |

---

## 8. Berechtigungskonzept

| Bereich | Inhaber | Teamleitung | Therapeut:in | Verwaltung | Extern (z. B. Steuerberatung) |
|---|---|---|---|---|---|
| Dashboard | voll | voll | eigene | voll | – |
| Patienten & Nachfrage | voll | voll | – | voll | – |
| Personal & Kapazitäten | voll | voll | eigene | lesen | – |
| Touren | voll | voll | eigene | lesen | – |
| Controlling & Finanzen | voll | zusammengefasst | – | voll | zusammengefasst |
| Marketing | voll | lesen | – | lesen | – |
| Partner & Zuweiser | voll | voll | – | voll | – |
| Aufgaben & Automationen | voll | voll | eigene | voll | – |
| Berichte & Prognosen | voll | lesen | – | lesen | lesen |
| System & Einstellungen | voll | – | – | – | – |
| Gehälter einzelner Personen | voll | – | – | – | – |

**Grundsätze:** Rechte werden **im Server** (Row Level Security) geprüft, nicht nur in der Oberfläche. Zwei-Faktor-Anmeldung für alle. Externe Zugänge nur lesend und befristet. Jeder Zugriff auf Finanz- und Personaldaten wird protokolliert. Rollen sind je Modul und Datenbereich (eigene/Team/alle) konfigurierbar.

**Datenschutz (Art. 9 DSGVO):** Das Business OS verarbeitet Patientendaten nur pseudonymisiert (Kennung, PLZ, Leistung, Kostenträger) – keine Diagnosen, keine Dokumentation. Kontaktdaten aus Anfragen werden nach Übernahme in MediFox bzw. Ablehnung gelöscht (Löschfrist definieren). Vor Produktivbetrieb: AVV mit Hosting-/Datenbankanbieter, Verzeichnis der Verarbeitungstätigkeiten, Datenschutz-Folgenabschätzung prüfen, technische und organisatorische Maßnahmen dokumentieren. KI-Dienste nur mit Daten ohne Patientenbezug oder nach gesonderter Prüfung (AVV, Serverstandort).

---

## 9. Entwicklungsplan

Jede Phase wird erst abgenommen, wenn Oberfläche **und** Datenqualität, Berechtigungen, Fehlerfälle und Wiederherstellung geprüft sind.

### Phase 1 · Fundament und Dashboard ← *begonnen*
**Inhalt:** Datenmodell, Rollen und Rechte, Sicherheitskonzept, Schnittstellenprüfung MediFox, Import-Prüfstrecke, Sync-Protokoll, zentrale Fehleranzeige, Automations-Engine (Grundgerüst), Dashboard.
**Abnahme:**
- MediFox-Fragen schriftlich beantwortet, Integrationsweg festgelegt
- Testimport mit echtem Export: Fehlerzeilen landen in der Klärungsliste, Lauf wird protokolliert, Fehlerquote > 2 % stoppt
- Jede Dashboard-Kennzahl zeigt Formel, Quelle, Stand und Qualität
- Rollenwechsel: Therapeut:in sieht keine Finanzen/Gehälter (Server-Test)
- Backup + Wiederherstellung einmal erfolgreich getestet
**Nutzen:** täglicher Überblick in unter 5 Minuten statt Zahlen aus mehreren Systemen zusammensuchen.

### Phase 2 · Dashboard und Controlling
**Inhalt:** DATEV- und Bank-Import, Umsatz/Zahlung/Kosten/DB/Ergebnis getrennt, Mitarbeitervergleich, Zielwerte, Monatsprognose, Liquidität 13 Wochen, Wochenbericht.
**Abnahme:** Monatsumsatz weicht weniger als 1 % vom MediFox-Controlling ab; Kosten stimmen mit der Buchhaltung überein; unvollständige Monate sind markiert; Teamleitung sieht keine Gehälter.
**Nutzen:** Monatsabschluss-Überblick ohne Excel, Ergebnis vor Monatsende absehbar.

### Phase 3 · Anfragen und Personalplanung
**Inhalt:** Anfrageverwaltung (Website direkt, Telefon/E-Mail manuell), Warteliste, Doppelanlagen-Erkennung, Erinnerungen, Zuweisungsvorschläge (Stufe 2), Arbeitszeitmodelle, Auslastung 4–12 Wochen, Einstellungsrechner.
**Abnahme:** keine Anfrage älter als 48 Std. ohne Bearbeitung; Zuweisungsvorschlag in > 80 % der Fälle angenommen; Engpass wird ≥ 4 Wochen vorher angezeigt.
**Nutzen:** kürzere Wartezeit, weniger verlorene Anfragen, Einstellungsentscheidung auf Zahlenbasis.

### Phase 4 · Tourenoptimierung
**Inhalt:** Geokodierung der PLZ/Adressen (ohne Patientennamen), Fahrtzeiten, Reihenfolge-Optimierung, Lückenfüller bei Ausfällen, Wirtschaftlichkeit je Tour, Vorschläge zur Umsetzung in MediFox.
**Abnahme:** Fahrzeit-Anteil messbar gesenkt (Ziel: unter 25 %); jeder Vorschlag zeigt Ersparnis in km und Minuten.
**Nutzen:** z. B. 30 Min. weniger Fahrt pro Therapeut:in und Tag ≈ 2,5 zusätzliche Behandlungen pro Woche.

### Phase 5 · Marketing und Partner-CRM
**Inhalt:** GSC, Web-Statistik, Google-Profil, Ads; Quelle je Anfrage; Kosten pro Neupatient:in; Partner-CRM mit Nachfass-Automation; KI-Beiträge mit Freigabe.
**Abnahme:** jede Anfrage hat eine Quelle; Kosten pro Neupatient:in je Kanal monatlich; keine Patientendaten im CRM.
**Nutzen:** Budget dorthin, wo Patient:innen herkommen.

### Phase 6 · Erweiterte KI und Unternehmensplanung
**Inhalt:** Berichte in verständlicher Sprache, Anomalieerkennung, Szenarien (Neueinstellung, Arbeitszeit, neue Region), Empfehlungen, ausgewählte Prozesse in Stufe 3.
**Abnahme:** jede Prognose zeigt Annahmen; Prognosefehler wird gemessen; Stufe-3-Prozesse haben Rückfall und Fehlerquote < 1 %.
**Nutzen:** Wachstumsentscheidungen (Team, Region) mit vorab berechneter Wirkung.

---

## 10. Abnahmekriterien für das Gesamtsystem
- Kennzahlen aktualisieren sich ohne Doppelpflege
- jede Kennzahl ist bis zur Datenquelle nachvollziehbar
- veraltete oder unvollständige Daten sind erkennbar
- fehlerhafte Importe werden erkannt und können sicher erneut verarbeitet werden
- keine Patientenanfrage geht unbemerkt verloren
- freie Kapazitäten und Personalengpässe sind früh sichtbar
- Umsatz, Zahlungseingang, Kosten und Ergebnis sind korrekt getrennt
- Mitarbeiter:innen sehen nur freigegebene Daten
- Automationen sind protokolliert, pausierbar und kontrollierbar
- ein weiteres Team oder eine Region lässt sich ohne Umbau ergänzen

---

## 11. Offene Entscheidungen (Inhaber)

1. **MediFox anfragen** (Fragenliste 1.3) und gebuchtes Paket bestätigen (Basis hat keinen Controlling-/Fibu-Export).
2. **Hosting und Datenbank** in der EU wählen; ggf. laufende Kosten (geringe zweistellige Beträge pro Monat zu erwarten, je nach Anbieter) freigeben.
3. **Buchhaltung**: Wer macht sie (Steuerberatung mit DATEV, lexoffice …), und kann monatlich exportiert werden?
4. **Datenschutz**: AVV-Verträge, Löschfristen für Anfragen, ggf. Datenschutzbeauftragte:r einbeziehen.
5. **Zielwerte** festlegen: Monatsumsatz, Zielauslastung, max. Fahrzeit-Anteil, max. Wartezeit.
6. **Rollen**: Wer erhält welchen Zugang (Teamleitung, Verwaltung, Steuerberatung)?

---

## 12. Stand des Prototyps (Phase 1)

Unter https://physiotherapie-oehlke.vercel.app/dashboard (Demo, Beispieldaten, keine echte Anmeldung):
- Navigation nach den 10 Modulen, Untermodule als Reiter
- Dashboard mit Heute/Woche/Monat, anklickbaren Kennzahlen (Formel, Eingangswerte, Quelle, Vergleich, Datenqualität), Handlungsbedarf nach Priorität, Prognose mit Annahmen, Datenabgleich
- System: Datenquellen mit Status, Import-Prüfstrecke für CSV, Sync-Protokoll mit Klärungsfällen, Rollen-und-Rechte-Matrix mit umschaltbarer Ansicht, Protokoll mit CSV-Export
- Automationen mit Auslöser/Regel/Aktion/Kontrolle, Stufe, Status, Pausieren; Freigaben (Stufe 2) mit Protokoll
- Module späterer Phasen zeigen Funktionen und Abnahmekriterien; vorhandene Prototypen (Touren, Warteliste, Rechnungen, KI-Beiträge) bleiben nutzbar

**Was der Prototyp nicht ist:** Er speichert nur im Browser, hat keine echte Anmeldung und keine echte Datenquelle. Für echte Daten ist der Schritt aus Abschnitt 11 (Hosting, AVV, MediFox-Export) nötig.
