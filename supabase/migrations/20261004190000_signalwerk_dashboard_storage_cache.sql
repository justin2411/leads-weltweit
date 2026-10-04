-- Speicher-Ansicht sofort (Inhaber 04.10.2026: „wieso? und speicher lädt sehr lange, mach das schneller“):
-- dashboard_storage() braucht bei wachsendem Bestand > 20 s und lief in den 25-s-Abbruch der Seite („nicht erreichbar“).
-- Wie beim Bestand für JARVIS (20261004121000): letzter Stand liegt als Zeile 'storage' in dashboard_cache, die App liest
-- ihn sofort und frischt im Hintergrund auf; der Wachhund rechnet alle 15 min vor. Nicht destruktiv.
create or replace function signalwerk.dashboard_storage_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '120s' as $$
declare v jsonb;
begin
  v := signalwerk.dashboard_storage();
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('storage', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.dashboard_storage_refresh() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_storage_refresh() to service_role;
