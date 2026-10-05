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
- **Prüfpunkt Mo 12.10.:** Käufer-Reichweite UK und FR ≥ 21 Tage (Tagescheck). Darunter: Kunden-Werk-Plätze auf UK/FR-Quellen.
- Zustellbarkeits-Check zählt Link-Scanner-Abmeldungen (< 2 min) getrennt, gelb ab > 50 %.
- **Prüfpunkt Di 06.10., 12:00:** S2/US ≥ 25 von 50 Proben mit 10/10 Premium (angepasst von 40: Obergrenze ≈ 29
  wegen Wunsch-Mix). Darunter: Austausch-Log prüfen. Danach: Premium-Anlass für „not_mobile“/„website_outdated“ suchen.
- **Prüfpunkt Mi 07.10., 20:00:** Antwortquote ≥ 0,3 % (nur Menschen); sonst Beleg-Einstieg-Test.
- Offen beim Inhaber: `SEED_INBOXES` (Posteingangstest); Abmelde-Seite mit Bestätigungsklick gegen Scanner (Abmelderegel = Inhaber).
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
