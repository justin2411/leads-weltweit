---
name: ruecklaeufer-klaeren
description: Klärt bei Signalwerk, warum Kaltmails zurückkommen oder keine Antworten bringen, und prüft dabei immer zuerst die Zustellung (DNS, Blocklisten, Bounce-Klassen, Kontrolladressen) bevor Text oder Zielgruppe verdächtigt werden. Nutzt zustellbarkeit.py --dry-run, lib/bounce_class.py, die Tabellen deliverability_daily und seed_checks sowie die Funktion bounce_stats. Löst aus bei „Rückläufer“, „Bounce“, „bounced“, „Mailer-Daemon“, „undeliverable“, „keine Antworten“, „0 Antworten“, „landet im Spam“, „Zustellbarkeit“, „Notbremse“, „Blockliste“, „SPF/DKIM/DMARC“, gelbem oder rotem Zustell-Status im Tagescheck oder Dashboard, und immer, wenn die Antwortrate eines Experiments auffällig niedrig ist.
---

# Rückläufer klären

Reihenfolge ist fest: **erst Zustellung, dann Liste, dann Text.** Eine Mail, die nicht ankommt, kann keine
Antwort bringen; Betreff-Tests vorher sind verschwendet.

**Grenzen:** CLAUDE.md §2 (Sperrliste nie aufheben/umgehen) und §6 gelten unverändert. Dieser Skill liest und
berichtet nur. Er ändert nie Versand (`config/versand.yaml`, `send_paused`), Notbremse, Sperrliste oder
Prüfregeln. Fällt ein Befund in diese Bereiche, als Vorschlag in `decisions` (über `scripts/lib/kurz.py`
`insert_decisions`) und dem Inhaber melden.

## 1. Zustellung messen (Run exactly this script)

```bash
python scripts/zustellbarkeit.py --dry-run
```

Liefert DNS (MX, SPF, DKIM, DMARC), Blocklisten, Bounce-Quote und -Klassen, Kontrolladressen und die Lücke
„gesendet vs. delivered“. Nur Anzeige, schreibt nichts.

Verlauf der letzten Tage (Status gruen/gelb/rot + Gründe):

```bash
cd scripts && python -c "from lib.db import DB; [print(r['day'], r['status'], r['gruende']) for r in DB().select('deliverability_daily', {'order': 'day.desc', 'limit': '14'})]"
```

## 2. Bounces einordnen

- Klassen kommen aus `scripts/lib/bounce_class.py` (`klasse()`: hart / weich / richtlinie / unbekannt).
- Verteilung je Postfach und je Käufer-Quelle/Land:

  ```bash
  cd scripts && python -c "import json; from lib.db import DB; print(json.dumps(DB().rpc('bounce_stats', {'p_days': 7}), indent=1, ensure_ascii=False))"
  ```

- Deutung:
  - **richtlinie** (Spam, Blockliste, Policy) → Ruf/Domain-Problem, Schritt 1 (DNS, Blocklisten) vertiefen.
  - **hart** gehäuft bei einer Käufer-Quelle → Listenqualität dieser Quelle; nur Vorschlag, Prüfregeln bleiben.
  - **weich** → meist vorübergehend; beobachten.
  - **unbekannt** → Rohtext im Postfach-Lauf ansehen: `python scripts/inbox.py --days 7` (ohne `--apply`
    nur Anzeige).

## 3. Posteingang oder Spam? (Kontrolladressen)

```bash
cd scripts && python -c "from lib.db import DB; [print(r['at'], r['country'], r['placement'], r['subject']) for r in DB().select('seed_checks', {'order': 'at.desc', 'limit': '20'})]"
```

`spam` oder `missing` → Zustellproblem, nicht Textproblem. Keine Zeilen → Kontrolladressen fehlen
(`SEED_INBOXES`, siehe `docs/EINRICHTUNG.md`); das als Lücke melden.

## 4. Erst danach: Liste und Text

Nur wenn 1–3 unauffällig sind:

- Liste: stimmen Segment, Land und Rechtsform der angeschriebenen Käufer (`prospects.check_status`)?
- Text: weiter mit dem Skill `kaltmail-bauen` (ein Test, eine Änderung, nur im Test-Rahmen von
  `config/fokus.yaml`).

## 5. Ergebnis festhalten

- Kurzbefund an den Inhaber nach „Wenig Text überall“ (CLAUDE.md: Titel ≤ 60 Zeichen, Grund 1 Satz).
- Gesicherte Erkenntnis mit Beleg → Skill `lehren-einpflegen` (Zahlen nur in `brain_knowledge`, nie ins Repo).

## Prüfschleife

- [ ] `zustellbarkeit.py --dry-run` gelaufen, Ergebnis gelesen
- [ ] DNS (SPF, DKIM, DMARC) und Blocklisten geprüft
- [ ] Bounce-Klassen je Postfach und Quelle angesehen
- [ ] Kontrolladressen (`seed_checks`) angesehen oder Fehlen gemeldet
- [ ] Ursache eingeordnet: Zustellung / Liste / Text, mit Beleg
- [ ] nichts an Versand, Notbremse, Sperrliste, Prüfregeln geändert
- [ ] Befund kurz gemeldet, Lehre ggf. über `lehren-einpflegen` gespeichert
