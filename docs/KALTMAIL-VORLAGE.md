# Kaltmail-Vorlage (Bauplan für neue Branchen und Länder)

Stand 02.10.2026, mit dem Inhaber Schritt für Schritt abgestimmt (Webagenturen S2, US/UK/FR/IE/NL/BE/SE).
Jede neue Branche und jedes neue Land wird **1:1 nach diesem Plan** gebaut. Es ändern sich nur die Wörter in
den markierten Platzhaltern, nicht der Aufbau. Grundregeln stehen in CLAUDE.md §2 und §7. Bei einem Widerspruch
gilt CLAUDE.md.

## 1. Aufbau der Mail (von oben nach unten)

| # | Baustein | Inhalt (Muster Webagenturen, EN) | Datei |
|---|---|---|---|
| 1 | **Kopf** | dunkelblauer Balken, links Wortmarke „NextGen **Profit**“, rechts Etikett „✓ Certified“ (FR „✓ Certifié“), Goldrand, nur Text | `scripts/lib/html_email.py` `render()` |
| 2 | **Betreff** | konkret, Branche + Land, ≤ 60 Zeichen, keine Emojis: „Local businesses across {Land} without a website“ | `scripts/drafts.py` `build()` |
| 3 | **Anrede** | „Hi {Kurzname} team,“; Kurzname ohne Rechtsform (Ltd, LLC, BV, AB, SAS …) und ohne Allerweltswörter nach dem Namen; über 4 Wörter → „Hi there,“. FR: „Bonjour,“ | `drafts.short_name()`, `_clean_name()` |
| 4 | **Satz 1: wer + was** | „I'm Justin, founder of NextGen Profit. We find {Firmen mit Anlass} across {Land}, a clear reason for them to talk to a {Käufer}.“ | `drafts.build()` |
| 5 | **Satz 2: Lieferung** | „Every Monday you get a short PDF briefing and a spreadsheet: company, phone, email, who to ask for and an opening line.“ | `drafts.build()` |
| 6 | **Satz 3: Angebot + Ja/Nein-Frage** | „I've put together a free sample of 10 current leads from across {Land}. Shall I send it over?“ | `drafts.build()` |
| 7 | **Button** | Land mit Landingpage: „See my 10 free leads →“ (FR „Voir mes 10 pistes gratuites →“), führt auf `/{land}/{branche}?r=<token>`. Land ohne Landingpage: „Send me my 10 free leads“ (öffnet fertige Antwortmail) | `html_email.page_button()` / `cta_button()` |
| 8 | **Hinweis unter dem Button** | goldenes ✓ + „Secure link to **nextgen-profit.de**“ (Domain grau, nicht blau). Kein Schloss-Emoji, kein Zusatz | `page_button()` |
| 9 | **Gruß + Unterschrift** | „Best regards,“, Unterschrift in Schreibschrift, 12 px Abstand, darunter Goldbalken mit „Founder, NextGen Profit“, Slogan, Website | `render()` |
| 10 | **Ablauf-Grafik** | 4 Kästchen, letztes dunkel: **WE FIND** A reason to call → **WE CHECK** Every contact → **YOU GET** Leads every Monday → **YOU WIN** New clients. FR: ON TROUVE Une raison d'appeler → ON VÉRIFIE Chaque contact → VOUS RECEVEZ Chaque lundi → VOUS GAGNEZ Nouveaux clients | `html_email.process_strip()` |
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
- Sprache des Landes: FR Französisch, sonst Englisch.
- Versand nur in Länder mit `allowed: true` (countries.yaml), nur über Strato-SMTP, nie über Resend.

## 3. Neue Branche anlegen (Checkliste)

1. In `scripts/drafts.py` → `build()` einen Block `if seg == "S…"` wie bei S2 anlegen. Darin stehen die Platzhalter:
   - **Betreff:** „{Firmen mit Anlass} across {area}“
   - **Satz 1:** Welche Firmen wir finden und warum das ein Anlass ist, in einem Halbsatz und nur das, was die
     Quelle wirklich liefert.
   - **Käufer:** „talk to a {Käufer}“
   - Satz 2, Satz 3 und der Button bleiben wörtlich gleich.
2. EN und FR jeweils ausformulieren und mit `lint_draft` prüfen (Wortzahl, verbotene Wörter).
3. Ablauf-Grafik: Sie erscheint nur für Segmente, die in `outreach.html_version()` freigeschaltet sind (heute
   `segment == "S2"`). Neue Branche dort ergänzen. Die vier Schritte bleiben gleich, weil sie für alle
   Trigger-Leads stimmen.
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
4. Eigene Sprache? Dann den ganzen Block wie FR übersetzen: Betreff, 3 Sätze, Button, Hinweis, Ablauf-Grafik,
   Gruß, Signatur-Slogan, Etikett. Sonst Englisch.
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
