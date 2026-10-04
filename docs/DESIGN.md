# Design: Marke, Seiten, Mails, Videos, Tonalität

Stand: 28.09.2026. Ziel: **ein wiedererkennbarer, hochwertiger Stil**, von der Mail über die Website bis zum Video.
Nachtblau + Gold, viel Luft, wenig Text, ehrlich.

## 1. Marke

- **Name:** NextGen Profit (zwei Wörter; `BRAND_NAME` in Vercel, „NextGenProfit“ wird automatisch getrennt).
- **Wortmarke:** „NextGen“ weiß (auf dunkel) bzw. dunkel (auf hell) + „Profit“ gold.
- **Domain:** www.nextgen-profit.de (nextgen-profit.de leitet um).
- **Absender Kaltmails:** info@nextgen-profit.de über Strato. Einwilligungsmails über Resend (`MAIL_FROM`).

## 2. Farben

| Rolle | Web (`app/lib/brand-css.ts`, Klasse `.bx`) | Mails / PDF / Video |
|---|---|---|
| Nachtblau (Grund dunkel) | `--ink #0b1320`, `--ink2 #121c2e` | `#0B1428` |
| Papier (Grund hell) | `--paper #f7f4ee`, Karten `--card #fffdf9` | `#FAFBFC`, `#EEF0F4` |
| Text | `--text #161b24`, leise `--soft #5b6372` | `#475064` |
| Gold | `--gold #b08d57`, hell `--gold2 #d8bd8a` | `#B8914F`, `#D8BD8A`, Verlauf bis `#E2C894` |
| Linien | `--line #e4ddd0` | `#E4E7EC` |

Gold nur für Akzente (Wortmarke, Buttons, Zahlen, Icons, Hervorhebungen), nie für Fließtext.

## 3. Schrift und Form

- **Schrift:** Inter (Web), Systemschrift als Fallback; Mails mit Web-sicherem Font-Stack.
- **Buttons:** Pille (`border-radius: 99px`), gold auf dunkel bzw. nachtblau auf hell, Pfeil →.
- **Icons:** feine Gold-Linien-Icons, **keine Emojis**.
- **Bewegung:** nur mit JavaScript (Klasse `.motion` auf `<html>`), nie bei „Bewegung reduzieren“.
- **Handy zuerst:** 16 px Seitenrand, kein waagrechtes Scrollen, Länder-Umschalter als 3-Spalten-Raster,
  lange Wörter per `<b>` (voll) / `<em>` (kurz).

**Wichtig beim Bauen:** Die Marken-CSS ist global. Klassennamen wie `.steps` oder `.flow` sind bereits belegt
(und bei `.motion` unsichtbar). Seitenspezifische Klassen immer mit eigenem Präfix: `sx-` (Preisseite), `wl-`
(Willkommen), `ff` (Formular), `cc-in` / `cswitch` (Länder-Umschalter).

## 4. Seiten

| Seite | Pfad | Inhalt |
|---|---|---|
| Startseite | `/`, `/fr`, `/de` | Radar-Film, Länder-Umschalter UK/US/FR, Branchenkarten, FAQ; kein Land im Kartentext |
| Landingpage | `/{land}/{branche}` (15 Stück) | persönlich über `?r=` („Vorbereitet für …“), Branchenfilm, 3 Beispiel-Leads (maskiert), Umsatz-/Premium-Abschnitt, FAQ, CTA „10 kostenlose Leads“ |
| Probe-Schritt | `?schritt=probe` | Einwilligung mit Wortlaut, 1 Klick |
| Preisseite | `/{land}/{branche}/start` | Starter / Pro / Regler 150–10.000 pro Woche, Ablauf 01-02-03 (Karten, keine Linien), Angebot per Mail-Vorlage; `noindex` |
| Danke | `/danke` (Demo `/danke?demo=1`) | Zusammenfassung, erster Liefertermin, Wunsch-Formular |
| Wünsche | `/kunde/filter?t=` | Signale als Karten, Branchen, Regionen, Ausschlüsse |
| Rechtstexte | `/impressum`, `/privacy`, `/terms`, FR: `/mentions-legales`, `/confidentialite`, `/cgv`; DE: `/datenschutz`, `/agb` | aus `app/content/legal.ts` |
| Dashboard | `/dashboard` (Login Inhaber) | JARVIS, Antworten, Versand (Entwürfe freigeben, Antwort erfassen, Sperren), Gehirn (`/dashboard/gehirn`) |
| Website (Dashboard) | `/dashboard/website` | Gesundheit als Ringe je Bereich (Klick = Funde), Chatfeld „Änderungswunsch“, Website-Agenten (Vorlagen, An/Aus statt Löschen); Präfix `ws-` |

Seiteninhalte (Überschrift, Signale, Preise, FAQ) kommen aus der Datenbank (`landing_pages`, `page_variants`).
Platzhalter `{land}`, `{land_de}`, `{register}` werden je Land ersetzt (`app/lib/country.ts`).

## 5. Mails

- **Kaltmail** (`scripts/lib/html_email.py`): schlichtes HTML ohne Bilder/Tracking + Text-Version, 70–120 Wörter,
  Button „See my free leads“ zur persönlichen Seite, Pflichtfußzeile mit Postanschrift, Abmeldung per Antwort.
- **Einwilligungsmails** (`app/lib/mail-html.ts`): Kopf nachtblau, goldene Linie, Bausteine `p` / `steps` / `note` /
  `button` / `facts`, Gold-Verlauf-Button, immer mit Text-Version (`mailText()`).
- **Willkommensmail** (`app/lib/welcome-mail.ts`): Glückwunsch, Paket-Fakten, erster Liefertermin (Montag mit
  mindestens 2 Tagen Vorlauf), Link zu den Wünschen, Signatur.
- **Proben-/Lieferungs-PDF** (`scripts/lib/leadreport.py`): nachtblau/gold, Priorität, Quelle mit Datum,
  Einstiegssatz, Kontakt, bei Proben die Pakete mit Link zur Preisseite.

## 6. Videos

Alle 1280×720, 25 fps, H.264 (crf ~26, faststart), AAC. Zuordnung in `app/content/videos.json`.

- **Startseite (v4, `video/v4/`):** Radar-Film: Firmenraster, neue Firma, Uhr, Radar über den Quellen des Landes,
  „täglich geprüft“, Lead-Karte, Briefing, Montagslieferung, exklusiv, 10 kostenlose Leads. EN / FR / DE.
- **Branchen (v5, `video/v5/`)**, je eigenes Konzept, 40–47 s, UK / US / FR / DE, eigene Musik je Branche:

| Branche | Konzept | Bildsprache |
|---|---|---|
| Buchhaltung | „Das erste Jahr“ | Registerstempel, Fristen-Leiste des Landes, Kassenbuch |
| Personalvermittlung | „Die Stelle, die nicht verschwindet“ | Tageszähler 1→30→45, „neu ausgeschrieben“, 3 Stellen, leere Stühle |
| Versicherungsmakler | „Neue Risiken“ | isometrischer Aufbau: Halle, Flotte, Personal, Schilde mit Deckungen |
| Finanzberater | „Der Mensch hinter der Firma“ | Registereintrag → Porträt, Themen im Orbit (Gehalt/Dividende, Vorsorge, Absicherung, Nachfolge) |
| Webagenturen | „Der Browser-Test“ | keine Website / Seite von 2008 / kaputtes Handy / vorher-nachher |

- Stimmen: UK Kokoro `bf_emma`, US `af_heart`, FR `ff_siwis`, DE piper `de_DE-thorsten-high`
  (Aussprache-Liste `video/v3/aussprache-de.json`).
- Jede Beispielszene trägt „Illustrative example / Exemple illustratif / Beispiel“; Firmen, Personen und Nummern
  sind erfunden (Fiktions-Nummernbereiche).

## 7. Tonalität

- **Ehrlich:** keine erfundenen Zahlen, Kundenstimmen, Logos, Erfolgsquoten, Garantien, keine künstliche Dringlichkeit.
- **Konkret:** Anlass, Quelle, Datum, warum jetzt, erster Satz.
- **Kurz:** wenig Text, klare Sätze, eine Frage am Schluss (Ja/Nein).
- **Wenig Text an den Inhaber (04.10.2026):** überall Titel ≤ 60 Zeichen (worum es geht) und 1 Satz Grund ≤ 160 Zeichen; Details nur auf Klick (Dashboard, Entscheidungen, Vorschläge, Agenten, Chat, Tagesbericht, Tagescheck-Mail, Push).
- **Sprache des Landes:** FR Französisch, sonst Englisch; Deutschland nur Anruflisten/Briefe.
- **Landesweit:** „across the UK“, „across the US“, „partout en France“, „in ganz Deutschland“.
- **Überschriften ohne Satzzeichen (Inhaber 02.10.2026):** keine Punkte, Kommas, Doppelpunkte oder Ausrufezeichen in Überschriften; nur das Fragezeichen bei echten Fragen.
- **Keine Binde- und Gedankenstriche in Kundentexten (Inhaber 02.10.2026: „sieht sehr nach KI aus“):** Seiten, PDFs, Mails und Videos ohne „–“, „—“ und ohne Bindestrich-Wörter („ready-made“, „mobile-friendly“); stattdessen Punkt, Komma oder umformulieren.
- **Kunden-PDF Webagenturen (02.10.2026):** Vorlage „Premium Leads“ (6 Seiten, dunkles Titelblatt mit Ablaufgrafik, Preis pro Lead auf der letzten Seite, Knopf zur Buchungsseite `/[land]/web-agencies/start`). Geht mit der Mail zu den 10 Testleads raus, nennt keine Branchen der Lead-Firmen.

## Mail-Kopf: Etikett „✓ Certified“ (02.10.2026)
Rechts im blauen Kopf aller HTML-Mails ein Etikett „✓ Certified“ (FR „✓ Certifié“), Goldrand, reiner Text, kein Bild.
Inhaber 02.10.2026 im Chat: „nimm certified“, auf Nachfrage „doch das haben wir“ und „echtes Prüfsiegel“.
Name und Aussteller des Siegels liegen beim Inhaber; sobald bekannt, hier eintragen und ggf. „Certified by …“.

## Dashboard: lange Abschnitte immer einklappbar (04.10.2026, feste Regel)
Inhaber 04.10.2026: „solchen langen sektionen immer zum ein und ausklappen“. Jede Liste, Tabelle oder Matrix im
Dashboard mit mehr als etwa 6 Zeilen (z. B. Speicher, Bestand, Proben, Versand, Kunden, Gehirn, Regler-Feinsteuerung)
steht in einem einklappbaren Abschnitt:

- Baustein `<Fold>` aus `app/app/dashboard/fold.tsx` (details/summary), gemeinsame Klasse `.fold` in
  `app/app/dashboard/hud-css.ts` – keine eigenen Klappen je Seite.
- Kopfzeile: Titel links, rechts eine Kurzzusammenfassung oder Zahl („7 Länder“, „3 offen · 12“), Chevron ganz rechts
  (Linie, dreht beim Öffnen), mindestens 36 px hoch, gut treffbar am Handy, kein Überlauf bei 390 px.
- Offen-Zustand je Abschnitt (`id`, eindeutig, z. B. `speicher-datenbank`) bleibt im Browser (localStorage, immer mit
  try/catch; ohne Speicher gilt der Standard). Gespeichert wird nur ein echter Klick.
- Standard offen; Abschnitte, die selten gebraucht werden (z. B. Umgebungsvariablen ohne Fehler), standardmäßig zu.
  Wichtige Warnzustände (fehlende Variable, ungespeicherte Änderung) öffnen den Abschnitt immer, auch gegen einen
  gespeicherten Zu-Zustand (`<Fold alert>`).
- Kurze Abschnitte (bis ~6 Zeilen) bleiben ohne Klappe.

## JARVIS: Empfehlungen ausblenden, acht Agenten (04.10.2026)
- Jede Karte in „JARVIS empfiehlt“ und jede Hinweis-Pille hat ein kleines X (Linien-Icon `schliessen`, Trefferfläche
  ≥ 32 px). Klick blendet aus: 7 Tage, rote Alarme (Notbremse, Spam, Freigabe rot) nur 24 h; danach unten kurz
  „… ausgeblendet · rückgängig“. Schlüssel = Art + Markt + Titel ohne Zahlen (`app/lib/tips.ts`), gespeichert in
  `owner_settings.dismissed_tips`, protokolliert in `owner_log` (`tip:dismiss`, `tip:undo`).
- Agenten-Leiste A1–A8: Desktop 4 × 2 plus Spalte „Auftrag erteilen“ / „Kunden-Agenten“, bis 1100 px 4 Spalten,
  am Handy 2 Spalten – immer bündig. Freie Agenten kompakt (gestrichelt, kleinere Kugel).
- Offene Aufträge zeigen nie „wartet“, sondern „startet um HH:MM“ (nächste Runde :08/:23/:38/:53 deutscher Zeit).
- **Immer bündig (Inhaber 04.10.2026: „das muss immer sein“):** Kästen nebeneinander schließen oben und unten bündig
  ab – Grid `align-items:stretch`, `.dash section`-Abstand (34 px aus `dash-css.ts`) in Spalten nullen, Überschrift
  in den Kasten. Schließen-X immer `x-btn`: nur das Zeichen, ohne Rahmen, exakt mittig (globale `.dash button`-Polsterung
  schiebt Icons sonst aus der Mitte).
