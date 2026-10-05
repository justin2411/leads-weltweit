# Ablaufplan: neue Zielgruppe oder neues Land (Segment × Land)

Inhaber 05.10.2026: „mir ist wichtig das das gehirn auch alle möglichkeiten hat wenn es z.b. neue zielgruppen bzw
branchen testen möchte, weil es dort einen größeren need sieht … natürlich erst wenn vorher genug kunden und leads
gefunden wurden. aber ich möchte das das strategisch möglich ist und das gehirn wie einen ablaufplan dazu hat, was es
jederzeit nutzen kann“.

**Grundregel:** Das Gehirn (und JARVIS) bereitet ein neues Paar Segment × Land **komplett selbst** vor. Der
Kaltmail-Versand startet erst nach **einem Klick des Inhabers** (CLAUDE.md §6 „Neue Länder oder Segmente mit Versand
starten“; §8a „Tests nur Webagenturen US/UK/FR … erweitern nur der Inhaber“). Bis dahin: keine Änderung an
`config/fokus.yaml`, kein Versand, keine öffentliche Seite. CLAUDE.md geht immer vor. Alle Werkzeuge mit einer Zeile
Zweck: [`WERKZEUGKASTEN.md`](WERKZEUGKASTEN.md).

**Jederzeit zuerst:** `python scripts/zielgruppe_bereit.py <Segment> <Land>` (nur lesen) zeigt die vier Tore und den
Stand der Vorbereitung (Seite, Experiment, Proben-Vorrat, Fokus, Vorschau-Links). Exit 0 = alle Tore grün.

| Schritt | Wer | Ergebnis |
|---|---|---|
| 1 Bedarf belegen | Gehirn | Segment `idea` mit Begründung, Quellen, Käufer-Kategorie |
| 2 Lieferfähigkeit | Gehirn | vier Tore grün (`zielgruppe_bereit.py`) |
| 3 Vorbereiten | Gehirn / Agenten | Seite, Tarif, Danke, Video, Probe, Playbook, Entwürfe, Experiment – alles nur als Vorschau |
| 4 Freigabe-Antrag | Gehirn | eine `decisions`-Zeile „Freigabe nötig“ mit Zahlen und Vorschau-Links |
| 5 Nach dem Klick | Gehirn | Paar in Fokus/Tests, Seite live, 50 Mails, Regeln §5 |
| 6 Stoppen / aufräumen | Gehirn | Verlierer pausieren, nichts löschen |

---

## 1. Bedarf belegen

1. **Recherche** (höchstens 8 Suchen je Sitzung, `docs/GEHIRN-SITZUNG.md` Schritt 5): Wer kauft, warum jetzt, was zahlt
   er heute für Leads? Ergebnis als `decisions` (type `note`, subject „Recherche: …“, Quellen-URLs), über
   `lib.kurz.insert_decisions`.
2. **Kostenlose Lead-Quellen** prüfen – nur erlaubte (CLAUDE.md §2 „Daten“: Register, amtliche Bekanntmachungen,
   Firmenwebsites, offene Daten; kein Scraping von LinkedIn, Indeed, Google Maps …). Was es schon gibt:
   `docs/EXTRAKTOR.md` „Quellen und Branchen“ (FMCSA, SEC Form D, Companies House, BODACC, Overture, Karriereseiten),
   Logbuch und Länder-Tests `docs/QUELLEN-SCOUT.md`. Neue Quelle = Modul in `scripts/extraktor/sources/` nach den
   Scout-Regeln (CLAUDE.md §8a „Quellen-Scout“).
3. **Käufer-Kategorie**: Overture-Kategorien → Segment in `scripts/kundenwerk.py` `CATEGORIES` (z. B. `web_designer` →
   S2); OSM-Filter im Katalog `config/zielgruppen.yaml` (`osm_filter`, `muster`) bzw. `scripts/osm.py`.
4. **Festhalten:** neues Segment als `idea` – Eintrag in `config/zielgruppen.yaml` (id, name, begruendung, laender,
   signale, osm_filter, Mailbausteine) per Pull Request und/oder Zeile in `signalwerk.segments`
   (`status = 'idea'`, `notes` = Begründung in 1–2 Sätzen). Bestehende Segmente (S1–S12) nicht neu anlegen.
5. **Land prüfen**, bevor Arbeit hineingeht: `countries.yaml` (`allowed`) **und** `docs/KALTMAIL-RECHT.md` – die
   strengere Regel gilt. Nie DE/AT/CH/IT/ES/PL/DK, nie Länder mit Risiko hoch/sehr hoch (IE, BE, AU, CA, IL …). Ein
   neues Mail-Land nur nach den Scout-Regeln (CLAUDE.md §8a „Scout entscheidet allein“: zwei Tests, „Ja“-Land,
   Rechtsgrundlage in `notes`). Rechtlich unklar = nicht weiter, Grund ins Logbuch.

## 2. Lieferfähigkeit (Tore)

```bash
python scripts/zielgruppe_bereit.py S5 US
```

| Tor | Soll | Gezählt |
|---|---|---|
| Premium-Leads | ≥ 50 Firmen | Status `new`, `premium->>tier = premium`, `premium_score ≥ 70`, Ereignis ≤ 14 Tage (`scripts/lib/premium.py`), `lead_checks.result = released` (Drei-Stufen-Freigabe, `scripts/lib/release_gate.py`) |
| Probe 10 | 10 verschiedene Firmen | ≥ `SAMPLE_SIZE` (`scripts/lib/leadreport.py`) freigegebene Firmen mit Status `new`; echter Bau in Schritt 3 |
| Käufer | ≥ 200 | `prospects.check_status = ok` im Paar (nur mail-fähige zählen, Inhaber 02.10.2026) |
| Land | erlaubt | `countries.yaml` + `docs/KALTMAIL-RECHT.md`, strengere Regel |

**Zahlen erzeugen (ohne Versand):**
- **Leads:** `python scripts/extraktor/run.py --segments S5 --countries US --per 100 --db --store --out out/test`
  (Bedienung `docs/EXTRAKTOR.md`), danach Premium-Wert `python scripts/premium_score.py --apply` und die Freigabe für das Paar:
  `python scripts/freigabe.py stichprobe --segment S5 --countries US --per 200 --apply` (schreibt `lead_checks`,
  Durchgefallene `held`, sendet nichts). Ohne Freigabe-Lauf zählt ein Lead nicht.
- **Käufer:** `python scripts/kundenwerk.py run --segments S5 --max 3000` (prüft mit `lib.rules.check_prospect`,
  speichert `ok`/`call_only`/`rejected`, kein Versand); einzelne Listen: `python scripts/prospects.py <csv>`,
  Prüfung `python scripts/outreach.py check --db`.
- **Ruhende Märkte:** Lead-Werk (`run.py`, `lib.laender.producing`) und Kunden-Werk (`pair_producing`) füllen nur Länder
  bzw. Paare aus `config/fokus.yaml` `fokus`. Für ein Land/Paar außerhalb des Fokus läuft dort **kein** Test-Befüllen –
  dann zählt nur der vorhandene Bestand. Reicht er nicht: im Antrag (Schritt 4) „Testlauf“ beantragen statt die
  Fokus-Liste selbst zu ändern (Lücke, siehe unten).
- **Lead-Qualität:** Fehlerquote der Stichprobe > 5 % = rot → erst Quelle verbessern (`docs/QUELLEN-SCOUT.md`).

Erst wenn alle vier Tore grün sind, weiter mit Schritt 3. Sonst: Notiz in `decisions` („Zielgruppe S5/US: Premium
30/50“) und später erneut prüfen.

## 3. Vorbereiten (alles nur Vorschau)

Bauplan für jeden Kontaktpunkt: `docs/KALTMAIL-VORLAGE.md` (Inhaber: „1:1 nachbauen“) – §3 neue Branche, §4 neues
Land, §5 was der Kunde sieht. Design: `docs/DESIGN.md`. Jede Änderung als PR mit grünen Tests; Seiten mit Screenshot
prüfen (`.github/ansicht.txt` → Workflow `ansicht`, Bilder in `docs/ansicht/`).

1. **Landingpage** (`/{land}/{branche}`): Zeile in `signalwerk.landing_pages` (`status = 'review'`, `created_by =
   'brain'`) + Variante A in `page_variants` (`status = 'review'`), Inhalte aus `app/content/pages/<branche>.json`
   (Muster: `scripts/brain.py` „Neue Seite (als 'review')“), Wortschatz `app/content/segment-words.ts`, Texte
   `app/content/landing-v2.ts`, Seite `app/app/[country]/[segment]/landing.tsx`. Beispiel-Leads nur aus echten Proben
   (`leads.status = 'sample'`). Neues Land: `app/lib/country.ts` `COUNTRIES` (heute nur UK/US/FR), FR-Slug in
   `FR_SEG`, Karte `app/content/maps/` aus einer echten 10er-Probe (`scripts/map_svg.py`).
2. **Tarifseite + Stripe-Checkout:** `app/app/[country]/[segment]/start/page.tsx` (Pakete aus `settings.pricing` bzw.
   `page_variants.pricing`, **Einheitspreise** Starter 129 / Pro 249 in Landeswährung, CLAUDE.md §8a), Rechnungsland
   `app/lib/billing.ts`. Keine eigenen Preise für das neue Paar (Preis-Tests nur in der Test-Freigabe).
3. **Danke-Seite + Filterformular:** `app/app/danke/page.tsx`, `app/app/kunde/filter/form.tsx`; neue Branche:
   `SEG_KEY`/`BY_SEG` in `app/content/filter-questions.ts`, Signale in `app/content/sample-wishes.ts`, Zuordnung je
   Schlüssel in `scripts/lib/wishes.py` (sonst bekommt der Kunde keine Leads), Abgleich `scripts/match.py`.
4. **Video** (`video/README.md`): Branchenfilm nach Version 5 (`video/v5/segments.py` → `video/v5/all.sh <name>`) oder
   Premium-Film nach Version 12 (`video/v12/segments.py` → `video/v12/build.sh <markt>-radar`); Eintrag in
   `app/content/videos.json`; Erklärvideo der Tarifseite = `HOW_VIDEO` in der Tarifseite. Nur erfundene, markierte
   Beispiel-Firmen, keine Zahlen über Ergebnisse, keine Garantien.
5. **Probe-PDF und Playbook:** Verkaufstexte je Segment in `scripts/lib/salesplay.json` (FR: `salesplay_fr.json`),
   Briefing `scripts/lib/playbook.py` (`SLUG` ergänzen), PDF `scripts/lib/leadreport.py` (genau 10 Firmen). Testbau
   ohne Reservierung: `responder.regional_sample(db, "S5", "US", None, mark=False)` (läuft durch die Freigabe, schreibt
   nur Prüfergebnisse). Vorlage: `docs/beispiel/Probe-S5-US.pdf`.
6. **Kaltmail-Entwürfe:** Skill `.claude/skills/kaltmail-bauen/SKILL.md` + `docs/KALTMAIL-VORLAGE.md` §1–4: Block in
   `scripts/drafts.py` `build()`, HTML `scripts/lib/html_email.py`, Nachfass `scripts/followups.py`. Prüfen:
   `python scripts/outreach.py lint --subject "…" --body-file … --language en`, `python scripts/lint_templates.py`,
   `python scripts/drafts.py --dry-run`. Lint-Fehler → Text ändern, nie die Prüfregel. Testmail nur an den Inhaber
   (`testmail.yml`; Segment-Auswahl dort heute S1/S2/S9, neue Branche in `outreach.py test` ergänzen).
7. **Experiment:** Zeile in `signalwerk.experiments` (`segment_id`, `country`, `variant = 'v1'`, Hypothese in einem
   Satz, `planned_count = 50`, **`status = 'paused'`**; einen Status „prepared“ gibt es nicht). Doppelte Sicherung:
   `config/fokus.yaml` `nur_fokus: true` – der Versand schickt nur Fokus-Paare.
8. **Nichts öffentlich:** Seiten bleiben `review` (öffentlich nur `live` + `legal_ready`, `app/lib/pages.ts`
   `pageIsPublic`). `scripts/brain.py` schaltet `review`-Seiten nur in der Test-Freigabe live – das neue Paar also nicht.
   Vorschau nur für den Inhaber: `/{land}/{branche}?vorschau=1` und `/{land}/{branche}/start?vorschau=1` (zählt nie).

## 4. Freigabe-Antrag (ein Klick)

Nur wenn `zielgruppe_bereit.py` Exit 0 meldet und Schritt 3 fertig ist. Genau **eine** Zeile, Text kurz
(CLAUDE.md §8a „Wenig Text“):

```python
import sys; sys.path.insert(0, "scripts")
from lib.db import DB
from lib.kurz import insert_decisions
import zielgruppe_bereit as Z
e = Z.pruefen("S5", "US")
insert_decisions(DB(), Z.antrag(e))   # type segment, status proposed, needs_owner true, Tore + Vorschau in metrics
```

Sichtbar auf JARVIS in „Braucht dich“ (Knopf „Erledigt“, `app/app/dashboard/jarvis/braucht-dich-actions.ts`) und in
`/dashboard/gehirn` als offener Vorschlag (Annehmen/Ablehnen, `app/app/dashboard/brain-actions.ts` `reviewDecision`).
**Annehmen oder „Erledigt“ = Freigabe**, Ablehnen = bleibt vorbereitet. Kein Betreff mit „Vorschlag:“ (sonst setzt ein
Agent ihn automatisch um). Offen: höchstens ein Antrag je Paar.

## 5. Nach dem Klick des Inhabers

Erkennen: `decisions` mit `metrics->>freigabe = 'zielgruppe'` und `status = 'done'` (abgelehnt: `rejected`).

1. PR: Paar in `config/fokus.yaml` unter `fokus` (`- S5/US`) **und** `tests` eintragen. Achtung: `tests` ist ein
   Kreuzprodukt (Segmente × Länder) – ein neues Segment dort gilt für alle Test-Länder; nur eintragen, was der Antrag
   genannt hat. Spiegel `app/lib/ops-config.json` (über `app/scripts/ops-config.mjs`, Test prüft Gleichheit).
2. Seite und Variante A auf `live` (DB-Trigger prüft `legal_ready`), Segment `testing`, Experiment `planned`.
3. Entwürfe: `drafts.py` (läuft vor jedem Versand mit `--refresh`); Versand über `send.yml` im Rahmen von Tageslimit
   (`countries.yaml`), Notbremse (`scripts/lib/deliverability.py`) und Spam-Stopp. **50 Mails**, dann messen.
4. Messen 14 Tage nach der letzten Mail, Regeln CLAUDE.md §5: Stopp unter 2 % positiv nach 50 zugestellten oder
   Beschwerden über 0,3 %; 2–5 % ohne Proben = einmal Betreff/Einstieg ändern; über 5 % oder ein zahlender Kunde =
   `winner`. Immer nur **eine** Sache pro Test (`scripts/ab.py anlegen …`). Kohorten:
   `select * from signalwerk.cohort_funnel('S5', array['US'], 12)`.
5. Ergebnis als Wissen: Skill `.claude/skills/lehren-einpflegen/SKILL.md`.

## 6. Stoppen und aufräumen (nichts löschen)

- Verlierer: Experiment `paused` (Entscheidung `killed` + Grund in `decision_reason`), Segment `killed`; Seite
  `retired` (macht `scripts/brain.py` bei `killed` selbst). Paar per PR aus `fokus`/`tests` nehmen.
- Leads, Käufer, Proben und Seiten bleiben gespeichert (ruhen). Daten löschen nur der Inhaber per Klick.
- Entscheidung mit Zahlen in `decisions` (kurz), Lehre in `brain_knowledge`.

## Grenzen (unverändert)

Nie ohne Inhaber: Versand in einem neuen Paar, `config/fokus.yaml`, neue Mail-Länder außerhalb der Scout-Regeln,
Sperrliste, Abmeldung, Notbremse, Drei-Stufen-Freigabe (nur strenger), Rechtstexte, Kosten. Kein Scraping verbotener
Plattformen, keine erfundenen Zahlen, Probe immer genau 10 Firmen.

## Lücken (Stand 05.10.2026)

- Der Klick setzt nur den Status der Entscheidung (`done`); die Umsetzung (Schritt 5) macht die nächste Gehirn-Sitzung.
- Ruhende Märkte werden von den Werken nicht testweise befüllt (Schritt 2); dafür braucht es heute eine Fokus-Änderung
  durch den Inhaber.
- Die App kennt nur die Länder UK/US/FR (`app/lib/country.ts`); ein neues Land braucht dort einen Eintrag.
