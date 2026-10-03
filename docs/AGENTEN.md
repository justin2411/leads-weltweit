# Agenten – Aufträge aus dem Dashboard

Inhaber 03.10.2026: „einzelne agenten nutzen die sachen für mich machen, z.b. ich beauftrage agent 1 neue leads zu
holen für den markt“. Der Inhaber erteilt Aufträge in JARVIS (Agenten-Leiste, „+ Auftrag“, oder einen gelben Hinweis bzw. den Engpass auf A1–A4 ziehen – dann steht der Auftragstext schon fertig drin). Eine Claude-Sitzung
(Routine „Agenten“, stündlich) bearbeitet sie nach dieser Anleitung. CLAUDE.md gilt immer zuerst.

## Ablauf je Sitzung

1. `python scripts/agent_tasks.py offen` – nichts offen: sofort beenden (keine weitere Arbeit, keine Nachricht).
2. Je Auftrag (älteste zuerst, höchstens 3 je Sitzung): `start <id>` (Exit-Code 3 = schon von einer anderen Sitzung übernommen → überspringen), beim Arbeiten `schritt <id> <prozent> "<kurz>"`
   (alle paar Minuten), am Ende `fertig <id> "<Ergebnis in 1–3 Sätzen>" '<Kennzahlen als JSON>'` oder `fehler`.
3. Ergebnis-Sätze: kurz, Deutsch, echte Zahlen, keine Fachbegriffe. Kennzahlen nur gemessene Werte
   (z. B. `{"neue Leads": 420, "grün %": 94}`).

## Arten

| Art | Was tun | Typisch |
|---|---|---|
| `leads` – Leads holen | Lead-Werk für den Markt anwerfen bzw. verstärken: Belegung im Belegungsplan (`owner_settings.slot_plan`, Grenzen aus `app/lib/werk-linien.json`) zugunsten der Linie des Marktes ändern und `lead-werk.yml` starten (`gh workflow run`). Ist der Vorrat der Linie erschöpft: wie `quelle` weiterarbeiten. Ergebnis: neue grüne Leads seit Start. | „Leads holen · UK“ |
| `kaeufer` – Käufer finden | Kunden-Werk für den Markt starten; ist die Overture-Liste durch, neue kostenlose Käuferquelle wie der Quellen-Scout suchen und testen. Ergebnis: neue mail-fähige Käufer. | „Käufer finden · FR“ |
| `quelle` – Neue Quelle | Wie der Quellen-Scout (`docs/QUELLEN-SCOUT.md`): kostenlose, erlaubte Quelle recherchieren, mit ≥ 10 grünen Leads testen, in die Werke einbauen (PR, Tests, CI grün, selbst mergen), Logbuch-Eintrag. | „Neue Quelle · NL“ |
| `pruefen` – Prüfen | Stichprobe ziehen (z. B. 20 Leads/Mails/Proben des Marktes), gegen die Drei-Stufen-Freigabe und Schreibregeln prüfen, Fehler beheben, Ergebnis mit Fehlerquote. | „Prüfen · US“ |
| `frage` – Frage | Auswertung aus echten Daten, Antwort in 1–3 Sätzen. Nichts ändern. | „Warum keine Antworten in FR?“ |

## Grenzen (nie ohne Inhaber)

Kein Versand und kein Einschalten des Versands, keine Kosten, Sperrliste und Prüfregeln nie lockern, keine neuen
Mail-Länder, keine destruktiven Datenbankänderungen, keine Lead-Daten ins Repo. Unklar oder rechtlich offen:
`fehler <id> "Braucht deine Entscheidung: …"` – der Inhaber sieht es im Dashboard.
