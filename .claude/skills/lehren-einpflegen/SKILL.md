---
name: lehren-einpflegen
description: Speichert eine Erkenntnis von Signalwerk (Gehirn, JARVIS, Agenten, Scout, Routinen) mit Beleg, Datum und Vertrauen dauerhaft in der Supabase-Tabelle brain_knowledge über scripts/brain_knowledge.py, statt sie ins öffentliche Repo zu schreiben. Löst aus, wenn etwas gelernt, gemessen, entdeckt oder als Fehler erkannt wurde und das künftig wieder gebraucht wird: „merk dir“, „Lehre“, „Erkenntnis“, „gelernt“, „Fehlermuster“, „festhalten“, „ins Gehirn“, „Wissen speichern“, nach einem A/B-Test, nach einer Rückläufer-Analyse, nach einem gescheiterten Lauf oder am Ende eines Agenten-Auftrags. Auch verwenden, bevor eine Zahl, Quote oder Strategie in eine .md-Datei im Repo geschrieben würde.
---

# Lehren einpflegen

Das Repo ist öffentlich. **Zahlen, Quoten, Strategie und Lehren gehören nie ins Repo**, sondern in
`signalwerk.brain_knowledge` (jede Änderung legt die alte Fassung als Version ab, nichts wird gelöscht).
Lead- und Käuferdaten gehören weder ins Repo noch in eine Lehre.

**Grenzen:** CLAUDE.md §2 (Daten, Ehrlichkeit: echte Zahlen, auch schlechte) und §6. Eine Lehre ändert nie
selbst Regeln, Versand, Sperrliste oder Prüfregeln; folgt daraus eine Regeländerung, ist das eine eigene
Entscheidung nach CLAUDE.md.

## 1. Erst nachsehen, ob es die Notiz schon gibt

```bash
python scripts/brain_knowledge.py list
python scripts/brain_knowledge.py get <slug>
```

Gibt es ein passendes Thema → `--anhaengen` statt neuer Notiz (vermeidet Doppelungen).

## 2. Lehre schreiben (Datei in den Scratchpad, nie ins Repo)

Jede Lehre hat genau diese Teile:

```markdown
**Lehre:** <ein Satz, was gilt>
**Beleg:** <Messung, Abfrage oder Lauf, mit Menge; woher die Zahl stammt>
**Datum:** <Tag der Messung>
**Vertrauen:** hoch | mittel | niedrig  (<warum: Menge, Dauer, Störfaktoren>)
**Gilt für:** <Segment × Land / Werk / Quelle>
**Nächste Prüfung:** <wann oder bei welcher Menge erneut prüfen>
```

- Ohne Beleg keine Lehre; Vermutung → `--typ notiz` und Vertrauen „niedrig“.
- Wiederkehrender Fehler → `--typ fehlermuster`, gesicherte Erkenntnis → `--typ gelernt`.
- Kurz halten: Titel ≤ 60 Zeichen, Lehre in einem Satz (CLAUDE.md „Wenig Text überall“).

## 3. Speichern (Run exactly this script)

```bash
python scripts/brain_knowledge.py add <slug> "<Titel>" <datei.md> --quelle agent --typ gelernt
# bestehende Notiz ergänzen:
python scripts/brain_knowledge.py add <slug> "<Titel>" <datei.md> --quelle agent --typ gelernt --anhaengen
```

- `slug`: a-z, 0-9, Bindestrich (z. B. `s2-uk-betreff`). `--quelle`: routine | chat | agent | inhaber.
- Exit 2 = Eingabe ungültig → slug/Titel/Text korrigieren und erneut.

## 4. Kontrollieren

```bash
python scripts/brain_knowledge.py get <slug>
```

Text muss vollständig da sein. Danach die Scratchpad-Datei verwerfen; `git status` darf keine neue Datei mit
Zahlen oder Lehren zeigen.

## Prüfschleife

- [ ] vorhandene Notizen geprüft (`list` / `get`)
- [ ] Lehre, Beleg, Datum, Vertrauen, Geltungsbereich, nächste Prüfung ausgefüllt
- [ ] keine Lead-/Käuferdaten, keine Geheimnisse im Text
- [ ] passender `--typ` und `--quelle`
- [ ] `add` mit Exit 0, `get` zeigt den Text
- [ ] nichts davon im Repo (`git status` sauber bis auf beabsichtigte Code-Änderungen)
