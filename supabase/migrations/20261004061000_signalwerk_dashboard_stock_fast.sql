-- dashboard_stock schneller (Nachtschicht 04.10.2026): Bisher 3 korrelierte EXISTS je Käufer (513.000 Zeilen,
-- 18 s, JARVIS zeigte bis dahin falsche Nullen). Jetzt Mails je Käufer einmal zusammengefasst und per Hash-Join
-- angehängt (~1,5 s), Leads über den vorhandenen Index (~2 s). Gleiche Ausgabe wie vorher.
create or replace function signalwerk.dashboard_stock()
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '30s' as $$
with m as (
  select prospect_id,
         bool_or(status = 'sent') as sent,
         bool_or(status in ('draft', 'approved')) as queued
    from signalwerk.messages
   where prospect_id is not null
   group by prospect_id
)
select jsonb_build_object(
  'at', now(),
  'leads', (select coalesce(jsonb_agg(x), '[]') from (
            select segment_id, country, status, count(*) as n from signalwerk.leads group by 1, 2, 3) x),
  'leads_24h', (select coalesce(jsonb_agg(x), '[]') from (
            select segment_id, country, count(*) as n from signalwerk.leads
             where created_at >= now() - interval '24 hours' group by 1, 2) x),
  'prospects', (select coalesce(jsonb_agg(x), '[]') from (
            select p.check_status, p.segment_id, p.country, count(*) as n,
                   count(*) filter (where p.check_status = 'ok' and m.prospect_id is null) as unused,
                   count(*) filter (where p.check_status = 'ok' and m.sent) as sent,
                   count(*) filter (where p.check_status = 'ok' and m.queued and not m.sent) as queued
              from signalwerk.prospects p left join m on m.prospect_id = p.id
             group by 1, 2, 3) x),
  'prospects_24h', (select coalesce(jsonb_agg(x), '[]') from (
            select check_status, segment_id, country, count(*) as n from signalwerk.prospects
             where created_at >= now() - interval '24 hours' group by 1, 2, 3) x)
);
$$;

revoke all on function signalwerk.dashboard_stock() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_stock() to service_role;
