---
name: kaltmail-bauen
description: Baut und prüft Kaltmails (Erstmail an Käufer) für Signalwerk streng nach docs/KALTMAIL-VORLAGE.md und prüft sie mit lib.rules.lint_draft und lint_templates.py. Löst aus, wenn eine Kaltmail, ein Entwurf, ein Betreff, ein Einstiegssatz, eine Mail-Variante oder ein A/B-Test für Betreff/Einstieg geschrieben, geändert oder geprüft werden soll, wenn eine neue Branche oder ein neues Land in drafts.py aufgenommen wird, oder wenn jemand „Mailtext“, „Entwurf“, „cold mail“, „subject line“, „drafts.py“ oder „lint“ sagt. Auch verwenden, wenn nur ein einzelner Satz einer Kaltmail angepasst wird, denn jede Änderung muss die gesamte Prüfung bestehen.
---

# Kaltmail bauen

Bauplan ist `docs/KALTMAIL-VORLAGE.md` (Inhaber: „1:1 nachbauen“). Dieser Skill ersetzt ihn nicht, er sagt nur,
in welcher Reihenfolge gebaut und geprüft wird.

**Grenzen:** CLAUDE.md §2 (Kontaktaufnahme, Geld) und §6 (was allein, was nur mit Freigabe) gelten
unverändert; Schreibregeln CLAUDE.md §7. Bei Widerspruch gilt CLAUDE.md. Dieser Skill schaltet nie Versand ein,
gibt keine Entwürfe frei und ändert keine Prüfregeln in `scripts/lib/rules.py`.

## 1. Rahmen klären

1. Segment und Land bestimmen. Darf das Land überhaupt Kaltmails bekommen? Nachsehen in `countries.yaml`
   (`allowed`) und `docs/KALTMAIL-RECHT.md`. Nein → stoppen, nur Anrufliste/Brief.
2. Geht es um einen **Test** (Betreff, Einstieg, Variante)? Nur erlaubt, wenn Segment × Land in
   `config/fokus.yaml` `tests` steht. Prüfen mit genau diesem Befehl:

   ```bash
   cd scripts && python -c "import sys; from lib.fokus import test_allowed; print(test_allowed(sys.argv[1], sys.argv[2]))" S2 UK
   ```

   `False` → keinen Test anlegen, nur Variante A bearbeiten.
3. Pro Experiment nur **eine** Sache ändern (Segment, Land oder Botschaft).

## 2. Bauen

- Aufbau Baustein für Baustein nach `docs/KALTMAIL-VORLAGE.md` §1. Text lebt in `scripts/drafts.py`
  (`build()`, `SUBJECTS`, `opener()`, `LAND`, `LOCAL_TEXT`), HTML in `scripts/lib/html_email.py`.
- Neue Branche: Checkliste `KALTMAIL-VORLAGE.md` §3. Neues Land: Checkliste §4.
- Nur wahre Aussagen, keine Städte/Regionen, Sprache des Landes (Vorlage §2).
- Fußzeile und Abmeldelink kommen vom System (`lib/rules.render_footer()`), nie selbst schreiben oder weglassen.

## 3. Prüfen (Skripte, nicht nach Gefühl)

Einzelner Text:

```bash
python scripts/outreach.py lint --subject "<Betreff>" --body-file <datei.txt> --language en   # fr für FR
```

Alle Vorlagen in `drafts/*.md`:

```bash
python scripts/lint_templates.py
```

Generierte Entwürfe ansehen, ohne zu speichern:

```bash
python scripts/drafts.py --dry-run
```

Tests der Mail-Bausteine:

```bash
pytest -q tests -k "draft or html_email or rules or lint"
```

Exit ≠ 0 oder ein Fehler in der Ausgabe → Text anpassen, nicht die Prüfregel.

## 4. Abschluss

- Änderung als PR (Branch, Tests grün, CI grün), Merge nach den Regeln in CLAUDE.md.
- Testmail nur über `testmail.yml` an den Inhaber (Vorlage §3 Punkt 5); nie an Käufer.
- Offene Entwürfe zieht `send.yml` selbst nach (`drafts.py --refresh`); nichts von Hand freigeben.

## Prüfschleife

Wiederhole 2 → 3, bis alles abgehakt ist:

- [ ] Land erlaubt (`countries.yaml`, `KALTMAIL-RECHT.md`), bei Test `test_allowed` = True
- [ ] Aufbau entspricht `KALTMAIL-VORLAGE.md` §1, nur Platzhalter geändert
- [ ] `outreach.py lint` ohne Fehler (EN und, falls betroffen, FR)
- [ ] `lint_templates.py` Exit 0
- [ ] keine Garantien, keine Dringlichkeit, keine erfundenen Zahlen, keine Orte, kein „Re:“
- [ ] Fußzeile/Abmeldung unverändert vom System
- [ ] nur eine Sache im Experiment geändert
- [ ] `pytest -q tests` grün
