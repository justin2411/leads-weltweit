# Entscheidungen (Logbuch)

Alle Entscheidungen des Inhabers mit Datum und Wortlaut, damit jede spätere Sitzung weiß, **was gilt und warum**.
Neue Entscheidungen oben in den jeweiligen Tag eintragen. Bei Widerspruch gilt die neuere Entscheidung; die
unverrückbaren Regeln in [`CLAUDE.md`](../CLAUDE.md) Abschnitt 2 gelten immer.

Laufende Entscheidungen des Gehirns (Preise, Seitenvarianten) stehen zusätzlich in der Tabelle `signalwerk.decisions`.

## Offene Entscheidungen (warten auf den Inhaber)

| Thema | Frage | Vorschlag |
|---|---|---|
| Vollständigkeit der Leads | Dürfen Proben/Lieferungen Leads ohne E-Mail und ohne Namen enthalten, wenn Website, Adresse und Telefon geprüft sind? | Ja; fehlt der Name, steht „Ask for the owner / managing director“ |
| Companies House | kostenlosen API-Schlüssel als GitHub-Secret `COMPANIES_HOUSE_API_KEY` eintragen | eintragen (UK-Geschäftsführer aus dem Register) |
| Rechtsfrage DSGVO Art. 14 | Informationspflicht, wenn Geschäftsführer-Namen an Kunden gehen (EU/UK) | Inhaber klärt |
| UK PECR | reicht bei Ltd-Firmen eine allgemeine Adresse, oder Interessenabwägung dokumentieren? | Inhaber klärt |
| Antwort-Assistent | läuft weiter (beantwortet nur Leute, die selbst geschrieben haben, und Web-Probe-Anfragen) – auch stoppen? | läuft, bis der Inhaber anders entscheidet |
| Versand wieder starten | wann und mit welcher Tagesmenge | nach dem Neuaufbau der Lead-Suche, wenn Proben lieferbar sind |
| Nach-dem-Kauf-Mails | Zahlung fehlgeschlagen, Kündigung, Formular-Erinnerung, Feedback nach 4 Wochen | bauen |
| Erste Lieferung | Freigabe im Dashboard statt GitHub, oder automatisch, wenn bis Montag 12 Uhr nichts kommt | Dashboard-Knopf |
| Meldungen bündeln | Kaufinteresse an horbach.de, Verkäufe an gmail, Berichte an OWNER_EMAIL | eine Adresse |

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
