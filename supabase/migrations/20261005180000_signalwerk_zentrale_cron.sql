-- JARVIS-Cache unabhängig von GitHub (05.10.2026, Bug „Ziele unbestätigt“): der Wachhund (GitHub-Cron, oft stark
-- verspätet) war der einzige, der dashboard_cache 'zentrale' neu rechnete. pg_cron ist in jedem Supabase-Tarif
-- enthalten (kostenlos, kein Tarifwechsel) und rechnet den Cache jetzt alle 5 min in der Datenbank selbst neu.
-- Nicht destruktiv: Erweiterung anlegen (falls fehlt) + ein benannter Job (cron.schedule mit Namen = idempotent).
-- Laufzeit zentrale_cache_refresh() ~5 s (Zeitlimit 60 s in der Funktion); Überlappung verhindert ein Advisory-Lock.
create or replace function signalwerk.zentrale_cache_cron()
returns void
language plpgsql volatile security definer set search_path = signalwerk, public as $$
begin
  -- Läuft schon ein Lauf (Wachhund/Server-Action/Cron)? Dann diesen auslassen.
  if not pg_try_advisory_xact_lock(hashtext('signalwerk.zentrale_cache')) then return; end if;
  -- Gerade erst neu gerechnet (z. B. direkt nach einem Speichern des Inhabers): auslassen.
  if exists (select 1 from signalwerk.dashboard_cache where name = 'zentrale' and updated_at > now() - interval '2 minutes') then
    return;
  end if;
  perform signalwerk.zentrale_cache_refresh();
end $$;
revoke all on function signalwerk.zentrale_cache_cron() from public, anon, authenticated;
grant execute on function signalwerk.zentrale_cache_cron() to service_role;

-- Nur wo pg_cron verfügbar ist (Supabase); im CI-Postgres ohne pg_cron wird der Job übersprungen.
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('signalwerk-zentrale-cache', '*/5 * * * *', $cron$select signalwerk.zentrale_cache_cron()$cron$);
  end if;
end
$do$;
