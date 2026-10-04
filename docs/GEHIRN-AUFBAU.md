# Gehirn-Aufbau: wie JARVIS dazulernt und die Firma führt

Auftrag Inhaber 04.10.2026: „bestmöglich aufbauen … JARVIS soll sich selber bauen für viele verschiedene Bereiche … damit er Umsatz vergrößert“.

Das Modell lernt nicht selbst. Klüger wird es nur durch **besseres Gedächtnis** und **gemessene Rückmeldung**. Dafür gibt es vier Bausteine und einen Motor.

## Ablauf alle 2 Stunden (Gehirn = Geschäftsführung)

1. Aufwachen und kurze Regeln lesen (CLAUDE.md).
2. Fällige Entscheidungen nachmessen (Lernschleife).
3. Abteilung mit der größten Lücke zum Ziel wählen (Abteilungs-Motor).
4. Handbuch dieser Abteilung laden und die Lehren mit hohem Vertrauen anwenden.
5. Agenten der Abteilung einen Auftrag geben, mit Erwartung („Antwortquote UK von 0 % auf ≥ 1 % bis 12.10.“).
6. Montags zusätzlich die Rückschau.

## 1. Gedächtnis in Schichten

| Schicht | Ort | Inhalt | Wird geladen |
|---|---|---|---|
| Regeln | `CLAUDE.md` | nur unverrückbare Regeln und eine Landkarte | immer |
| Inhaber-Entscheidungen | `docs/ENTSCHEIDUNGEN-INHABER.md` | alle datierten Entscheidungen wörtlich | bei Bedarf |
| Handbücher (Skills) | `.claude/skills/*/SKILL.md` | Schritte je Aufgabe und je Abteilung | nur passend zur Aufgabe |
| Wissensspeicher | `signalwerk.brain_knowledge` | eine Erkenntnis je Zeile, mit Beleg, Datum und Vertrauen | gefiltert nach Thema |
| Lernjournal | `signalwerk.decisions` | Entscheidung, Erwartung, Ergebnis | fällige und letzte |

Grundsatz: wenig laden, das Richtige laden. Eine lange CLAUDE.md verwässert die Regeln.

## 2. Lernschleife

- Jede Entscheidung bekommt eine **Erwartung**: Kennzahl, Zielwert und Prüfdatum.
- `scripts/brain_learn.py pruefen` misst täglich nach → `bestaetigt` / `widerlegt` / `unklar`.
- Bestätigt → Lehre im Wissensspeicher, das Vertrauen steigt. Widerlegt → das Vertrauen sinkt.

## 3. Rückschau (montags)

- `brain_learn.py rueckschau`: Veraltetes mit wenig Vertrauen wird archiviert (nie gelöscht) und Widersprüche werden gemeldet.
- Die 3 wichtigsten Lehren der Woche werden als Entscheidung gespeichert (kurzer Titel und Grund).

## 4. Prüffälle (Evals)

- `tests/fixtures/gehirn_faelle.json`: rund 20 echte Situationen aus unserer Geschichte, jeweils mit richtiger und verbotener Entscheidung.
- Feste Regeln (Notbremse, Länder, Rechtsform, Testbereich) prüft `pytest`.
- Das Urteil des Gehirns prüft `scripts/brain_eval.py`. Ergebnis ist eine Punktzahl in `brain_evals`; sie darf nach einer Änderung nicht sinken.

## 5. Abteilungs-Motor (JARVIS baut sich selbst)

- `scripts/abteilungen_motor.py` berechnet je Abteilung Ziel (`company_goals`) gegen Ist und daraus die Lücke in %.
- Die 2–3 größten Lücken bekommen je einen Auftrag an ihren Agenten. Bereiche nah am Umsatz kommen zuerst (Vertrieb, Antworten, Proben).
- Höchstens 6 offene Motor-Aufträge, keine doppelten.
- Jede Dashboard-Seite gehört zu einer Abteilung mit mindestens einem Agenten.
- Im Büro jeder Abteilung: Ring „Lücke zum Ziel“ und „Nächster Auftrag“.
- Bei `brain_enabled = false` wird nur angezeigt, es werden keine Aufträge vergeben.

## Grenzen (unverändert)

Kein Geld ohne Inhaber. Kaltmail-Recht, Sperrliste, Abmeldung, Notbremse, Drei-Stufen-Freigabe und Prüfregeln werden nie gelockert. Tests nur für S2 in US/UK/FR. Löschen nur durch den Inhaber. Keine Lead-Daten im Repo. Das Gehirn schaltet nur der Inhaber wieder ein.

## Stand

| Baustein | Status |
|---|---|
| 1 Gedächtnis | in Arbeit (Agent A) |
| 2 Lernschleife, 3 Rückschau, 4 Prüffälle | in Arbeit (Agent B) |
| 5 Abteilungs-Motor und Büros | in Arbeit (Agent C) |
