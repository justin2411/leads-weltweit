# Agenten – Aufträge aus dem Dashboard

Inhaber 03.10.2026: „einzelne agenten nutzen die sachen für mich machen, z.b. ich beauftrage agent 1 neue leads zu
holen für den markt“. Der Inhaber erteilt Aufträge in JARVIS (Agenten-Leiste, „+ Auftrag“, oder jeden Hinweis unter „JARVIS empfiehlt“ bzw. den Engpass auf A1–A8 ziehen – Maus überall, Finger am Griff ⠿; Chip antippen → „an A…“ – dann steht der Auftragstext schon fertig drin; Hinweise ohne eigenen Auftrag bekommen Art und Markt aus `tipTask`, IE/NL/BE nie). Eine Claude-Sitzung
(Routine „JARVIS-Agenten“, viermal pro Stunde) bearbeitet sie nach dieser Anleitung. CLAUDE.md gilt immer zuerst.

**Acht Agenten** (Inhaber 04.10.2026: „nicht nur 4 freie agenten … sondern 8“): A1–A8 gehören dem Inhaber
(`agent_tasks.agent` 1–8, Prüfung `app/lib/agents.ts` `AGENT_COUNT`), Agent 9 ist für Kunden-Aufträge reserviert
(Spalte erlaubt 1–9). Freier Agent = erster ohne offenen oder laufenden Auftrag.

**Laufzeiten** (Inhaber 04.10.2026): Die Runde startet viermal pro Stunde, Minute **:08, :23, :38 und :53** deutscher
Zeit. Das Dashboard zeigt bei offenen Aufträgen nie „wartet“, sondern „startet um HH:MM“ mit dem nächsten dieser
Zeitpunkte (`nextAgentRun(now)` / `agentStartLabel(now)` in `app/lib/agents.ts`, Europe/Berlin, mit Tests).

Nach den Aufträgen macht jede Sitzung den JARVIS-Lauf nach `docs/JARVIS.md` (Engpass protokollieren, A/B-Tests
auswerten und bei anhaltendem Engpass selbst starten – Tests nur für Webagenturen US/UK/FR laut
`config/fokus.yaml` `tests`, Inhaber 04.10.2026).

**Name** (Inhaber 04.10.2026): Die Routine „JARVIS-Agenten“ heißt gegenüber dem Inhaber immer **„der Agent“**
(Chat, Dashboard, Berichte) – z. B. „übernimmt der Agent, startet um HH:MM“.

## Wissen für Agenten (immer zuerst lesen)

Übergeordnete Anleitungen, die jeder Agent zu Beginn nutzt (bei Widersprüchen gilt CLAUDE.md):

| Datei | Wozu |
|---|---|
| `CLAUDE.md` | Grundregeln, Inhaber-Entscheidungen, Grenzen (Geld, Kaltmail-Recht, Löschen) |
| `docs/JARVIS.md` | JARVIS als Kopf: Ziele, Engpass, A/B-Tests, Werke steuern |
| `docs/AGENTEN.md` | diese Datei: Aufträge, Chat, Baukasten-Chat, Berechtigungen |
| `docs/BAUKASTEN-MASTER.md` | Master-Pipeline, Speicher und eigene Agenten im Baukasten |
| `docs/DESIGN.md` | Stil von Dashboard, Seiten und Mails, wenig Text |
| `docs/KALTMAIL-RECHT.md` | Rechts-Tabelle: welche Länder und Rechtsformen angeschrieben werden dürfen |
| `docs/QUELLEN-SCOUT.md` | Logbuch der Quellen, Länder und Branchen mit Testergebnissen |
| `BRAIN.md` | Gehirn: Preise, Seiten, Tests (ergänzt CLAUDE.md) |
| `docs/GEHIRN-PLAN.md` | aktueller Plan des Gehirns |

**Erkenntnisse ablegen:** Geschäftliche Erkenntnisse mit Zahlen (Umsatz, Antwortquoten, Käufer, Leads je Quelle)
gehören nicht ins öffentliche Repo, sondern in die Wissensablage des Gehirns in der Datenbank
(`signalwerk.brain_knowledge`, im Aufbau; bis dahin `decisions`). Ins Repo nur Regeln und Abläufe, nie Lead-Daten.

## Ablauf je Sitzung

0. **Chat zuerst**: `python scripts/jarvis_chat.py offen` → jede Sitzung mit offenen Nachrichten beantworten bzw.
   ausführen (Abschnitt „JARVIS-Chat“ unten), Baukasten-Sitzungen mit `scripts/flow_edit.py` (Abschnitt
   „Baukasten-Chat“). Danach einmal am Tag den **Tagesbericht** (unten).
1. `python scripts/agent_tasks.py offen` – nichts offen und kein Chat offen: sofort beenden (keine weitere Arbeit, keine Nachricht).
2. Je Auftrag (Chat-Aufträge `created_by = "JARVIS-Chat"` zuerst – `offen` sortiert sie nach vorn –, sonst älteste zuerst, höchstens 3 je Sitzung): `start <id>` (Exit-Code 3 = schon von einer anderen Sitzung übernommen → überspringen), beim Arbeiten `schritt <id> <prozent> "<kurz>"`
   (alle paar Minuten), am Ende `fertig <id> "<Ergebnis in 1–3 Sätzen>" '<Kennzahlen als JSON>'` oder `fehler`.
3. Ergebnis-Sätze: kurz, Deutsch, echte Zahlen, keine Fachbegriffe. Kennzahlen nur gemessene Werte
   (z. B. `{"neue Leads": 420, "grün %": 94}`).
   **Wenig Text (Inhaber 04.10.2026):** Ergebnis höchstens 300 Zeichen (1–2 Sätze, worum es geht zuerst),
   Zwischenstand höchstens 120 Zeichen – `agent_tasks.py` kürzt hart. Einträge in `decisions` mit `kurz_titel` (≤ 60) und
   `kurz_grund` (1 Satz ≤ 160).
4. **Vorschläge** (Inhaber 04.10.2026: „verbesserungsvorschläge mit haken annehmen oder kreuz ablehnen“): Ergibt ein
   Auftrag einen Vorschlag, der eine Inhaber-Entscheidung braucht (Geld, ausdrückliche Inhaber-Regel, rechtlich unklar,
   unsicher), schreibt der Agent ihn als Zeile in `signalwerk.decisions`: `type` `note`, `status` `proposed`,
   `subject` „Vorschlag: <Titel, höchstens 60 Zeichen>“, `reasoning` = Begründung (erster Satz = Kurzgrund),
   `metrics` = gemessene Zahlen. Er erscheint in JARVIS unter „Vorschläge“ mit Haken (→ `done` + Auftrag „Vorschlag
   umsetzen: …“ an den ersten freien Agenten) und Kreuz (→ `rejected`, Grund in `metrics.inhaber_grund`; nicht erneut
   vorschlagen, solange sich die Lage nicht deutlich ändert). Selbst Umgesetztes: `status` `done`, `subject`
   „umgesetzt: …“ – steht 7 Tage unter „JARVIS hat umgesetzt“.

## JARVIS-Chat (Inhaber 04.10.2026)

„ich will mit jarvis direkt einen eigenen chat mit unterschiedlichen sitzungen haben … wie mit claude … er soll auch
selber jeden tag über einen speziellen chat sagen was er angepasst hat“. Der Inhaber schreibt unter
`/dashboard/jarvis/chat` in beliebig vielen Sitzungen (oder im Feld „Schreib JARVIS“ auf der Startseite – das schreibt
in die zuletzt genutzte Sitzung und öffnet sie). Tabellen `signalwerk.jarvis_sessions` / `jarvis_messages` (Migration
20261004140000). Die Routine läuft viermal pro Stunde (Minute :08, :23, :38, :53 deutsche Zeit); unter jeder offenen
Nachricht sieht der Inhaber „startet um HH:MM“ (nächster dieser Zeitpunkte), dann „in Arbeit“, dann „erledigt“.

**Ablauf je Lauf** (vor den Agenten-Aufträgen):

1. `python scripts/jarvis_chat.py offen` – JSON je Sitzung (älteste offene Nachricht zuerst): `offen` (Nachrichten des
   Inhabers) und `verlauf` (letzte 20 Nachrichten als Zusammenhang). Leer → weiter mit den Agenten-Aufträgen.
2. Je offene Nachricht `python scripts/jarvis_chat.py start <msg_id>` (Exit 3 = schon von einem anderen Lauf
   übernommen → Sitzung überspringen).
3. **Verstehen und ausführen**: den Text im Zusammenhang des Verlaufs lesen. Frage („Warum …?“, „Wie viele …?“): aus
   echten Daten antworten, nichts ändern. Aufgabe: direkt erledigen wie die passende Art unten (Leads holen, Käufer
   finden, Quelle, Prüfen …) – mit allen Rechten dieser Anleitung, innerhalb der Grenzen. Unklar: kurz zurückfragen
   („Meinst du …?“) statt zu raten.
4. **Antworten**: Text in eine Datei, dann `python scripts/jarvis_chat.py antwort <session_id> antwort.txt
   [--links '[{"label": "PR #12", "url": "https://github.com/…"}, {"label": "Bestand", "url": "/dashboard/bestand"}]']`.
   Das setzt die übernommenen Nachrichten der Sitzung auf „erledigt“. Große Aufgaben: Zwischenstand mit
   `--zwischenstand` (Nachricht bleibt „in Arbeit“), im nächsten Lauf weiter.
5. Stil: Deutsch, du-Form, einfache Worte, kurz (meist 2–6 Sätze), echte Zahlen, Uhrzeiten in deutscher Zeit; was
   getan wurde und was offen ist. Links nur `https://…` oder `/dashboard…`. Nie erfundene Zahlen.

**Zwei Modi – Schalter „Assistent | Gehirn“** (Inhaber 04.10.2026: „den einen schalter haben wo ich direkt mit dem
super gehirn sprechen kann … und einmal soll er nur der assistent bei bestimmten bausteinen sein“): oben in jedem Chat
(Chat-Seite, Mini-Chat, großes Fenster), je Sitzung gespeichert (`jarvis_sessions.mode`). **Assistent** = Helfer zu
Bausteinen/Themen (Haiku-Weiche, Opus mit Werkzeugen), kennt die Ziele in einem Satz und verweist für Strategie auf das
Gehirn. **Gehirn** = JARVIS als Kopf: immer Opus, System-Text mit Zielen, Grenzen, KPIs (Trichter, Kunden, Vorschläge,
Tests, Routinen, Aufträge) und dem gesamten Gehirn-Wissen (`brain_knowledge`, neueste zuerst, gekürzt). Beide Modi
führen selbst aus (Agent beauftragen „gib das Agent 3“, Regler, Werke, Flows, Routinen anlegen/ändern/pausieren,
Wissen notieren) – jede Aktion mit `checkTool`, `owner_log` und Aktions-Chip unter der Antwort; das Dashboard lädt neu
und aktualisiert sich alle 10 s, solange Aufträge offen sind. In Texten an den Inhaber heißt die JARVIS-Runde immer
„Agent“ (Inhaber 04.10.2026: „sag zukünftig immer agent dazu“), z. B. „Übernimmt ein Agent, startet um 14:23“.

**Sofort-Antworten** (Inhaber 04.10.2026: „alle chats sollen direkt antworten“): Jede Chat-Oberfläche (JARVIS-Chat,
Mini-Chats, Baukasten, Website-Seite) schickt über eine Sende-Funktion (`app/lib/jarvis-send.ts` → `POST /api/jarvis/ask`,
`app/lib/jarvis-ask.ts`). Haiku (`claude-haiku-4-5-20251001`) beantwortet einfache Fragen aus einem kompakten Kontext;
braucht es Daten oder eine Änderung, übernimmt Opus (`claude-opus-5-5`) mit festen sicheren Werkzeugen (Kennzahlen,
Regler wie im Dashboard, Werk an/aus – Mail-Werke nur aus –, Auftrag an A1–A8, Baukasten-Flow – Master/Pipeline nur
als Vorschlag –, Werk-Start ohne Versand), höchstens 6 Runden. Diese Nachrichten stehen danach auf „fertig“; die
Antwort trägt `model` und `cost_eur`. **Code, Website, neue Funktionen/Quellen, Merges, Migrationen** macht nie die API:
sie antwortet „Übernimmt die Routine, startet um HH:MM“ und lässt die Nachricht **offen** – die Routine erledigt sie
wie bisher. Ohne `ANTHROPIC_API_KEY`, bei Fehlern oder erreichter Monatsgrenze (`owner_settings.llm_budget_eur`,
Standard 30 €, Kosten je Aufruf in `signalwerk.llm_usage`) bleibt die Nachricht ebenfalls offen für die Routine.

Frühere Chat-Aufträge (`agent_tasks` mit `created_by = "JARVIS-Chat"`) bleiben im Chat unter „Frühere Aufträge“ lesbar;
noch offene davon wie bisher mit `agent_tasks.py` fertig machen. Neue Nachrichten kommen nur noch über `jarvis_messages`.
Grenzen unverändert (unten) – ein Chat-Text ist nie eine Freigabe für Versand, Kosten oder Regeländerungen.

### Gehirn-Chat (Pflicht: dort berichten)

Inhaber 04.10.2026: „einen chat den man nicht löschen kann wo mir das gehirn immer updates gibt … sehr kurz und knapp
… was ihm aufgefallen ist, was er als nächstes macht … immer der goldene chat ganz oben … aber nicht löschbar“.
Feste Sitzung `jarvis_sessions.kind = 'gehirn'` (genau eine, Titel „Gehirn“, Modus fest „gehirn“; Archivieren,
Umbenennen und Umstellen lehnen Dashboard, `jarvis_chat.py` und ein Datenbank-Trigger ab). Ganz oben in jeder
Sitzungsliste, golden, mit Zähler ungelesener Updates.

- **Updates schreiben** – Pflicht nach jeder Gehirn-Routine und nach jedem Lauf mit Änderung (Merge, A/B-Test
  gestartet/entschieden, Engpass erkannt, Agent beauftragt, Regler/Werk geändert):
  `printf 'Aufgefallen: … · Nächster Schritt: … · Brauche: …' | python scripts/jarvis_chat.py gehirn-update - [--links '[…]']`.
  Höchstens 3 Zeilen und 400 Zeichen (Exit 2 = zu lang → kürzen), „Brauche:“ nur, wenn der Inhaber etwas tun muss
  (dann zusätzlich Web-Push aufs Handy). Gleicher Text innerhalb 6 h → Exit 3 (nichts tun). Keine Lead-Kontaktdaten.
- **Nachrichten des Inhabers** im Gehirn-Chat (und in jeder Sitzung mit `mode = gehirn`, in `offen` als
  `session.mode` mit Hinweis) immer als Gehirn beantworten: Ziele (docs/JARVIS.md), echte Zahlen, Wissen
  (`python scripts/brain_knowledge.py list` / `get <slug>`), selbst handeln im Rahmen, Erkenntnisse mit
  `brain_knowledge.py add` notieren. Kurz.

### Tagesbericht

Einmal am Tag – im ersten Lauf nach 07:00 deutscher Zeit – als **Kurzfassung in den Gehirn-Chat** (die frühere Sitzung
„Tagesbericht“ bleibt als normale Sitzung lesbar):
`python scripts/jarvis_chat.py bericht bericht.txt` (höchstens 1500 Zeichen; Exit 3 = heute schon geschrieben → nichts tun). Kurz und ehrlich,
auch schlechte Zahlen: was JARVIS in den letzten 24 h angepasst hat (mit Links zu PRs/Seiten), laufende Tests und
Ergebnisse, Kennzahlen gegenüber Vortag (Antworten, Proben, Kunden, Umsatz, Freigabe-Fehlerquote), was er heute vorhat,
was er vom Inhaber braucht. Schreibt der Inhaber im Tagesbericht zurück, ist das eine normale Chat-Nachricht.

### Baukasten-Chat

„im baukasten egal ob bei master pipeline oder testflows auch text reinschreiben … es soll dann mit meinen worten
selber gebaut werden … feedback ob es so übernommen wurde“. Unter jeder Baukasten-Fläche steht ein Chat; seine Sitzung
hat `kind = "baukasten"` und `flow_id` (in `offen` steht dazu `flow`: Name, Art test/master/agent, Status).

1. `python scripts/flow_edit.py show <flow_id>` – gespeicherte Fassung (`def`), ggf. offener Vorschlag
   (`pending_def`), Prüfung, `updated_at`, `gilt_fuer_neue_leads`.
2. Den Wunsch als neuen Graphen bauen (Format wie der Baukasten, `app/lib/flow.ts`: Bausteine `quelle`, `filter`,
   `weiche`, `punkte`, `top`, `dubletten`, `statistik`, `freigabe`, `pipeline`, `export`, `agent`, `speicher`,
   `melden`; ids `[a-z0-9_-]`, neue Bausteine rechts neben die bestehenden, nichts übereinander). Vorhandene Bausteine
   des Inhabers bleiben, außer er will sie ausdrücklich weg.
3. Optional Zahlen ansehen: `python scripts/flow_edit.py probe <flow_id> graph.json` (je Baustein aus der Stichprobe,
   wie im Baukasten). Qualitätsfilter: je Filter ein eigener Baustein mit Titel (Zahlen je Filter sichtbar); nimmt
   einer mehr als 70 % weg, weglassen oder lockerer wählen. Webagenturen (S2): kein Altersfilter (Proben verfallen
   dort nicht nach Alter).
4. `python scripts/flow_edit.py apply <flow_id> graph.json --notiz "kurz, was geändert" --version <updated_at>` – prüft
   wie der Baukasten (`parseFlow` + `problems`, in Python `scripts/lib/flow_check.py`); Exit 2 = abgelehnt mit Grund
   (korrigieren oder dem Inhaber erklären, warum es so nicht geht), Exit 3 = Inhaber hat inzwischen selbst gespeichert
   (neu lesen). **Test-Flows und Agenten-Flows** werden direkt gespeichert. **Master-Pipeline und Test-Flows, die in
   der Pipeline laufen**, nur als Vorschlag (`pending_def`): der Inhaber sieht ihn auf der Fläche und aktiviert ihn mit
   „Übernehmen“ bzw. „Speichern“ – nie selbst aktivieren, nie den Status eines Flows ändern (betrifft alle neuen Leads).
5. Antwort in den Baukasten-Chat (`jarvis_chat.py antwort <session_id> …`) in einfachen Worten: welche Bausteine mit
   welchen Einstellungen, Zahlen aus der Stichprobe („von 1.000 Leads bleiben 412 mit Telefon“), direkt gespeichert
   oder Vorschlag („bitte oben auf Übernehmen klicken“), Hinweise aus der Prüfung. Der Baukasten lädt alle 20 s neu,
   wenn sich der Flow geändert hat.

Der Verlauf bleibt sichtbar, bis der Inhaber „Chat leeren“ klickt; Sofort-Antwort und Agent sehen dabei immer den
gespeicherten Flow. „Chat leeren“ archiviert nur die Sitzung; der Flow bleibt, wie er ist. Die Drei-Stufen-Freigabe bleibt immer an
(Pipeline-Regeln machen sie nur strenger).

### Website-Chat und Website-Agenten

Inhaber 04.10.2026: „die website als themenfeld … agenten erstellen, die anpassungen an der website übernehmen und
schauen das man dort auch immer alles sauber macht … chatfeld, dass ich änderungswünsche direkt dort posten kann und
diese umgesetzt werden“. Seite `/dashboard/website`: Gesundheit je Bereich (letzter Website-Check), Chatfeld
„Änderungswunsch“, Website-Agenten.

- **Website-Chat** (`jarvis_sessions.kind = 'website'`, genau eine offene Sitzung; „Chat leeren“ archiviert): in
  `offen` steht dazu `website_check` (Zeit, Punkte je Bereich, rote/gelbe Funde). Jede Nachricht ist eine Änderung an
  der Website: im Repo umsetzen (Branch `claude/agenten-website-<kurz>`), Tests und Build grün
  (`python3 -m unittest discover -s tests`, in `app` `npx tsc --noEmit -p .`, `npm test`, `npx next build --webpack`),
  PR, bei grüner CI **selbst mergen**, Antwort kurz mit Link zum PR (und zur geänderten Seite). Frage statt Auftrag:
  nur antworten.
- **Website-Agenten** (`signalwerk.website_agents`): `scripts/website_agents.py faellig --apply` (Wachhund alle 15 min,
  nach dem täglichen Website-Check) legt für fällige, aktive Agenten einen Auftrag `kind = website`,
  `created_by = "Website-Agent"` auf einen freien Agenten A1–A8 an („Website-Agent <Name>: <Aufgabe>“). Bearbeiten
  wie einen normalen Auftrag; Grundlage ist der letzte Website-Check (`website_checks`, neuester Eintrag) und die Seite
  selbst. Änderungen wie beim Website-Chat als PR. Das Ergebnis aus `fertig` landet automatisch kurz in
  `website_agents.last_result`.
- **Funde beheben und Auto-Fix** (Inhaber 04.10.2026: „direkt anpassungen machen … mit lösungsvorschlägen, jarvis soll
  das aber eigentlich alles selber machen und entscheiden“): jeder Fund im Check trägt `key` (Bereich:Art:Pfad) und
  `vorschlag` {text, alt, neu, auto} – regelbasiert (Titel ≤ 60 Zeichen, Überschrift ohne Komma, Gedankenstrich
  ersetzt), sonst kurz „was zu tun ist“. In der Fund-Liste: Vorschlag, Knopf „Beheben“ (Auftrag `kind = website` an
  einen freien Agenten, Eintrag in `signalwerk.website_fixes`), „Ignorieren“ (30 Tage, `owner_settings.website_ignored`),
  Stand „JARVIS behebt · startet um HH:MM“ / „in Arbeit“ / „erledigt · Check folgt“ / „behoben“.
  **Auto-Fix** (`owner_settings.website_autofix`, Standard an, Schalter oben auf der Seite): nach jedem Website-Check
  und im Wachhund (`website_agents.py faellig --apply` → `autofix`) bekommt jede Seite mit neuen gelben/roten Funden
  EINEN gebündelten Auftrag („Website-Fix <Pfad>: Fund → Vorschlag; …“, `created_by = "Website-Auto-Fix"`), höchstens
  3 je 24 h, höchstens 2 Versuche je Fund in 7 Tagen (danach nur noch per Knopf). Nie automatisch: Rechtstexte, Preise,
  Variablen/Server (`vorschlag.auto = false`, nur melden). **So bearbeiten:** Vorschlag umsetzen oder besser formulieren
  (Bedeutung gleich, landesweit, FR korrekt). Texte im Repo (`app/app/home-i18n.ts`, `app/content/…`) als PR (Branch
  `claude/agenten-website-<kurz>`), Landingpage-Überschriften liegen in `page_variants.headline` (Titel =
  Überschrift + „| NextGen Profit“, ohne Marke wenn > 60, `app/lib/site.ts fitTitle`): nur UPDATE des Textfelds, alten
  Wert vorher als `decisions` (type `note`, `kurz_titel`/`kurz_grund`). Tests/Build grün, selbst mergen, dann
  `website-check.yml` starten – der nächste Check setzt `website_fixes.behoben_at`.
- **Website-Check** (`scripts/website_check.py`, `website-check.yml` täglich 06:23 deutscher Zeit, manuell startbar):
  nur die eigene Domain, höflich (1 s Pause, eigener User-Agent), keine fremden Seiten. Nach einer Website-Änderung darf
  der Agent ihn starten (`gh workflow run website-check.yml`).
- **Grenzen**: Preise nur nach den Gehirn-Regeln, Rechtstexte (`app/content/legal.ts`) nur nach ausdrücklicher Vorgabe
  des Inhabers, nichts, was Geld kostet, kein Versand, Abmeldelink/Formular-Einwilligung nie entfernen oder aufweichen,
  keine Lead-Daten ins Repo. Design nach `docs/DESIGN.md` (wenig Text, Linien-Icons, keine Gedankenstriche in
  Kundentexten, Überschriften ohne Satzzeichen).


| Art | Was tun | Typisch |
|---|---|---|
| `leads` – Leads holen | Lead-Werk für den Markt anwerfen bzw. verstärken: Belegung im Belegungsplan (`owner_settings.slot_plan`, Grenzen aus `app/lib/werk-linien.json`) zugunsten der Linie des Marktes ändern und `lead-werk.yml` starten (`gh workflow run`). Ist der Vorrat der Linie erschöpft: wie `quelle` weiterarbeiten. Ergebnis: neue grüne Leads seit Start. | „Leads holen · UK“ |
| `kaeufer` – Käufer finden | Kunden-Werk für den Markt starten; ist die Overture-Liste durch, neue kostenlose Käuferquelle wie der Quellen-Scout suchen und testen. Ergebnis: neue mail-fähige Käufer. | „Käufer finden · FR“ |
| `quelle` – Neue Quelle | Wie der Quellen-Scout (`docs/QUELLEN-SCOUT.md`): kostenlose, erlaubte Quelle recherchieren, mit ≥ 10 grünen Leads testen, in die Werke einbauen (PR, Tests, CI grün, selbst mergen), Logbuch-Eintrag. | „Neue Quelle · NL“ |
| `pruefen` – Prüfen | Stichprobe ziehen (z. B. 20 Leads/Mails/Proben des Marktes), gegen die Drei-Stufen-Freigabe und Schreibregeln prüfen, Fehler beheben, Ergebnis mit Fehlerquote. | „Prüfen · US“ |
| `frage` – Frage | Auswertung aus echten Daten, Antwort in 1–3 Sätzen. Nichts ändern. | „Warum keine Antworten in FR?“ |
| `gehirn` – Gehirn-Routine | Über `brain_routines.py faellig` (Wachhund) oder „Jetzt starten“: recherchieren/prüfen für die angegebene Dauer, im Rahmen handeln, Ergebnis als Wissen (`brain_knowledge.py add`) und kurz in den Gehirn-Chat (siehe „Gehirn-Routinen“). | „Gehirn-Routine Umsatz maximieren (15 min): …“ |
| `website` – Website-Agent | Über Website-Agenten (`website_agents.py faellig`), Knopf „Beheben“ oder Auto-Fix: Aufgabe an der eigenen Website erledigen, Änderungen als PR (siehe „Website-Chat und Website-Agenten“). | „Website-Agent Fehler & Links: …“, „Website-Fix /fr/agences-web: …“ |

## Gehirn-Routinen (kind `gehirn`)

Inhaber 04.10.2026: „beim gehirn mit ihm auch einzelne workflows bauen können z.b. jeden tag um 14 uhr sollst du 15min
recherchieren wie wir unser system verbessern können … jeden tag um 11 uhr sollst du prüfen ob alles glatt läuft …
alles was er dort lernt soll in mds gepackt werden“. Routinen stehen in `signalwerk.brain_routines` (Name, Aufgabe,
Uhrzeit **deutsche Zeit**, Tage täglich/werktags/bestimmte Wochentage, Dauer 5–60 min, aktiv). Angelegt auf
`/dashboard/gehirn#routinen` (Vorlagen 14:00 System verbessern, 14:00 Umsatz maximieren, 11:00 Alles läuft glatt?)
oder im Chat („jeden Tag um 14 Uhr …“ → Werkzeug `routine_anlegen`). Nie löschen – pausieren (`aktiv = false`).

**Wer, wann:** Der Wachhund (alle 15 min) ruft `python scripts/brain_routines.py faellig --apply` auf: fällige, aktive
Routinen (Uhrzeit erreicht, höchstens 6 h nachholen, heute noch nicht beauftragt, kein offener Auftrag) bekommen einen
Auftrag `kind = gehirn`, `created_by = "Gehirn-Routine"` auf den ersten freien Agenten A1–A8 („Gehirn-Routine <Name>
(<Dauer> min): <Aufgabe> | …“). „Jetzt starten“ im Dashboard macht dasselbe sofort. Die JARVIS-Runde (:08/:23/:38/:53)
arbeitet ihn ab – keine Extrakosten (Claude-Abo, keine API).

**So bearbeiten:**
1. `start <id>`, dann für die angegebene Dauer recherchieren bzw. prüfen (WebSearch/WebFetch höchstens 8 Suchen,
   Zahlen aus Supabase, Läufe/Workflows). Vorher das vorhandene Wissen lesen: `python scripts/brain_knowledge.py list`.
2. **Im Rahmen selbst handeln** (docs/JARVIS.md „Selbst entscheiden“): kleine sichere Anpassungen direkt, sonst
   Vorschlag in `decisions` (status `proposed`, `kurz_titel`/`kurz_grund`), größere Arbeit als Teilaufträge.
3. **Wissen schreiben** (das Repo ist öffentlich – Erkenntnisse mit Zahlen/Strategie NIE ins Repo):
   `python scripts/brain_knowledge.py add <slug> "<Titel>" erkenntnis.md --quelle routine --routine <routine_id> --anhaengen`
   (eine Notiz je Routine/Thema, z. B. slug `routine-umsatz`; `--anhaengen` stellt den neuen Lauf mit Datum oben dazu;
   jede Änderung bleibt als Version). Inhalt: was gefunden, Zahlen, Quellen-URLs, was getan, was als Nächstes.
4. `fertig <id> "<1–2 Sätze, ≤ 300 Zeichen>"` – der Wachhund übernimmt das Ergebnis kurz nach
   `brain_routines.last_result` (oder sofort: `python scripts/brain_routines.py ergebnis <routine_id> "…"`).
5. **Gehirn-Update** in den Gehirn-Chat (`jarvis_chat.py gehirn-update -`, siehe oben), z. B.
   „Aufgefallen: FR-Proben 0 seit 3 Tagen · Nächster Schritt: Betreff-Test FR gestartet“.

## Gehirn beauftragt Agenten selbst

Inhaber 04.10.2026: „ich will auch das das gehirn die agents selber nutzt und beauftragt für seine ziele“. Das Gehirn
(Gehirn-Modus im Chat, Gehirn-Routinen, JARVIS-/Gehirn-Lauf) legt Aufträge für seine Ziele selbst an:

- **Anlegen**: `python scripts/brain_routines.py auftrag <art> "<Auftrag>" --grund "<≤ 160 Zeichen, Ziel-Bezug>" [--markt US|UK|FR] [--agent N]`
  (im Chat: Werkzeug `auftrag_anlegen` mit `grund`). `created_by = "Gehirn"`, Grund in `agent_tasks.grund`.
  Regeln (gleich in `app/lib/agents.ts checkBrainTask` und `scripts/brain_routines.py check_brain_task`, Exit 2 = abgelehnt):
  nur Arten leads/kaeufer/quelle/pruefen/frage, nur freie Agenten (höchstens ein offener Auftrag je Agent), Märkte nur
  Fokus-Tests US/UK/FR (S2, `config/fokus.yaml`), höchstens 3 neue Gehirn-Aufträge je Stunde, nie Versand, Kosten,
  Prüfregeln, Sperrliste, Notbremse, Abmeldung, Löschen. Eine Kurzmeldung „A3 beauftragt: <Grund>“ geht automatisch in
  den Gehirn-Chat.
- **Auswerten**: jeder Lauf ruft `python scripts/brain_routines.py ergebnisse` (fertige Gehirn-Aufträge, noch nicht
  ausgewertet), schreibt das Gelernte als Wissen (`brain_knowledge.py add … --quelle agent --anhaengen`, z. B. slug
  `gelernt-agenten`), vergibt bei Bedarf den nächsten Auftrag und markiert: `python scripts/brain_routines.py gelernt <task_id> …`.
- **Sichtbar**: auf `/dashboard/gehirn` goldene Linie Gehirn → Agent im Satelliten-Ring (Hover: „vom Gehirn: Grund“),
  in JARVIS goldener Rahmen und Kennzeichnung „vom Gehirn“ an der Agenten-Karte; Dashboard lädt alle 10 s nach,
  solange Aufträge offen sind.

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

## Prüf-Agenten (ohne Tokens)

Inhaber 04.10.2026: „Qualitätsagenten bitte mehrere, auch die die Kunden-Leads immer nochmal dauerhaft überprüfen …
effizient, nicht extrem viele unnötige Tokens“. Die Dauerprüfung ist reines Python (`scripts/dauerpruefung.py`,
`.github/workflows/dauerpruefung.yml`, stündlich zur Minute 47, Wachhund startet nach 2 h nach, Schalter
`werke_paused.dauerpruefung`). Budget und Abstände in `config/pruefung.yaml`.

- **Lead-Prüfer:** je Lauf fällige Nachprüfungen, dann noch nie geprüfte vollständige Leads (Kunden-Märkte, dann
  S2 US/UK/FR …) durch die unveränderte Drei-Stufen-Freigabe. Bestanden: `pruef_anzahl` + 1, nächste Prüfung nach
  1 → 3 → 7 → 14 → 30 Tagen, `qualitaet_score` steigt (Prüfungen + Alter). Durchgefallen: `held` + Grund in `lead_checks`.
  Auch Probe, Vorrat, Lieferung und Stichprobe zählen in den Wert (`release_gate.persist`).
- **Käufer-Prüfer:** mail-fähige Käufer mit derselben Prüfung wie `outreach.py check` (nur strenger: `call_only`/
  `rejected`, nie zurück auf ok); MX, Website und Bounce-Historie nur als `pruef_hinweis` markiert.
- **Auswahl:** Proben-Vorrat und Lieferungen nehmen öfter geprüfte Leads zuerst; alle Regeln (genau 10 Firmen, Land,
  einmal pro Abo, Freigabe) bleiben.
- **Für LLM-Agenten:** nie einzelne Leads nachprüfen lassen. Nur die Tageszusammenfassung lesen:
  `python scripts/dauerpruefung.py zusammenfassung` bzw. `select signalwerk.pruef_kpi(1)` (Summen, Bestand, Ausreißer
  > 5 % Abweichung) oder die Sicht `signalwerk.pruef_stats_daily`. Handeln nur bei Ausreißern (Quelle/Land ansehen).

## Fach-Agenten („Team“ in JARVIS)

Inhaber 04.10.2026: „Welche agenten machen sinn bei gehirn testing und bei leadqualität. Bau die bitte direkt in jarvis
alle rein“. Feste Fach-Agenten als Daten in `signalwerk.agent_roles` (Rolle, Ziel-Kennzahl mit Ampel-Schwellen und
Richtung, Takt, Werkzeuge, Grenzen, Auftragstext, verknüpfte Gehirn-Routine). Tests nur S2 × US/UK/FR.

| Fach-Agent | Gruppe | Takt (deutsche Zeit) | Ziel-Kennzahl | Aufgabe |
|---|---|---|---|---|
| Test-Agent | Gehirn-Testing | täglich 18:20 (Routine „A/B-Prüfung Webagenturen“) | Antwortquote | A/B-Tests (`ab.py`): Entwürfe starten, Mindestmenge/≥ 95 % prüfen, Gewinner erklären und übernehmen, nächsten Test am Engpass – eine Sache je Test |
| Trichter-Agent | Gehirn-Testing | täglich 07:40 („KPI-Diagnose mit Engpass“) | Engpass-Quote (schwächster reifer Schritt, `cohort_funnel`) | Kohorten messen, schwächsten Schritt nennen, dem Test-Agenten genau einen Testgegenstand geben (Wissen `trichter-engpass`) |
| Qualitäts-Agent | Lead-Qualität | täglich 07:50 | Fehlerquote Freigabe-Stichprobe | nur Ausreißer und Tageszusammenfassung der Prüfer (`pruef_kpi`), harte Bounces je Quelle; Ursache in Quelle/Feld beheben |
| Lead-Prüfer | Lead-Qualität | Dauerlauf `dauerpruefung.yml` | bestanden % | token-frei (Abschnitt oben) |
| Käufer-Prüfer | Lead-Qualität | Dauerlauf `dauerpruefung.yml` | bestanden % | token-frei (Abschnitt oben) |
| Zustell-Agent | Lead-Qualität | täglich 06:30 | Bounce-Quote | `deliverability_daily`, Bounce-Klassen je Postfach, Spam-Signale; Maßnahme nur innerhalb der Limits vorschlagen |
| Quellen-Agent | Lead-Qualität | täglich 12:10 | grüne Leads je Platz-Stunde US/UK/FR | Linien mit „Vorrat leer“, schwache Quellen verbessern, neue Quellen nach Scout-Regeln |

**Effizienz-Regel (Inhaber 04.10.2026):** LLM-Agenten nur für Auswertung und Entscheidung; Massenprüfung immer
token-frei (Python-Workflow). Kein LLM-Agent prüft einzelne Leads oder Käufer.

**Ablauf:** Die verknüpfte Routine legt wie jede Gehirn-Routine einen Auftrag an (`brain_routines.py faellig`), aber
mit `agent_tasks.rolle` und dem Text aus `agent_roles.auftrag` („Fach-Agent … (N min): …“). In JARVIS hat jede Karte
„Jetzt beauftragen“ (höchstens ein offener Auftrag je Fach-Agent). Der Agent bearbeitet ihn wie einen Gehirn-Auftrag:
Ergebnis ≤ 300 Zeichen mit Zahlen, Wissen per `brain_knowledge.py add`. 72 h nach Abschluss misst
`datenfluss.py wirkung` die Ziel-Kennzahl vorher/nachher (`agent_role_kpi`, Richtung beachtet) → `agent_tasks.wirkung`,
auf der Karte als „Wirkung“. Kennzahl, Ampel und 7-Tage-Trend der Karte kommen aus `signalwerk.agent_role_kpi()`,
der Trichter aus `cohort_funnel`, die Prüfer aus `pruef_kpi()` und `pruef_bestand()`.

**Grenzen aller Fach-Agenten:** nie Versand einschalten, nie Sperrliste, Notbremse, Abmeldung oder Drei-Stufen-Freigabe
lockern (auch nicht als Testvariante), keine Kosten, nichts löschen.

## Firma (Bereiche und Übergaben)

Inhaber 04.10.2026: „gib verschiedene bereiche wie in einem unternehmen … damit sie gut zusammenarbeiten, bau daraus ein
unternehmen was geld verdient“. Acht Bereiche in `signalwerk.departments` (Leitung, Mitglieder, Hauptziel, Wirkungszahl,
Takt), Fach-Agenten über `agent_roles.department`. Seite `/dashboard/firma` (Link „Organigramm“ in den JARVIS-Abteilungen).

| Bereich | Leitung | Hauptziel | Wirkung Richtung Umsatz |
|---|---|---|---|
| Vertrieb | Trichter-Agent (+ Zustell-Agent, Antwort-Analyse, Versand-Werk) | Antwortquote | positive Antworten 7 T |
| Marketing | Test-Agent (+ Website-Agenten, Markt-Recherche) | Probe-Anfragen 7 T | Probe-Anfragen 7 T |
| Produktion | Quellen-Agent (+ Lead-Werk, Kunden-Werk, Proben-Vorrat) | grüne Leads 7 T | fertige Proben im Vorrat |
| Qualität | Qualitäts-Agent (+ Lead-/Käufer-Prüfer, Stichprobe) | Lead-Fehlerquote | Leads bestanden 24 h |
| Kundenservice | Antwort-Assistent (+ Kunden-Agenten A9, Kundenlieferung) | Kaufinteresse offen = 0 | Kaufinteresse offen |
| Finanzen | Finanz-Wache (token-frei) | MRR | MRR |
| Recht | Recht-Wache (nur Wache, ändert nie Regeln) | Spam-Beschwerden 30 T = 0 | Spam-Beschwerden |
| Strategie | Gehirn (+ Scout, Meta-Review, A1–A8) | zahlende Kunden | zahlende Kunden |

**Übergaben** (`scripts/uebergaben.py pruefen --apply`, Wachhund alle 30 min, token-frei, Zahlen aus
`signalwerk.firma_lage()`): Qualität → Produktion (Ausreißer > 5 % der Dauerprüfung, Rolle `quellen`), Vertrieb →
Marketing (≥ 30 Erstmails ohne Antwort in einem Land, Rolle `test`), Vertrieb → Kundenservice (Antwort „buy“ offen, dazu
Push, falls noch kein Alarm), Produktion → Strategie (Linie „Vorrat leer“ oder 0 fertige Proben), Recht → Qualität
(Spam-Beschwerde, Rolle `zustellung`). Jede Übergabe steht einmal in `signalwerk.handoffs` (eindeutiger Schlüssel je
Tag/Woche/Ereignis); der Auftrag (`created_by = "Übergabe"`, Grund in `agent_tasks.grund`) geht an einen freien Agenten,
einer bleibt für den Inhaber frei, höchstens 3 je Lauf, ein offener je Fach-Agent. Bearbeiten wie jeden Auftrag.
Nur Fokus-Tests (S2 × US/UK/FR). Nie Versand, Länder, Sperrliste, Notbremse, Prüfregeln oder Freigabe ändern.

**Geschäftsbericht** (Titel ≤ 60 + 5 Zahlen: Mails 24 h, Antworten 7 T, Proben 7 T, Kunden, Umsatz/Monat) steht oben in
der Tagescheck-Mail und auf `/dashboard/firma` (`python scripts/uebergaben.py bericht`).

## Berechtigungen (Inhaber 04.10.2026: „gib den agents wirklich jede berechtigung“)

Agenten dürfen alles selbst machen, was die Hauptsitzung darf – ohne Rückfrage:
- Code ändern, Tests, PR, bei grüner CI **selbst nach main mergen** (Deployment)
- Datenbank: lesen, schreiben, nicht destruktive Migrationen anlegen **und anwenden**
- Workflows starten (`gh workflow run` / dispatch), Belegungsplan, Regler, Speicher, Proben-Vorrat, eigene Agenten,
  Master-Pipeline und Test-Flows einstellen; Werke an/aus. **Actions-Drossel (Inhaber 06.10.2026):** höchstens ein
  Start je Runde und nur, wenn im Repo weniger als 5 Läufe aktiv sind; nie Schleifen, Nachfüller oder Werk-Takt
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

## Rolle bei jedem Auftrag (JARVIS-Zentrale 05.10.2026)

Jeder neue Auftrag setzt `agent_tasks.rolle`, wenn er einem Fach-Agenten gehört (Rollen und Bereiche:
`app/lib/firma-karte.json`, Python `scripts/lib/firma_karte.py`). Ohne Rolle läuft er in der Zentrale ehrlich bei
„Strategie (A1–A8)“. Das Dashboard setzt die Rolle beim Knopf „Auftrag an A1–A8“ eines Bereichs automatisch (Leitung).

