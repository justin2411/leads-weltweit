-- Merkzettel für fortlaufende Läufe (Paket B, Master-Pipeline/Speicher, docs/BAUKASTEN-MASTER.md „Laufzeit“):
-- scripts/pools.py fill merkt sich hier, bis zu welchem Lead (created_at, id) die Master-Pipeline schon ausgewertet
-- hat, und welche Fassung des Flows dabei galt. Fehlt die Tabelle, wertet pools.py nur die letzten Stunden aus
-- (idempotent über den Primärschlüssel von lead_pool_items). Nicht destruktiv: neue Tabelle.
create table if not exists signalwerk.job_cursors (
  name        text primary key check (char_length(name) between 1 and 60),   -- z. B. 'pools:master'
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
create or replace trigger job_cursors_touch before update on signalwerk.job_cursors
  for each row execute function signalwerk.touch_updated_at();
alter table signalwerk.job_cursors enable row level security;
revoke all on signalwerk.job_cursors from anon, authenticated;
grant select, insert, update on signalwerk.job_cursors to service_role;
