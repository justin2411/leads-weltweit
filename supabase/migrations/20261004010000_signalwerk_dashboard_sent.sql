-- Dashboard: Käufer je Land getrennt nach "gesendet" (Erstmail raus) und "Mail bereit" (Entwurf/freigegeben, noch nicht gesendet).
-- Vorher zählte das Dashboard alles mit Nachricht als "angeschrieben", auch Entwürfe in der Warteschlange.
create or replace function signalwerk.dashboard_stock()
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '30s' as $$
select jsonb_build_object(
  'at', now(),
  'leads', (select coalesce(jsonb_agg(x), '[]') from (
            select segment_id, country, status, count(*) as n from signalwerk.leads group by 1, 2, 3) x),
  'leads_24h', (select coalesce(jsonb_agg(x), '[]') from (
            select segment_id, country, count(*) as n from signalwerk.leads
             where created_at >= now() - interval '24 hours' group by 1, 2) x),
  'prospects', (select coalesce(jsonb_agg(x), '[]') from (
            select p.check_status, p.segment_id, p.country, count(*) as n,
                   count(*) filter (where p.check_status = 'ok'
                                      and not exists (select 1 from signalwerk.messages m where m.prospect_id = p.id)) as unused,
                   count(*) filter (where p.check_status = 'ok'
                                      and exists (select 1 from signalwerk.messages m
                                                   where m.prospect_id = p.id and m.status = 'sent')) as sent,
                   count(*) filter (where p.check_status = 'ok'
                                      and exists (select 1 from signalwerk.messages m
                                                   where m.prospect_id = p.id and m.status in ('draft', 'approved'))
                                      and not exists (select 1 from signalwerk.messages m
                                                       where m.prospect_id = p.id and m.status = 'sent')) as queued
              from signalwerk.prospects p group by 1, 2, 3) x),
  'prospects_24h', (select coalesce(jsonb_agg(x), '[]') from (
            select check_status, segment_id, country, count(*) as n from signalwerk.prospects
             where created_at >= now() - interval '24 hours' group by 1, 2, 3) x)
);
$$;

revoke all on function signalwerk.dashboard_stock() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_stock() to service_role;
