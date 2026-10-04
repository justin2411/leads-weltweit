# Gehirn-Lernen: wie Claude bei uns schneller dazulernt

Auftrag Inhaber 04.10.2026: „recherchiere … wie der selbstlernprozess von claude noch optimiert werden kann, was stellt claude für skills zusammen die wir dafür nutzen können?“ Ergänzt `docs/GEHIRN-AUFBAU.md`.

**Grundsatz:** Das Modell lernt nicht selbst. Besser wird es nur durch **Gedächtnis** (was geladen wird), **Rückmeldung** (gemessene Ergebnisse) und **Prüffälle** (was nicht schlechter werden darf).

## 1. Kostenlos im Abo

| Baustein | Was es bringt | Belegt (Quelle) |
|---|---|---|
| **Projekt-Skills** `.claude/skills/<name>/SKILL.md` | Handbuch je Aufgabe, lädt erst bei Bedarf (zuerst nur Name + Beschreibung) | [Skills-Doku](https://code.claude.com/docs/en/skills), [Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) |
| **skill-creator** (`anthropic-skills:skill-creator`) | misst mit/ohne Skill (Treffer, Zeit, Tokens, Mittelwert ± Streuung); schärft die Beschreibung mit 20 Prüffragen, 60/40, je 3 Läufe, ≤ 5 Runden; Fälle in `evals/evals.json` | [SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) |
| **Schlanke CLAUDE.md** | Ziel < 200 Zeilen; längere Dateien „reduce adherence“. Unsere: 212 Zeilen, 42 KB (sehr lange Zeilen) | [Memory-Doku](https://code.claude.com/docs/en/memory) |
| **`.claude/rules/*.md` mit `paths:`** | Bereichsregeln laden nur bei passenden Dateien | Memory-Doku |
| **Hooks** (PreToolUse, Exit 2 blockiert) | harte Grenzen unabhängig vom Modell; CLAUDE.md ist „context, not enforced configuration“ | [Hooks](https://code.claude.com/docs/en/hooks-guide) |
| **Routinen** | laufen im Abo-Kontingent, ≥ 1 h Abstand, laden Skills aus dem Repo | [Routinen](https://code.claude.com/docs/en/routines) |
| **GitHub Action mit `CLAUDE_CODE_OAUTH_TOKEN`** | Läufe über das Abo statt API-Abrechnung (GitHub-Minuten fallen an) | [GitHub Actions](https://code.claude.com/docs/en/github-actions) |
| **Prüffälle (Evals)** | 20–50 Fälle aus echten Fehlern, Regeln per Code, Urteile per Modell, pass^k bei Kundenrelevantem | [Anthropic Engineering](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| **Wissensspeicher in Supabase** | `brain_knowledge` (notiz/gelernt/fehlermuster); Auto-Memory bleibt auf der Maschine und hilft Cloud-Routinen nicht | Memory-Doku |

Wichtig: Cloud-Sitzungen und Routinen lesen nur `.claude/skills/` **im Repo**, nicht `~/.claude/skills`. Repo ist öffentlich: Skills enthalten nur Abläufe und Regeln, Zahlen und Lehren gehören in `brain_knowledge`.

Ist das Abo-Kontingent erschöpft, laufen Routinen nur mit kostenpflichtigen „usage credits“ weiter. Die bleiben aus (Nachtschicht-Freigabe Punkt 3).

## 2. Kostet API-Geld (nur mit Ja des Inhabers, CLAUDE.md §2)

| Baustein | Was | Kosten |
|---|---|---|
| Managed Agents | Agenten-Läufe auf der Plattform | Tokens + $0,08 pro Laufstunde; Websuche $10 je 1.000 |
| Memory Stores | Speicher für Agenten (≤ 100 kB je Eintrag, 10.000 Einträge, Versionen 30 Tage) | wie Managed Agents |
| Outcomes | eigener Prüfer mit Bewertungsliste, Standard 3, max. 20 Runden | Tokens je Runde |
| Scheduled Deployments | Zeitplan mit Budget je Lauf (`budget.max_list_cost`), Ausführung bis 9 min später | wie Managed Agents |
| Dreams | verdichtet 1–100 Sitzungen, Forschungsvorschau mit Antrag | Tokens |
| Memory-Tool + Context Editing | +39 % (Context Editing allein +29 %), 84 % weniger Tokens, gemessen bei agentischer Suche | Tokens ([Blog](https://claude.com/blog/context-management)) |

Preise je Million Tokens (Eingabe / Ausgabe): Opus 5.5 $4 / $20, Sonnet 5 und 5.5 $2 / $10, Haiku 4.5 $1 / $5. Batch-API halber Preis (nicht für Managed Agents). Quelle: [Preise](https://platform.claude.com/docs/en/about-claude/pricing).

**Schon heute API-Kosten:** `scripts/responder.py` ruft Claude bei jeder Antwort-Einordnung auf, sobald `ANTHROPIC_API_KEY` gesetzt ist. `ki-test.yml` nur bei Handstart. Frage an den Inhaber: Ist der Schlüssel gesetzt, und welches Abo (Pro, Max, Team)?

## 3. Regeln für unsere Skills

- Name: ASCII, Kleinbuchstaben, Bindestrich, ≤ 64 Zeichen, ohne „claude“/„anthropic“ (`ruecklaeufer-klaeren`).
- Beschreibung ≤ 1.024 Zeichen, dritte Person, sagt **was** und **wann**, mit den Wörtern, die wirklich fallen; leicht „pushy“ (Claude löst eher zu selten aus).
- SKILL.md < 500 Zeilen, Verweise nur eine Ebene tief, feste Schritte als Skript („Run exactly this script“).
- Keine zeitabhängigen Angaben; Grenzen nur als Verweis auf CLAUDE.md §2/§6, nie umformulieren.
- Erst 3 Prüffälle und ein Basiswert ohne Skill, dann minimaler Text. Mit allen eingesetzten Modellen testen.
- Prüfschleife und abhakbare Checkliste am Ende.
- `` !`befehl` `` mit `|| true` absichern (ein Fehler bricht den Skill ab). `context: fork` mit `background: false`, wenn das Ergebnis gleich gebraucht wird.

## 4. Skill-Katalog

| Prio | Skill | Wofür | Voraussetzung |
|---|---|---|---|
| 1 | `kaltmail-bauen` | Kaltmail nach `KALTMAIL-VORLAGE.md`, Prüfung `lib.rules.lint_draft` / `lint_templates.py`, nur S2 × US/UK/FR für Tests | vorhanden |
| 2 | `ruecklaeufer-klaeren` | 0 Antworten auf ~500 Mails: Zustellung zuerst (`zustellbarkeit.py --dry-run`, `bounce_class`, `deliverability_daily`, `seed_checks`) | vorhanden |
| 3 | `lehren-einpflegen` | Erkenntnis mit Beleg, Datum, Vertrauen in `brain_knowledge` (`brain_knowledge.py`) | vorhanden |
| 4 | `quelle-testen` | neue Quelle prüfen: ≥ 10 grüne Leads, Rechtslage, robots.txt (`context: fork`) | vorhanden |
| 5 | `premium-lead-pruefen` | Premium = ≥ 70 Punkte **und** frisches, datiertes Ereignis | Merge `claude/premium-radar` |
| 6 | `wertrechnung-probe` | Wert-Seite in Probe/Landingpage nach `PREMIUM-WERT.md` | wie 5; erster Einsatz über Gehirn-Entscheidung |
| 7 | `entscheiden-mit-erwartung` | jede Entscheidung mit Kennzahl, Zielwert, Prüfdatum | Migration Erwartungsfelder in `decisions` |
| 8 | `rueckschau` | montags Lehren prüfen, Veraltetes archivieren | wie 7 |
| 9 | `prueffall-lauf` | Gehirn-Prüffälle laufen lassen, Punktzahl darf nicht sinken | `brain_eval.py`, `gehirn_faelle.json`, Ergebnistabelle (alle neu) |
| 10 | `skill-pflegen` | Skills mit skill-creator messen und nachschärfen | wie 9 |

**Prüffälle-Grundlage:** vorhandene Fixtures (`brain_meta_cases.json`, `ab_cases.json`, `kurz_cases.json`, `persona_cases.json`) im Format `evals/evals.json`.

## 5. Reihenfolge

1. **Jetzt (Abo):** Skills 1–3 anlegen, je 3 Prüffälle + Basiswert.
2. Skill 4; danach Migration Erwartungsfelder → 7, 8.
3. `brain_eval.py` + Prüffälle + Ergebnistabelle → 9, 10.
4. `claude/premium-radar` mergen → 5, 6.
5. **Vorschlag an den Inhaber:** CLAUDE.md verkleinern (datierte Entscheidungen nach `docs/ENTSCHEIDUNGEN-INHABER.md`, Bereichsregeln nach `.claude/rules/`). Nur mit seiner Zustimmung.
6. **Vorschlag an den Inhaber:** Hooks für Sperrliste, Prüfregeln, `versand.yaml`; bei `countries.yaml` nur die Nie-Länder sperren (Scout-Freigabe). Zusätzlich CI-Test, weil `settings.json` änderbar ist. Wirkung in Cloud-Sitzungen vorher testen.
7. **Nur nach Ja des Inhabers:** Managed Agents mit Outcomes und Budget je Lauf.

Nicht belegt und daher nicht genutzt: Tagesgrenzen 5/15/25 Routinen-Läufe.
