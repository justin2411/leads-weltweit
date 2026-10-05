# Großer Plan: NextGen Profit groß machen (Stand 26.09.2026, wird vom Gehirn fortgeschrieben)

> Aktueller Stand, Zahlen und Prioritäten: [`STRATEGIE.md`](STRATEGIE.md) (28.09.2026). Einige Punkte unten sind
> überholt (Kaltmails laufen seit 27.09. über Strato, Rechtstexte sind live, Angebot ist landesweit statt regional).

> **Seit 04.10.2026 gilt:** Tests nur Webagenturen US/UK/FR (`config/fokus.yaml` `tests`, Inhaber: „beim gehirn bei a/b tests soll er das nur für webagencys usa, fr, und uk machen nichts mehr erst wenn ich ihm das freigebe das soll überall so sein, wir brauchen erstmal nichts anderes“).
> Preis-Tests, neue Zielgruppen und Länder unten ruhen, bis der Inhaber sie freigibt.

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
