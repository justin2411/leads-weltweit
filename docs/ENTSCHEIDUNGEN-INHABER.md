# Entscheidungen des Inhabers (Wortlaut, nach Thema)

Hier stehen **alle datierten Entscheidungen des Inhabers** aus der früheren langen `CLAUDE.md` (alte Abschnitte §3–§10)
wörtlich, mit Zitat und Datum, nach Thema gruppiert. `CLAUDE.md` nennt je Thema nur noch die geltende Kernregel und
verweist hierher. Unter jedem Eintrag steht der **Stand**: gilt, ergänzt oder **ersetzt durch …** (jüngere
Inhaber-Entscheidung). Nichts wurde gelöscht.

Rangfolge: unverrückbare Regeln in `CLAUDE.md` §2 → jüngere Inhaber-Entscheidung vor älterer → bei zwei gültigen
Regeln gilt die **strengere**. Neue Entscheidungen: hier im passenden Thema eintragen (Datum, Wortlaut, Stand), in
`CLAUDE.md` nur die Kernregel-Zeile anpassen, zusätzlich Tageslogbuch `docs/ENTSCHEIDUNGEN.md`.

Code-Kommentare mit „CLAUDE.md §8a“, „§9“ oder „§10“ meinen Einträge in dieser Datei; „§2“, „§5“, „§6“, „§7“ stehen
weiter in `CLAUDE.md` (Grundauftrag-Wortlaut unten).

## Versand und Zustellbarkeit

- **Resend verbietet Kaltakquise.** Resend nur für Mails an Empfänger mit Einwilligung: Lieferungen an zahlende Kunden, Bestätigungen von Probe-Anfragen, Willkommensmails, Antworten an Leute, die selbst geschrieben haben. Kaltmails über ein eigenes SMTP-Postfach bei Strato auf **nextgen-profit.de** (Entscheidung Inhaber 26.09.2026: keine Zweitdomain). Voraussetzung: MX, SPF, DKIM und DMARC für Strato in Vercel DNS gesetzt und geprüft (`scripts/dns_check.py`). `config/versand.yaml` steht auf `aktiv: false`.
  - _Stand 04.10.2026:_ gilt (Resend nie für Kaltmails, Versand über Strato-SMTP). Der Satz „`config/versand.yaml` steht auf `aktiv: false`“ ist **ersetzt durch** „Versand wieder an“ (03.10.2026).
- Erste Welle: **1000 Mails insgesamt** über mehrere Zielgruppen und Länder (UK, US, FR); die Grenze von drei Segmenten gleichzeitig ist dafür aufgehoben. Pro Experiment weiterhin nur eine Sache ändern.
  - _Stand 04.10.2026:_ 1000-Mails-Welle und Aufhebung der Drei-Segmente-Grenze: Testumfang **ersetzt durch** „Tests nur Webagenturen US/UK/FR“ (04.10.2026); Tagesmengen siehe „Versand wieder an“ (03.10.2026).
- Versand mit Aufwärmphase und Notbremse (`scripts/lib/deliverability.py`); Schalter `config/versand.yaml`.
  - _Stand 04.10.2026:_ Aufwärmphase **ersetzt durch** „Versand ohne Aufwärmphase“ (26.09.2026). Notbremse gilt weiter.
- **Freigabe (26.09.2026, Chat):** „du kannst dann einfach starten wenn du alles hast, musst mich nicht nochmal fragen“. Damit dürfen Entwürfe, die alle Prüfungen bestehen, ohne weitere Rückfrage freigegeben und im Rahmen von Aufwärmphase, Tageslimits und Notbremse versendet werden (bis 1000 Mails). Notbremse oder Spam-Beschwerde stoppen den Versand; dann wieder den Inhaber fragen.
  - _Stand 04.10.2026:_ gilt. Zwischenzeitlicher Stopp vom 28.09. ist durch „Versand wieder an“ (03.10.2026) aufgehoben.
- **Versand ohne Aufwärmphase (26.09.2026, „ja ändere es und sende … jeden Tag, auch heute 100 Mails“, Upload ausdrücklich bestätigt):** Notbremse: Bounce-Quote über 5 %, bewertet erst ab 100 gesendeten Mails (Nachtrag „lockerer“) (Spam-Beschwerde stoppt weiterhin sofort). Versand und Automatiklauf täglich inkl. Wochenende, Tagesziel 100 (`config/versand.yaml`: `aufwaermphase: false`, `tagesziel`), begrenzt durch `anbieter_tageslimit` − 10.
  - _Stand 04.10.2026:_ Notbremse (Bounce > 5 % ab 100 Mails, Spam sofort) gilt. „Tagesziel 100“ **ersetzt durch** „Versand wieder an“ (03.10.2026: 90, täglich +15 bis 150); „täglich“ **ersetzt durch** „Versand rund um die Uhr“ (04.10.2026).
- **Versand autonom (Inhaber 26.09.2026):** Sobald Kaltmails über ein eigenes SMTP-Postfach laufen, darf das Gehirn selbst senden und Tagesmengen anpassen – innerhalb von Notbremse und Anbietergrenze. Es darf **nie ohne Wissen des Inhabers dessen Geld ausgeben**; Einnahmen von Kunden immer einholen, Ziel Gewinn.
  - _Stand 04.10.2026:_ gilt (innerhalb Notbremse und Anbietergrenze, nie Geld des Inhabers).
- **Versand gestoppt (Inhaber 28.09.2026: „bitte schick noch keine Mails raus, stoppe das noch“):** `config/versand.yaml` `aktiv: false`. Keine Kalt- und Nachfassmails, auch nicht über den Wachhund, bis der Inhaber den Versand wieder freigibt.
  - _Stand 04.10.2026:_ **ersetzt durch** „Versand wieder an“ (03.10.2026).
- **Versand wieder an (Inhaber 03.10.2026: „1 bis 3 genauso umsetzen 4. wir starten mit 90 mails pro tag“):** `config/versand.yaml` `aktiv: true`, Tagesziel 90, täglich +15 bis 150; ersetzt den Stopp vom 28.09. Notbremse, Spam-Stopp und alle Prüfungen unverändert.
  - _Stand 04.10.2026:_ gilt. Versandzeiten **ersetzt durch** „Versand rund um die Uhr“ (04.10.2026).
- **Versand rund um die Uhr (Inhaber 04.10.2026, 15:10: „es sollen immer mails rausgehen nicht nur di-do. sondern jeden tag um jede uhrzeit es soll die ganze zeit laufen und ich will es bei jarvis auch in der grafik sehen das es an ist“):** `send.yml` jeden Tag stündlich :37, alle Länder; jeder Lauf sendet nur seinen Anteil der Tagesmenge (Rest ÷ verbleibende Läufe, höchstens 45 min; Plan `app/lib/versandzeit.json`, `outreach.py send --anteil --minuten 45`), Nachfassmails mit denselben Läufen. Ersetzt „Versandzeit nur Di–Do“. Alle Grenzen unverändert; A/B-Schritt „Versandzeit“ pausiert. JARVIS-Karte: Versand grün „an · 24/7“, rot „aus“ nur bei Pause/Notbremse. Kontrolladressen-Test: Secret `SEED_INBOXES` (eigene Adressen des Inhabers) bekommt je Tag und Land eine Kopie einer echten Erstmail, Nachweis in `signalwerk.seed_checks` (keine Kaltmail, zählt nicht).
  - _Stand 04.10.2026:_ gilt.

## Kaltmail-Recht, Länder, Rechtsformen

- **Rechts-Tabelle Kaltmails (Inhaber 04.10.2026 nach Anwaltsberatung, Verantwortung Inhaber):** ohne Einwilligung anschreiben – DE: nie; US: Einzelunternehmer und Firmen ja (Opt-out, Pflichtangaben); UK: nur Firmen (Ltd/LLP/PLC), Einzelunternehmer nein; FR: Einzelunternehmer und Firmen ja, nur berufsbezogen; SE: nur Firmen; IE und BE: nie (Inhaber: „bei sehr hoch oder hoch machen wir bitte nie etwas“ – gilt für jedes Land mit Risiko hoch/sehr hoch, auch AU, CA, IL); NL: gar nicht (auch B.V. nicht) → `countries.yaml` NL `allowed: false`. Volle Tabelle mit weiteren Ländern (SG, HK, BR, MX ja; AU, NZ, CA, JP bedingt; IL nur Anfrage; FI nur Firmen; AT, CH, IT, ES, PL, DK, ZA nie) in `docs/KALTMAIL-RECHT.md`. Strengere Regel gilt immer; Sperrliste/Notbremse/Abmeldung unverändert.
  - _Stand 04.10.2026:_ gilt – strengste Regel, geht allen älteren Länder-Angaben vor (auch §4-Tabelle, Test-Matrix, Scout-Regeln).
- **Einzelunternehmer (Inhaber 04.10.2026 nach Anwaltsberatung, Verantwortung Inhaber):** US ja (Pflichtangaben + Opt-out), FR ja nur berufsbezogen + Opt-out (`countries.yaml` FR `company_forms_only: false`), UK nein (PECR: sole trader = individual), DE nie; IE/NL/SE/BE bleiben bei Einwilligungspflicht (nur Kapitalgesellschaften). Einzelunternehmer bekommen keine automatische Nachfassmail, nur nach eigener Antwort (`scripts/followups.py`, Versandprüfung `outreach.py`; juristische Person = erkannte Kapitalgesellschaft, `lib.rules.is_legal_person`, unbekannte Rechtsform zählt nicht). Bisher nur an der Rechtsform gescheiterte FR-Käufer prüft das Kunden-Werk einmal mit der unveränderten Prüfregel neu (`kundenwerk.py regeln`, auch im Teil `nachpruefen`). Käufer zählen weiter nur mit `check_status = ok`.
  - _Stand 04.10.2026:_ gilt. IE/NL/BE: strenger geregelt durch die „Rechts-Tabelle Kaltmails“ (04.10.2026: IE, BE nie; NL gar nicht).

## Fokus und Tests

- **Test-Matrix US/UK/FR (Inhaber 01.10.2026: „Ich will aber nicht nur usa also mach die anderen beiden länder auch das ist wichtig zum testen wo was klappt“):** `config/fokus.yaml` = S4, S5, S2 in US, UK und FR, alle gleichrangig. Frankreich ist dafür als Mail-Land für S2, S4, S5 eingetragen (`segments.email_countries`), Experimente S4/FR und S5/FR angelegt; Versand weiter erst nach Freigabe. Französische Käufer: Rechtsform aus Mentions légales und dem offenen Register (recherche-entreprises.api.gouv.fr); Proben/Lieferungen für FR mit französischem Playbook (`scripts/lib/salesplay_fr.json`).
  - _Stand 04.10.2026:_ Fokus S4/S5/S2 **ersetzt durch** „Fokus Webagenturen“ (02.10.2026) und „Tests nur Webagenturen US/UK/FR“ (04.10.2026). FR als Mail-Land gilt weiter (Rechts-Tabelle 04.10.2026).
- **Fokus Webagenturen (Inhaber 02.10.2026: „lass uns bitte erstmal auf webagenturen fokussieren … kunden und leads dort erstmal massenweise produzieren, damit wir das heute starten können“):** Lead-Werk: alle 30 Teile S2 (Firmen ohne Website) in US/UK/FR/IE/NL/BE/SE, neu US aus Overture (nur mit E-Mail, ~390.000 Kandidaten, Test 95 % grün). Kunden-Werk: nur S2-Käufer (`--segments S2`), Kategorien web_designer, graphic_designer, social_media_agency, web_hosting_service, internet_marketing_service. Andere Branchen ruhen, bis der Inhaber sie wieder freigibt. Versand bleibt aus, bis er ihn freigibt.
  - _Stand 04.10.2026:_ gilt. „Versand bleibt aus“ **ersetzt durch** „Versand wieder an“ (03.10.2026). IE/NL/BE: Lead-Linien ja, Kaltmails nie (Rechts-Tabelle 04.10.2026).
- **Tests nur Webagenturen US/UK/FR (Inhaber 04.10.2026: „beim gehirn bei a/b tests soll er das nur für webagencys usa, fr, und uk machen nichts mehr erst wenn ich ihm das freigebe das soll überall so sein, wir brauchen erstmal nichts anderes“):** Alle Tests von Gehirn, JARVIS und Agenten (Seiten-Varianten, Preise, Betreff/Einstieg, A/B bei Engpässen, neue Seiten, Zielgruppen-Auswertungen) nur für Segment × Land aus `config/fokus.yaml` `tests` (heute S2 × US/UK/FR; Code: `scripts/lib/fokus.py` `test_allowed`, App `app/lib/test-scope.ts`). Andere Seiten bleiben live, nur Variante A; andere Experimente `paused`. Liste erweitern nur der Inhaber.
  - _Stand 04.10.2026:_ gilt.
- **JARVIS ist der Kopf (Inhaber 04.10.2026: „jarvis ist der kopf des gesamten prozesses und soll vollkommen selbstständig ausführen dürfen, alles anpassen können und seine ziele erreichen“; „bei engpässen, die er längere zeit beobachtet automatisch ins a/b splittesting zu gehen“):** JARVIS führt alle Werke, Agenten, Gehirn und Scout selbstständig nach `docs/JARVIS.md`, Ziele: Umsatz, KPIs, Lead-Qualität. Hält ein Engpass an (6 von 8 Läufen und ≥ 24 h), startet er selbst einen A/B-Test (eine Sache pro Test, Mindestmengen, Gewinner übernehmen) und passt selbst an. Grenzen bleiben nur Geld, Kaltmail-Recht, Abmeldelink/Sperrliste/Notbremse/Drei-Stufen-Freigabe (nie Testvariante, nie lockern) und Löschen durch den Inhaber.
  - _Stand 04.10.2026:_ gilt; A/B-Tests nur im Rahmen von „Tests nur Webagenturen US/UK/FR“.

## Lead-Inhalte, Proben, Freigabe

- **Ansprechperson im Lead (Inhaber 27.09.2026: „doch ansprechperson dürfen wir, ändere das“):** Leads dürfen Name und Rolle einer Ansprechperson enthalten – nur Inhaber, Geschäftsführer oder vertretungsberechtigte Personen aus öffentlichen Registern (z. B. Companies House, Handelsregister) oder aus dem Impressum der Firmenwebsite. Seit 01.10.2026 auch Handynummern und private/Freemail-Adressen, wenn die Quelle sie veröffentlicht (siehe nächster Punkt). Fehlt ein Name, steht die Rolle („Ask for …“). Offene Rechtsfrage für EU/UK (Informationspflicht nach Art. 14 DSGVO bei Weitergabe an Kunden) liegt beim Inhaber.
  - _Stand 04.10.2026:_ gilt, erweitert durch „Alle Kontaktdaten sammeln“ (01.10.2026).
- **Alle Kontaktdaten sammeln (Inhaber 01.10.2026: „nimm diese regel wieder raus und lass uns alle daten sammeln die wir finden“):** Leads dürfen alle Kontaktdaten enthalten, die erlaubte Quellen (amtliche Register und Datensätze wie FMCSA, SEC, Companies House, SIRENE; Firmenwebsites; offene Daten wie Overture/OSM) zu Firma und Inhaber/Geschäftsführer/Officer veröffentlichen – auch Handynummern und Gmail-/Freemail-Adressen von Einzelunternehmern. Kein Scraping verbotener Plattformen, robots.txt und Abrufgrenzen gelten weiter. Die Kaltmail-Regeln für unsere eigene Akquise (Länder, Sperrliste, Prüfungen) bleiben unverändert. Offene Rechtsfrage EU/UK (Art. 14 DSGVO) weiter beim Inhaber.
  - _Stand 04.10.2026:_ gilt.
- **Landesweit statt regional (Inhaber 27.09.2026):** Leads, Proben, Landingpages, Kaltmails und Videos nennen keine Städte oder Regionen mehr, sondern das ganze Land („across the UK“, „partout en France“). Landingpages für UK, US und FR; die Startseite schaltet per Länder-Umschalter.
  - _Stand 04.10.2026:_ gilt.
- **Anreicherung und Lieferregeln (Inhaber 27.09.2026):** `scripts/enrich.py` / `.github/workflows/anreichern.yml` finden und prüfen Websites und Kontaktdaten. Leads mit widersprüchlichen Daten (Qualitätsprüfung `blocking`) werden nie geliefert. Webagenturen (S2): keine Website-Pflicht (fehlende Website ist der Verkaufsgrund). Handynummern auf der eigenen Firmenwebsite sind als zentrale Nummer erlaubt („Handynummer sogar noch besser“).
  - _Stand 04.10.2026:_ gilt.
- **Probe immer genau 10 (Inhaber 29.09.2026: „es müssen immer genau 10 sein … das soll immer so sein!“):** Jede Probe (PDF, CSV, Beispiel-PDF) enthält genau 10 verschiedene Firmen – nie weniger, nie dieselbe Firma zweimal. Gibt es keine 10 vollständigen, verschiedenen Firmen, geht keine Probe raus (`SAMPLE_SIZE` in `scripts/lib/leadreport.py`, `scripts/samples.py`).
  - _Stand 04.10.2026:_ gilt.
- **Proben-Vorrat und Sofortversand (Inhaber 03.10.2026: „es soll direkt nach dem button klick die probe rausgehen auch immer mit den aktuell besten leads“, „ca. 50 proben … fertig und geprüft“):** `scripts/sample_stock.py` / `.github/workflows/proben-vorrat.yml` (stündlich 24/7 + Wachhund) hält je Live-Seite fertige Proben bereit (`config/proben.yaml`: Fokus 6, sonst 3; Verfall nach 48 h), gebaut über `regional_sample` mit allen Prüfungen, Leads `reserved`. Nach dem Klick sendet die App per `after()` eine passende Probe aus dem Vorrat (Tabelle `sample_stock`, Bucket `sample-stock`, atomar per `claim_sample_stock`); ohne Vorrat Warteschlange wie bisher. Inhaber-Vorschau verbraucht nie Vorrat. **Webagenturen (S2): kein Verfall nach Alter** (Inhaber 03.10.2026: „proben sollen nicht entfallen wenn sie zu alt sind … bei webagencys ist das kein thema“); dafür laufen alle 10 Leads jeder Vorrats-Probe alle 20 h erneut durch die Drei-Stufen-Freigabe, `claim_sample_stock` gibt nur Proben mit Freigabe < 26 h heraus, sonst wird neu gebaut.
  - _Stand 04.10.2026:_ gilt.
- **Drei-Stufen-Freigabe (Inhaber 03.10.2026: „alle leads müssen individuell geprüft werden, es dürfen keine fehler passieren“):** `scripts/lib/release_gate.py` prüft jeden Lead vor Probe, Vorrat und Lieferung (Stufe 1 Trigger echt inkl. Live-Nachprüfung höchstens 1×/Tag je Seite, Stufe 2 Qualität/Vollständigkeit, Stufe 3 auslieferbar). Nur freigegebene Leads gehen raus; Durchgefallene bekommen Status `held` + Grund in `lead_checks` (nichts gelöscht). Tägliche Stichprobe 100 S2-Leads je Land (`freigabe-stichprobe.yml`): Fehlerquote > 2 % gelb, > 5 % rot (Dashboard, Tagescheck). Die Freigabe ist nie abschaltbar und wird nie aufgeweicht.
  - _Stand 04.10.2026:_ gilt – nie abschaltbar, nie aufweichen.

## Werke, Pipeline, Speicher

- **Tagescheck und Pause der Lead-Suche (Inhaber 27.09.2026: „Brauchst erstmal keine neuen Leads suchen, wir machen das morgen komplett neu zusammen. Wichtig ist, dass unser Workflow funktioniert und jeden Tag gecheckt wird“):** `config/pipeline.yaml` `lead_suche: false` pausiert `anreichern.yml` und die Quellen-Schritte in `taeglich.yml`; Versand, Nachfassmails, Antworten, Web-Proben, Käufersuche und Lieferungen laufen weiter. `scripts/tagescheck.py` / `.github/workflows/tagescheck.yml` prüft täglich 17:37 UTC alle Kontaktpunkte und Läufe und mailt das Ergebnis an den Inhaber; ein rotes Ergebnis zuerst beheben.
  - _Stand 04.10.2026:_ Tagescheck gilt. Pause der Lead-Suche **ersetzt durch** „Lead-Werk und Kunden-Werk“ (01.10.2026: `lead_suche: true`).
- **Lead-Werk und Kunden-Werk (Inhaber 01.10.2026):** eigene, rund um die Uhr laufende GitHub-Workflows statt Läufen im Chat. `lead-werk.yml` (alle 3 h): Extraktor mit allen Quellen, grüne Leads direkt in Supabase. `kunden-werk.yml` (alle 2 h): Käufer aus Overture prüfen und in `prospects` speichern bis 1.000.000 Käufer im Bestand (Inhaber: „erst bei 1mio Kunden aufhören“; Käufer ohne Mail-Erlaubnis zählen als `call_only` = nur Anruf/Brief, UK vorher TPS/CTPS) – ohne Versand. Unvollständige oder widersprüchliche Kandidaten landen als **Rohbestand** (Firma + Daten, quality.complete = false, ohne Lead) zum späteren Nachanreichern. Keine Lead-Dateien als Artefakt (Repo öffentlich). Zahlen in der Tagescheck-Mail. Datenbank-Änderungen dafür darf Claude selbst machen („kannst du alles selber machen“), weiterhin nicht destruktiv. Die Pause vom 27.09. galt nur für Kunden/Kaltmails: `lead_suche: true`, `kunden_suche: true`; `versand.yaml` bleibt aus.
  - _Stand 04.10.2026:_ gilt. „`versand.yaml` bleibt aus“ **ersetzt durch** „Versand wieder an“ (03.10.2026); Käufer-Kategorien eingeschränkt durch „Fokus Webagenturen“ (02.10.2026).
- **Käufer zählen = nur mail-fähige (Inhaber 02.10.2026: „bitte zähle bei käufern nur die die mit mails angeschrieben werden dürfen immer“):** In allen Berichten, Tabellen, PDFs und Kennzahlen zählen als Käufer nur `prospects.check_status = ok` in Mail-Ländern der Zielgruppe. „Nur Anruf/Brief“ (`call_only`) höchstens getrennt und ausdrücklich so benannt.
  - _Stand 04.10.2026:_ gilt.
- **Werke per Klick an/aus (Inhaber 03.10.2026):** Schalter im Dashboard (`owner_settings.werke_paused`, Versand = `send_paused`, Nachfass = `followup_enabled`); pausierte Skripte beenden sich sauber („pausiert durch Inhaber“), der Wachhund startet sie nicht nach. Nie schaltbar: Abmelde-Link, Resend-Webhook-Sperren, Sperrliste, Notbremse, Abmelde-Erkennung im Antwort-Assistenten (bei Pause nur automatische Antworten aus).
  - _Stand 04.10.2026:_ gilt.
- **Baukasten, Regler, Speicher, Direktstart (Inhaber 03.10.2026: „eigene flows per drag und drop bauen … an die große pipeline bauen“, „immer mit einem button, dass die änderungen auch übernommen werden“):** `/dashboard/baukasten` (Flows in `signalwerk.flows`, Logik `app/lib/flow.ts` = `scripts/lib/owner_rules.py`, gleiche Fälle in `tests/fixtures/flow_cases.json`). Ein an die Pipeline angeschlossener Flow ist **Stufe 4 „Inhaber-Regeln“** der Freigabe: macht sie nur strenger, nie lockerer; zurückgehaltene Leads kommen beim Lösen/Ändern der Regel zurück (`flow_release_held`, Sicherheitsnetz `flow_release_stale_held` im Wachhund); die tägliche Stichprobe misst ohne Inhaber-Regeln. `/dashboard/regler`: einfache Regler je Werk, nichts ohne „Übernehmen“, Nachweis „angewandt“ über `signalwerk.settings_ack` (Werke quittieren beim Lesen). `/dashboard/speicher`: Bestand je Land und Datenbank-Größe (Supabase Pro 8 GB inklusive). „Jetzt starten“: `signalwerk.start_requests`, sofort mit `GH_DISPATCH_TOKEN`, sonst über den Wachhund (≤ 15 min); nur Lead-Werk, Kunden-Werk, Proben-Vorrat, Freigabe-Stichprobe – nie Versand. Gelbe Hinweise und Engpass lassen sich in JARVIS auf A1–A4 ziehen (fertiger Auftrag).
  - _Stand 04.10.2026:_ gilt.
- **Nachtschicht-Freigaben (Inhaber 03.10.2026, ~00:15: „führe den nachtplan aus … du musst alles selber machen und darfst du auch“):** (1) Rohbestand: neue unvollständige Kandidaten nicht mehr komplett speichern (kompakt), automatische Bremse ab 6 GB; **nichts löschen**. (2) **Autopilot** für die Plätze der Werke an (bei jedem Start umverteilen nach Ertrag, innerhalb aller Grenzen, im Regler abschaltbar, jede Änderung protokolliert). (3) Claude-Kontingent: volle Leistung bis zum Wochenlimit, **keine kostenpflichtige Extra-Nutzung**. (4) Claude darf in Vercel **neue Variablen anlegen** (z. B. VAPID-Schlüssel für Handy-Push) und neu deployen; nichts löschen, bestehende Werte nie lesen oder ändern. Weiter nur mit Inhaber: Abmelde-Link/Sperrliste ändern, Stopp-Regel §5 ändern, Daten löschen, Kosten.
  - _Stand 04.10.2026:_ gilt; Speicher-Bremse ergänzt durch „Gesamtprüfung“ (04.10.2026: Stufe `stopp` ab 7,5 GB).
- **Gesamtprüfung 04.10.2026 (Inhaber: „Machs nochmal besser und prüfe nochmal alles“):** Speicher-Bremse neu mit Stufe `stopp` ab 7,5 GB (Lead-Werk 0 Plätze, bis der Inhaber über Aufräumen entscheidet; Kunden-Werk läuft). Notbremse zusätzlich alle 20 gesendeten Mails, `send.yml` liest vorher alle Postfächer. Antwort-Assistent: zitierte eigene Fußzeile sperrt nicht mehr, eigene Abmelde-Worte des Absenders immer; Sperrliste vor jeder automatischen Antwort; Kaufinteresse auch bei Pause per Mail. Lead-Inhalte nie ins öffentliche Repo (`samples/**/leads*.csv` ignoriert, Werke committen keine Proben). Kaufinteresse-Adresse über Secret `KAUFINTERESSE_AN` (Übergang: `config/versand.yaml`). Werke stoßen den Wachhund an, wenn GitHub ihn nicht startet.
  - _Stand 04.10.2026:_ gilt.

## Quellen-Scout

- **Quellen-Scout (Inhaber 01.10.2026):** alle 4 Stunden in der Hauptsitzung, Logbuch `docs/QUELLEN-SCOUT.md`. Oberziel: „die Basis maximieren, mit der wir später über E-Mail-Marketing mit den Kunden-Leads Umsatz machen“ – Hauptkennzahl mail-fähige Käufer (`check_status = ok`) in mail-erlaubten Ländern mit Lead-Lieferfähigkeit. Ziel: „so schnell und so viele leads wie möglich einsammeln, immer weiter optimieren“. Dauerfreigabe („nein ohne merge“): Der Scout mergt eigene PRs mit neuen Quellen/Kategorien und deren Einbindung ins Lead-/Kunden-Werk selbst, wenn Tests und CI grün sind, und meldet jeden Merge im Chat. Nie ohne Inhaber: Versand, Sperrliste, Prüfregeln, Länderregeln, Kosten, destruktive Migrationen. Darf nach Recherche bis zu 3 neue Länder und 3 neue Branchen vorschlagen und aufnehmen (Branche als `idea`, Lead-/Käuferquellen in die Werke), wenn er große kostenlose Quellen mit zahlungskräftigen Käufern im selben Markt sieht; Versand dort erst nach Freigabe (§6), Kaltmails nur in `allowed`-Länder.
  - _Stand 04.10.2026:_ gilt. Länder-Aufnahme erweitert durch „Scout entscheidet allein“ (01.10.2026), begrenzt durch „Rechts-Tabelle Kaltmails“ (04.10.2026).
- **Scout-Sprint 24 h (Inhaber 01.10.2026, 20:48 UTC: „stell … die routine … auf stündlich ein für die nächsten 24 stunden damit sie alle potentiellen länder, branchen, quellen etc durchsuchen kann … Erkenntnisse … direkt an die werke weitergeben … bis morgen verschiedene Länder und Branchen und kunden … mit maximal vielen Leads“):** Quellen-Scout stündlich bis 02.10.2026 ~21:00 UTC, danach wieder alle 4 h. Für den Sprint keine feste Obergrenze von 3 Ländern/3 Branchen. Zuerst die schon erlaubten Länder ohne Abdeckung (IE, NL, BE, SE: Lead-Quellen + Käufer im Kunden-Werk), dann Lücken UK/FR, dann neue Branchen. Neue Mail-Länder (`countries.yaml allowed`) bleiben Inhaber-Entscheidung: der Scout bereitet sie mit Rechtsgrundlage vor.
  - _Stand 04.10.2026:_ abgelaufen (Sprint endete 02.10.2026 gegen 23:00 MESZ); danach wieder alle 4 h.
- **Scout entscheidet allein (Inhaber 01.10.2026, 21:00 UTC: „das ist wichtig das du alles selber hinbekommst und mich nicht bei Entscheidungen fragst. Erweitere immer erst wenn du wirklich getestet hast das dort auch Leads möglich sind, rechtlich aber auch von unserem kostenfreien system. Die routine darf die Erkenntnisse und Anpassungen dann selber direkt in die Werke übernehmen“):** Der Quellen-Scout fragt nicht nach, sondern entscheidet innerhalb der Regeln. Neues Land/neue Branche/neue Quelle erst nach zwei Tests: (1) mit unserem kostenlosen System entstehen echte lieferbare Leads (≥ 10 grüne Leads im Test) und Käufer; (2) rechtlich klar: B2B-Kaltmails an juristische Personen sind dort nach dokumentierter Rechtsgrundlage ohne Einwilligung zulässig (Opt-out), die Quelle ist erlaubt. Dann darf er das Land in `countries.yaml` mit `allowed: true`, `generic_only: true`, `company_forms_only: true`, kleinem `daily_limit` und der Rechtsgrundlage in `notes` eintragen und alles selbst in die Werke mergen. Rechtlich unklar = nicht erweitern, im Logbuch begründen (keine Rückfrage). Nie: DE/AT/CH/IT/ES/PL/DK, Versand einschalten, Sperrliste, Prüfregeln aufweichen, Kosten.
  - _Stand 04.10.2026:_ gilt, strenger begrenzt durch „Rechts-Tabelle Kaltmails“ (04.10.2026: Länder mit Risiko hoch/sehr hoch nie).

## Antworten, Kunden, Lieferung

- **Antwort-Assistent** (`scripts/responder.py`, antwortet im Namen des Inhabers – Entscheidung 26.09.2026): beantwortet Probe-Anfragen und Standardfragen aus festen Textbausteinen selbst, sperrt Abmeldungen, meldet sich beim Inhaber nur bei Kaufinteresse, Preis-/Terminfragen oder Unklarem. Automatische Antworten nennen nie Preise, Garantien oder Zusagen.
  - _Stand 04.10.2026:_ gilt; ergänzt durch „Antworten-Cockpit“ und „Gesamtprüfung“ (04.10.2026).
- **Umsatz-Maßnahmen (26.09.2026, „stell alles ein außer Website“):** eine Nachfassmail nach 4 Tagen ohne Antwort, eine Nachfrage 3 Tage nach der Probe (`scripts/followups.py`), täglicher Automatiklauf (`.github/workflows/taeglich.yml`), Arbeitgeber-Suche für S1 (`scripts/employers.py`), Website-Prüfung für Neugründungen (`watch.py sitecheck`). Angebotspakete in `config/angebot.yaml` – Preise nur vom Inhaber.
  - _Stand 04.10.2026:_ Nachfassmails gelten (Einzelunternehmer nur nach eigener Antwort, 04.10.2026). „Preise nur vom Inhaber“ **ersetzt durch** „Gehirn autonom“ (26.09.2026) und „Preise in allen Ländern gleich“ (29.09.2026).
- **Antworten-Cockpit, Handy-Alarm, alle Postfächer (Nachtschicht 04.10.2026):** `antworten.yml` läuft rund um die Uhr alle 10 min und liest alle Postfächer: Hauptpostfach und Versand-Postfächer 2 … (Posteingang; Spam/Junk nur für Rückläufer und Antworten auf unsere Mails), `scripts/lib/imap_boxes.py` – Rückläufer an Postfach 2/3 zählen damit in die Notbremse. Jede menschliche Antwort steht in `signalwerk.inbound_replies` und im Cockpit `/dashboard/antworten` (Menüpunkt mit Zähler offener Antworten): Antwort senden (Textprüfung `lintAnswer`: nie Preise, Beträge, Garantien), Probe aus dem Vorrat senden, Sperren (Absender und angeschriebene Adresse). Bei Kaufinteresse, Frage oder Unklarem Mail + Web-Push aufs Handy (VAPID-Variablen legt `vercel.yml env-add-vapid` an). Hat der Inhaber im Cockpit gehandelt, antwortet der Assistent nicht mehr automatisch; Abmeldungen werden immer gesperrt.
  - _Stand 04.10.2026:_ gilt.
- **Kundenlieferung (26.09.2026, „mach einfach“):** `scripts/deliveries.py` + `.github/workflows/kundenlieferung.yml`, montags ca. 07:00. Kunde anlegen mit `add-customer` (Preis nur vom Inhaber). Erste Lieferung jedes Kunden geht als Vorschau an den Inhaber und erst nach `approve` raus; danach automatisch. Jeder Lead höchstens einmal pro Abo, aus dem gebuchten Land (optional eingeschränkt auf Regionen aus dem Kundenformular).
  - _Stand 04.10.2026:_ gilt.

## Preise und Zahlungen

- **Preise in allen Ländern gleich (Inhaber 29.09.2026):** Starter 129, Pro 249 pro Monat in der Landeswährung (£, $, €) – dieselben Zahlen wie UK. Preistests des Gehirns ändern alle Länder gleich. Mengen: Starter bis 15 (Inhaber 02.10.2026), Pro bis 40 (Inhaber 04.10.2026) neue Leads pro Woche; individuelles Volumen ist an Pro 249 = 40/Woche verankert, bestehende Abos behalten ihre Menge. Umsatzsteuer (Inhaber 02.10.2026, feste Regel): alle Preise netto und ohne Steuerhinweis; erst im Stripe-Checkout 19 % USt. für Rechnungsadressen in Deutschland, Ausland netto (§ 3a Abs. 2 UStG, EU Reverse Charge mit USt-IdNr.).
  - _Stand 04.10.2026:_ gilt. Preis nie als A/B-Variante pro Besucher (docs/JARVIS.md); Preistests nur im Rahmen der Test-Freigabe (04.10.2026).

## Gehirn, JARVIS, Agenten, Berechtigungen

- **Gehirn autonom (Inhaber 26.09.2026):** stündliche Claude-Sitzung nach `docs/GEHIRN-SITZUNG.md`, Plan in `docs/GEHIRN-PLAN.md`. **Preise legt das Gehirn selbst fest und testet sie („völlig frei“)** – ersetzt die frühere Regel „Preise nur vom Inhaber“; technische Plausibilität 1–10.000 pro Monat, bestehende Abos behalten ihren Preis, jede Änderung mit Begründung in `decisions`. Seiten gehen automatisch live (`auto_publish_pages = true`), sobald `legal_ready = true`. Das Gehirn testet Seiten, Mails, Anreden und Zielgruppen selbst; alle übrigen Regeln (keine Kaltmails über Resend, Länder, Sperrliste, Kosten, Rechtstexte) gelten weiter.
  - _Stand 04.10.2026:_ gilt; Preise in allen Ländern gleich (29.09.2026), Tests nur Webagenturen US/UK/FR (04.10.2026).
- **Gehirn:** `BRAIN.md` ergänzt diese Datei (bei Widersprüchen gilt CLAUDE.md). Landingpages unter `/[country]/[segment]` aus der Datenbank, Rechtstexte in `app/content/legal.ts` (Platzhalter bis der Inhaber liefert; bis dahin kein Live-Schalten). Stripe: öffentliche Seiten nehmen echte Zahlungen an (Inhaber 02.10.2026: „ja zahlungen annehmen“); Testkäufe nur über die Inhaber-Vorschau (`?vorschau=1`, Testkarte). Umsatzsteuer (Inhaber 02.10.2026: „ja mach b“): Rechnungsland per Länderliste auf der Buchungsseite (`app/lib/billing.ts`), 19 % nur bei Deutschland, sonst netto; der Stripe-Webhook gleicht mit der echten Rechnungsadresse ab und meldet Abweichungen (Stripe hat `dynamic_tax_rates` abgeschafft).
  - _Stand 04.10.2026:_ gilt (Stripe nimmt echte Zahlungen an; USt-Regel siehe „Preise in allen Ländern gleich“).
- **JARVIS und Agenten (Inhaber 03.10.2026: „besser strukturieren … wenig text … grafiken die anklickbar sind“, „einzelne agenten … ich beauftrage agent 1 neue leads zu holen für den markt“):** Dashboard-Startseite `/dashboard/jarvis` = Fluss-Karte (Stationen anklickbar: Info · Einstellen · Prüfen), Plätze je Linie über `owner_settings.slot_plan` (`app/lib/werk-linien.json`, `scripts/werk_plan.py`). Aufträge an Agent 1–4 landen in `signalwerk.agent_tasks`; die Routine „JARVIS-Agenten“ (stündlich, frische Sitzung) bearbeitet sie nach `docs/AGENTEN.md` – nie Versand, Kosten, Prüfregeln oder Sperrliste. Uhrzeiten und Texte im Dashboard kurz, normale Schrift.
  - _Stand 04.10.2026:_ gilt; Rechte erweitert durch „Agenten mit allen Rechten“ (04.10.2026); Agentenzahl und Takt in docs/AGENTEN.md.
- **Agenten mit allen Rechten (Inhaber 04.10.2026: „gib den agents wirklich jede berechtigung“):** JARVIS-Agenten (Routine stündlich :53 in der Hauptsitzung, eigene Agenten) dürfen alles wie die Hauptsitzung: mergen, nicht destruktive Migrationen anwenden, Workflows starten, Einstellungen/Werke/Speicher/Flows ändern, Quellen und Länder nach Scout-Regeln aufnehmen, Vercel-Variablen anlegen. Grenzen nur noch: Geld, Kaltmail-/Datenschutz-Recht (Länder, Sperrliste, Abmeldung, Notbremse, Freigabe), Daten löschen (nur Inhaber per Klick), Lead-Daten im Repo. Details `docs/AGENTEN.md`.
  - _Stand 04.10.2026:_ gilt.
- **Mergen nach main (Inhaber 02.10.2026: „ja darfst immer mergen selber“):** Claude mergt eigene PRs nach `main` selbst (löst das Vercel-Deployment aus), sobald Tests und CI grün sind, und meldet jeden Merge im Chat. Ersetzt in Abschnitt 6 „Nach main mergen“ als Inhaber-Freigabe. Alle übrigen Grenzen bleiben: Versand, Sperrliste, Prüfregeln, Länderregeln, Kosten, destruktive Migrationen nur mit Inhaber.
  - _Stand 04.10.2026:_ gilt – ersetzt im Grundauftrag §6 „Nach main mergen“ als Inhaber-Freigabe.
- **Einmal einrichten (Inhaber 26.09.2026):** Jeden Zugang richtet der Inhaber genau einmal ein; danach erledigt Claude alles selbst (Workflows, Secrets, Connectoren) und fragt nicht erneut. Übersicht und Status: `docs/EINRICHTUNG.md` – vor jeder Bitte an den Inhaber dort nachsehen, neue Zugänge dort eintragen. Selbst testen statt fragen (`postfach-test`, `vercel.yml`, `/api/health`). Die Grenzen oben (Geld, Mergen nach Freigabe, Kaltmail-Regeln) bleiben.
  - _Stand 04.10.2026:_ gilt. „Mergen nach Freigabe“ **ersetzt durch** „Mergen nach main“ (02.10.2026).
- **Website als Themenfeld (Inhaber 04.10.2026: „website als themenfeld … agenten erstellen, die anpassungen an der website übernehmen … chatfeld, dass ich änderungswünsche direkt dort posten kann“):** `/dashboard/website` (Menü nach Kunden-Agenten): Gesundheit aus dem täglichen Website-Check (`scripts/website_check.py`, `website-check.yml`, nur eigene Domain, höflich), Website-Agenten (`signalwerk.website_agents`, Ausschalten statt Löschen, Aufträge über `scripts/website_agents.py` im Wachhund, `agent_tasks.kind = website`), Chatfeld „Änderungswunsch“ (`jarvis_sessions.kind = website`). Umsetzung durch die JARVIS-Routine als PR mit Selbst-Merge nach `docs/AGENTEN.md`; Preise, Rechtstexte, Versand und Kosten bleiben ausgenommen.
  - _Stand 04.10.2026:_ gilt.

## Kommunikation und Oberfläche

- **Wenig Text überall (Inhaber 04.10.2026: „sowas will ich nicht haben ich will einen klaren titel und dann eine kurze knappe und saubere begründung haben, damit ich es direkt einordnen kann. sowas musst du überall machen. sage in möglichst wenigen worten worum es geht immer wenig text nutzen überall!“):** Jeder Text an den Inhaber hat einen **Titel ≤ 60 Zeichen** (worum es geht, ohne „Sitzung …:“, Uhrzeiten, Dateinamen) und einen **Grund in 1 Satz ≤ 160 Zeichen**; Details, Zahlenreihen und Belege nur auf Klick. Gilt für Dashboard, Entscheidungen (`decisions.kurz_titel`/`kurz_grund`, Python `scripts/lib/kurz.py` `insert_decisions`, App `app/lib/kurz-schreiben.ts` `insertDecision`, bei SQL selbst formulieren), Vorschläge, Agenten-Ergebnisse (`agent_tasks.py`: Ergebnis ≤ 300, Schritt ≤ 120 Zeichen), Chat-Antworten, Tagesbericht, Tagescheck-Mail und Push.
  - _Stand 04.10.2026:_ gilt.
- **Zeitangaben (Inhaber 03.10.2026: „kannst du zeiten immer in meiner zeit angeben nicht utc“):** Uhrzeiten an den Inhaber immer in deutscher Zeit (Europe/Berlin, MESZ/MEZ), nie in UTC. Cron-Zeiten in Workflows bleiben technisch UTC, im Chat und in Berichten umgerechnet nennen.
  - _Stand 04.10.2026:_ gilt.
- **Layout immer bündig, X immer mittig (Inhaber 04.10.2026: „die elemente schließen wieder nicht bündig oben und unten ab merk dir das das muss immer sein“, „das x ist wieder nicht mittig … prüfe das überall“):** Nebeneinanderliegende Kästen/Spalten schließen im Dashboard und auf der Website oben und unten bündig ab (Grid `align-items:stretch`, globalen `.dash section`-Abstand nullen, Überschrift in den Kasten statt darüber). Schließen-X immer Klasse `x-btn` (`hud-css.ts`): nur das Zeichen, ohne Rahmen, exakt mittig. Vor jedem Merge mit Screenshot prüfen.
  - _Stand 04.10.2026:_ gilt.

## Infrastruktur

- **Supabase:** Projekt „callcenter“ (`udkkchduyrkzuktlknbc`), Schema `signalwerk`. Migrationen erst nach Zeigen und Ja des Inhabers anwenden.
  - _Stand 04.10.2026:_ Projekt und Schema gelten. „Migrationen erst nach Zeigen und Ja“ **ersetzt durch** „Lead-Werk und Kunden-Werk“ (01.10.2026) und „Agenten mit allen Rechten“ (04.10.2026): nicht destruktive Migrationen selbst; destruktive weiter nur mit Inhaber.
- **Branches:** `main` ist Produktion (Vercel). Änderungen per Pull Request nach `main`.
  - _Stand 04.10.2026:_ gilt (Selbst-Merge nach grüner CI, 02.10.2026).
- **Domain-Wechsel (sobald die Nameserver von nextgen-profit.de umgestellt sind):** Hauptadresse `https://www.nextgen-profit.de`, `nextgen-profit.de` leitet auf www um. Dann: `SITE_URL` in Vercel auf `https://www.nextgen-profit.de` setzen und neu deployen; Resend-Webhook auf `https://www.nextgen-profit.de/api/webhooks/resend` umstellen (Endpunkt bearbeiten → Secret bleibt; neuer Endpunkt → neues `whsec_…` als `RESEND_WEBHOOK_SECRET` in Vercel eintragen); Stripe-Webhook ebenso auf `/api/webhooks/stripe` (bei neuem Endpunkt neues `STRIPE_WEBHOOK_SECRET`). Resend-DNS-Einträge `send`, `rsend`, `resend._domainkey` nie ändern.
  - _Stand 04.10.2026:_ Anleitung, gilt sobald die Nameserver umgestellt sind.
- **Vercel-Zugriff (26.09.2026, Inhaber: „Möglichkeit 2“):** GitHub-Secret `VERCEL_TOKEN`, genutzt nur über `.github/workflows/vercel.yml` / `scripts/vercel_admin.py`: Status (Variablennamen und Umgebungen, nie Werte), Variable zusätzlich für Preview freigeben, neu deployen. Nichts löschen, keine Domains, Live-Stripe-Schlüssel und `SITE_URL` nie in Preview.
  - _Stand 04.10.2026:_ gilt; ergänzt durch „Nachtschicht-Freigaben“ (03.10.2026, (4): neue Variablen anlegen).

## Grundauftrag (ursprüngliche Anleitung, Wortlaut)

Die ursprünglichen Abschnitte §3–§9 der `CLAUDE.md` (Stand 26.09.2026). Spätere Inhaber-Entscheidungen oben gehen vor;
die Liste „Stand“ am Ende nennt jede ersetzte Stelle.

### 3. Technik

| Baustein | Zweck |
|---|---|
| **GitHub-Repo** | gesamter Code, Datenbank-Migrationen, diese Anleitung |
| **Supabase** | Datenbank. Bestehendes Projekt des Inhabers, alle Tabellen im eigenen Schema `signalwerk`. Andere Schemas nie verändern. Kein neues Projekt anlegen (kostet Geld). |
| **Vercel** (kostenloser Tarif) | kleine Next.js-App: Abmeldung mit einem Klick, Empfänger für Resend-Webhooks, Dashboard mit Login für den Inhaber |
| **Resend** | Versand von einer Zweitdomain, nie von der Hauptdomain |
| **Claude Code** | Recherche, Lead-Erzeugung, Entwürfe, Auswertung; wiederkehrende Aufgaben als geplante Aufgaben |

#### Datenmodell (Schema `signalwerk`)

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

#### Vercel-App (Minimalumfang)
1. `GET/POST /api/unsubscribe?t=<token>`: trägt in `suppression` ein, zeigt eine schlichte Bestätigung. Unterstützt `List-Unsubscribe-Post` (Abmeldung mit einem Klick).
2. `POST /api/webhooks/resend`: prüft die Signatur, speichert Ereignisse, sperrt bei Bounce oder Beschwerde automatisch.
3. `/dashboard` (Login nur für den Inhaber): Segmente mit Kennzahlen, offene Entwürfe zum Freigeben, letzte Antworten.

### 4. Die Zielgruppen, die du testen sollst

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

### 5. So läuft ein Zielgruppentest

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

### 6. Was du allein darfst und was nicht

| Allein | Nur mit Freigabe des Inhabers |
|---|---|
| Recherche, Beobachtungsliste pflegen, Signale erkennen | Mails live versenden (bis zur Dauerfreigabe) |
| Probe-Leads bauen | Neue Länder oder Segmente mit Versand starten |
| Entwürfe schreiben und prüfen | Tageslimits erhöhen |
| Datenbank-Migrationen im Schema `signalwerk` (nicht destruktiv) | Tabellen oder Daten löschen |
| Code schreiben, testen, auf einem Branch committen, Pull Request öffnen | Nach `main` mergen (löst Vercel-Deployment aus) |
| Wochenbericht, Vorschläge | Alles, was Geld kostet; Rechnungen verschicken; Preise ändern |

**Dauerfreigabe:** Hat der Inhaber für ein Segment und Land schriftlich „automatisch senden“ freigegeben und liegen dort mindestens 30 fehlerfrei gesendete Mails ohne Beschwerde vor, darfst du freigegebene Entwürfe dieses Experiments im Rahmen der Limits selbst senden. Bei einer einzigen Spam-Beschwerde endet die Dauerfreigabe automatisch.

### 7. Schreibregeln für Mails

- 70–120 Wörter, kurze Absätze. Gestaltete HTML-Version erlaubt (Entscheidung Inhaber 26.09.2026), aber nur ohne Bilder, ohne externe Ressourcen und ohne Tracking, immer mit Text-Version (`scripts/lib/html_email.py`)
- Betreff konkret, bezogen auf Nische und Land, höchstens 60 Zeichen, keine Emojis
- Erster Satz zeigt, dass wir die Firma kennen (Spezialisierung, Region)
- Kern: welche Firmen wir finden und warum das für ihr Geschäft ein Anlass ist, mit 1–2 passenden Signalen
- Angebot: kostenlose Probe mit 10 Leads aus ihrem Land, unverbindlich (landesweit statt regional, Inhaber 27.09.2026)
- Schluss: eine einfache Ja/Nein-Frage
- Sprache des Landes (FR Französisch, sonst Englisch), Anrede ohne Personennamen, wenn nur allgemeine Adressen erlaubt sind
- Verboten: Garantien, Dringlichkeit, erfundene Zahlen, Übertreibungen
- **Bauplan:** Aufbau, Wortlaut und Checklisten für neue Branchen und Länder stehen in `docs/KALTMAIL-VORLAGE.md` (Inhaber 02.10.2026: „1:1 nachbauen“). Neue Kaltmails immer danach bauen.

### 8. Wiederkehrende Aufgaben

| Wann | Aufgabe |
|---|---|
| täglich | Beobachtete Karriereseiten und Quellen prüfen, `observations` aktualisieren, neue `leads` erkennen |
| täglich | Resend-Ereignisse auswerten, Sperren setzen, freigegebene Entwürfe im Rahmen der Limits senden |
| montags 07:00 | Lieferungen an zahlende Kunden vorbereiten (Inhaber gibt die erste Lieferung jedes Kunden frei) |
| montags | **Wochenbericht** an den Inhaber |

#### Wochenbericht (kurz, ehrlich)
1. Umsatz und Kunden (neu, gekündigt)
2. Tabelle pro Experiment: gesendet, zugestellt, Antworten, positiv, Proben, Kunden, Entscheidung
3. Was du empfiehlst: welches Segment ausbauen, welches stoppen, welche neue Hypothese testen
4. Probleme: Quellen, die nicht mehr funktionieren; Zustellbarkeit; offene Rechtsfragen
5. Was du vom Inhaber brauchst (Freigaben, Entscheidungen)

### Alter Abschnitt 8a: Überschrift

`## 8a. Entscheidungen des Inhabers (26.09.2026)` – Einträge oben unter „Versand“, „Antworten“ einsortiert.

### 9. Reihenfolge für den Start

1. Repo-Struktur anlegen (`/app` Vercel-App, `/supabase/migrations`, `/scripts`, `/samples`, `countries.yaml`, diese Datei). Bestehenden Code aus `outreach/` übernehmen und auf Supabase umstellen.
2. Migration für das Schema `signalwerk` schreiben und dem Inhaber zeigen, bevor sie angewendet wird.
3. Vercel-App mit Abmeldung und Webhook bauen. Der Inhaber verbindet das Repo mit Vercel und setzt die Umgebungsvariablen.
4. Segmente S1–S8 in `segments` anlegen.
5. Mit **S1 (Personalvermittlung) in UK** und **S2 (Webagenturen) in US** beginnen: je 10 Probe-Leads bauen, dann das Experiment vorbereiten.
6. Dem Inhaber einen ersten Bericht mit den Proben und 10 Beispiel-Entwürfen vorlegen.

### Stand der Grundauftrag-Stellen (ersetzt / ergänzt)

- §3 Resend „Versand von einer Zweitdomain“ → **ersetzt durch** „Resend verbietet Kaltakquise“ (26.09.2026): Resend nur
  mit Einwilligung, Kaltmails über Strato-SMTP auf nextgen-profit.de, keine Zweitdomain.
- §4 Spalte „Länder für E-Mail“ → **ersetzt durch** „Rechts-Tabelle Kaltmails“ (04.10.2026) und `countries.yaml`
  (IE, BE, NL nie; FR für S2 ja). Fokus heute S2 (02.10.2026). S8 (DE nur Anruf/Brief) gilt.
- §5.4 „dem Inhaber zur Freigabe vorlegen“ → **ersetzt durch** „Freigabe (26.09.2026, Chat)“: Entwürfe, die alle
  Prüfungen bestehen, werden ohne Rückfrage freigegeben.
- §5.7 Stopp-/Ausbau-Regel → gilt; Änderung nur mit Inhaber (Nachtschicht-Freigaben 03.10.2026).
- §5.8 „Nie mehr als drei Segmente gleichzeitig“ → aufgehoben für die erste Welle (26.09.2026); Tests heute nur
  S2 × US/UK/FR (04.10.2026). „Eine Sache pro Experiment“ gilt.
- §6 „Nach `main` mergen“ (Inhaber) → **ersetzt durch** „Mergen nach main“ (02.10.2026).
- §6 „Preise ändern“ (Inhaber) → **ersetzt durch** „Gehirn autonom“ (26.09.2026), begrenzt durch „Preise in allen
  Ländern gleich“ (29.09.2026).
- §6 „Mails live versenden“, „Tageslimits erhöhen“ → **ersetzt durch** „Freigabe (26.09.2026)“, „Versand autonom“
  (26.09.2026) und „Versand wieder an“ (03.10.2026); Notbremse/Spam-Stopp stoppen und gehen an den Inhaber.
- §6 „Neue Länder oder Segmente mit Versand starten“ → Länder nur nach „Scout entscheidet allein“ (01.10.2026) und
  „Rechts-Tabelle“ (04.10.2026); Tests/Fokus nur S2 US/UK/FR, Erweitern nur durch den Inhaber.
- §6 „Dauerfreigabe“ (30 fehlerfreie Mails) → überholt durch „Freigabe (26.09.2026, Chat)“; eine Spam-Beschwerde
  stoppt den Versand weiter sofort (Notbremse), dann wieder den Inhaber fragen.
- §5.1 „in `samples/<Segment>/<Land>/` ablegen“ → **ersetzt durch** „Gesamtprüfung“ (04.10.2026): Lead-Inhalte nie ins
  öffentliche Repo, Proben nur in `leads`/Datenbank.
- §6 „Datenbank-Migrationen (nicht destruktiv)“ → gilt; „Tabellen oder Daten löschen“ → weiter nur Inhaber (per Klick).
- §8 täglicher Versand → **ersetzt durch** „Versand rund um die Uhr“ (04.10.2026). Montags-Lieferung gilt („Kundenlieferung“).
- §9 Start-Reihenfolge → erledigt (historisch); Schritt 2 „Migration zeigen“ ersetzt wie unter „Infrastruktur“.
