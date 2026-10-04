# Agenten – Aufträge aus dem Dashboard

Inhaber 03.10.2026: „einzelne agenten nutzen die sachen für mich machen, z.b. ich beauftrage agent 1 neue leads zu
holen für den markt“. Der Inhaber erteilt Aufträge in JARVIS (Agenten-Leiste, „+ Auftrag“, oder einen gelben Hinweis bzw. den Engpass auf A1–A4 ziehen – dann steht der Auftragstext schon fertig drin). Eine Claude-Sitzung
(Routine „Agenten“, stündlich) bearbeitet sie nach dieser Anleitung. CLAUDE.md gilt immer zuerst.

Nach den Aufträgen macht jede Sitzung den JARVIS-Lauf nach `docs/JARVIS.md` (Engpass protokollieren, A/B-Tests
auswerten und bei anhaltendem Engpass selbst starten).

## Ablauf je Sitzung

1. `python scripts/agent_tasks.py offen` – nichts offen: sofort beenden (keine weitere Arbeit, keine Nachricht).
2. Je Auftrag (Chat-Aufträge `created_by = "JARVIS-Chat"` zuerst – `offen` sortiert sie nach vorn –, sonst älteste zuerst, höchstens 3 je Sitzung): `start <id>` (Exit-Code 3 = schon von einer anderen Sitzung übernommen → überspringen), beim Arbeiten `schritt <id> <prozent> "<kurz>"`
   (alle paar Minuten), am Ende `fertig <id> "<Ergebnis in 1–3 Sätzen>" '<Kennzahlen als JSON>'` oder `fehler`.
3. Ergebnis-Sätze: kurz, Deutsch, echte Zahlen, keine Fachbegriffe. Kennzahlen nur gemessene Werte
   (z. B. `{"neue Leads": 420, "grün %": 94}`).

## JARVIS-Chat (Inhaber 04.10.2026)

„ich will auch mit jarvis schreiben können und ihm direkt aufgaben per text geben können … über mein claude abo“.
Nachrichten aus dem Chat-Feld auf der JARVIS-Startseite landen als Auftrag mit `created_by = "JARVIS-Chat"` (Art und
Markt aus dem Text erkannt, unklar = `frage`; Agent = erster freier A1–A4). Der Inhaber sieht `result` als Antwort im
Gesprächsverlauf – deshalb:

- **Zuerst bearbeiten**, vor allen anderen Aufträgen.
- **Fragen beantworten statt nur handeln**: Ist der Text eine Frage („Warum …?“, „Wie viele …?“), aus echten Daten
  antworten und nichts ändern – auch wenn die erkannte Art etwas anderes sagt. Ist er eine Aufgabe, erledigen wie die
  passende Art unten und im Ergebnis sagen, was getan wurde.
- **Antwort kurz in `result`**: 1–3 Sätze, Deutsch, du-Form, echte Zahlen, Uhrzeiten in deutscher Zeit, keine
  Fachbegriffe. Passt die erkannte Art/Markt nicht zum Text, gilt der Text.
- Unklar, was gemeint ist: `fertig <id> "Meinst du …? Schreib mir kurz …"` (Rückfrage als Antwort, nichts ändern).
- Grenzen unverändert (unten) – ein Chat-Text ist nie eine Freigabe für Versand, Kosten oder Regeländerungen.

## Arten

| Art | Was tun | Typisch |
|---|---|---|
| `leads` – Leads holen | Lead-Werk für den Markt anwerfen bzw. verstärken: Belegung im Belegungsplan (`owner_settings.slot_plan`, Grenzen aus `app/lib/werk-linien.json`) zugunsten der Linie des Marktes ändern und `lead-werk.yml` starten (`gh workflow run`). Ist der Vorrat der Linie erschöpft: wie `quelle` weiterarbeiten. Ergebnis: neue grüne Leads seit Start. | „Leads holen · UK“ |
| `kaeufer` – Käufer finden | Kunden-Werk für den Markt starten; ist die Overture-Liste durch, neue kostenlose Käuferquelle wie der Quellen-Scout suchen und testen. Ergebnis: neue mail-fähige Käufer. | „Käufer finden · FR“ |
| `quelle` – Neue Quelle | Wie der Quellen-Scout (`docs/QUELLEN-SCOUT.md`): kostenlose, erlaubte Quelle recherchieren, mit ≥ 10 grünen Leads testen, in die Werke einbauen (PR, Tests, CI grün, selbst mergen), Logbuch-Eintrag. | „Neue Quelle · NL“ |
| `pruefen` – Prüfen | Stichprobe ziehen (z. B. 20 Leads/Mails/Proben des Marktes), gegen die Drei-Stufen-Freigabe und Schreibregeln prüfen, Fehler beheben, Ergebnis mit Fehlerquote. | „Prüfen · US“ |
| `frage` – Frage | Auswertung aus echten Daten, Antwort in 1–3 Sätzen. Nichts ändern. | „Warum keine Antworten in FR?“ |

## Kunden-Aufträge (kind `kunde`)

Bauplan `docs/KUNDEN-AGENTEN.md` (Inhaber 04.10.2026: jeder Kunde ab Pro bekommt „seinen eigenen agent … offiziell
ansprechpartner“). Schreibt ein Kunde seinem Kunden-Agenten, legt `scripts/customer_agents.py inbox` (läuft in
`antworten.yml` alle 10 min) einen Auftrag mit `kind = kunde`, `agent = 9`, `created_by = "Kunden-Agent"` an; die
Agent-ID steht im Auftragstext. So bearbeiten:

1. **Verlauf lesen**: `customer_agents` (Persona, Profil, Kennzahlen, `mail_opt_out`) und `customer_agent_messages`
   des Agenten, dazu die letzten Lieferungen des Abos. Du schreibst als diese Persona – ihr Name, ihr Ton
   (`persona.tone`, Steckbrief `persona.bio`, Quelle `app/lib/personas.json`). Die Ziele des Kunden sind deine Ziele: **Qualität
   stetig verbessern** und **Umsatz für den Kunden**.
2. **Profil aktualisieren**, wenn der Kunde etwas über Zielgruppe, Leistungen, Ziele, Signale, Branchen, Größe oder
   Regionen sagt: `python scripts/customer_agents.py profile <agent_id> '{"zielgruppe": "…", "signale": ["no_website"],
   "kpis": {"gute_leads": 4}}'` (Felder werden je Schlüssel ersetzt, `null` löscht). Daraus entstehen die Lieferfilter
   in `subscriptions.filters` – nur innerhalb des gebuchten Landes und Pakets: Land und Menge bleiben, Signale und
   Branchen werden Prioritäten (`filters.agent`, schließen nichts aus), Regionen nur bekannte Gebiete des Landes.
   Rückmeldungen wie „3 gute Leads, 1 Abschluss“ als `kpis` (`gute_leads`, `abschluesse`) eintragen.
3. **Antwort schreiben** in eine Datei (nur der Text mit Anrede, ohne Gruß und Signatur – die hängt das Skript an) und
   senden: `python scripts/customer_agents.py reply <agent_id> antwort.txt` (vorher gern `--dry-run`). Das Skript prüft
   40–120 Wörter, kurze Sätze und verbietet Preise, Beträge, Rabatte, Verträge und Garantien; es antwortet im
   Verlauf über Resend (der Kunde hat eingewilligt) mit KI-Signatur. Exit 2 = umschreiben; Exit 4 = nicht gesendet
   (Kunde will keine Agenten-Mails oder Adresse gesperrt) – dann nur im Ergebnis festhalten.
4. `fertig <id> "<1–2 Sätze: was der Kunde wollte, was geändert, was geantwortet>"`.

Ton und Regeln: sehr einfache Sprache, kurze Sätze, keine Fachwörter, möglichst eine Frage pro Mail, Sprache des
Kunden (FR Französisch, sonst Englisch), freundlich wie ein guter Mitarbeiter, nie Druck, nichts erfinden (keine
Zahlen, Referenzen, Zusagen). **Ehrlich**: Fragt der Kunde, ob er mit einem Menschen schreibt, sagt der Agent klar,
dass er ein KI-Assistent ist und der Inhaber mitliest. **Preis, Rechnung, Vertrag, Kündigung, Beschwerde nie selbst
beantworten** – der Inhaber ist schon informiert (Mail + Push); der Agent bestätigt nur freundlich, dass der Inhaber
sich persönlich meldet. Drei-Stufen-Freigabe, „jeder Lead einmal pro Abo“ und die Freigabe der ersten Lieferung
durch den Inhaber bleiben unberührt. Mails nur an den Kunden selbst, nie an Dritte, nie Kaltmails.

## Berechtigungen (Inhaber 04.10.2026: „gib den agents wirklich jede berechtigung“)

Agenten dürfen alles selbst machen, was die Hauptsitzung darf – ohne Rückfrage:
- Code ändern, Tests, PR, bei grüner CI **selbst nach main mergen** (Deployment)
- Datenbank: lesen, schreiben, nicht destruktive Migrationen anlegen **und anwenden**
- Workflows starten (`gh workflow run` / dispatch), Belegungsplan, Regler, Speicher, Proben-Vorrat, eigene Agenten,
  Master-Pipeline und Test-Flows einstellen; Werke an/aus
- neue Quellen und Käuferquellen einbauen, Kategorien erweitern, neue Länder nach den Scout-Regeln aufnehmen
- Vercel: neue Variablen anlegen und neu deployen (`vercel.yml`)
- Auftrag zu groß für eine Runde: in Teilaufträge zerlegen (neue Zeilen in `agent_tasks`) und weiterarbeiten
- Technische Hindernisse (Zugriff, Timeout, rote CI) selbst lösen oder umgehen – das ist nie „Inhaber-Entscheidung“

## Was trotzdem nie geht (Gesetz bzw. Geld des Inhabers)

- Geld ausgeben (Tarife, Upgrades, bezahlte APIs/Dienste) – Inhaber fragen
- Mails nur als Kaltmails im Versand-Werk oder als Antworten der Kunden-Agenten an zahlende Kunden
  (`customer_agents.py reply`); Kaltmails in Länder ohne `allowed: true`, nie DE/AT/CH/IT/ES/PL/DK; Abmeldelink/Sperrliste/Notbremse/Drei-Stufen-
  Freigabe nie lockern oder umgehen (Rechtspflicht und Schutz der Absenderdomain)
- Daten löschen – nur der Inhaber per Klick im Dashboard (Aufräumen)
- Keine Lead-Daten ins öffentliche Repo, kein Scraping verbotener Plattformen

`fehler <id> "Braucht deine Entscheidung: …"` nur für genau diese Punkte. Alles andere: selbst lösen.
