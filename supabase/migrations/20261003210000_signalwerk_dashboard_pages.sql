-- Inhaber-Dashboard mit Unterseiten (Inhaber 03.10.2026: „mach zu den punkten einzelne seiten … nur webagencies …
-- jeden tag sehen wv mails gingen raus was sind die ergebnisse und wie war es gestern, die woche, letzte woche,
-- letzter monat, letzte 3 monate, ganzes jahr“). Nur lesende Funktionen, nicht destruktiv, nur Service-Schlüssel.

-- Tageswerte einer Zielgruppe je Land (Kalendertage in deutscher Zeit) zwischen p_from und p_to (einschließlich).
-- Antworten: je eingehender Mail nur das aussagekräftigste Ereignis (wie scripts/lib/stats.py), ohne Abwesenheit.
-- Proben: per Mail-Antwort gesendete (sample_requested) + Website-Anfragen. Kunden/Umsatz: neue Abos ohne Testkäufe.
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
    select day, country, count(*) filter (where type <> 'auto_reply') as replies,
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
     where r.segment_id = p_segment and r.created_at >= rng.t0 and r.created_at < rng.t1 group by 1, 2
  ),
  webs as (
    select (r.sent_at at time zone 'Europe/Berlin')::date as day, r.country, count(*) as web_sent
      from signalwerk.sample_requests r, rng
     where r.segment_id = p_segment and r.status = 'sent' and r.sent_at >= rng.t0 and r.sent_at < rng.t1 group by 1, 2
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
         'replies', coalesce(r.replies, 0), 'positive', coalesce(r.positive, 0),
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

-- Wer ist wo: jede angeschriebene Firma einer Zielgruppe mit ihrer weitesten Stufe.
-- Stufen: contacted (angeschrieben) → replied (geantwortet) → sample (Probe per Mail erhalten); out = Absage/Abmeldung.
-- Je Stufe und Land die Anzahl und die neuesten p_per_stage Firmen.
create or replace function signalwerk.dashboard_contacts(p_segment text, p_per_stage int default 30)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '15s' as $$
with
  first_mail as (
    select m.prospect_id, e.country, min(m.sent_at) as first_sent, max(m.sent_at) as last_sent
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
     where e.segment_id = p_segment and m.status = 'sent'
     group by 1, 2
  ),
  evs as (
    select m.prospect_id, ev.type, ev.occurred_at
      from signalwerk.email_events ev join signalwerk.messages m on m.id = ev.message_id
      join signalwerk.experiments e on e.id = m.experiment_id
     where e.segment_id = p_segment
       and ev.type in ('reply','reply_positive','reply_negative','sample_requested','unsubscribed','complained')
  ),
  best as (
    select prospect_id,
           max(case when type = 'sample_requested' then 4 when type in ('reply_negative','unsubscribed','complained') then 1
                    when type in ('reply','reply_positive') then 3 end) as lvl,
           bool_or(type = 'reply_positive') as positive,
           max(occurred_at) as last_event
      from evs group by 1
  ),
  st as (
    select f.prospect_id, f.country, f.first_sent, greatest(f.last_sent, b.last_event) as last_at,
           case when b.lvl = 4 then 'sample' when b.lvl = 3 then 'replied' when b.lvl = 1 then 'out' else 'contacted' end as stage,
           coalesce(b.positive, false) as positive, p.company_name, p.domain
      from first_mail f join signalwerk.prospects p on p.id = f.prospect_id
      left join best b on b.prospect_id = f.prospect_id
  ),
  ranked as (select st.*, row_number() over (partition by stage order by last_at desc) as rn from st)
select jsonb_build_object(
  'counts', (select coalesce(jsonb_agg(x), '[]') from (select stage, country, count(*) as n from st group by 1, 2) x),
  'cards', (select coalesce(jsonb_agg(jsonb_build_object('id', prospect_id, 'stage', stage, 'country', country,
              'company', company_name, 'domain', domain, 'first_sent', first_sent, 'last_at', last_at, 'positive', positive)
              order by last_at desc), '[]') from ranked where rn <= greatest(1, least(p_per_stage, 200)))
);
$$;

revoke all on function signalwerk.dashboard_daily(text, date, date) from public, anon, authenticated;
revoke all on function signalwerk.dashboard_contacts(text, int) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_daily(text, date, date) to service_role;
grant execute on function signalwerk.dashboard_contacts(text, int) to service_role;
