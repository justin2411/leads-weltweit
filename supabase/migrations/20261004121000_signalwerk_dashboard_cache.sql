-- Dashboard-Werte immer sichtbar (Inhaber 04.10.2026: „warum laden hier die werte und stehen nicht immer da ich will
-- immer alles sehen“). dashboard_stock() braucht unter Last mehrere Sekunden; der Next-Zwischenspeicher je Instanz war
-- nach jedem Deployment kalt, JARVIS zeigte dann „…“. Neu: letzter Stand liegt in der Datenbank (eine Zeile, sofort
-- lesbar), wird von der App (im Hintergrund, wenn älter als 5 min) und vom Wachhund aufgefrischt. Nicht destruktiv.
create table if not exists signalwerk.dashboard_cache (
  name        text primary key check (char_length(name) between 1 and 60),
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table signalwerk.dashboard_cache enable row level security;
revoke all on signalwerk.dashboard_cache from anon, authenticated;
grant select, insert, update on signalwerk.dashboard_cache to service_role;

-- Frischt den Bestand auf und gibt ihn zurück (gleicher Inhalt wie dashboard_stock()).
create or replace function signalwerk.dashboard_stock_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '60s' as $$
declare v jsonb;
begin
  v := signalwerk.dashboard_stock();
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('stock', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.dashboard_stock_refresh() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_stock_refresh() to service_role;
