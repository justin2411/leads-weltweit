# Design der Kommandozentrale (Dashboard)

Stand 04.10.2026. Ergänzt `docs/DESIGN.md` (Farben, Schriftskala) für `/dashboard`. Inhaber nutzt es am Mac (~1680 px) und am Handy (390 px).

## Prinzipien (Recherche)

1. **5-Sekunden-Regel:** Nach 5 s muss klar sein: Läuft alles? Was braucht mich? Oben links das Wichtigste (Status, „Braucht dich“), darunter Details. – [Dataslayer, 15 Principles](https://www.dataslayer.ai/blog/dashboard-design-best-practices-15-principles-for-clear-reports), [UX Pilot](https://uxpilot.ai/blogs/dashboard-design-principles)
2. **Umgekehrte Pyramide:** Kennzahlen oben, Ursachen in der Mitte, Rohdaten unten oder auf Klick. – [Sisense, 4 Principles](https://www.sisense.com/blog/4-design-principles-creating-better-dashboards/)
3. **Progressive Disclosure:** Zusammenfassung zeigen, Details per Klick/Aufklappen (`<Fold>`, Stationen der Fluss-Karte). Spart auch Abfragen. – [Domo](https://www.domo.com/learn/article/dashboard-design-examples-best-practices)
4. **Farbe nur für Bedeutung:** Rot = Alarm, Gelb = Achtung, Grün = ok (`app/lib/ampel.ts`), sonst neutral. Wird Rot dekorativ benutzt, verliert es seine Warnwirkung. – [Stripe-Analyse, 925studios](https://www.925studios.co/blog/stripe-dashboard-design-breakdown)
5. **Dichte über Typografie, nicht über Rahmen:** wenige Schriftgrößen (Token `--fs-*`), Hierarchie über Gewicht und Abstand. – [Linear-Muster, AdminLTE](https://adminlte.io/blog/saas-dashboard-design-examples/)
6. **Zusammengehöriges gruppieren, Fluss-Reihenfolge:** Zeilen in Reihenfolge des Datenflusses (Lead → Freigabe → Bestand → Probe → Kunde), Gruppen mit eigener Überschrift. – [Grafana Best Practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/), [Datadog Guidelines](https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md)
7. **Jedes Element hat einen Zweck:** Was dauerhaft flach/leer ist oder doppelt vorkommt, raus oder zuklappen. Leere Zustände kurz: was fehlt + nächster Schritt. – [Datadog Guidelines](https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md)
8. **Klare Sprache:** keine Abkürzungen ohne Erklärung, Titel ≤ 60 Zeichen, Grund ≤ 160 (CLAUDE.md „Wenig Text“). – [Datadog Guidelines](https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md)
9. **Klickflächen am Handy ≥ 44 px** (Apple HIG 44 pt, Material 48 dp; WCAG 2.5.8 mindestens 24 px). – [WCAG 2.5.8 Guide](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide)
10. **Gleicher Seitenkopf überall:** Pfad · Titel mit Symbol · rechts Stand/Filter · höchstens eine Zeile darunter – man findet sich auf jeder Unterseite sofort zurecht.

## Umsetzung im Code

- Seitenkopf: `PageHead` in `app/app/dashboard/v2.tsx` (Klassen `pg-head`, `pg-at`, `pg-sub`, `pg-link`). Neue Unterseiten nutzen ihn.
- Inhaltsbreite: `--wmax` (1240 px, ab 1560 px Fensterbreite 1400 px). Eigene Leisten nutzen `max-width:var(--wmax,1240px)`.
- Handy (≤ 640 px): Filter-Chips, Pfad-Links, Kopf-Knöpfe ≥ 44 px, untere Leiste ≥ 48 px; Kopfzeile ≤ 480 px einreihig.
- Layout-Wächter (`npm run layout`): prüft bündige Reihen (Reihe = senkrechte Überdeckung > 50 %), X mittig, kein seitliches
  Scrollen, Fluss-Karte und jetzt auch **Abzeichen über Text** (absolut gesetzte Abzeichen dürfen keinen Text im Kasten berühren).

## Handy-Übersicht (umgesetzt 04.10.2026, Inhaber: „übersichtlicher“)

- Untere Leiste (seit 05.10.2026): genau die 5 Menüpunkte wie am Rechner (JARVIS, Antworten, Kunden, Regler, Büro); das „Mehr“-Blatt entfällt, Büro ersetzt es. Desktop-Reiter unverändert.
- JARVIS: seit 05.10.2026 die Zentrale „Organigramm live“ (unten, docs/JARVIS.md „Zentrale“). Chat als schwebender Knopf über der unteren Leiste.
- Kontakte ≤ 760 px: Stufen als Reiter (`MobileTabs` in `mobile-tabs.tsx`) statt sechs gestapelter Kästen.
- Leer-Zustand: `Leer` in `v2.tsx` (Symbol + 1 Satz), auf allen Seiten mit leeren Listen.
- CSS der Handy-Bausteine in `mobile-css.ts` (Konstanten aus „use client“-Dateien sind auf dem Server nur Verweise).

## JARVIS-Zentrale (05.10.2026)

- **Raster:** 12 Spalten, Abstand 8 px, `align-items:stretch`; Karte 9 Spalten (Du + Gehirn, Bereiche, Werke), Leitplanken
  3 Spalten, gleich hoch. Überschriften stehen im Kasten (`.p > h2`), der globale `.dash section`-Abstand ist genullt.
- **Handy (< 760 px):** eine Spalte; Reihenfolge Gehirn → Leitplanken (3 × 2 Schilde) → Bereiche (3 × 3, Name beim
  Antippen, Agenten als Zahl-Badge) → Werke als senkrechte Kette (zwei Bahnen nebeneinander). Jedes Ziel ≥ 44 px.
- **Farben:** Nachtblau als Fläche, 1-px-Linien; Cyan = läuft; Gold nur Geld und Premium (Umsatz-Kachel, Premium-Labor,
  Leitplanke Geld); Rot/Gelb/Grün nur Status; Grau = aus oder keine Daten (gestrichelt = nicht gebaut). Zahlen Monospace.
- **Animation:** nur mit Bedeutung (Tabelle in docs/JARVIS.md). Partikel-Tempo aus echtem Durchsatz:
  Dauer = clamp(8 s ÷ log10(1 + n/h), 0,8 s, 8 s), Anzahl = ceil(log10(1 + n/h) × 1,5), höchstens 3 je Kante und 40 gesamt
  (Handy 2 / 20); 0/h = keine Partikel, Kante gedimmt. Ringe füllen einmal (300 ms), danach Gleiten (150 ms).
  Nur SVG (`animateMotion`) und CSS, keine Canvas-Bibliothek.
- **Versteckter Tab:** `svg.pauseAnimations()` + Klasse `.jv-paused` (`animation-play-state:paused`), keine Abrufe.
- **prefers-reduced-motion:** globaler Gegenblock in `hud-css.ts` (alle Bereiche), in der Zentrale zusätzlich: keine
  Partikel, Kantendicke = Durchsatz mit „n/h“ an der Kante, Puls als statischer Punkt, Ringe sofort gefüllt, nichts dreht.
- **Schließen-X:** immer Klasse `x-btn` (nur das Zeichen, rahmenlos, exakt mittig).
- **Prüfer:** `app/lib/layout-regeln.test.ts` (Kasten-Raster `align-items:stretch`, x-btn mittig, Gegenblock zu jeder
  `@keyframes`, am Handy keine Schrift < 12 px, Raster 12/9+3), `npm run layout` im Browser (bündig, X mittig, kein
  seitliches Scrollen, Abzeichen über Text) und **vor jedem Merge Bildschirmfotos in 390 px und 1440 px** für jarvis,
  regler, buero und gehirn (`LAYOUT_SHOTS=… npm run layout` oder `ansicht.yml`).
