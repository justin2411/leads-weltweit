# Master-Pipeline, Speicher und eigene Agenten (Inhaber 04.10.2026)

Wünsche des Inhabers (wörtlich gekürzt):
- „einmal die pipeline festlegen die immer stattfindet als master pipeline … gerne auch in gold“
- „ergebnisse in unseren speicher übertragen oder andere speicher selber anlegen und entscheiden welcher speicher genutzt
  wird um die kunden zu bedienen“ → Antwort: je Zielgruppe+Land, optional je Kunde übersteuern
- „mit dem baukasten eigene agenten bauen und speichern, die dann für eine bestimmte sache immer angewendet werden“
  → Antwort: beides – feste Schritte (kostenlos im Werk) + optionaler KI-Auftrag (Agenten-Routine)
- Master-Pipeline: „Alles frei“ – alle Bausteine verschieb-/änder-/löschbar. **Untergrenze bleibt**: die Drei-Stufen-
  Freigabe (Stufe 1–3, `scripts/lib/release_gate.py`) läuft vor jeder Probe/Lieferung IMMER, unabhängig vom Flow
  (CLAUDE.md: „nie abschaltbar, nie aufgeweicht“). Im Baukasten steht sie gold mit Schloss; wird der Baustein entfernt,
  zeigt die UI „läuft trotzdem immer (feste Regel)“.

## Datenbank (Migration 20261004100000, angewendet)
- `flows.kind` = `test` | `master` | `agent`; höchstens EINE nicht archivierte Master-Pipeline (`flows_one_master`).
- `lead_pools(id, name unique ≤40, color #rrggbb, note)` – eigene Speicher. „Gesamtbestand“ = kein Speicher (alle Leads).
- `lead_pool_items(pool_id, lead_id, added_at, added_by)` PK (pool_id, lead_id); added_by = `master` | `agent:<uuid8>` | `manuell`.
- `pool_routes(segment_id, country, pool_id)` – Proben (Vorrat) und Lieferungen für diese Zielgruppe+Land nur aus diesem Speicher.
- `subscriptions.pool_id` – Übersteuerung je Kunde (vor pool_routes).
- `custom_agents(id, name, flow_id, trigger stuendlich|taeglich|neue_leads, at_hour 0–23 deutsche Zeit, ai_brief ≤1000,
  ai_market, enabled, last_run_at, last_result)`; `agent_runs(agent_id, started_at, finished_at, rows_in, result, error)`.
- RPC `pool_counts()` → (pool_id, country, segment, n).

## Flow-Format (app/lib/flow.ts = scripts/lib/owner_rules.py, gemeinsame Fälle tests/fixtures/flow_cases.json)
Neue Baustein-Arten (zusätzlich zu quelle, filter, weiche, punkte, top, dubletten, statistik, pipeline, export, agent):
- `freigabe` – Schritt, lässt alles durch (Anzeige: „Drei-Stufen-Freigabe“, gold, Schloss). Die echte Prüfung macht
  release_gate.py; im Flow ist der Baustein eine Markierung.
- `speicher` – Ziel: `{ pool_id: string | null, pool_name: string }`. Leads, die ihn erreichen, kommen in diesen Speicher
  (nur Quelle „leads“). In der Master-Pipeline: alle neuen Leads; in Agenten: bei jedem Lauf.
- `melden` – Ziel: kurze Zusammenfassung an den Inhaber (Anzahl + bis zu 10 Firmennamen) per Mail (Resend, an den
  Inhaber selbst – erlaubt) und Push. Nur in Agenten wirksam; im Test-Flow nur Vorschau.
Semantik der Master-Pipeline: `pipeline`-Ziel = Stufe 4 „Inhaber-Regeln“ wie bisher (macht die Freigabe nur strenger);
`speicher`-Ziele füllen Speicher. Test-Flows (`kind=test`) verhalten sich wie bisher.

## Laufzeit
- `scripts/pools.py fill` – wertet die aktive Master-Pipeline über neue Leads aus (seit letztem Lauf, gemerkt in
  owner_settings oder über lead_pool_items) und schreibt Speicher-Zuordnungen (`added_by='master'`). Idempotent.
- `scripts/agents_run.py` – führt fällige eigene Agenten aus (Auslöser), Zeilen über dieselben RPCs wie der Baukasten
  (`flow_lead_rows`/`flow_buyer_rows`), Ziele: speicher → lead_pool_items (`agent:<id8>`), melden → Mail/Push an Inhaber,
  agent/ai_brief → Eintrag in `agent_tasks` (Agenten-Routine), export → Ergebnis-IDs in agent_runs.result (Download im
  Dashboard). NIE Versand an Käufer/Leads, nie Sperrliste/Prüfregeln ändern.
- Workflow `.github/workflows/agenten-werk.yml` stündlich (+ Wachhund-Pflichtlauf), führt `pools.py fill` und
  `agents_run.py --apply` aus; respektiert `owner_settings.werke_paused`.
- Bedienen: `scripts/sample_stock.py` (Vorrat) und `scripts/deliveries.py` (Lieferungen) beschränken die Kandidaten auf
  den Speicher aus `subscriptions.pool_id` bzw. `pool_routes`, falls gesetzt; sonst wie bisher. Drei-Stufen-Freigabe
  bleibt davor Pflicht. Reicht der Speicher nicht für genau 10 verschiedene Firmen → keine Probe aus diesem Speicher
  (Regel „Probe immer genau 10“), Hinweis im Tagescheck.

## Laufzeit – umgesetzt (Paket B)
- `scripts/pools.py fill [--apply]`: Merkzettel `job_cursors` 'pools:master' (Migration 20261004110000, noch nicht
  angewendet – ohne Tabelle schaut der Lauf 6 h zurück, idempotent). Erster Lauf/geänderter Flow: letzte 7 Tage neu.
  Zeilen aus `release_gate.load_items` + `owner_rules.flat_row` (dieselbe Quelle wie Stufe 4).
- `scripts/agents_run.py [--apply] [--agent <id>]`: Auslöser in deutscher Zeit; höchstens ein offener Auftrag je
  Agent in `agent_tasks` (created_by „Agent <Name>“); Markt: ai_market → genau ein Land der Quelle → aus dem Text
  erkannt („uk käufer finden“ → UK). Meldungen nur bei Treffern.
- Speicher beim Bedienen strikt (`scripts/lib/pools.py`): Abo-Speicher vor Route; ohne beides Gesamtbestand. Fertige
  Proben außerhalb des gesetzten Speichers verwirft der Proben-Vorrat; Tagescheck „Speicher X reicht nicht“.
- Schalter `werke_paused.agenten` (Dashboard „Agenten-Werk“), Wachhund-Pflichtlauf stündlich.
