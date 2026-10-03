-- Agenten-Aufträge (Inhaber 03.10.2026: „einzelne agenten … die sachen für mich machen, z.b. ich beauftrage agent 1
-- neue leads zu holen für den markt“). Der Inhaber legt Aufträge im Dashboard an; eine stündliche Claude-Sitzung
-- (Routine „Agenten“) bearbeitet offene Aufträge nach CLAUDE.md und schreibt Fortschritt und Ergebnis zurück.
-- Nicht destruktiv: neue Tabelle.
create table if not exists signalwerk.agent_tasks (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  agent        smallint not null check (agent between 1 and 9),
  kind         text not null check (kind in ('leads', 'kaeufer', 'quelle', 'pruefen', 'frage')),
  market       text,                        -- z. B. US, UK, FR, IE … (leer = alle)
  brief        text not null check (char_length(brief) between 1 and 1000),
  status       text not null default 'offen' check (status in ('offen', 'laeuft', 'fertig', 'fehler', 'abgebrochen')),
  progress     smallint not null default 0 check (progress between 0 and 100),
  step         text,                        -- kurzer Zwischenstand („prüfe 3 Quellen …“)
  result       text,                        -- Ergebnis in wenigen Sätzen
  numbers      jsonb not null default '{}', -- Kennzahlen des Ergebnisses, z. B. {"leads": 420, "kaeufer": 35}
  started_at   timestamptz,
  finished_at  timestamptz,
  created_by   text not null default 'Inhaber Dashboard'
);
create index if not exists agent_tasks_open on signalwerk.agent_tasks (status, created_at);
alter table signalwerk.agent_tasks enable row level security;
revoke all on signalwerk.agent_tasks from anon, authenticated;
grant select, insert, update on signalwerk.agent_tasks to service_role;
