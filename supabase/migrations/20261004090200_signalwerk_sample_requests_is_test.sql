-- Testproben des Inhabers zählen nicht als echte Proben (Prüfung 04.10.2026). Bisher waren nur Vorschau-Anfragen
-- (status 'rejected') ausgenommen; schickt der Inhaber über die öffentliche Seite eine Probe an sich selbst, zählte sie
-- in funnel()/dashboard_daily/dashboard_list mit. Neu: sample_requests.is_test (App setzt es bei Inhaber-Vorschau,
-- angemeldetem Inhaber oder OWNER_EMAIL/SALE_NOTIFY_EMAIL als Adresse). Der Versand selbst bleibt unverändert.
-- Zusätzlich zählt dashboard_live 'ready' im Proben-Vorrat nur Proben mit Freigabe < 26 h – dieselbe Bedingung wie
-- claim_sample_stock (vorher zählten auch Proben, die beim Abruf verworfen würden).
-- Funktionen exakt aus 20261003180000 (dashboard_live), 20261003220000 (dashboard_daily) und 20261003230000
-- (dashboard_list) übernommen, nur die genannten Filter ergänzt. Nicht destruktiv: neue Spalte mit Standardwert,
-- create or replace function mit gleicher Signatur.
alter table signalwerk.sample_requests add column if not exists is_test boolean not null default false;

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
                   claimed_at, note, is_test
              from signalwerk.sample_requests order by created_at desc limit 300) x),
  'stock', (select coalesce(jsonb_agg(x), '[]') from (
            select segment_id, country,
                   count(*) filter (where status = 'ready' and expires_at > now()
                                      and gate_checked_at >= now() - interval '26 hours') as ready,
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

create or replace function signalwerk.dashboard_daily(p_segment text, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '15s' as $$
with
  rng as (select (p_from::timestamp at time zone 'Europe/Berlin') as t0,
                 ((p_to + 1)::timestamp at time zone 'Europe/Berlin') as t1),
  msg as (
    select m.id, m.kind, m.sent_at, m.to_email, e.country
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
     where e.segment_id = p_segment and m.status = 'sent'
  ),
  sent as (
    select (sent_at at time zone 'Europe/Berlin')::date as day, country,
           count(*) filter (where kind = 'initial') as sent, count(*) filter (where kind <> 'initial') as followups
      from msg, rng where sent_at >= rng.t0 and sent_at < rng.t1 group by 1, 2
  ),
  ev as (
    select ev.*, msg.country,
           coalesce(substring(ev.dedupe_key from '^(?:imap|reply|unknown):(.+)$'), ev.message_id::text, ev.id::text) as mail_key,
           case ev.type when 'reply_positive' then 5 when 'sample_requested' then 4 when 'reply_negative' then 3
                        when 'unsubscribed' then 2 when 'auto_reply' then 1 else 0 end as prio
      from signalwerk.email_events ev join msg on msg.id = ev.message_id, rng
     where ev.occurred_at >= rng.t0 and ev.occurred_at < rng.t1
  ),
  rep as (
    select distinct on (mail_key) mail_key, type, country, (occurred_at at time zone 'Europe/Berlin')::date as day
      from ev where type in ('reply','reply_positive','reply_negative','sample_requested','unsubscribed','auto_reply')
     order by mail_key, prio desc, occurred_at
  ),
  repd as (
    select day, country, count(*) filter (where type in ('reply','reply_positive','sample_requested')) as replies,
           count(*) filter (where type in ('reply_negative','unsubscribed')) as declined,
           count(*) filter (where type in ('reply_positive','sample_requested')) as positive,
           count(*) filter (where type = 'sample_requested') as mail_samples
      from rep group by 1, 2
  ),
  bnc as (
    select (occurred_at at time zone 'Europe/Berlin')::date as day, country, count(distinct message_id) as bounced
      from ev where type = 'bounced' and coalesce(payload #>> '{bounce,type}', '') not ilike 'transient' group by 1, 2
  ),
  web as (
    select (r.created_at at time zone 'Europe/Berlin')::date as day, r.country,
           count(*) filter (where r.status <> 'rejected') as web_req
      from signalwerk.sample_requests r, rng
     where r.segment_id = p_segment and not r.is_test and r.created_at >= rng.t0 and r.created_at < rng.t1 group by 1, 2
  ),
  webs as (
    select (r.sent_at at time zone 'Europe/Berlin')::date as day, r.country, count(*) as web_sent
      from signalwerk.sample_requests r, rng
     where r.segment_id = p_segment and not r.is_test and r.status = 'sent' and r.sent_at >= rng.t0 and r.sent_at < rng.t1 group by 1, 2
  ),
  cust as (
    select s.started_on as day, c.country, count(*) as customers,
           sum(coalesce(s.amount_cents, round(coalesce(s.price_eur_month, 0) * 100)::int)) as revenue_cents
      from signalwerk.subscriptions s join signalwerk.customers c on c.id = s.customer_id
     where s.segment_id = p_segment and s.started_on between p_from and p_to
       and s.status in ('active', 'past_due') and c.status <> 'cancelled'
       and not (c.status = 'trial' and (c.stripe_customer_id is not null or coalesce(c.notes, '') like '%Stripe-Testmodus%'))
     group by 1, 2
  ),
  keys as (
    select day, country from sent union select day, country from repd union select day, country from bnc
    union select day, country from web union select day, country from webs union select day, country from cust
  )
select coalesce(jsonb_agg(jsonb_build_object(
         'day', k.day, 'country', k.country,
         'sent', coalesce(s.sent, 0), 'followups', coalesce(s.followups, 0), 'bounced', coalesce(b.bounced, 0),
         'replies', coalesce(r.replies, 0), 'declined', coalesce(r.declined, 0), 'positive', coalesce(r.positive, 0),
         'samples_requested', coalesce(r.mail_samples, 0) + coalesce(w.web_req, 0),
         'samples_sent', coalesce(r.mail_samples, 0) + coalesce(ws.web_sent, 0),
         'customers', coalesce(c.customers, 0), 'revenue_cents', coalesce(c.revenue_cents, 0)) order by k.day), '[]')
  from keys k
  left join sent s on s.day = k.day and s.country is not distinct from k.country
  left join repd r on r.day = k.day and r.country is not distinct from k.country
  left join bnc b on b.day = k.day and b.country is not distinct from k.country
  left join web w on w.day = k.day and w.country is not distinct from k.country
  left join webs ws on ws.day = k.day and ws.country is not distinct from k.country
  left join cust c on c.day = k.day and c.country is not distinct from k.country;
$$;

create or replace function signalwerk.dashboard_list(p_segment text, p_metric text, p_from date, p_to date,
                                                      p_country text, p_limit int)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '15s' as $$
with
  rng as (select (p_from::timestamp at time zone 'Europe/Berlin') as t0,
                 ((p_to + 1)::timestamp at time zone 'Europe/Berlin') as t1),
  msg as (
    select m.id, m.kind, m.sent_at, m.subject, m.to_email, m.prospect_id, e.country
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
     where e.segment_id = p_segment and m.status = 'sent' and (p_country is null or e.country = p_country)
  ),
  ev as (
    select ev.id, ev.type, ev.occurred_at, ev.note, ev.payload, msg.prospect_id, msg.country, msg.to_email,
           coalesce(substring(ev.dedupe_key from '^(?:imap|reply|unknown):(.+)$'), ev.message_id::text, ev.id::text) as mail_key,
           case ev.type when 'reply_positive' then 5 when 'sample_requested' then 4 when 'reply_negative' then 3
                        when 'unsubscribed' then 2 when 'auto_reply' then 1 else 0 end as prio
      from signalwerk.email_events ev join msg on msg.id = ev.message_id, rng
     where ev.occurred_at >= rng.t0 and ev.occurred_at < rng.t1
  ),
  rep as (
    select distinct on (mail_key) * from ev
     where type in ('reply','reply_positive','reply_negative','sample_requested','unsubscribed','auto_reply')
     order by mail_key, prio desc, occurred_at
  ),
  web as (
    select r.* from signalwerk.sample_requests r
     where r.segment_id = p_segment and (p_country is null or r.country = p_country) and r.status <> 'rejected'
       and not r.is_test
  ),
  rows as (
    select msg.prospect_id, null::uuid as cid, msg.country, msg.sent_at as at,
           case msg.kind when 'initial' then 'Erstmail' when 'followup' then 'Nachfassmail' else 'Nachfrage Probe' end as status,
           msg.subject as text
      from msg, rng
     where ((p_metric = 'sent' and msg.kind = 'initial') or (p_metric = 'followups' and msg.kind <> 'initial'))
       and msg.sent_at >= rng.t0 and msg.sent_at < rng.t1
    union all
    select prospect_id, null::uuid, country, occurred_at, 'Bounce',
           coalesce(payload #>> '{bounce,message}', payload #>> '{bounce,subType}', note, to_email)
      from ev where p_metric = 'bounced' and type = 'bounced' and coalesce(payload #>> '{bounce,type}', '') not ilike 'transient'
    union all
    select prospect_id, null::uuid, country, occurred_at,
           case type when 'reply_positive' then 'positiv' when 'sample_requested' then 'Probe gesendet'
                     when 'reply_negative' then 'kein Interesse' when 'unsubscribed' then 'abgemeldet' else 'Antwort' end,
           coalesce(payload ->> 'summary_de', note)
      from rep
     where (p_metric = 'replies' and type in ('reply','reply_positive','sample_requested'))
        or (p_metric = 'positive' and type in ('reply_positive','sample_requested'))
        or (p_metric = 'declined' and type in ('reply_negative','unsubscribed'))
        or (p_metric in ('samples_requested','samples_sent') and type = 'sample_requested')
    union all
    select null::uuid, null::uuid, w.country, w.created_at, case when w.status = 'sent' then 'Website · gesendet' else 'Website · offen' end,
           w.company_name || coalesce(' · ' || w.note, '')
      from web w, rng where p_metric = 'samples_requested' and w.created_at >= rng.t0 and w.created_at < rng.t1
    union all
    select null::uuid, null::uuid, w.country, w.sent_at, 'Website · gesendet', w.company_name
      from web w, rng where p_metric = 'samples_sent' and w.status = 'sent' and w.sent_at >= rng.t0 and w.sent_at < rng.t1
    union all
    select null::uuid, l.company_id, l.country, l.created_at, l.source_name, l.event_summary
      from signalwerk.leads l, rng
     where p_metric = 'leads_new' and l.segment_id = p_segment and (p_country is null or l.country = p_country)
       and l.created_at >= rng.t0 and l.created_at < rng.t1
    union all
    select p.id, null::uuid, p.country, p.created_at,
           case p.check_status when 'ok' then 'mail-fähig' when 'call_only' then 'nur Anruf/Brief' else p.check_status end,
           p.check_reason
      from signalwerk.prospects p, rng
     where p_metric in ('buyers_new', 'buyers_call_only') and p.segment_id = p_segment and (p_country is null or p.country = p_country)
       and p.check_status = case p_metric when 'buyers_new' then 'ok' else 'call_only' end
       and p.created_at >= rng.t0 and p.created_at < rng.t1
    union all
    select c.prospect_id, null::uuid, c.country, s.started_on::timestamp at time zone 'Europe/Berlin',
           coalesce(s.package, 'Abo') || ' · ' || round(coalesce(s.amount_cents, coalesce(s.price_eur_month, 0) * 100) / 100.0)::text,
           c.company_name
      from signalwerk.subscriptions s join signalwerk.customers c on c.id = s.customer_id
     where p_metric in ('customers', 'revenue') and s.segment_id = p_segment and s.started_on between p_from and p_to
       and (p_country is null or c.country = p_country) and s.status in ('active', 'past_due') and c.status <> 'cancelled'
       and not (c.status = 'trial' and (c.stripe_customer_id is not null or coalesce(c.notes, '') like '%Stripe-Testmodus%'))
  )
select jsonb_build_object(
  'total', (select count(*) from rows),
  'rows', coalesce((select jsonb_agg(jsonb_build_object('prospect_id', r.prospect_id, 'company', coalesce(p.company_name, wc.name, r.text),
             'domain', p.domain, 'country', r.country, 'at', r.at, 'status', r.status,
             'text', case when p.id is null and r.status like 'Website%' then null else left(r.text, 300) end) order by r.at desc)
           from (select * from rows order by at desc limit greatest(1, least(p_limit, 1000))) r
           left join signalwerk.prospects p on p.id = r.prospect_id
           left join signalwerk.watch_companies wc on wc.id = r.cid), '[]')
);
$$;

revoke all on function signalwerk.dashboard_live(timestamptz) from public, anon, authenticated;
revoke all on function signalwerk.dashboard_daily(text, date, date) from public, anon, authenticated;
revoke all on function signalwerk.dashboard_list(text, text, date, date, text, int) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_live(timestamptz) to service_role;
grant execute on function signalwerk.dashboard_daily(text, date, date) to service_role;
grant execute on function signalwerk.dashboard_list(text, text, date, date, text, int) to service_role;
