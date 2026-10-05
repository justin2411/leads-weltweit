-- Speicher mit Premium (Inhaber 05.10.2026: „wieviel überall drin ist auch mit premium leads angezeigt“).
-- dashboard_storage() liefert zusätzlich 'premium' (Premium-Leads je Zielgruppe × Land × Status, Kriterium exakt wie
-- signalwerk.premium_status() bzw. scripts/lib/premium.py: premium_score >= 70, Stufe premium, Ereignis ≤ 14 Tage) und
-- 'stock_premium' (fertige Proben je Zielgruppe × Land, davon reine Premium-Proben premium_n = 10).
-- Schnell über einen Teilindex (Index-Only-Scan statt 10 s Seq-Scan); die Seite liest weiter nur dashboard_cache.
-- Nicht destruktiv: neuer Index (im Live-Projekt concurrently angelegt) + create or replace.
create index if not exists leads_premium_speicher on signalwerk.leads (event_date)
  include (segment_id, country, status, company_id)
  where premium_score >= 70 and (premium->>'tier') = 'premium';

create or replace function signalwerk.dashboard_storage()
returns jsonb
language sql stable set search_path = signalwerk, public
set statement_timeout = '20s' as $$
with
  b as (select segment_id, country, check_status, count(*) as n
          from signalwerk.prospects group by 1, 2, 3),
  s as (select p.segment_id, p.country, p.check_status,
               count(distinct p.id) filter (where m.status = 'sent') as sent,
               count(distinct p.id) as used
          from signalwerk.messages m join signalwerk.prospects p on p.id = m.prospect_id
         group by 1, 2, 3)
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
              select b.segment_id as segment, b.country, b.check_status, b.n, coalesce(s.sent, 0) as sent,
                     coalesce(s.used, 0) as used
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
               group by 1, 2) x),
  'premium', (select coalesce(jsonb_agg(x), '[]') from (
              select segment_id as segment, country, status, count(*) as n, count(distinct company_id) as firms
                from signalwerk.leads
               where premium_score >= 70 and (premium->>'tier') = 'premium' and event_date >= current_date - 14
               group by 1, 2, 3) x),
  'stock_premium', (select coalesce(jsonb_agg(x), '[]') from (
              select segment_id as segment, country, count(*) as ready,
                     count(*) filter (where coalesce(premium_n, 0) >= 10) as premium
                from signalwerk.sample_stock
               where status = 'ready' and expires_at > now()
               group by 1, 2) x)
);
$$;

revoke all on function signalwerk.dashboard_storage() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_storage() to service_role;
