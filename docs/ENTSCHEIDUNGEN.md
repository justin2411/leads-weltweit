# Entscheidungen (Logbuch)

Alle Entscheidungen des Inhabers mit Datum und Wortlaut, damit jede spätere Sitzung weiß, **was gilt und warum**.
Neue Entscheidungen oben in den jeweiligen Tag eintragen. Bei Widerspruch gilt die neuere Entscheidung; die
unverrückbaren Regeln in [`CLAUDE.md`](../CLAUDE.md) Abschnitt 2 gelten immer.

Laufende Entscheidungen des Gehirns (Preise, Seitenvarianten) stehen zusätzlich in der Tabelle `signalwerk.decisions`.

## Offene Entscheidungen (warten auf den Inhaber)

| Thema | Frage | Vorschlag |
|---|---|---|
| Companies House | kostenlosen API-Schlüssel als GitHub-Secret `COMPANIES_HOUSE_API_KEY` eintragen | eintragen (UK-Geschäftsführer aus dem Register) |
| Rechtsfrage DSGVO Art. 14 | Informationspflicht, wenn Geschäftsführer-Namen an Kunden gehen (EU/UK) | Inhaber klärt |
| UK PECR | reicht bei Ltd-Firmen eine allgemeine Adresse, oder Interessenabwägung dokumentieren? | Inhaber klärt |
| Versand wieder starten | wann und mit welcher Tagesmenge | nach dem Neuaufbau der Lead-Suche, wenn Proben lieferbar sind |
| Nach-dem-Kauf-Mails | Zahlung fehlgeschlagen, Kündigung, Formular-Erinnerung, Feedback nach 4 Wochen | bauen |
| Erste Lieferung | Freigabe im Dashboard statt GitHub, oder automatisch, wenn bis Montag 12 Uhr nichts kommt | Dashboard-Knopf |
| Meldungen bündeln | Kaufinteresse an horbach.de, Verkäufe an gmail, Berichte an OWNER_EMAIL | eine Adresse |

## 01.10.2026

- **Alle Kontaktdaten sammeln:** „nimm diese regel wieder raus und lass uns alle daten sammeln die wir finden“ → Leads dürfen
  auch Handynummern und Freemail-Adressen von Inhabern/Officers enthalten, wenn eine erlaubte Quelle sie veröffentlicht
  (Anlass: FMCSA-Daten mit Handy und Gmail von Einzelfahrern). Quellen-Regeln und Kaltmail-Regeln unverändert.
- **S2 ohne Namen:** „ja“ → S2-Leads ohne Registernamen tragen die Rolle („Owner (ask for the owner)“).
- **S1 nicht in Frankreich:** Frage „Sollen wir für FR bei S1 bleiben lassen?“ → „bleiben“. Code du travail L5331-1
  verbietet den Verkauf von Stellenangeboten; keine France-Travail-/La-Bonne-Boîte-Daten, keine S1-Leads für FR.
- **S1 aus Karriereseiten:** „ja mach das“ → eigene Karriereseiten der Firmen aus der Web-Data-Commons-Liste
  (UK + US), keine Jobbörsen; Personalvermittler, Behörden und Konzerne ausgeschlossen. Läuft im Lead-Werk.
- **Lead-Werk:** „Können wir das ab sofort an einen eigenen Bereich … der 24/7 die leads holt und anreichert“ → „ja“.
  `lead-werk.yml` alle 3 Stunden, grüne Leads direkt in Supabase, keine Lead-Dateien als Artefakt (Repo öffentlich).
- **Lead-Suche wieder an:** „war nur die Pause für kunden gedacht, weil erstmal keine kaltmails raussollen“ →
  `config/pipeline.yaml` `lead_suche: true`; der Versand bleibt aus (`config/versand.yaml`).
- **Kunden-Werk:** „ein Kunden-Werk … was 24/7 läuft bis 100.000 voll ist“ → `kunden-werk.yml` alle 2 Stunden,
  Käufer aus Overture (US/UK/FR, mit Website) geprüft in `prospects`, Ziel 100.000 geprüfte Käufer, kein Versand.
- **Kunden-Werk-Ziel 1 Mio.:** „Kundenwerk soll erst bei 1mio Kunden aufhören“ → `kundenwerk.TARGET = 1_000_000`.
- **Rohbestand:** „Wenn da etwas fehlt sollen die Leads trotzdem noch irgendwo abgelegt werden das man die später
  nochmal anreichern kann“ → gelbe/rote Kandidaten als Firma mit allen Daten in `watch_companies`/`observations`
  (quality.complete = false, missing/problems), ohne Lead – also nie geliefert, aber auffindbar und nachanreicherbar.
  Rot (widersprüchlich) zusätzlich blocking = true, active = false. Käufer ohne Treffer stehen mit Grund in `prospects`.
- **Käufer „nur Anruf/Brief“:** „Ja wir sollten so viele leads besorgen können wie es geht“ → Käufer, die wir nicht
  mailen dürfen (UK-Einzelunternehmer, PECR) oder ohne Firmen-E-Mail, stehen mit Telefon/Adresse als
  `check_status = call_only` in `prospects` und zählen zum Ziel. Nie Kaltmail; UK-Anrufe vorher gegen TPS/CTPS prüfen.
- **Rolle statt Name zählt als Ansprechperson** (CLAUDE.md §9, S1/S2 01.10.2026): `deliveries.contact_companies`
  akzeptiert Name oder Rolle.
- **Datenbank:** „brauchst du nicht kannst du alles selber machen“ → Datenbank-Änderungen für die Werke ohne
  Rückfrage (weiterhin nicht destruktiv).

## 29.09.2026

- **Preise überall wie UK:** „warum kosten die leads bei us mehr als uk? lass alle gleich auf den preisen von uk“ → Starter 129, Pro 249 in £, $ und € (vorher US $159/$299, FR 149 €/289 €).
- **Probe immer genau 10:** „warum sind bei uk nur 7 leads es müssen immer genau 10 sein, merk dir das“ / „ja das soll immer so sein!“ → jede Probe genau 10 verschiedene Firmen; sonst keine Probe.
- **Lead-PDF:** jeder Lead als Karte mit Schatten; 10 Leads auf 3 Seiten (3 + 4 + 3), nie ein einzelner Lead allein auf einer Seite.
- **Einwilligungstext im Formular:** „6 ja“ → „I agree that … / J'accepte que … / Ich bin einverstanden, dass …“
  statt „By clicking the button …“ (passt zur Checkbox).
- **Antwort-Assistent:** „5 weiterlaufen“ – beantwortet weiter Leute, die selbst geschrieben haben, und Web-Probe-Anfragen.
- **Freemail-Sperre:** „4 ja nur diese“ – Abmeldung/Bounce einer Gmail-, Outlook-, GMX-Adresse usw. sperrt nur diese
  Adresse, nicht die ganze Domain. Migration `20260928090000_signalwerk_suppress_freemail.sql` am 29.09. angewendet.
- **Vollständigkeit bleibt streng:** „2 nein“ – Proben und Lieferungen nur mit vollständigen Leads (Telefon, E-Mail,
  Ansprechperson, Website, Adresse); keine Leads ohne E-Mail oder Namen.
- Rest (Lead-Suche neu, Companies-House-Schlüssel, Versand wieder starten) später.

## 28.09.2026

- **Versand gestoppt:** „bitte schick noch keine mails raus, stoppe das noch“ → `config/versand.yaml aktiv: false`.
  Keine Kalt- und Nachfassmails, auch nicht über den Wachhund.
- **Branchenfilme v5 abgenommen:** „videos sind super“, „ist super“. Jede Branche hat ein eigenes Konzept.
- **Branchenfilme unterschiedlich:** „geh direkt auf die Branche ein und warum die Leads dafür so gut sind, jede
  Branche mit neuem Ansatz“.
- **Wachhund** (technisch, nach Befund): Läufe, die GitHub auslässt, werden automatisch nachgestartet.

## 27.09.2026

- **Lead-Suche pausiert, Tagescheck:** „Brauchst erstmal keine neuen Leads suchen, wir machen das morgen komplett neu
  zusammen. Wichtig ist, dass unser Workflow funktioniert und jeden Tag gecheckt wird.“ → `config/pipeline.yaml
  lead_suche: false`, `tagescheck.yml` täglich 17:37 UTC mit Mail.
- **Anreicherung und Lieferregeln:**
  - „Leads mit widersprüchlichen Daten nie liefern“: „Ja!“
  - Webagenturen ohne Website-Pflicht: „Ja genau“
  - „Handynummer sogar noch besser“ (Handynummern von der eigenen Firmenwebsite zählen als zentrale Nummer).
- **Lead-Pipeline:** „ein GitHub bauen, was die Leads automatisch generiert und prüft … Websites bekommt und anreichern“.
- **Landesweit statt regional:** Leads, Proben, Seiten, Mails und Videos nennen das ganze Land, keine Städte.
- **Startseite:** „Großbritannien“ raus, Länder-Umschalter UK/US/FR.
- **Videos:** Radar-Film auf der Startseite für alle Leads; Unterseiten mit branchen- und landesspezifischen Filmen,
  hochwertige Animationen, wenig Text, jeweilige Sprache.
- **Ansprechperson im Lead:** „doch ansprechperson dürfen wir, ändere das“: nur Inhaber/Geschäftsführer aus
  öffentlichen Registern oder Impressum; fehlt der Name, steht die Rolle.
- **Versand über Strato:** „lass mit 150 pro tag über strato starten“, „ja gebe ich frei“ (am 28.09. gestoppt).
- **Anthropic-API:** Guthaben 15 $ für die Einordnung eingehender Antworten.
- **Kasse und Zahlung:**
  - Stripe live mit `sk_live`-Schlüssel (der eingeschränkte Schlüssel hatte zu wenig Rechte).
  - Zahlungsseite: kein Kündigungssatz, stattdessen Ablauf 1-2-3; weniger Abstand, keine durchlaufenden Linien.
  - „Zurück“ aus Stripe führt auf die Paketübersicht (`/start`), nicht auf die Startseite.
  - Stripe-Seite zeigt das Kontingent pro Monat und begrüßt zur Partnerschaft.
  - „Angebot anfragen“ erzeugt eine fertige Mail, in die man nur noch Daten einträgt.
  - Individuelles Volumen per Regler 150–10.000 Leads pro Woche, Preis automatisch, direkt bezahlbar;
    „mach bitte die vollen 10.000 leads rein“, Obergrenze nicht senken („nein“).
  - Datenbankgrenze für Wochenmenge auf 10.000 angehoben („ja“).
- **Nach dem Kauf:**
  - Eigene Danke-Seite mit Formular für die gewünschten Leads; Demo unter `/danke?demo=1`.
  - Verkaufsmeldung an **deinetop5@gmail.com** („schick die mail an deinetop5“).
  - Willkommensmail ausführlicher, professionell, mit Glückwunsch, Link zu den Zielgruppen-Wünschen und Signatur,
    „in unserem Design mit Blau und Gold“.
- **Mergen:** Nach grüner CI darf Claude selbst nach `main` mergen („merge dann direkt“).

## 26.09.2026

- **Erste Welle:** 1000 Mails insgesamt über mehrere Zielgruppen und Länder (UK, US, FR); Grenze von drei
  Segmenten gleichzeitig dafür aufgehoben.
- **Dauerfreigabe:** „du kannst dann einfach starten wenn du alles hast, musst mich nicht nochmal fragen“.
- **Versand ohne Aufwärmphase:** „sende … jeden Tag, auch heute 100 Mails“. Notbremse: Bounce-Quote über 5 %,
  bewertet ab 100 Mails („lockerer“); eine Spam-Beschwerde stoppt sofort.
- **Resend verbietet Kaltakquise:** Kaltmails nur über eigenes SMTP-Postfach bei Strato auf nextgen-profit.de
  (keine Zweitdomain); Resend nur für Mails mit Einwilligung (Proben, Kunden, Antworten).
- **HTML-Mails** erlaubt, ohne Bilder, externe Ressourcen und Tracking, immer mit Text-Version.
- **Antwort-Assistent** antwortet im Namen des Inhabers: Proben und Standardfragen selbst, Abmeldungen sperren,
  Inhaber nur bei Kaufinteresse, Preis-/Terminfragen oder Unklarem; nie Preise oder Zusagen.
- **Umsatz-Maßnahmen** („stell alles ein außer Website“): Nachfassmail nach 4 Tagen, Nachfrage 3 Tage nach der
  Probe, täglicher Automatiklauf, Arbeitgeber-Suche S1, Website-Prüfung für Neugründungen.
- **Kundenlieferung** („mach einfach“): montags ca. 07:00; erste Lieferung jedes Kunden als Vorschau an den
  Inhaber, danach automatisch.
- **Gehirn autonom:** stündliche Sitzung; **Preise legt das Gehirn selbst fest und testet sie** („völlig frei“,
  1–10.000 pro Monat, bestehende Abos behalten ihren Preis); Seiten gehen automatisch live, sobald
  `legal_ready = true`.
- **Versand autonom:** mit eigenem SMTP darf das Gehirn Tagesmengen anpassen, innerhalb Notbremse und
  Anbietergrenze; nie ohne Wissen des Inhabers dessen Geld ausgeben.
- **Einmal einrichten:** Jeden Zugang richtet der Inhaber genau einmal ein (Übersicht in `EINRICHTUNG.md`),
  danach fragt Claude nicht erneut.
- **Vercel-Zugriff** („Möglichkeit 2“): nur über `vercel.yml` / `scripts/vercel_admin.py`; nichts löschen,
  keine Domains, Live-Schlüssel nie in Preview.
- **Domain:** Hauptadresse `https://www.nextgen-profit.de`.
