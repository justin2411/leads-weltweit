# Kaltmail-Vorlage (Bauplan für neue Branchen und Länder)

Stand 02.10.2026, mit dem Inhaber Schritt für Schritt abgestimmt (Webagenturen S2, US/UK/FR/IE/NL/BE/SE).
Jede neue Branche und jedes neue Land wird **1:1 nach diesem Plan** gebaut. Es ändern sich nur die Wörter in
den markierten Platzhaltern, nicht der Aufbau. Grundregeln stehen in CLAUDE.md §2 und §7. Bei einem Widerspruch
gilt CLAUDE.md.

## 1. Aufbau der Mail (von oben nach unten)

| # | Baustein | Inhalt (Muster Webagenturen, EN) | Datei |
|---|---|---|---|
| 1 | **Kopf** | dunkelblauer Balken, Wortmarke „NextGen **Profit**“, nur Text, kein Siegel oder Gütezeichen (ohne Aussteller verboten, §7) | `scripts/lib/html_email.py` `render()` |
| 2 | **Betreff** | konkret, Branche + Land, ≤ 60 Zeichen, keine Emojis, kein „Re:“. Zwei Varianten je Land (A/B-Test seit 04.10.2026), fest je Käufer, gespeichert in `messages.subject_variant`: A „Local businesses across {Land} without a website“, B „No website yet: local businesses across {Land}“ (FR A „Entreprises en France sans site web“, B „Pas encore de site web : entreprises partout en France“) | `scripts/drafts.py` `SUBJECTS`, `subject_variant()` |
| 3 | **Anrede** | „Hi {Kurzname} team,“; Kurzname ohne Rechtsform (Ltd, LLC, BV, AB, SAS …) und ohne Allerweltswörter nach dem Namen; über 4 Wörter → „Hi there,“. FR: „Bonjour,“ | `drafts.short_name()`, `_clean_name()` |
| 4a | **Einstiegssatz (individuell)** | aus echten Daten des Käufers, ohne Ort (§7, 04.10.2026): „I came across {Firma} while looking at {Kategorie, z. B. web design studios}.“ FR „J'ai découvert {Firma} en cherchant des {agences de création de sites web}.“ Ohne Kategorie: „I'm writing to the team at {Firma} directly.“ / „Je me permets d'écrire directement à {Firma}.“ Wird der Text dadurch länger als 120 Wörter, entfällt der Satz | `drafts.opener()`, `SPEC_PLURAL` |
| 4 | **Satz 1: wer + was** | „I'm Justin, founder of NextGen Profit. We find {Firmen mit Anlass} across {Land}, a clear reason for them to talk to a {Käufer}.“ | `drafts.build()` |
| 5 | **Satz 2: Lieferung** | „Every Monday you get a short PDF briefing and a spreadsheet: company, phone, email, who to ask for and an opening line.“ | `drafts.build()` |
| 6 | **Satz 3: Angebot + Ja/Nein-Frage** | „I've put together a free sample of 10 current leads from across {Land}. Shall I send it over?“ | `drafts.build()` |
| 7 | **Button** | Land mit Landingpage: „See my 10 free leads →“ (FR „Voir mes 10 pistes gratuites →“), führt auf `/{land}/{branche}?r=<token>`. Land ohne Landingpage: „Send me my 10 free leads“ (öffnet fertige Antwortmail) | `html_email.page_button()` / `cta_button()` |
| 8 | **Hinweis unter dem Button** | goldenes ✓ + „Secure link to **nextgen-profit.de**“ (Domain grau, nicht blau). Kein Schloss-Emoji, kein Zusatz | `page_button()` |
| 9 | **Gruß + Unterschrift** | „Best regards,“, Unterschrift in Schreibschrift, 12 px Abstand, darunter Goldbalken mit „Founder, NextGen Profit“, Slogan, Website | `render()` |
| 10 | ~~Ablauf-Grafik~~ | **entfällt** (Inhaber 05.10.2026: „überall raus“). Unter der Signatur steht keine Grafik mehr; nicht wieder einbauen. | – |
| 11 | **Pflichtfußzeile** | Firma, Anschrift, Grund des Kontakts, Abmeldung („reply unsubscribe“ bzw. Link). Kommt immer vom System | `lib/rules.render_footer()` |

Textfassung: Bausteine 2–6 und 9 als reiner Text, ohne Button-Gestaltung und ohne Grafik. Jede Mail ist
HTML + Text (multipart).

## 2. Feste Regeln (nie ändern ohne Inhaber)

- 70–120 Wörter (Prüfung `lint_draft`); kurze Absätze.
- **Nur wahre Aussagen.** Kein „just founded“, wenn die Quelle keine Neugründungen liefert. Kein „the contact
  person“, wenn der Name nicht immer da ist, sondern „who to ask for“. **Keine Exklusivitätszusage** („each lead
  goes to one agency only“), solange sie technisch nicht durchgesetzt ist.
- Keine Garantien, keine Dringlichkeit, keine erfundenen Zahlen. Keine Gedankenstriche oder Bindestriche als
  Satzzeichen (DESIGN.md).
- Keine Bilder, keine externen Ressourcen, keine Tracking-Pixel; Grafiken nur als HTML-Tabelle.
- Landesweit („across the UK“, „toute la France“), nie Städte oder Regionen.
- Sprache des Landes: FR Französisch, BR Portugiesisch, MX Spanisch (seit 04.10.2026), sonst Englisch.
- SG: Betreff beginnt immer mit „<ADV> “ (Spam Control Act, `countries.yaml` `subject_prefix`, Versandprüfung).
  HK: Abmeldehinweis in der Fußzeile zusätzlich auf Chinesisch (`lib/rules.UNSUBSCRIBE_EXTRA`).
- Versand nur in Länder mit `allowed: true` (countries.yaml), nur über Strato-SMTP, nie über Resend.

## 3. Neue Branche anlegen (Checkliste)

1. In `scripts/drafts.py` → `build()` einen Block `if seg == "S…"` wie bei S2 anlegen. Darin stehen die Platzhalter:
   - **Betreff:** „{Firmen mit Anlass} across {area}“
   - **Satz 1:** Welche Firmen wir finden und warum das ein Anlass ist, in einem Halbsatz und nur das, was die
     Quelle wirklich liefert.
   - **Käufer:** „talk to a {Käufer}“
   - Satz 2, Satz 3 und der Button bleiben wörtlich gleich.
2. EN und FR jeweils ausformulieren und mit `lint_draft` prüfen (Wortzahl, verbotene Wörter).
3. Keine Ablauf-Grafik unter der Signatur (Inhaber 05.10.2026: „überall raus“), auch nicht für neue Branchen.
4. Landingpage `/{land}/{branche}` live schalten (`landing_pages`, Status `live`). Erst dann zeigt die Mail den
   „See my 10 free leads“-Button, vorher den Antwort-Button.
5. Testmail an den Inhaber: Workflow `testmail.yml` (an, segment, land, art=kaltmail). Gmail prüfen
   (Posteingang/Werbung, SPF/DKIM/DMARC = PASS).
6. Erst nach „passt“ des Inhabers Entwürfe erzeugen (`drafts.py`). Offene Entwürfe holt `send.yml` vor jedem
   Versand automatisch auf den aktuellen Text (`drafts.py --refresh`).

## 4. Neues Land anlegen (Checkliste)

1. Rechtsgrundlage und `countries.yaml` (`allowed`, `generic_only`, `company_forms_only`, `daily_limit`, Notiz)
   nach CLAUDE.md. Nie DE/AT/CH/IT/ES/PL/DK.
2. `drafts.LAND` um den Ländernamen ergänzen („the Netherlands“, „Ireland“ …).
3. Rechtsformen des Landes in `drafts._clean_name()` ergänzen, damit sie nicht in der Anrede stehen.
4. Eigene Sprache? Dann den ganzen Block wie FR übersetzen: Betreff, 3 Sätze, Button, Hinweis,
   Gruß, Signatur-Slogan, Etikett. Sonst Englisch. Vorbild für neue Sprachen: PT (BR) und ES (MX) in
   `drafts.LOCAL_TEXT`, `html_email.LOCAL`, `followups.LOCAL_FOLLOWUP`, Fußzeile/verbotene Wörter in `lib/rules.py`,
   Abmelde-Erkennung in `inbox.OPTOUT`; `drafts.MAIL_LANG` muss zu `countries.yaml language` passen (Test).
5. Landingpage `/{land}/{branche}` mit Video (`app/content/videos.json`) und Beispiel-Leads aus diesem Land.
6. Testmail, Abnahme durch den Inhaber, dann Entwürfe.

## 5. Was der Kunde danach sieht (Reihenfolge)

1. Kaltmail (diese Vorlage)
2. Landingpage mit Video und Beispiel-Leads
3. Probe-Mail mit genau 10 verschiedenen Leads (PDF + CSV)
4. Nachfassmail nach 4 Tagen ohne Antwort; Nachfrage 3 Tage nach der Probe
5. Buchungsseite `/{land}/{branche}/start` → Stripe-Checkout (netto, 19 % USt. nur bei Rechnungsadresse DE)
6. Filter-Formular, Willkommensmail, erste Lieferung am Montag (Vorschau an den Inhaber)

Die Schritte 2–6 werden nach demselben Muster abgestimmt und hier ergänzt, sobald sie abgenommen sind.

### 5.1 Lead-PDF (abgenommen 02.10.2026: „pdf ist super“)

`scripts/lib/leadreport.py` `build_html()`; gilt für Proben und Wochenlieferungen.

| Seite | Inhalt |
|---|---|
| 1 Deckblatt (dunkelblau) | Etikett „★ Free sample“, Siegel „Premium verified“, Titel „Your 10 free leads“, Unterzeile Anlass · Land, 3–4 Kennzahlen (Firmen, mit Telefon und E-Mail, mit Ansprechperson nur wenn > 0, Prüfdatum), Übersicht aller Firmen (Branche, Ort, Telefon; bei gemischten Anlässen „Reason“), 3 Schritte Pick/Call/Follow up |
| 2–3 Karten | 5 je Seite: Nummer, Firma, Branche · Ort, Anlass-Etikett; Kontaktband (Telefon, E-Mail, Adresse, Ansprechperson und Website nur wenn vorhanden); „Why now“ kurz ohne Wiederholungen + Einstiegsfrage; „Your pitch“ + Bedarfs-Chips |
| 4 Abschluss (nur Probe) | Nutzen, Ablauf, Pakete, Button zur Buchungsseite |

Regeln: keine leeren Felder („–“), keine Platzhalter wie „ask for the owner“, keine Sätze, die bei allen Firmen gleich sind.
Dateinamen nach Inhalt: `Your-10-Free-Leads-US.pdf`, `How-It-Works-US.pdf`, `sample-leads.csv` (CSV ohne leere Ansprechperson-Spalten).

### 5.2 Nachfassmails (abgenommen 02.10.2026: „ja perfekt genauso“)

`scripts/followups.py`, Versand über `outreach.py send` (Versand bleibt aus, bis der Inhaber ihn freigibt).

| Mail | Wann | Inhalt | Anhang |
|---|---|---|---|
| Erinnerung | 4 Tage nach der Kaltmail ohne Antwort | Anrede wie Kaltmail; „Just a short follow-up on my note about {Signal wie Kaltmail} across {Land}“; Probe ist fertig (company, phone, email, who to ask for, opening line); „Shall I send it over?“; Knopf „See my 10 free leads“ zur Landingpage | keiner |
| Nachfrage | 3 Tage nach der Probe ohne Antwort | „Did you get a chance to look at the 10 leads?“; jeden Montag eine neue Liste, {Land}, nur für ihre Firma; Knopf „Choose your plan“ zur Buchungsseite; „Shall we start next Monday?“ | How-It-Works-PDF |

PDFs insgesamt (Inhaber 02.10.2026): Probe-Mail = Lead-PDF + How-It-Works-PDF + CSV; Nachfrage nach der Probe = How-It-Works-PDF; alle anderen Mails ohne Anhang.
Testmails: `testmail.yml` mit `art=nachfass` bzw. `art=probe-nachfass`.

### 5.3 Landingpage (abgenommen 02.10.2026: „die website ist fertig und passt“)

`app/app/[country]/[segment]/page.tsx` mit `app/content/landing-v2.ts` (Texte EN/FR), `app/lib/landing-css.ts` (Design wie die Lead-PDF: Navy/Gold/Creme), `app/app/[country]/[segment]/v2.tsx` (Karte, Punktgrafik, Symbole), Karten je Land in `app/content/maps/s2-{land}.json`.

| Abschnitt | Inhalt |
|---|---|
| Hero (dunkel) | Etikett „Free sample · {Land}“; Überschrift mit Goldteil ab „(“; ein Satz Unterzeile; „In every lead“ zweizeilig: Phone · Email · Address / How to win them · Sales tips; goldener Button einzeilig (auch auf dem Handy), darunter mittig ✓ Free of charge · ✓ No obligation · ✓ Sent by email; Landkarte mit den 10 Pins (Nummern 1–10) einer echten Probe; 4 Kennzahlen (Leads, Gebiete, Branchen, 1 Firma pro Lead) + „From a recent free sample · Datum“ |
| Video | direkt unter dem Hero, gleiches Blau |
| What they have in common (hell) | Punktgrafik Telefon/E-Mail/Facebook/eigene Website aus derselben Probe + die Website-Befunde (keine Website, veraltet/nicht mobil, Sicherheitslücken) |
| Two leads from that sample | 2 echte Leads im Kachelstil der PDF, Name/Telefon/E-Mail maskiert, kein Hinweistext darunter |
| Why these leads turn into revenue (dunkel) | 3 Karten (real reason to buy · You call first: „New leads every week, found while the need is still open.“ · Only for your firm) + How it works 01–03 |
| Probe-Formular (hell) | Titel „Your 10 free leads“ + Gold „from across {Land}“; Wünsche (Webagenturen 6: no website, outdated, not mobile, security, broken, newly registered – nur lieferbare Signale); rechts 3 Häkchen + „What you receive“ (PDF, CSV, Karte), beide Spalten unten bündig; danach extra Abstand |
| FAQ | aus der Datenbank (`page_variants.faq`) |

Regeln: Abstände 72 px Desktop / 52 px Handy, zwei helle Abschnitte teilen sich einen Abstand; Kennzahlen und Pins nur aus einer echten Probe; keine Aussagen, die wir nicht belegen können (z. B. „before the company has found a provider“); Preise öffentlich aus. Neues Land: Karte `maps/s2-{land}.json` aus einer echten 10er-Probe erzeugen, `AREA_LABEL`/`COUNTRY_NAME` ergänzen.

### 5.4 Buchungsseite (abgenommen 02.10.2026: „tarif seite und verkaufsseite passt“)

`app/app/[country]/[segment]/start/page.tsx` (Texte EN/FR in `TXT`), Regler „Your volume“ in `custom.tsx`, Rechnungsland in `app/lib/billing.ts`.

| Abschnitt | Inhalt |
|---|---|
| Kopf | Etikett „Weekly trigger leads“, Titel „Start your weekly leads“, ein Satz Unterzeile |
| Rechnungsland | volle Länderliste (Intl, sortiert), vorausgewählt = Land der Seite, goldener Pfeil; 19 % USt. nur bei Deutschland, sonst netto, keine Steuerhinweise auf der Seite |
| Pakete | Starter 129 (bis 15 Leads/Woche), Pro 249 (bis 40, „Recommended“, Inhaber 04.10.2026), „Your volume“ mit Regler 150–10.000 Leads/Woche; je Paket 4 Häkchen und „From about … per lead“; Button → Stripe-Checkout (live; Inhaber-Vorschau `?vorschau=1` im Testmodus) |
| How it works | Erklärvideo des Landes (`HOW_VIDEO`, mit Untertiteln, Poster, Rahmen Navy/Gold), darunter nur die 4 Überschriften einzeilig: Choose your plan · Set your focus · Personal contact · Leads every Monday (Handy 2×2). Ohne Video für das Land: 4 Karten mit Text |
| Fuß | „Questions? …“ mit Kontaktadresse |

Neues Land: Video mit Preisen in der Landeswährung als `public/video/howitworks-{land}.mp4` (faststart) + `.jpg` (Poster) + `.vtt` (Untertitel) und Eintrag in `HOW_VIDEO`.

### 5.5 Danke-Seite und Filterformular (abgenommen 02.10.2026: „dankeseite passt auch“)

`app/app/danke/page.tsx`, Formular `app/app/kunde/filter/form.tsx`, Fragen je Branche in `app/content/filter-questions.ts`; derselbe Formular-Link kommt per Willkommensmail (`/kunde/filter?t=…`). Vorschau: `/danke?demo=1&seg=S2`.

| Abschnitt | Inhalt |
|---|---|
| Kopf | „Subscription confirmed“, „Welcome to NextGen Profit, {Firma}.“, ein Satz Dank |
| Übersicht | 4 Felder einzeilig: Your plan (+ Preis) · Leads per week (+ pro Monat) · First delivery (nächster Montag) · Deliveries to (E-Mail) |
| What happens next | 01 Payment confirmed ✓ · 02 Set your focus · 03 Leads every Monday |
| Formular je Branche | Signale als Kacheln mit kurzer Erklärung (nur lieferbare Signale, Schlüssel wie im Probe-Formular, Lieferung wertet sie über `scripts/match.py` aus); Freitext „beste Kundenbranchen“ / „Berufe, die Sie vermitteln“; Regionen (leer = ganzes Land); Ausschlüsse |

Neue Branche: `SEG_KEY`, Signale in `sample-wishes.ts`, Erklärungen in `DESC`, eigene Fragen in `BY_SEG`; jeder neue Schlüssel braucht eine Zuordnung in `scripts/lib/wishes.py`, sonst bekommt der Kunde keine Leads.

## 6. Vorgehen je Schritt (so stimmen wir jeden Kontaktpunkt ab)

1. Bestehenden Stand zeigen: Testmail an den Inhaber (`testmail.yml`: `art=kaltmail`, `probe`, `nachfass`,
   `probe-nachfass`), Seiten als Screenshot oder Link.
2. Rückmeldung des Inhabers umsetzen, nur wahre Aussagen, keine leeren Felder oder Platzhalter, landesweit.
3. Neue Testmail an den Inhaber, bis er „passt“ sagt.
4. Erst dann als abgenommen hier im Bauplan eintragen (Inhalt, Zeitpunkt, Anhänge) und nach `main` mergen.
5. Neue Branchen und Länder bauen jeden abgenommenen Schritt 1:1 nach diesem Bauplan nach.
