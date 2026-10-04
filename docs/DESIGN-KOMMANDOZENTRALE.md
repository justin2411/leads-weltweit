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

- Untere Leiste: 5 feste Ziele nach Nutzung (JARVIS, Antworten mit Zähler, Versand, Kunden, Website) + „Mehr“-Blatt mit den übrigen Bereichen (`BottomNav` in `nav.tsx`, X = `x-btn`, 44 px). Desktop-Reiter unverändert.
- JARVIS ≤ 760 px: Kohorten, Entscheidungen und Chat eingeklappt (`MobileFold` in `mobile-fold.tsx`, Kennzahl im Kopf, Zustand im Browser). Desktop unverändert offen.
- Kontakte ≤ 760 px: Stufen als Reiter (`MobileTabs` in `mobile-tabs.tsx`) statt sechs gestapelter Kästen.
- Leer-Zustand: `Leer` in `v2.tsx` (Symbol + 1 Satz), auf allen Seiten mit leeren Listen.
- CSS der Handy-Bausteine in `mobile-css.ts` (Konstanten aus „use client“-Dateien sind auf dem Server nur Verweise).
