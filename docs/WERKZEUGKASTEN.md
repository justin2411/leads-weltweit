# Werkzeugkasten: alle Anleitungen, Skills, Skripte und Generatoren

Für Gehirn, JARVIS und Agenten: schnell finden, was es gibt und wann man es nimmt (Inhaber 05.10.2026). Je Eintrag
eine Zeile. CLAUDE.md hat immer Vorrang. Ablauf für neue Zielgruppen und Länder:
[`docs/ABLAUFPLAN-NEUE-ZIELGRUPPE.md`](ABLAUFPLAN-NEUE-ZIELGRUPPE.md). Ein Test (`tests/test_zielgruppe_bereit.py`)
prüft, dass jeder Pfad hier existiert und jede MD-Datei des Repos hier steht.

## Regeln und Steuerung

| Datei | Wofür / wann |
|---|---|
| `CLAUDE.md` | unverrückbare Regeln und alle Inhaber-Entscheidungen – vor jeder Sitzung, bei Widerspruch gilt sie |
| `BRAIN.md` | Arbeitsweise des Gehirns (Handlungsrechte, Lernschleife) – zu Beginn jeder Gehirn-Sitzung |
| `README.md` | Überblick über das Repo – Einstieg für neue Sitzungen |
| `docs/README.md` | Index des Wissensspeichers und Pflegeregeln – wenn unklar ist, wo etwas steht |
| `docs/GEHIRN-SITZUNG.md` | stündlicher Ablauf des Gehirns – Arbeitsanweisung jeder Sitzung |
| `docs/GEHIRN-PLAN.md` | großer Plan, vom Gehirn fortgeschrieben – Prioritäten, höchstens 1× täglich ändern |
| `docs/GEHIRN-AUFBAU.md` | wie das Gehirn lernt und die Firma führt (Premium-Definition, Bausteine) – bei Fragen zur Lernschleife |
| `docs/GEHIRN-LERNEN.md` | wie Claude schneller dazulernt – vor neuen Lehren und Prüffällen |
| `docs/JARVIS.md` | JARVIS als Kopf: Ziele, Ablauf, A/B bei Engpässen, Grenzen – jeder JARVIS-Lauf |
| `docs/AGENTEN.md` | Agenten-Aufträge, Rechte, Fach-Agenten – beim Beauftragen und Abarbeiten |
| `docs/ABLAUFPLAN-NEUE-ZIELGRUPPE.md` | neue Zielgruppe/neues Land von Bedarf bis Freigabe-Klick – wenn irgendwo größerer Bedarf gesehen wird |
| `docs/WERKZEUGKASTEN.md` | dieses Verzeichnis – wenn ein Werkzeug gesucht wird |
| `docs/STRATEGIE.md` | Geschäftsmodell, Märkte, Zahlen, Prioritäten – vor strategischen Entscheidungen |
| `docs/ENTSCHEIDUNGEN.md` | Logbuch aller Inhaber-Entscheidungen mit Wortlaut – wenn eine Regel belegt werden muss |
| `docs/EINRICHTUNG.md` | Zugänge, die der Inhaber einmal einrichtet – vor jeder Bitte an den Inhaber |
| `docs/FIRMA-AUFBAU.md` | Stand der Firmen-Bereiche – bei Arbeit an Abteilungen/Übergaben |
| `docs/PLAN-SKALIERUNG.md` | Daten-Archiv und Versand im großen Stil – bei Speicher- und Mengenfragen |
| `docs/PRUEFUNG-2026-09-28.md` | Prüfung des Vertriebsprozesses mit Befunden – Vorbild für eigene Gesamtprüfungen |

## Recht, Mails, Kontaktpunkte

| Datei | Wofür / wann |
|---|---|
| `countries.yaml` | Mail-Erlaubnis, Tageslimit, Rechtsform-Regel je Land – vor jeder Länderfrage |
| `docs/KALTMAIL-RECHT.md` | Rechts-Tabelle je Land (Anwaltsberatung) – mit `countries.yaml`, strengere Regel gilt |
| `docs/KALTMAIL-VORLAGE.md` | Bauplan für Kaltmail, PDF, Nachfass, Landingpage, Tarif-, Danke-Seite – neue Branche/neues Land 1:1 nachbauen |
| `docs/WORKFLOW.md` | Kundenweg, Kontaktpunkte, Zeitplan aller Läufe, Schalter – wenn ein Lauf oder Schalter gesucht wird |
| `docs/DESIGN.md` | Marke, Farben, Seiten, Mails, Videos, Ton – vor jeder Gestaltung |
| `docs/DESIGN-KOMMANDOZENTRALE.md` | Design des Dashboards – bei Dashboard-Änderungen |
| `docs/PREMIUM-WERT.md` | belegte Wertzahlen je Lead für Webagenturen – für Seiten, Video v12 und Mails mit Zahlen |
| `docs/KUNDEN-AGENTEN.md` | persönlicher KI-Ansprechpartner ab Pro – bei Kunden-Betreuung |
| `drafts/S1-FR.md` | Entwurfsvorlage S1 Frankreich – Muster für neue FR-Vorlagen |
| `drafts/S1-UK.md` | Entwurfsvorlage S1 UK – Muster für englische Vorlagen |
| `drafts/S12-UK.md` | Entwurfsvorlage S12 UK (Vorschau) – Marketing-/SEO-Agenturen UK, nur Ltd/LLP/PLC |
| `drafts/S12-US.md` | Entwurfsvorlage S12 USA (Vorschau) – Marketing-/SEO-Agenturen US |
| `drafts/S2-FR.md` | Entwurfsvorlage S2 Frankreich (aktiv) – Webagenturen FR |
| `drafts/S2-US.md` | Entwurfsvorlage S2 USA (aktiv) – Webagenturen US |
| `drafts/S9-FR.md` | Entwurfsvorlage S9 Frankreich – Finanzberater FR |
| `drafts/S9-UK.md` | Entwurfsvorlage S9 UK – Finanzberater UK |

## Quellen, Leads, Daten

| Datei | Wofür / wann |
|---|---|
| `docs/EXTRAKTOR.md` | Lead-Quellen je Branche, Lead-Werk, Kunden-Werk, Bedienung – bevor Leads oder Käufer erzeugt werden |
| `docs/QUELLEN-SCOUT.md` | Logbuch kostenloser Quellen und Länder-Tests – vor neuer Quelle oder neuem Land |
| `docs/WISSEN.md` | Architektur, Datenmodell, Secrets (Namen), Lehren aus Fehlern – bei Technikfragen |
| `docs/BAUKASTEN-MASTER.md` | Master-Pipeline, Speicher, eigene Agenten – bei Flows und Speicher |
| `samples/README.md` | Regeln für Probe-Leads im Repo (keine Lead-Daten committen) |
| `samples/S2/US/README.md` | Stand der S2-Proben USA – historische Referenz |
| `samples/S9/US/README.md` | Stand der S9-Proben USA – historische Referenz |
| `video/README.md` | Video-Pipeline v3–v12 (Stimme, Bilder, ffmpeg) – bevor ein Film gebaut oder geändert wird |
| `video/v3/voice/_probe/LIZENZEN.md` | Lizenzen der Stimmen – vor dem Einsatz einer neuen Stimme |
| `sites/physiotherapie-oehlke/README.md` | eigenständige Kunden-Website (nicht Signalwerk) – nur bei Arbeit an dieser Seite |
| `sites/physiotherapie-oehlke/docs/BUSINESS-OS-KONZEPT.md` | Konzept dieser Kunden-Website – nur dort |

## Skills (`.claude/skills`)

| Skill | Wann |
|---|---|
| `.claude/skills/kaltmail-bauen/SKILL.md` | Kaltmail, Betreff, Einstieg, Variante schreiben oder prüfen; neue Branche/neues Land in `scripts/drafts.py` |
| `.claude/skills/lehren-einpflegen/SKILL.md` | Erkenntnis mit Beleg dauerhaft in `brain_knowledge` speichern |
| `.claude/skills/ruecklaeufer-klaeren/SKILL.md` | Rückläufer oder fehlende Antworten klären (Zustellung zuerst) |

## Zielgruppe und Bereitschaft

| Werkzeug | Wofür / wann |
|---|---|
| `scripts/zielgruppe_bereit.py` | vier Tore je Segment × Land (nur lesen), Freigabe-Antrag `antrag()` – Schritt 2 und 4 des Ablaufplans |
| `config/fokus.yaml` | Fokus-Paare (Werke, Versand) und Test-Freigabe – nur der Inhaber erweitert |
| `config/zielgruppen.yaml` | Katalog weiterer Zielgruppen (Begründung, Signale, OSM-Filter, Mailbausteine) – neue Idee eintragen |
| `scripts/lib/fokus.py` | `focus_pairs`, `test_allowed` – vor jedem Test prüfen |
| `scripts/lib/laender.py` | aktive Märkte der Werke (`producing`, `pair_producing`) – warum ein Markt ruht |
| `scripts/lib/rules.py` | Prüfregeln Käufer und Entwürfe (`check_prospect`, `lint_draft`, Fußzeile) – nie lockern |
| `scripts/lib/kurz.py` | `insert_decisions` mit Kurztitel/-grund – jede Entscheidung, jeder Antrag |
| `scripts/lib/leadsegment.py` | Zielgruppen ohne eigene Leads (S12 -> S2-Bestand), Spiegel `app/lib/lead-segment.ts` |

## Leads erzeugen und prüfen

| Werkzeug | Wofür / wann |
|---|---|
| `scripts/extraktor/run.py` | Leads aus amtlichen/offenen Quellen holen, anreichern, doppelt prüfen (`--db --store`) |
| `scripts/extraktor/segments.py` | welche Branche zu einem Kandidaten passt, Texte nur aus Fakten – neue Branche im Extraktor |
| `scripts/extraktor/sources/__init__.py` | Quellen-Module (FMCSA, Register, Karriereseiten …) – neue Quelle hier anlegen |
| `scripts/extraktor/store.py` | grüne Leads in die Datenbank übernehmen |
| `scripts/extraktor/qc.py` | Kontrolle 1: Kontaktdaten |
| `scripts/extraktor/sc.py` | Kontrolle 2: Signal, Firmeninfo, Einstiegssatz |
| `scripts/premium_score.py` | Premium-Bewertung offener Leads (`--apply`) |
| `scripts/lib/premium.py` | Premium-Definition (≥ 70 Punkte, Ereignis ≤ 14 Tage) |
| `scripts/freigabe.py` | Drei-Stufen-Freigabe von der Kommandozeile (`stichprobe --segment … --countries … --apply`) |
| `scripts/lib/release_gate.py` | Drei-Stufen-Freigabe + Stufe 4 – nie abschalten, nur strenger |
| `scripts/pruefer.py` | Prüfer-Werk der lieferbaren Leads |
| `scripts/dauerpruefung.py` | Dauerprüfung ohne Tokens |
| `scripts/kontaktwerk.py` | Ansprechperson + Kontakt zusammenführen |
| `scripts/uk_psc_radar.py` | Premium-Radar UK (Eigentümerwechsel) |
| `scripts/enrich.py` | Website und Kontakte anreichern |
| `scripts/watch.py` | tägliche Beobachtung von Quellen |
| `scripts/employers.py` | Arbeitgeber mit Karriereseite finden (S1) |

## Käufer

| Werkzeug | Wofür / wann |
|---|---|
| `scripts/kundenwerk.py` | Käufer aus Overture prüfen und speichern (`run --segments …`), Kategorien `CATEGORIES` |
| `scripts/osm.py` | Käufer-Kandidaten aus OpenStreetMap |
| `scripts/prospects.py` | Käufer aus CSV übernehmen und prüfen |
| `scripts/outreach.py` | Käufer prüfen (`check`), Entwürfe prüfen (`lint`), senden (nur nach Regeln), Testmail |

## Seiten, Video, Probe, Mails (Vorbereiten)

| Werkzeug | Wofür / wann |
|---|---|
| `app/app/[country]/[segment]/landing.tsx` | Landingpage (Vorschau `?vorschau=1` für review-Seiten) |
| `app/app/[country]/[segment]/start/page.tsx` | Tarifseite mit Stripe-Checkout und `HOW_VIDEO` |
| `app/app/danke/page.tsx` | Danke-Seite nach dem Kauf |
| `app/app/kunde/filter/form.tsx` | Filterformular des Kunden |
| `app/content/pages/web-agencies.json` | Seiteninhalt je Branche (Muster für neue `app/content/pages/<branche>.json`) |
| `app/content/landing-v2.ts` | Landingpage-Texte EN/FR |
| `app/content/segment-words.ts` | Wortschatz je Branche für Platzhalter |
| `app/content/filter-questions.ts` | Filterfragen je Branche (`SEG_KEY`, `BY_SEG`) |
| `app/content/sample-wishes.ts` | Probe-Wünsche (Signale) je Branche |
| `app/content/videos.json` | Video je Seite |
| `app/content/maps/s2-us.json` | Landkarte aus einer echten Probe (Muster für neue Karten) |
| `app/lib/country.ts` | Länder der App (heute UK/US/FR) und FR-Slugs |
| `app/lib/pages.ts` | `pageIsPublic`: öffentlich nur live + Rechtstexte |
| `app/lib/billing.ts` | Rechnungsland und Umsatzsteuer |
| `scripts/brain.py` | Gehirn-Schleife: Seiten als review anlegen, Stilllegen, Live nur in der Test-Freigabe |
| `scripts/map_svg.py` | Landkarten als SVG |
| `video/v5/segments.py` | Branchenfilm-Inhalte (dann `video/v5/all.sh`) |
| `video/v12/segments.py` | Premium-Radar-Film (dann `video/v12/build.sh`) |
| `scripts/lib/salesplay.json` | Verkaufs-Playbook je Segment (EN) |
| `scripts/lib/salesplay_fr.json` | Verkaufs-Playbook Frankreich |
| `scripts/lib/playbook.py` | Vertriebs-Briefing je Lead (`SLUG` je Segment) |
| `scripts/lib/leadreport.py` | Lead-PDF, `SAMPLE_SIZE = 10` |
| `scripts/responder.py` | Antwort-Assistent; `regional_sample` baut Proben |
| `scripts/sample_stock.py` | Proben-Vorrat für Live-Seiten |
| `scripts/samples.py` | Probe-Leads je Segment/Land auswählen |
| `scripts/web_samples.py` | Probe-Anfragen der Seiten beantworten |
| `scripts/drafts.py` | Kaltmail-Entwürfe (`build()`, `--dry-run`) |
| `scripts/lib/html_email.py` | HTML-Version der Mails (ohne Bilder/Tracking) |
| `scripts/followups.py` | Nachfassmails |
| `scripts/lint_templates.py` | Vorlagen in `drafts/` gegen die Schreibregeln prüfen |
| `scripts/lib/wishes.py` | Wunsch-Schlüssel → Signale (Pflicht für neue Branche) |
| `scripts/match.py` | Leads taggen, Kundenfilter abgleichen |

## Messen, Testen, Lernen

| Werkzeug | Wofür / wann |
|---|---|
| `scripts/ab.py` | A/B je Schritt (nur Test-Freigabe) |
| `scripts/kpi_snapshot.py` | KPI-Tageswerte |
| `scripts/prognose.py` | Prognose 30 Tage |
| `scripts/datenfluss.py` | Stillstand je Station, Wirkung von Aufträgen |
| `scripts/zustellbarkeit.py` | Zustellbarkeits-Check |
| `scripts/brain_routines.py` | Gehirn-Routinen und Agenten-Aufträge |
| `scripts/brain_knowledge.py` | Wissen des Gehirns (`add`, `list`, `get`) |
| `scripts/brain_learn.py` | Lernschleife, Nachmessen |
| `scripts/brain_meta.py` | Meta-Review, Gehirn-Score |
| `scripts/brain_eval.py` | Prüffälle des Gehirns |
| `scripts/selbstopt.py` | Selbstoptimierung der Stellschrauben |
| `scripts/tagescheck.py` | täglicher Gesamtcheck |
| `scripts/report.py` | Morgenbericht |
| `scripts/deliveries.py` | Kundenlieferungen |
| `scripts/werk_plan.py` | Plätze der Werke (Autopilot) |

## GitHub-Abläufe (wichtigste)

| Ablauf | Wofür |
|---|---|
| `.github/workflows/lead-werk.yml` | Leads rund um die Uhr (nur Fokus-Märkte) |
| `.github/workflows/kunden-werk.yml` | Käufer rund um die Uhr (nur Fokus-Paare) |
| `.github/workflows/freigabe-stichprobe.yml` | tägliche Freigabe-Stichprobe |
| `.github/workflows/proben-vorrat.yml` | Proben-Vorrat für Live-Seiten |
| `.github/workflows/send.yml` | Versand (nur Fokus-Paare, Notbremse) |
| `.github/workflows/testmail.yml` | Testmail an den Inhaber |
| `.github/workflows/ansicht.yml` | Screenshots der Seiten (`.github/ansicht.txt`) |
| `.github/workflows/extraktor.yml` | Extraktor per Hand starten |
| `.github/workflows/gehirn.yml` | Gehirn-Lauf |
| `.github/workflows/wachhund.yml` | startet ausgelassene Läufe nach |
| `.github/workflows/ci.yml` | Tests (Python, Migrationen, App) |
