-- Paket „Website“ im Dashboard (Inhaber 04.10.2026: „die website als themenfeld mit aufzunehmen … damit man auch dort
-- agenten erstellen kann, die anpassungen an der website übernehmen und schauen das man dort auch immer alles sauber
-- macht. gerne auch mit einem chatfeld, dass ich änderungswünsche direkt dort posten kann“).
-- Nicht destruktiv: zwei neue Tabellen, zwei Prüfungen um einen Wert erweitert (alle bisherigen Werte bleiben erlaubt),
-- ein neuer eindeutiger Index. Nichts gelöscht, keine Löschrechte („Ausschalten statt Löschen“).
--   website_checks   Ergebnis des täglichen Website-Checks (scripts/website_check.py, .github/workflows/website-check.yml):
--                    Punkte je Bereich (0–100) und kurze Funde. Nur die eigene Domain.
--   website_agents   Website-Agenten des Inhabers (Name, Aufgabe, Rhythmus); fällige legen über
--                    scripts/website_agents.py faellig (Wachhund) einen Auftrag in agent_tasks an (kind 'website').
--   jarvis_sessions  neue Sitzungsart 'website' (Chatfeld „Änderungswunsch“), genau eine offene Sitzung.

-- 1) Website-Check
create table if not exists signalwerk.website_checks (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  site      text not null check (char_length(site) between 8 and 200),
  scores    jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  funde     jsonb not null default '[]'::jsonb check (jsonb_typeof(funde) = 'array'),
  seiten    integer not null default 0 check (seiten >= 0),
  dauer_ms  integer check (dauer_ms is null or dauer_ms >= 0)
);
create index if not exists website_checks_at on signalwerk.website_checks (at desc);

-- 2) Website-Agenten
create table if not exists signalwerk.website_agents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 2 and 40),
  aufgabe       text not null check (char_length(btrim(aufgabe)) between 5 and 240),
  rhythmus      text not null default 'woechentlich' check (rhythmus in ('taeglich', 'woechentlich', 'einmal')),
  aktiv         boolean not null default true,
  last_run_at   timestamptz,          -- zuletzt beauftragt (Auftrag in agent_tasks angelegt)
  last_task_id  uuid references signalwerk.agent_tasks(id),
  last_result   text check (last_result is null or char_length(last_result) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists website_agents_active on signalwerk.website_agents (aktiv, last_run_at);
create or replace trigger website_agents_touch before update on signalwerk.website_agents
  for each row execute function signalwerk.touch_updated_at();

-- 3) Aufträge der Website-Agenten über dieselbe Agenten-Routine (docs/AGENTEN.md)
alter table signalwerk.agent_tasks drop constraint if exists agent_tasks_kind_check;
alter table signalwerk.agent_tasks add constraint agent_tasks_kind_check
  check (kind in ('leads', 'kaeufer', 'quelle', 'pruefen', 'frage', 'kunde', 'website'));

-- 4) Chatfeld „Änderungswunsch“: Sitzungsart 'website', genau eine offene („Chat leeren“ archiviert)
alter table signalwerk.jarvis_sessions drop constraint if exists jarvis_sessions_kind_check;
alter table signalwerk.jarvis_sessions add constraint jarvis_sessions_kind_check
  check (kind in ('chat', 'bericht', 'baukasten', 'website'));
create unique index if not exists jarvis_sessions_one_website on signalwerk.jarvis_sessions ((true))
  where kind = 'website' and not archived;

-- 5) Rechte: nur serverseitig (Service-Schlüssel), keine Löschrechte
alter table signalwerk.website_checks enable row level security;
alter table signalwerk.website_agents enable row level security;
revoke all on signalwerk.website_checks, signalwerk.website_agents from anon, authenticated;
revoke delete, truncate on signalwerk.website_checks, signalwerk.website_agents from service_role;
grant select, insert on signalwerk.website_checks to service_role;
grant select, insert, update on signalwerk.website_agents to service_role;
