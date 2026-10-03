-- Nachtschicht 04.10.2026 (Inhaber 03.10.2026: Autopilot an, Rohbestand nicht mehr komplett speichern, Bremse ab 6 GB).
-- Nur Ergänzungen, nichts wird geändert oder gelöscht.

-- Größe der Datenbank für die Speicher-Bremse im Plan-Job (schnell, ohne Tabellen zu zählen)
create or replace function signalwerk.db_size_bytes()
returns bigint
language sql
stable
set search_path = signalwerk, public
as $$ select pg_database_size(current_database())::bigint $$;

revoke all on function signalwerk.db_size_bytes() from public, anon, authenticated;
grant execute on function signalwerk.db_size_bytes() to service_role;

-- Jede Belegung, die ein Plan-Job wirklich startet (Autopilot oder Inhaber), mit Gründen – JARVIS und Regler zeigen sie
create table if not exists signalwerk.werk_plan_log (
  id bigint generated always as identity primary key,
  werk text not null check (werk in ('lead-werk', 'kunden-werk')),
  at timestamptz not null default now(),
  run_id text,
  mode text not null check (mode in ('autopilot', 'inhaber', 'standard')),
  bremse text not null default 'aus' check (bremse in ('aus', 'hinweis', 'drossel', 'ohne-rohbestand')),
  db_bytes bigint,
  base jsonb not null default '{}'::jsonb,   -- Belegung des Inhabers bzw. Standard
  plan jsonb not null default '{}'::jsonb,   -- gestartete Belegung je Linie
  reasons jsonb not null default '{}'::jsonb -- je Linie: kurzer Grund mit Messwerten
);
create index if not exists werk_plan_log_werk_at on signalwerk.werk_plan_log (werk, at desc);
alter table signalwerk.werk_plan_log enable row level security;
revoke all on signalwerk.werk_plan_log from anon, authenticated;
grant select, insert on signalwerk.werk_plan_log to service_role;
grant usage on sequence signalwerk.werk_plan_log_id_seq to service_role;

-- Rohbestand kompakt (Inhaber 03.10.2026: „nicht mehr neu speichern“ = nicht mehr als Firma + 5 Beobachtungen):
-- eine Zeile je Kandidat statt ~2,6 KB über watch_companies/observations. Kein Lead, nie geliefert.
create table if not exists signalwerk.raw_candidates (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  segment_id text,
  country text,
  ampel text not null check (ampel in ('yellow', 'red')),
  name text,
  domain text,
  missing text[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists raw_candidates_country_seg on signalwerk.raw_candidates (country, segment_id);
alter table signalwerk.raw_candidates enable row level security;
revoke all on signalwerk.raw_candidates from anon, authenticated;
grant select, insert, update on signalwerk.raw_candidates to service_role;
