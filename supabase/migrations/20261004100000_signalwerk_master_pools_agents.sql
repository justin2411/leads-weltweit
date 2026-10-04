-- Master-Pipeline, Speicher und eigene Agenten (Inhaber 04.10.2026: „einmal die pipeline festlegen die immer stattfindet
-- als master pipeline … in gold“, „ergebnisse in unseren speicher übertragen oder andere speicher selber anlegen und
-- entscheiden welcher speicher genutzt wird um die kunden zu bedienen“, „mit dem baukasten eigene agenten bauen und
-- speichern“). Nicht destruktiv: neue Spalten mit Standardwert, neue Tabellen. Nichts wird gelöscht oder geändert.
--   flows.kind          test (bisherige Flows) | master (genau eine, gold) | agent (Flow eines eigenen Agenten)
--   lead_pools          eigene Speicher; „Gesamtbestand“ = kein Speicher (alle Leads, wie bisher)
--   lead_pool_items     welcher Lead in welchem Speicher liegt (Herkunft: master | agent:<id> | manuell)
--   pool_routes         je Zielgruppe+Land: aus welchem Speicher Proben und Lieferungen kommen (fehlt = Gesamtbestand)
--   subscriptions.pool_id  Übersteuerung je Kunde (leer = Route der Zielgruppe/des Landes)
--   custom_agents       gespeicherte Agenten: Flow + Auslöser + optionaler KI-Auftrag; nie Versand
--   agent_runs          Protokoll je Lauf
-- Die Drei-Stufen-Freigabe bleibt unabhängig davon vor jeder Probe/Lieferung Pflicht (release_gate.py).

alter table signalwerk.flows add column if not exists kind text not null default 'test';
alter table signalwerk.flows drop constraint if exists flows_kind_check;
alter table signalwerk.flows add constraint flows_kind_check check (kind in ('test', 'master', 'agent'));
create unique index if not exists flows_one_master on signalwerk.flows ((true)) where kind = 'master' and status <> 'archiv';

create table if not exists signalwerk.lead_pools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) between 1 and 40),
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create or replace trigger lead_pools_touch before update on signalwerk.lead_pools
  for each row execute function signalwerk.touch_updated_at();

create table if not exists signalwerk.lead_pool_items (
  pool_id   uuid not null references signalwerk.lead_pools(id),
  lead_id   uuid not null references signalwerk.leads(id),
  added_at  timestamptz not null default now(),
  added_by  text not null default 'manuell' check (char_length(added_by) <= 60),
  primary key (pool_id, lead_id)
);
create index if not exists lead_pool_items_lead on signalwerk.lead_pool_items (lead_id);
create index if not exists lead_pool_items_added on signalwerk.lead_pool_items (pool_id, added_at desc);

create table if not exists signalwerk.pool_routes (
  segment_id  text not null,
  country     text not null,
  pool_id     uuid not null references signalwerk.lead_pools(id),
  updated_at  timestamptz not null default now(),
  primary key (segment_id, country)
);

alter table signalwerk.subscriptions add column if not exists pool_id uuid references signalwerk.lead_pools(id);

create table if not exists signalwerk.custom_agents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  flow_id       uuid not null references signalwerk.flows(id),
  trigger       text not null default 'taeglich' check (trigger in ('stuendlich', 'taeglich', 'neue_leads')),
  at_hour       smallint check (at_hour is null or at_hour between 0 and 23),   -- deutsche Zeit, nur bei 'taeglich'
  ai_brief      text check (ai_brief is null or char_length(ai_brief) <= 1000), -- optionaler KI-Auftrag (agent_tasks)
  ai_market     text,
  enabled       boolean not null default true,
  last_run_at   timestamptz,
  last_result   jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create or replace trigger custom_agents_touch before update on signalwerk.custom_agents
  for each row execute function signalwerk.touch_updated_at();

create table if not exists signalwerk.agent_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references signalwerk.custom_agents(id),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  rows_in      int,
  result       jsonb not null default '{}',
  error        text
);
create index if not exists agent_runs_agent on signalwerk.agent_runs (agent_id, started_at desc);

-- Zählung je Speicher und Land (Speicher-Seite, Baukasten)
create or replace function signalwerk.pool_counts()
returns table (pool_id uuid, country text, segment text, n bigint)
language sql stable set search_path = signalwerk, public set statement_timeout = '15s' as $$
  select i.pool_id, l.country, l.segment_id, count(*)
    from signalwerk.lead_pool_items i join signalwerk.leads l on l.id = i.lead_id
   group by 1, 2, 3;
$$;

alter table signalwerk.lead_pools enable row level security;
alter table signalwerk.lead_pool_items enable row level security;
alter table signalwerk.pool_routes enable row level security;
alter table signalwerk.custom_agents enable row level security;
alter table signalwerk.agent_runs enable row level security;
revoke all on signalwerk.lead_pools, signalwerk.lead_pool_items, signalwerk.pool_routes, signalwerk.custom_agents,
  signalwerk.agent_runs from anon, authenticated;
grant select, insert, update on signalwerk.lead_pools, signalwerk.custom_agents, signalwerk.agent_runs to service_role;
grant select, insert, update, delete on signalwerk.lead_pool_items, signalwerk.pool_routes to service_role;
revoke all on function signalwerk.pool_counts() from public, anon, authenticated;
grant execute on function signalwerk.pool_counts() to service_role;
