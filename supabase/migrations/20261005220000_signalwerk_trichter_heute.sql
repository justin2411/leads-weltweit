-- Website-Trichter „Heute“ (Inhaber 05.10.2026: „ich will websiten trichter auch nur von heute sehen können als zeitraum“).
-- Heute = seit 00:00 Europe/Berlin (nicht die letzten 24 h). Nicht destruktiv: drei Funktionen per create or replace,
-- jeweils nur ein zusätzlicher Eimer; bestehende Eimer, Filter (page_events_echt, is_test) und Ausschlüsse unverändert.
--   web_funnel_refresh()    p.heute und buy.heute im Cache 'website_funnel'
--   web_analytics_refresh() heute (cur: heute 00:00 → jetzt, prev: gestern 00:00 → gleiche Uhrzeit gestern)
--   zentrale_extra()        p.1 = KPI-Leiste „Heute“ (p.7 / p.30 wie bisher)
-- website_stats(1) und web_scanner(1) liefern „Heute“ bereits (seit heute 00:00 Berlin).

create or replace function signalwerk.web_funnel_refresh()
returns jsonb
language plpgsql
security definer
set search_path to 'signalwerk', 'public'
set statement_timeout to '30s'
as $function$
declare today date := (now() at time zone 'Europe/Berlin')::date;
        hi timestamptz := now() + interval '1 minute';
        lo0 timestamptz := today::timestamp at time zone 'Europe/Berlin';
        lo7 timestamptz := (today - 6)::timestamp at time zone 'Europe/Berlin';
        lo30 timestamptz := (today - 29)::timestamp at time zone 'Europe/Berlin';
        v jsonb;
begin
  v := jsonb_build_object(
    'at', now(),
    'since', (select min(created_at) from signalwerk.web_hits),
    'p', jsonb_build_object(
      'heute', signalwerk.web_funnel_calc(lo0, hi),
      '24h', signalwerk.web_funnel_calc(now() - interval '24 hours', hi),
      '7d',  signalwerk.web_funnel_calc(lo7, hi),
      '30d', signalwerk.web_funnel_calc(lo30, hi)),
    'live', (select jsonb_build_object(
               'start_60m', count(distinct (h.day, h.vh)) filter (where h.stage = 'start'),
               'start_land_60m', count(distinct (h.day, h.vh)) filter (where h.stage = 'landing' and h.has_start))
               from (select x.day, x.vh, x.stage,
                            exists (select 1 from signalwerk.web_hits s where s.day = x.day and s.vh = x.vh and s.stage = 'start') has_start
                       from signalwerk.web_hits x where x.created_at > now() - interval '1 hour') h),
    'buy', (select jsonb_build_object(
              'heute', coalesce(jsonb_object_agg(c, n0) filter (where n0 > 0), '{}'::jsonb),
              '24h', coalesce(jsonb_object_agg(c, n24) filter (where n24 > 0), '{}'::jsonb),
              '7d',  coalesce(jsonb_object_agg(c, n7) filter (where n7 > 0), '{}'::jsonb),
              '30d', coalesce(jsonb_object_agg(c, n30) filter (where n30 > 0), '{}'::jsonb))
              from (select upper(p.country) c,
                           count(*) filter (where pe.created_at >= lo0)::int n0,
                           count(*) filter (where pe.created_at > now() - interval '24 hours')::int n24,
                           count(*) filter (where pe.created_at >= lo7)::int n7,
                           count(*)::int n30
                      from signalwerk.page_events_echt pe
                      join signalwerk.page_variants pv on pv.id = pe.variant_id
                      join signalwerk.landing_pages p on p.id = pv.page_id
                     where pe.type = 'purchase' and pe.created_at >= lo30 and p.country is not null
                     group by 1) b));
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('website_funnel', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $function$;

create or replace function signalwerk.web_analytics_refresh()
returns jsonb
language plpgsql
security definer
set search_path to 'signalwerk', 'public'
set statement_timeout to '60s'
as $function$
declare today date := (now() at time zone 'Europe/Berlin')::date;
        hi timestamptz := now() + interval '1 minute';
        b0 timestamptz := today::timestamp at time zone 'Europe/Berlin';
        b1 timestamptz := (today - 1)::timestamp at time zone 'Europe/Berlin';
        b7 timestamptz := (today - 6)::timestamp at time zone 'Europe/Berlin';
        b14 timestamptz := (today - 13)::timestamp at time zone 'Europe/Berlin';
        b30 timestamptz := (today - 29)::timestamp at time zone 'Europe/Berlin';
        b60 timestamptz := (today - 59)::timestamp at time zone 'Europe/Berlin';
        c text;
        p jsonb := '{}'::jsonb;
        v jsonb;
begin
  foreach c in array array['ALL', 'US', 'UK', 'FR'] loop
    p := p || jsonb_build_object(c, jsonb_build_object(
      'heute', jsonb_build_object('cur', signalwerk.web_analytics_calc(b0, hi, nullif(c, 'ALL')),
                                  'prev', signalwerk.web_analytics_calc(b1, least(b0, now() - interval '1 day'), nullif(c, 'ALL'))->'k'),
      '24h', jsonb_build_object('cur', signalwerk.web_analytics_calc(now() - interval '24 hours', hi, nullif(c, 'ALL')),
                                'prev', signalwerk.web_analytics_calc(now() - interval '48 hours', now() - interval '24 hours', nullif(c, 'ALL'))->'k'),
      '7d',  jsonb_build_object('cur', signalwerk.web_analytics_calc(b7, hi, nullif(c, 'ALL')),
                                'prev', signalwerk.web_analytics_calc(b14, b7, nullif(c, 'ALL'))->'k'),
      '30d', jsonb_build_object('cur', signalwerk.web_analytics_calc(b30, hi, nullif(c, 'ALL')),
                                'prev', signalwerk.web_analytics_calc(b60, b30, nullif(c, 'ALL'))->'k')));
  end loop;
  v := jsonb_build_object('at', now(), 'since', (select min(created_at) from signalwerk.web_hits), 'c', p);
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('website_analytics', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $function$;

create or replace function signalwerk.zentrale_extra()
returns jsonb
language sql
stable
security definer
set search_path to 'signalwerk', 'public'
set statement_timeout to '20s'
as $function$
  with neu as (
    select count(*) filter (where source_name = 'Website check (change radar)') as radar,
           count(*) filter (where premium_score is not null) as bewertet,
           count(*) filter (where premium_score >= 70 and premium->>'tier' = 'premium') as premium
      from signalwerk.leads
     where segment_id = 'S2' and created_at > now() - interval '24 hours'
  ), prem as (
    select country, count(*) as n from signalwerk.leads
     where segment_id = 'S2' and country in ('US', 'UK', 'FR') and status = 'new'
       and premium_score is not null and premium_score >= 70 and premium->>'tier' = 'premium'
     group by country
  ), lo as (
    -- '1' = heute seit 00:00 Europe/Berlin; '7' / '30' = rollierend wie bisher
    select '1'::text as k, (((now() at time zone 'Europe/Berlin')::date)::timestamp at time zone 'Europe/Berlin') as t
    union all select '7', now() - interval '7 days'
    union all select '30', now() - interval '30 days'
  ), per as (
    select lo.k, jsonb_build_object(
      'sent', (select count(*) from signalwerk.messages where status = 'sent' and sent_at > lo.t),
      'bounced', (select count(*) from signalwerk.email_events where type = 'bounced' and created_at > lo.t),
      'complained', (select count(*) from signalwerk.email_events where type = 'complained' and created_at > lo.t),
      'antworten', (select count(*) from signalwerk.inbound_replies
                     where received_at > lo.t and coalesce(intent, '') not in ('out_of_office')),
      'positiv', (select count(*) from signalwerk.inbound_replies
                   where received_at > lo.t and intent in ('buy', 'sample', 'question')),
      'proben', (select count(*) from signalwerk.sample_requests
                  where created_at > lo.t and not coalesce(is_test, false))
              + (select count(*) from signalwerk.email_events
                  where type = 'sample_requested' and occurred_at > lo.t)) as v
      from lo
  )
  select jsonb_build_object(
    'at', now(),
    'premium', (select coalesce(sum(n), 0) from prem),
    'premium_land', (select coalesce(jsonb_object_agg(country, n), '{}'::jsonb) from prem),
    'radar_24h', (select radar from neu),
    'bewertet_24h', (select bewertet from neu),
    'premium_24h', (select premium from neu),
    'feedback', jsonb_build_object(
      'n_7d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '7 days' and (rating is not null or won)),
      'gut_7d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '7 days' and rating = 'gut'),
      'schlecht_7d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '7 days' and rating = 'schlecht'),
      'won_30d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '30 days' and won),
      'links_7d', (select count(*) from signalwerk.lead_feedback_links where created_at > now() - interval '7 days'),
      'letzte', greatest((select max(created_at) from signalwerk.lead_feedback_links),
                         (select max(updated_at) from signalwerk.lead_feedback))),
    'p', (select jsonb_object_agg(k, v) from per)
  )
$function$;

revoke all on function signalwerk.web_funnel_refresh() from public, anon, authenticated;
grant execute on function signalwerk.web_funnel_refresh() to service_role;
revoke all on function signalwerk.web_analytics_refresh() from public, anon, authenticated;
grant execute on function signalwerk.web_analytics_refresh() to service_role;
revoke all on function signalwerk.zentrale_extra() from public, anon, authenticated;
grant execute on function signalwerk.zentrale_extra() to service_role;
