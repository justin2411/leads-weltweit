-- Inhaber-Dashboard (Inhaber 03.10.2026: „login … dashboard … mit der aktuellen auswertung über wer wo in welchem
-- prozess ist wv leads wir haben wo engpass ist was vorbereitet ist usw. damit ich immer eine übersicht habe“).
--
-- Nur lesende Kennzahl-Funktionen (Aggregation in der Datenbank statt Tausender Zeilen über die API) und ein Index.
-- Nicht destruktiv: nichts wird geändert oder gelöscht. Aufruf nur mit dem Service-Schlüssel (serverseitig, Vercel).
--   dashboard_live(p_window_start)  schnell (< 0,5 s): Versand, Antworten, Proben, Seiten, Kunden, Engpässe
--   dashboard_stock()               groß (~1–2 s): Leads und Käufer je Zielgruppe × Land; App cacht 10 min
--   dashboard_raw_stock()           Rohbestand (Firmen ohne Lead) je Land (~4 s); App cacht 1 h

-- Käufer je Status/Zielgruppe/Land per Index statt Tabellenscan (bereits CONCURRENTLY angelegt).
create index if not exists prospects_status_seg_country_idx
  on signalwerk.prospects (check_status, segment_id, country, id);

-- ---------------------------------------------------------------------------------------------------------------
create or replace function signalwerk.dashboard_live(p_window_start timestamptz)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '15s' as $$
with
  today as (select (now() at time zone 'Europe/Berlin')::date as d),
  m as (
    select m.id, m.prospect_id, m.status, m.kind, m.sent_at, m.created_at, m.approved_at,
           lower(coalesce(substring(m.sent_from from '<([^>]+)>'), nullif(m.sent_from, ''), '')) as box,
           e.segment_id, e.country
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
  ),
  ev as (
    select ev.id, ev.type, ev.dedupe_key, ev.message_id, ev.occurred_at, ev.created_at, ev.note,
           ev.payload #>> '{bounce,type}' as bounce_type,
           mm.to_email, mm.kind, e.segment_id, e.country, p.id as prospect_id, p.company_name, p.domain
      from signalwerk.email_events ev
      left join signalwerk.messages mm on mm.id = ev.message_id
      left join signalwerk.experiments e on e.id = mm.experiment_id
      left join signalwerk.prospects p on p.id = mm.prospect_id
     where ev.type not in ('sent', 'delivered', 'delivery_delayed')
     order by ev.occurred_at desc
     limit 3000
  ),
  due as (   -- Nachfassmail fällig: Erstmail vor 4+ Tagen, keine Nachfassmail, keine Antwort/Bounce/Sperre
    select m.prospect_id, m.segment_id, m.country, m.sent_at, mm.to_email, p.company_name, p.domain
      from m
      join signalwerk.messages mm on mm.id = m.id
      join signalwerk.prospects p on p.id = m.prospect_id
     where m.status = 'sent' and m.kind = 'initial' and m.sent_at <= now() - interval '4 days'
       and not exists (select 1 from signalwerk.messages x where x.prospect_id = m.prospect_id and x.kind <> 'initial')
       and not exists (select 1 from signalwerk.email_events x where x.message_id = m.id
                        and x.type in ('bounced','complained','failed','reply','reply_positive','reply_negative',
                                       'sample_requested','unsubscribed'))
       and not signalwerk.is_suppressed(mm.to_email)
  )
select jsonb_build_object(
  'now', now(),
  'today', (select d from today),
  'db_size', pg_database_size(current_database()),
  'legal_ready', coalesce((select legal_ready from signalwerk.settings where id = 1), false),
  'segments', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'email_countries', email_countries,
                                                             'status', status) order by id), '[]') from signalwerk.segments),
  'msg', (select coalesce(jsonb_agg(x), '[]') from (
            select segment_id, country, status, kind, count(*) as n,
                   count(*) filter (where status = 'sent' and (sent_at at time zone 'Europe/Berlin')::date = (select d from today)) as today,
                   count(*) filter (where status = 'sent' and sent_at >= now() - interval '7 days') as d7
              from m group by 1, 2, 3, 4) x),
  'sent_days', (select coalesce(jsonb_agg(x), '[]') from (
            select (sent_at at time zone 'Europe/Berlin')::date as day, country, box, count(*) as n
              from m where status = 'sent' and sent_at >= now() - interval '8 days' group by 1, 2, 3) x),
  'boxes', (select coalesce(jsonb_agg(x), '[]') from (
            select box, min(sent_at) as first_sent, max(sent_at) as last_sent, count(*) as n
              from m where status = 'sent' group by 1) x),
  'last_sent_at', (select max(sent_at) from m where status = 'sent'),
  'window_sent', (select count(*) from m where status = 'sent' and sent_at >= p_window_start),
  'delivered', (select coalesce(jsonb_agg(x), '[]') from (
            select e.segment_id, e.country, count(distinct d.message_id) as n
              from signalwerk.email_events d join signalwerk.messages mm on mm.id = d.message_id
              join signalwerk.experiments e on e.id = mm.experiment_id
             where d.type = 'delivered' group by 1, 2) x),
  'events', (select coalesce(jsonb_agg(ev order by ev.occurred_at desc), '[]') from ev),
  'followups_due', (select jsonb_build_object('n', count(*),
            'rows', coalesce((select jsonb_agg(z) from (select * from due order by sent_at limit 100) z), '[]')) from due),
  'sample_requests', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
            select id, company_name, split_part(email, '@', 2) as domain, segment_id, country, status, created_at, sent_at,
                   claimed_at, note
              from signalwerk.sample_requests order by created_at desc limit 300) x),
  'stock', (select coalesce(jsonb_agg(x), '[]') from (
            select segment_id, country,
                   count(*) filter (where status = 'ready' and expires_at > now()) as ready,
                   min(built_at) filter (where status = 'ready' and expires_at > now()) as oldest,
                   max(built_at) as newest,
                   count(*) filter (where status = 'sent' and sent_at >= now() - interval '24 hours') as sent24,
                   count(*) filter (where status = 'failed' and released_at >= now() - interval '24 hours') as failed24
              from signalwerk.sample_stock group by 1, 2) x),
  'stock_last_built', (select max(built_at) from signalwerk.sample_stock),
  'pages', (select coalesce(jsonb_agg(x order by x.slug), '[]') from (
            select p.slug, p.segment_id, p.country, p.status,
                   count(pe.id) filter (where pe.type = 'view') as views,
                   count(pe.id) filter (where pe.type = 'cta_click') as clicks,
                   count(pe.id) filter (where pe.type = 'sample_request') as requests,
                   count(pe.id) filter (where pe.type = 'checkout_started') as checkouts,
                   count(pe.id) filter (where pe.type = 'purchase') as purchases
              from signalwerk.landing_pages p
              left join signalwerk.page_variants v on v.page_id = p.id
              left join signalwerk.page_events pe on pe.variant_id = v.id and pe.created_at >= now() - interval '7 days'
             where p.status = 'live' group by p.id) x),
  'customers', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
            select c.id, c.company_name, c.country, c.status, c.created_at, c.prospect_id,
                   (c.stripe_customer_id is not null) as stripe, coalesce(c.notes, '') like '%Stripe-Testmodus%' as test_note
              from signalwerk.customers c) x),
  'subscriptions', (select coalesce(jsonb_agg(x), '[]') from (
            select id, customer_id, segment_id, status, package, amount_cents, currency, price_eur_month, started_on,
                   current_period_end, first_delivery_approved, filters
              from signalwerk.subscriptions) x),
  'deliveries', (select coalesce(jsonb_agg(x order by x.period_start desc), '[]') from (
            select id, subscription_id, period_start, cardinality(lead_ids) as leads, status, approved_at, sent_at, created_at
              from signalwerk.deliveries order by period_start desc limit 100) x),
  'suppression', (select coalesce(jsonb_object_agg(reason, n), '{}') from (
            select reason, count(*) as n from signalwerk.suppression where kind = 'email' group by 1) x),
  'contact_requests', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
            select id, company_name, country, industry, status, created_at
              from signalwerk.contact_requests order by created_at desc limit 50) x),
  'later_msgs', (select coalesce(jsonb_agg(x), '[]') from (
            select prospect_id, kind, status, sent_at, created_at from signalwerk.messages
             where kind <> 'initial' order by created_at desc limit 2000) x),
  'last_lead_at', (select max(created_at) from signalwerk.leads),
  'last_prospect_at', (select max(created_at) from signalwerk.prospects),
  'experiments', (select coalesce(jsonb_agg(x order by x.segment_id, x.country), '[]') from (
            select id, segment_id, country, variant, status, decision, started_on, last_sent_on
              from signalwerk.experiments) x)
);
$$;

-- ---------------------------------------------------------------------------------------------------------------
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
                                      and not exists (select 1 from signalwerk.messages m where m.prospect_id = p.id)) as unused
              from signalwerk.prospects p group by 1, 2, 3) x),
  'prospects_24h', (select coalesce(jsonb_agg(x), '[]') from (
            select check_status, segment_id, country, count(*) as n from signalwerk.prospects
             where created_at >= now() - interval '24 hours' group by 1, 2, 3) x)
);
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Rohbestand: beobachtete Firmen ohne Lead (unvollständig/widersprüchlich, zum späteren Nachanreichern).
create or replace function signalwerk.dashboard_raw_stock()
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '60s' as $$
select jsonb_build_object('at', now(), 'by_country', coalesce(jsonb_object_agg(country, n), '{}'))
  from (select w.country, count(*) as n from signalwerk.watch_companies w
         where not exists (select 1 from signalwerk.leads l where l.company_id = w.id) group by 1) x;
$$;

revoke all on function signalwerk.dashboard_live(timestamptz) from public, anon, authenticated;
revoke all on function signalwerk.dashboard_stock() from public, anon, authenticated;
revoke all on function signalwerk.dashboard_raw_stock() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_live(timestamptz) to service_role;
grant execute on function signalwerk.dashboard_stock() to service_role;
grant execute on function signalwerk.dashboard_raw_stock() to service_role;
