-- Datenbank-Last 05.10.2026 (ab ~09:00 MESZ 400–550 Statement-Timeouts je 15 min), nicht destruktiv:
--
-- 1) Landingpage-Beispiele (landing.tsx countrySamplesFetch, ~2.600 der Timeouts seit 07:00 UTC):
--    status in ('sample','new') order by event_date desc konnte den Index (segment_id, country, status, event_date)
--    nicht sortiert lesen → alle ~446.000 S2/US-Leads lesen und auf Platte sortieren (24 s). Teilindex ohne status
--    in der Spalte liefert die Reihenfolge direkt (75 ms).
-- 2) Premium-Beispiele (premium_score >= 70, nach premium_score sortiert): eigener kleiner Teilindex (3 s → 0,17 s).
-- 3) firma_lage() rief pruef_kpi(1) nur für 'ausreisser' auf, rechnete dabei aber den ganzen Prüfbestand
--    über alle Leads und Käufer (6–20 s je Zentrale-Cache-Lauf alle 5 min). Ausreißer jetzt direkt aus run_stats.
--
-- Die Indizes wurden live mit CREATE INDEX CONCURRENTLY angelegt; hier "if not exists" für frische Datenbanken.

create index if not exists leads_offen_datum on signalwerk.leads (segment_id, country, event_date desc)
  where status in ('sample', 'new');

create index if not exists leads_offen_premium on signalwerk.leads (segment_id, country, premium_score desc, event_date)
  where status in ('sample', 'new') and premium_score >= 70;

create or replace function signalwerk.firma_lage(p_segment text, p_countries text[])
returns jsonb
language sql stable set search_path = signalwerk, public as $$
  with abos as (
    select s.status, coalesce(nullif(s.amount_cents, 0) / 100.0, s.price_eur_month, 0) as betrag, s.customer_id
      from signalwerk.subscriptions s join signalwerk.customers c on c.id = s.customer_id
     where s.status in ('active', 'past_due') and c.status <> 'cancelled'
       and not (c.status = 'trial' and (c.stripe_customer_id is not null or coalesce(c.notes, '') like '%Stripe-Testmodus%'))
  ), erst as (
    select m.id, m.prospect_id, e.country, m.sent_at
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
     where m.status = 'sent' and m.kind = 'initial' and e.segment_id = p_segment and e.country = any(p_countries)
       and m.sent_at between now() - interval '17 days' and now() - interval '3 days'
  ), plan as (
    select reasons from signalwerk.werk_plan_log where werk = 'lead-werk' order by at desc limit 1
  ), pruef as (
    select sum(geprueft) g, sum(bestanden) b from signalwerk.pruef_stats_daily
     where art = 'lead' and segment_id = p_segment and country = any(p_countries)
       and tag >= (now() at time zone 'Europe/Berlin')::date - 1
  )
  select jsonb_build_object(
    'at', now(),
    'mrr', (select coalesce(round(sum(betrag), 2), 0) from abos),
    'kunden', (select count(distinct customer_id) from abos),
    'mails_24h', (select count(*) from signalwerk.messages where status = 'sent' and sent_at >= now() - interval '24 hours'),
    'antworten_7d', (select count(*) from signalwerk.inbound_replies
                      where received_at >= now() - interval '7 days' and coalesce(intent, '') not in ('out_of_office')),
    'positiv_7d', (select count(*) from signalwerk.inbound_replies
                    where received_at >= now() - interval '7 days' and intent in ('buy', 'sample', 'question')),
    'proben_7d', (select count(*) from signalwerk.sample_requests where created_at >= now() - interval '7 days' and not coalesce(is_test, false))
               + (select count(*) from signalwerk.email_events where type = 'sample_requested' and occurred_at >= now() - interval '7 days'),
    'gruen_7d', (select coalesce(sum(value), 0) from signalwerk.kpi_daily
                  where metric = 'leads_neu' and segment_id = p_segment and country = any(p_countries)
                    and day >= (now() at time zone 'Europe/Berlin')::date - 6),
    'vorrat', (select count(*) from signalwerk.sample_stock where status = 'ready' and segment_id = p_segment and country = any(p_countries)),
    'vorrat_land', (select coalesce(jsonb_object_agg(c, (select count(*) from signalwerk.sample_stock
                                                          where status = 'ready' and segment_id = p_segment and country = c)), '{}'::jsonb)
                      from unnest(p_countries) c),
    'bestanden', (select case when g > 0 then round(b::numeric / g, 4) end from pruef),
    'bestanden_n', (select coalesce(g, 0) from pruef),
    'spam_30d', (select count(*) from signalwerk.email_events where type = 'complained' and occurred_at >= now() - interval '30 days'),
    'spam_neu', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', occurred_at) order by occurred_at desc), '[]'::jsonb)
                   from (select id, occurred_at from signalwerk.email_events
                          where type = 'complained' and occurred_at >= now() - interval '7 days' order by occurred_at desc limit 10) x),
    'heiss_offen', (select count(*) from signalwerk.inbound_replies
                     where intent = 'buy' and status in ('offen', 'spaeter') and owner_action is null),
    'heiss', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'firma', p.company_name, 'land', p.country,
                                                           'alarm', r.alert_sent_at is not null) order by r.received_at desc), '[]'::jsonb)
                from (select * from signalwerk.inbound_replies
                       where intent = 'buy' and status = 'offen' and owner_action is null
                         and received_at >= now() - interval '7 days' order by received_at desc limit 10) r
                left join signalwerk.prospects p on p.id = r.prospect_id),
    'laender', (select coalesce(jsonb_object_agg(c, jsonb_build_object(
                    'erstmails', (select count(*) from erst where country = c),
                    'antworten', (select count(*) from erst x where x.country = c and x.prospect_id is not null and (
                         exists (select 1 from signalwerk.inbound_replies r
                                  where r.prospect_id = x.prospect_id and coalesce(r.intent, '') <> 'out_of_office')
                      or exists (select 1 from signalwerk.messages m2 join signalwerk.email_events v on v.message_id = m2.id
                                  where m2.prospect_id = x.prospect_id
                                    and v.type in ('reply', 'reply_positive', 'reply_negative', 'sample_requested')))))), '{}'::jsonb)
                  from unnest(p_countries) c),
    'leer', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from plan, jsonb_each_text(plan.reasons) e(k, v)
              where v like 'Vorrat leer%'),
    -- gleiche Ausreißer wie pruef_kpi mit 1 Tag, aber ohne dessen Bestands-Zählung über alle Leads/Käufer
    -- (Lastspitze 05.10.2026: der volle pruef_kpi-Aufruf brauchte 6–20 s je Zentrale-Cache-Lauf, nur für diese Liste)
    'ausreisser', coalesce((select jsonb_agg(x) from (
        select coalesce(extra->>'art', 'lead') as art, segment_id, country, sum(candidates)::int as geprueft,
               round(sum(candidates - green)::numeric / nullif(sum(candidates), 0), 4) as fehlerquote
          from signalwerk.run_stats
         where werk = 'dauerpruefung' and finished_at >= now() - interval '24 hours'
         group by 1, 2, 3
        having sum(candidates) >= 20 and sum(candidates - green)::numeric / nullif(sum(candidates), 0) > 0.05) x), '[]'::jsonb)
  );
$$;

revoke all on function signalwerk.firma_lage(text, text[]) from public, anon, authenticated;
grant execute on function signalwerk.firma_lage(text, text[]) to service_role;
