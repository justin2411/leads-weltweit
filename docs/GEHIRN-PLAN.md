# Großer Plan: NextGen Profit groß machen (Stand 26.09.2026, wird vom Gehirn fortgeschrieben)

> Aktueller Stand, Zahlen und Prioritäten: [`STRATEGIE.md`](STRATEGIE.md) (28.09.2026). Einige Punkte unten sind
> überholt (Kaltmails laufen seit 27.09. über Strato, Rechtstexte sind live, Angebot ist landesweit statt regional).

> **Seit 04.10.2026 gilt:** Tests nur Webagenturen US/UK/FR (`config/fokus.yaml` `tests`, Inhaber: „beim gehirn bei a/b tests soll er das nur für webagencys usa, fr, und uk machen nichts mehr erst wenn ich ihm das freigebe das soll überall so sein, wir brauchen erstmal nichts anderes“).
> Preis-Tests, neue Zielgruppen und Länder unten ruhen, bis der Inhaber sie freigibt.

## Strategie 05.10.
**In einem Satz:** Erst beweisen, dass echte Menschen antworten – dann jede Antwort mit einer 10/10-Premium-Probe
in einen Kunden verwandeln. Masse erst danach.

**Drei Hebel:**
1. **Zustellung vor Botschaft:** 0 menschliche Antworten auf ~490 Erstmails – erst Posteingang messen (`SEED_INBOXES`), dann Texte.
2. **Beleg statt Behauptung:** echter, datierter Premium-Anlass aus dem Land des Käufers direkt in der Mail (Beleg-Einstieg).
3. **US trägt die Menge:** dort reichen Käufer und Premium-Leads für Monate; UK/FR bleiben Testmärkte, bis Quellen reichen.

**Ziel 25.000 €/Monat (≈ 100 × Pro 249), Meilensteine (Quoten = Annahmen):** erste Antwort Fr 09.10. · erste
Probe-Anfrage Fr 16.10. · erster Kunde Fr 06.11. · 10 Kunden Jan 2027 · 25 Kunden Mär 2027 (nur mit Zweit-Domains,
Inhaber-Ja) · 100 Kunden Sep 2027.

**Säulen:** Qualität = Premium-Proben US ≥ 25/50 (Di 06.10. 12:00), datierte Anlässe für UK/FR (Scout), Fehlerquote ≤ 2 %.
Umsatz = Betreff-Test (Mi 07.10. 20:00, ≥ 0,3 %), Beleg-Einstieg ab Do 08.10. (≥ 1 % bis 21.10.), Probe ≤ 1 h nach Antwort.
Visualisierung = JARVIS-Trichter ohne Scanner, Ziel-Ring 25.000 € mit Zeitstrahl, Premium-Karte je Land (A4, bis Fr 09.10.).

**Offen beim Inhaber:** `SEED_INBOXES` (ja), Bestätigungsknopf Abmeldeseite (ja), Zweit-Domains (nach 1. Antwort),
Cloudflare R2 (später), Aufräum-SQL (nach Sichtung).

## Lagebild (06.10.2026, 02:40 Berliner Zeit)
- **FR-Fehlerquote 5,1 % ist kein Kundenfehler:** Das ist die Erstprüfung frischer Leads (Filter vor der Auslieferung).
  Im Vorrat FR praktisch fehlerfrei, Tagesstichprobe 2,0 % – kein Eingriff. Ampel nur nach Stichprobe/Vorrat lesen.
- **Aufräumen lief nie:** Die Löschfunktion fehlt in der Datenbank; das Anlegen braucht die Bestätigung des Inhabers
  („Braucht dich“). Nicht eilig (frühestens ab 17.10. etwas fällig). Das Skript warnt jetzt sichtbar statt still grün.
- KPI-Abschluss 05.10. kam 01:56; Autovacuum leads läuft (00:10) – Abschluss 06.10. ist vorbereitet.
- Versand 24 h: 270 Erstmails (Grenzen unverändert). Engpass bleibt die Kaltmail; Betreff-Test (Mi), Beleg-Einstieg (Do).

## Lagebild (06.10.2026, 00:40 Berliner Zeit)
- **GitHub-Störung abgeklungen:** Werke, Nachfüller, Antworten und Wachhund laufen wieder (Status noch „minor“).
  CI auf main war bei 3d8089a rot (App-Build); lokal grün, fehlgeschlagener Job neu gestartet.
- **KPI-Abschluss 05.10. scheiterte nicht an GitHub, sondern an der Datenbank:** kpi_day lief in den Zeitüberschreitung
  (8 s), weil leads ohne Vacuum lief (Index-only las fast jede Zeile aus der Tabelle). Manuelles VACUUM: 13 s → 0,3 s;
  Abschluss 05.10. und Gehirn-Score nachgeholt. Dauerhaft: Autovacuum ab 2 % (leads, lead_checks, prospects) und 3
  Versuche bei Zeitüberschreitung im Schnappschuss.
- **FR-Proben lieferbar:** 11 abrufbare 10/10-Premium-Proben FR im Vorrat (UK 30, US 50) – eine FR-Anfrage geht sofort raus.
- Engpass bleibt die Kaltmail (0 menschliche Antworten); Betreff-Test (Mi) und Beleg-Einstieg (Do) bleiben der Plan.

## Lagebild (05.10.2026, 22:40 Berliner Zeit)
- **Zeitplan-Ausfall trifft alle Jobs, nicht nur das Lead-Werk:** GitHub startete seit 03.10. nur einen Bruchteil der
  geplanten Läufe (Versand 5 von ~32 in 34 h, Antworten 6 von ~200). Der Wachhund fängt das für Versand, Antworten,
  Werke und die meisten Tagesjobs auf. Ohne Nachstart waren: KPI-Tagesabschluss, Aufräumen, Premium-S5, Zustellbarkeit.
- **KPI-Verlauf hatte Lücken:** der Abschluss kam 02:12/03:18 statt 23:50 und wurde verworfen – kpi_daily hat nur 04./05.10.
  Behoben: Abschluss 23:20, verspätet bis 05:59 = Vortag (falls offen), Wachhund startet ab 23:40 nach; die vier Tagesjobs
  stehen jetzt im Wachhund. Gehirn-Score nutzt denselben Abschluss-Tag.
- Heute Abend zusätzlich GitHub-Störung (Actions „degraded“): 13 Läufe in der Warteschlange, Werke kurz unter 30 Plätzen.

## Lagebild (05.10.2026, 20:40 Berliner Zeit)
- **Erste S2-Probe aus einer Kaltmail (FR):** Mail → Seite → Probe in 16 Minuten, Probe 10/10 Premium.
  Probe-Nachfrage am Do 08.10. ist richtig verknüpft (Ereignis an der Erstmail). Engpass bleibt Mail → Seitenbesuch.
- **Lücke „Nur Premium“ beim Abruf geschlossen:** Der Vorrat hatte FR-Wunsch-Proben ohne Premium; der Abruf gab
  Premium nur zuerst heraus. Jetzt bei Mischung 100 % nur 10/10-Premium-Proben, sonst Warteschlange. Nichts gelöscht.
- **Hinweis Tageszeit (nur Beobachtung):** Seitenbesuche kamen am Montag fast nur von Mails, die werktags 8–17 Uhr
  Ortszeit ankamen. Ein Tag ist zu wenig; Versandzeit bleibt 24/7 (Inhaber), A/B „Versandzeit“ bleibt pausiert.

## Lagebild (05.10.2026, 18:20 Berliner Zeit)
- **Zustellung ist nicht der Engpass:** Blocklisten frei, Kontrollmails im Posteingang, keine Richtlinien-Rückläufer.
  US-Rückläufer sind tote Postfächer, die frisch (≤ 4 T) auf der Firmenwebsite standen – strengere Frischeprüfung hilft nicht.
- **US-Seite misst richtig:** Beacon geprüft (Browser, ohne Eintrag). 0 Besuche = Tageszeit (US-Arbeitszeit erst ab 15:00).
- Neu: `zustellbarkeit.py --dry-run --anbieter` zeigt harte Rückläufer je Land × Empfänger-Anbieter (nur Anzeige).

## Lagebild (05.10.2026, 16:30 Berliner Zeit)
- **Versand wieder voll:** 237 Erstmails in 24 h (US 82, UK 81, FR 74), Postfach 3 sendet wieder. Prüfpunkt Di (≥ 180) schon erreicht.
- **Antworten weiter 0** (Cockpit leer seit Start, nur Abwesenheitsnotizen); Antwort-Erkennung läuft. Zustellung Posteingang (Kontrollmails).
- **Nachfassmails ab Mi 07.10. werden der zweite große Kanal** (~130 aus der ersten Welle fällig, Text besteht die Prüfung).
  Bisher kamen sie aus einem beliebigen Postfach und ohne Bezug zur Erstmail – jetzt vom Postfach der Erstmail und im
  selben Verlauf (In-Reply-To, Betreff ohne „Re:“). Mengen, Notbremse und Prüfungen unverändert.

## Lagebild (05.10.2026, 14:50 Berliner Zeit)
- **Versand-Halbierung war ein Fehler der Selbstoptimierung:** Sie protokollierte keine Stufe (Feldtyp passte nicht,
  jedes Protokoll scheiterte) – damit fehlte die Sperre „eine Stufe je Tag“: 1,0 → 0,5 in drei Stunden am 04.10.
  Behoben (Sperre hält auch ohne Protokoll), Faktor auf die regelgerechte Stufe 0,8 gesetzt; Notbremse unverändert.
- Kontrollmails: alle 6 im Posteingang (Gmail). Menschen lesen: Abmeldungen mit Bestätigungsklick seit heute früh,
  einzelne Seitenbesuche – aber 0 menschliche Antworten. Engpass bleibt Botschaft/Angebot (Tests Mi/Do laufen).

## Lagebild (05.10.2026, 12:30 Berliner Zeit)
- **Versand nur halb so groß wie erlaubt:** Postfach 3 durch die Postfach-Notbremse gestoppt (über 5 % Rückläufer seit
  03.10.), Selbstoptimierung ×0,5 (3-Tage-Quote über 3 %) → 140 statt 420 Erstmails/Tag. Nichts gelockert.
- Ursache geprüft: harte Rückläufer sind meist tote Postfächer, die weiter auf der Firmenwebsite stehen – kostenlose
  Prüfungen senken den Boden kaum. Postfach 3 erholt sich ohne Versand nicht → Entscheidung beim Inhaber („Braucht dich“).
- Kontrollmails laufen: erste 6 Kopien 10:58–11:00 (US/UK/FR), noch nicht eingeordnet.
- Länder-Vorrang drückte radar-us nur kurz (10:47–10:58 auf 1, 11:21 auf 2), sonst 6 Plätze.
- Mail-Besuche auf den S2-Seiten 3 T: 43 (US 13, UK 14, FR 16), 1 Klick auf „Probe“, 0 Probe-Anfragen.

## Lagebild (05.10.2026, 10:30 Berliner Zeit)
- **Engpass bleibt zugestellt → Antwort:** 405 Erstmails seit 03.10. (US 155, UK 142, FR 108), 0 menschliche Antworten.
  Rückläufer 16/405 = 4,0 %, Notbremse nicht in Gefahr. 1 Probe-Anfrage in 7 T (DE, nicht lieferbar).
- **Posteingangstest war blind:** Kopien an die Kontrolladressen gehen raus, aber niemand trug die Lage ein (Postfächer
  des Inhabers nicht per IMAP lesbar). #441: Ein-Klick-Einordnung in „Braucht dich“ (Posteingang/Werbung/Spam/Fehlt).
- Meilenstein „Erste Probe aus Mail“ geprüft: echt (UK-Personalvermittler S1, 27.09.), kein Test – noch nicht S2.
- Probe-Anfrage DE (S1) nicht lieferbar, Inhaber informiert, Antwortvorschlag in „Braucht dich“ (Weckruf erledigt).

## Lagebild (05.10.2026, 08:40 Berliner Zeit)
- **Engpass bleibt zugestellt → Antwort:** ~405 Erstmails seit 03.10., 0 menschliche Antworten (12 Abwesenheitsnotizen).
  Rückläufer 16/405 = 4,0 %; seit der Adressprüfung (#394) 0 von 30 – Notbremse nicht in Gefahr.
- **Beleg-Einstieg vorbereitet (Start frühestens Do 08.10.):** Premium frei US 2.700, UK 317, FR 142. 100 Mails × 2 Belege
  = 200 reservierte Leads; die Hälfte des Bestands bleibt für Proben → Start nur US, UK/FR erst ab 400 frei.
  Einstiegssatz nur mit Kapitalgesellschaften (keine Personennamen), `scripts/lib/belege.py`. Einbau in den Versand +
  Reservierung je Käufer: Auftrag c5da4536 (ergänzt).
- Proben S2 mit 10/10 Premium: US 21/50 (Ziel Di 25), UK 1/30, FR 0/30.
- Auftrag „SG Webagenturen, 10.000 Leads“ ruht (fehler mit Grund): SG außerhalb Fokus, Versand nur US/UK/FR.
  Der Inhaber-Agent legt ihn täglich neu an – bis SG in `fokus.yaml` steht, gleich behandeln.

## Lagebild (05.10.2026, 06:40 Berliner Zeit)
- **„Ohne HTTPS“ war der fehleranfälligste Anlass – Ursache gefunden:** Zertifikatsfehler fallen in der Freigabe nur
  zu 0,6 % durch, „gar kein HTTPS“ dagegen zu 14 % (US 77/566, UK 67/469, FR 8 %), fast alle „seite_in_ordnung“
  1–2 Tage nach dem Fund. Grund: jeder Verbindungsfehler (Abbruch, Reset, DNS-Zeitfehler) zählte als „Port 443 zu“.
- Behoben: „kein HTTPS“ nur noch bei echter Ablehnung/nicht vorhandenem Namen und bestätigt durch einen zweiten
  Versuch; alles andere = keine Aussage, kein Lead. Strenger, nie lockerer; Freigabe unverändert.

## Lagebild (05.10.2026, 05:30 Berliner Zeit)
- **Käufer-Nachschub ist kein Engpass** (gegengeprüft): freie ok-Käufer S2 (nie Erstmail) US 28.620, UK 2.485, FR 1.239;
  Tempo ~41/40/33 Erstmails pro Tag → Reichweite US ≈ 700, UK ≈ 57, FR ≈ 38 Tage. Dazu ~1.300 freigegebene Entwürfe je Land.
  Kunden-Werk „leer“ heißt nur: kaum neue Overture-Kandidaten – FR kam trotzdem +519 in 24 h.
- Der Alarm „< 50 neue Käufer in 24 h“ war ein Fehlalarm. Tagescheck zeigt jetzt die Reichweite je Land
  (gelb < 21, rot < 7 Tage); der Zufluss-Hinweis kommt nur noch, wenn ein Land knapp wird.
- Rückläufer 04.10. 9 % (14/153) – fast alles vor #394 (Adressprüfung, 01:40); danach 0 von 15. Beobachten.
- Engpass bleibt: 0 menschliche Antworten. Laufend: Betreff-Test (Mi), Premium-Proben (Di), Beleg im Lead (#410, Labor).

## Lagebild (05.10.2026, 04:45 Berliner Zeit)
- **Proben fast ohne Premium:** S2 10/10-Premium-Proben US 1/50, UK 1/30, FR 0/30. Ursache: Der Austausch brach beim
  ersten Wunsch ohne Premium-Nachschub ab (US „not_mobile“ = 0 Premium-Firmen) – „no_website“ (2.624 frei) kam nie dran.
  Behoben: Fehlschlag sperrt nur diesen Wunsch, größter Nachschub zuerst.
- Ehrliche Obergrenze US nach Wunsch-Mix: ≈ 29 von 50 (no_website 13, security 9, ohne Wunsch 6, broken 1);
  not_mobile/website_outdated haben keine Premium-Firmen. UK ≈ 12 (nur Zertifikat/HTTPS), FR ≈ 1.
- Premium frei (≤ 14 T): US 2.769 (fast nur FMCSA no_website), UK 64, FR 14 – alles Zertifikats-/HTTPS-Anlässe außer US.
- Posteingangstest ohne Inhaber geprüft: eigene Postfächer liegen alle bei Strato auf unserer Domain – sagt nichts über
  Gmail/Outlook beim Empfänger. Bleibt `SEED_INBOXES` (Inhaber).

## Lagebild (05.10.2026, 03:30 Berliner Zeit)
- **Engpass: echte Menschen erreichen.** ~510 Kaltmails, 0 menschliche Antworten, 0 Proben, 0 € MRR.
- Fund: 6 von 10 Abmeldungen kamen 5–50 s nach dem Versand – Link-Scanner der Empfänger, kein Mensch.
  Auch die 40 „Mail-Klicks“ vom 04.10. kommen paarweise in derselben Sekunde, Minuten nach dem Versand = Scanner.
  Echte Klickquote also ≈ 0; Abmeldungen bleiben trotzdem gesperrt (Regel).
- Posteingang oder Spam: unbekannt – `seed_checks` leer, Secret `SEED_INBOXES` fehlt (Inhaber, kostenlos).
- DNS grün (SPF, DKIM, DMARC p=none), keine Blocklisten. Antwortweg funktioniert (Abwesenheitsnotizen kommen an).
- Käufer ok (S2): US 28.782, UK 2.623, FR 1.285. DB 5,1 GB.

## Nächster Schritt
- **Prüfpunkt Mo 12.10.:** Funktion signalwerk.aufraeumen vorhanden (Inhaber bestätigt), Trockenlauf ohne Warnung.
- **Prüfpunkt Mi 07.10., 12:00:** kpi-tag-Läufe 06.10. ohne Zeitüberschreitung; leads last_autovacuum < 24 h alt.
- **Prüfpunkt Mi 07.10., 12:00:** kpi_daily hat für 05.10. und 06.10. je einen Abschluss (updated_at ab 23:00 deutscher
  Zeit oder Nachtrag bis 05:59); aufraeumen/premium-s5/zustellbarkeit je ≥ 1 Lauf am 06. und 07.10.
- **Prüfpunkt Mo 12.10.:** 0 rausgegangene Proben mit weniger als 10/10 Premium seit 05.10. (sample_stock sent/claimed).
- **Prüfpunkt Mi 07.10., 20:00:** Seitenbesuch je Erstmail werktags 8–17 Uhr Ortszeit vs. übrige Zeiten (3 Werktage).
  Hält der Abstand (≥ 3×, ≥ 300 Mails je Gruppe), dem Inhaber vorschlagen: Länder-Anteil je Stunde nach Ortszeit
  gewichten – weiter 24/7 und alle Länder in jedem Lauf. Nicht selbst umstellen.
- **Prüfpunkt Mo 12.10., 12:00:** `zustellbarkeit.py --dry-run --anbieter`: liegt ein Land × Anbieter mit ≥ 150 Erstmails
  über 5 % hart, eine strengere Adressregel nur dafür bauen (nie lockern); sonst US-Rückläufer als Grundrauschen abhaken.
- **Prüfpunkt Do 08.10., 18:00:** Nachfassmails S2 gesendet ≥ 50, davon ≥ 90 % vom Postfach der Erstmail; Erfolg bis
  15.10.: mindestens 1 menschliche Antwort auf eine Nachfassmail.
- **Prüfpunkt Di 06.10., 15:00:** Erstmails S2 in 24 h ≥ 180 (Faktor 0,8, Postfach 3 aus); selbstopt_changes hat Zeilen;
  höchstens eine Versand-Stufe je Tag. Bounce-Quote 3 T ≤ 4,5 % – sonst senkt die Regel selbst weiter.
- **Prüfpunkt Mi 07.10., 12:00:** ≥ 140 Erstmails/Tag gehalten; Postfach 3 nach Inhaber-Entscheidung wieder an oder bewusst aus.
- **Prüfpunkt Mi 07.10., 20:00:** ≥ 6 Kontrollmails eingeordnet (seed_checks.placement). Liegt > 30 % im Spam:
  Zustellbarkeit vor Text (Beleg-Einstieg verschieben, DMARC/Inhalt prüfen).
- **Prüfpunkt Do 08.10., 20:00:** Beleg-Einstieg in US läuft (Variante B mit 2 Belegen, ≥ 20 B-Mails gesendet); Erfolg bis 21.10.: Antwortquote B ≥ 1 % bei ≥ 100.
- **Prüfpunkt Do 08.10.:** Freigabe-Durchfall „no_https“ (Detail none, neue Leads ab 05.10.) < 3 % je Land; sonst Fund-Protokoll prüfen.
- **Prüfpunkt Mo 12.10.:** Käufer-Reichweite UK und FR ≥ 21 Tage (Tagescheck). Darunter: Kunden-Werk-Plätze auf UK/FR-Quellen.
- Zustellbarkeits-Check zählt Link-Scanner-Abmeldungen (< 2 min) getrennt, gelb ab > 50 %.
- **Prüfpunkt Di 06.10., 12:00:** S2/US ≥ 25 von 50 Proben mit 10/10 Premium (angepasst von 40: Obergrenze ≈ 29
  wegen Wunsch-Mix). Darunter: Austausch-Log prüfen. Danach: Premium-Anlass für „not_mobile“/„website_outdated“ suchen.
- **Prüfpunkt Mi 07.10., 20:00:** Antwortquote ≥ 0,3 % (nur Menschen); sonst Beleg-Einstieg-Test.
- Offen beim Inhaber: Kontrollmails einordnen (Braucht dich); Abmelde-Seite mit Bestätigungsklick gegen Scanner (Abmelderegel = Inhaber).
- Offen: Premium-Quelle FR (Labor klärt).

## Nordstern
Wiederkehrender Umsatz aus Lead-Abos. Kennzahl: **neuer Monatsumsatz (MRR) pro Woche**. Kosten nahe null.

## Wo wir stehen (ehrlich)
- 115 Kaltmails am 26.09. (UK/US) – erste Antworten: 1 Abwesenheitsnotiz, noch keine Probe-Anfrage, kein Kunde.
- Kaltmails gestoppt: Resend verbietet Kaltakquise. **Engpass Nr. 1: eigenes SMTP-Postfach auf einer Zweitdomain.**
- Landingpages, Stripe (Test + Live), Gehirn, Dashboard stehen. Rechtstexte fehlen noch → Seiten offline.
- Leads: >5.000 (UK Companies House, NY-Register, BODACC). Käufer-Adressen: ~160 geprüft, täglicher Nachschub via OSM.

## Phase 1 (Woche 1–2): Verkaufsmaschine scharf schalten
1. Rechtstexte übernehmen → Seiten live (automatisch).
2. Zweitdomain + SMTP-Postfach (Inhaber, ca. 1–3 €/Monat) → Kaltmails mit Link zur passenden Landingpage.
3. Jede Mail führt auf die Seite ihrer Zielgruppe und Region; Probe mit einem Klick; Probe kommt sofort.
4. Preise testen: pro Zielgruppe zwei Preisniveaus gegeneinander (Umsatz pro Aufruf).

## Phase 2 (Woche 3–6): Gewinner ausbauen
- Zielgruppen mit Proben/Käufen bekommen mehr Versand und eigene Unterseiten je Stadt (UK 36 Gebiete, NY 8).
- Neue Zielgruppen aus dem Katalog testen (Kanzleien, Marketing, Coworking, Werbetechnik, Reinigung).
- Nachfass-Sequenz auf 3 Stufen, nur mit echtem Mehrwert (neue Leads aus ihrer Region).

## Phase 3 (ab Monat 2): Skalieren
- Weitere erlaubte Länder (IE, NL) mit eigenen Quellen; Selbstbedienung (Abo online, Filter selbst setzen).
- Empfehlungen: Kunden, die zufrieden sind, nach Empfehlung fragen (kein Rabatt-Spam).

## Kosten, die sich lohnen würden (nur mit Ja des Inhabers)
| Was | Kosten | Nutzen |
|---|---|---|
| Zweitdomain + SMTP-Postfach | ca. 1–3 €/Monat | Kaltakquise überhaupt wieder möglich (Engpass) |
| Anthropic-API-Guthaben | ca. 10–30 $/Monat bei heutigem Volumen | Antworten zuverlässig verstehen und beantworten |
| Resend Pro | ca. 20 $/Monat | erst ab >100 Mails/Tag an Kunden nötig |
