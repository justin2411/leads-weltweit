-- Premium-Labor 05.10.2026: Premium = frisch ≤ 14 Tage (Definition docs/GEHIRN-AUFBAU.md), wie scripts/lib/premium.py
-- PREMIUM_MAX_AGE. Vorher zählte premium_status() bis 30 Tage (lockerer als die Definition). Nur strenger, nichts gelöscht.
create or replace function signalwerk.premium_status()
returns table (segment_id text, country text, premium_frei int, proben int, proben_premium int, premium_in_proben int,
               zu_klein boolean)
language sql stable
set search_path = signalwerk, public
as $fn$
  with s as (
    select segment_id, country, count(*)::int proben,
           count(*) filter (where coalesce(premium_n, 0) >= 10)::int proben_premium,
           coalesce(sum(premium_n), 0)::int premium_in_proben
      from signalwerk.sample_stock
     where status = 'ready' and expires_at > now()
     group by 1, 2),
  l as (
    select segment_id, country, count(distinct company_id)::int premium_frei
      from signalwerk.leads
     where status = 'new' and premium_score >= 70 and premium->>'tier' = 'premium'
       and event_date >= current_date - 14
     group by 1, 2),
  p as (select distinct segment_id, country from signalwerk.landing_pages where status = 'live')
  select p.segment_id, p.country, coalesce(l.premium_frei, 0), coalesce(s.proben, 0), coalesce(s.proben_premium, 0),
         coalesce(s.premium_in_proben, 0),
         coalesce(s.proben_premium, 0) < coalesce(s.proben, 0) or coalesce(l.premium_frei, 0) < 10
    from p left join s using (segment_id, country) left join l using (segment_id, country)
   order by 1, 2
$fn$;
