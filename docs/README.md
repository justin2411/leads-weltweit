# Wissensspeicher NextGen Profit

Hier liegt alles, was eine neue Sitzung (oder ein Mensch) wissen muss. **Zuerst lesen:** [`../CLAUDE.md`](../CLAUDE.md)
(unverrückbare Regeln), dann diese Übersicht.

| Datei | Wofür |
|---|---|
| [`STRATEGIE.md`](STRATEGIE.md) | Geschäftsmodell, Zielgruppen, Märkte, Preise, Trichter, Stand in Zahlen, Prioritäten, Risiken |
| [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md) | Logbuch aller Entscheidungen des Inhabers mit Datum und Wortlaut; offene Entscheidungen |
| [`WORKFLOW.md`](WORKFLOW.md) | Kontaktpunkte vom Erstkontakt bis zur Lieferung, Zeitplan aller Läufe, Schalter, Handgriffe |
| [`DESIGN.md`](DESIGN.md) | Marke, Farben, Schrift, Seiten, Mails, Videos, Tonalität |
| [`WISSEN.md`](WISSEN.md) | Architektur, Datenmodell, Quellen, Secrets (nur Namen), Lehren aus Fehlern, Werkzeuge, Tests |
| [`EINRICHTUNG.md`](EINRICHTUNG.md) | Zugänge, die der Inhaber einmal einrichtet, und ihr Status |
| [`PRUEFUNG-2026-09-28.md`](PRUEFUNG-2026-09-28.md) | Prüfung des Vertriebsprozesses vom 28.09. mit Befunden und Status |
| [`workflow/NextGen-Profit-Workflow.pdf`](workflow/NextGen-Profit-Workflow.pdf) | grafischer Ablauf mit allen Kontaktpunkten |
| [`ABLAUFPLAN-NEUE-ZIELGRUPPE.md`](ABLAUFPLAN-NEUE-ZIELGRUPPE.md) | neue Zielgruppe/neues Land: Bedarf → Tore → Vorbereitung → Freigabe-Klick |
| [`WERKZEUGKASTEN.md`](WERKZEUGKASTEN.md) | alle Anleitungen, Skills, Skripte und Generatoren mit einer Zeile Zweck |
| [`GEHIRN-SITZUNG.md`](GEHIRN-SITZUNG.md), [`GEHIRN-PLAN.md`](GEHIRN-PLAN.md), [`../BRAIN.md`](../BRAIN.md) | Arbeitsweise des autonomen „Gehirns“ |

## Pflege

- **Neue Entscheidung des Inhabers** → sofort in `ENTSCHEIDUNGEN.md` (Datum, Wortlaut) und, wenn sie eine Regel
  ändert, zusätzlich knapp in `CLAUDE.md`.
- **Neuer Fehler mit Lehre** → Tabelle „Lehren aus Fehlern“ in `WISSEN.md`.
- **Neuer Lauf, Schalter oder Kontaktpunkt** → `WORKFLOW.md` (und bei Bedarf das PDF neu erzeugen:
  `docs/workflow/workflow.html` → Playwright `page.pdf`).
- **Neue Zahlen / neue Prioritäten** → Abschnitt „Wo wir stehen“ in `STRATEGIE.md` (mindestens wöchentlich mit dem
  Wochenbericht).
- **Neuer Zugang** → `EINRICHTUNG.md`.
