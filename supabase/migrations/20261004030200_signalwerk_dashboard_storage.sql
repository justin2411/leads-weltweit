-- Speicher-Ansicht im Dashboard (Inhaber 03.10.2026: „wie voll die Speicher sind – Kunden-Leads je Land“).
-- Eine Zählfunktion für /dashboard/speicher: Datenbankgröße (Supabase Pro: 8 GB inklusive), größte Tabellen,
-- Leads je Zielgruppe/Land/Status, Käufer je Zielgruppe/Land/Prüfstatus (+ davon angeschrieben), Proben-Vorrat und
-- Ergebnisse der Drei-Stufen-Freigabe je Land. Nur Zählungen, keine Firmendaten. Die App cacht das Ergebnis 5 min.
-- Laufzeit (gemessen 03.10.2026, 600k Leads, 513k Käufer): ~2 s warm über die vorhandenen Indizes
-- leads_seg_country_status_date_idx und prospects_status_seg_country_idx (Index-Only-Scans).
-- Nicht destruktiv: nur create or replace function.
create or replace function signalwerk.dashboard_storage()
returns jsonb
language sql stable set search_path = signalwerk, public
set statement_timeout = '20s' as $$
with
  b as (select segment_id, country, check_status, count(*) as n
          from signalwerk.prospects group by 1, 2, 3),
  s as (select p.segment_id, p.country, p.check_status, count(distinct p.id) as sent
          from signalwerk.messages m join signalwerk.prospects p on p.id = m.prospect_id
         where m.status = 'sent' group by 1, 2, 3)
select jsonb_build_object(
  'at', now(),
  'db_bytes', pg_database_size(current_database()),
  'tables', (select coalesce(jsonb_agg(x order by x.bytes desc), '[]') from (
              select c.relname as name, pg_total_relation_size(c.oid) as bytes
                from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'signalwerk' and c.relkind in ('r', 'p')
               order by 2 desc limit 6) x),
  'leads', (select coalesce(jsonb_agg(x), '[]') from (
              select segment_id as segment, country, status, count(*) as n
                from signalwerk.leads group by 1, 2, 3) x),
  'buyers', (select coalesce(jsonb_agg(x), '[]') from (
              select b.segment_id as segment, b.country, b.check_status, b.n, coalesce(s.sent, 0) as sent
                from b left join s on s.segment_id is not distinct from b.segment_id
                                  and s.country is not distinct from b.country
                                  and s.check_status is not distinct from b.check_status) x),
  'stock', (select coalesce(jsonb_agg(x), '[]') from (
              select segment_id as segment, country, status, count(*) as n
                from signalwerk.sample_stock group by 1, 2, 3) x),
  'checks', (select coalesce(jsonb_agg(x), '[]') from (
              select l.segment_id as segment, l.country,
                     count(*) filter (where c.result = 'released') as released,
                     count(*) filter (where c.result = 'failed') as failed
                from signalwerk.lead_checks c join signalwerk.leads l on l.id = c.lead_id
               group by 1, 2) x)
);
$$;

revoke all on function signalwerk.dashboard_storage() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_storage() to service_role;
