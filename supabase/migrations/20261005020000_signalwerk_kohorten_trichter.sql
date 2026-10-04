-- Kohorten-Trichter (nicht destruktiv, nur lesend): je Versandwoche (ISO-Woche der ersten Erstmail, deutsche Zeit)
-- und Land: gesendet -> zugestellt -> Antwort -> positiv -> Probe -> Kunde. Einheit = angeschriebener Käufer (prospect).
--  zugestellt: Erstmail ohne Bounce-Ereignis
--  Antwort:   menschliche Antwort auf irgendeine Mail an den Käufer (email_events reply*/sample_requested oder
--             inbound_replies ohne Abwesenheitsnotiz)
--  positiv:   reply_positive/sample_requested oder Cockpit-Einordnung buy/sample
--  Probe:     sample_requested oder Einordnung sample
--  Kunde:     customers.prospect_id
create or replace function signalwerk.cohort_funnel(p_segment text, p_countries text[], p_weeks int default 12)
returns table (week text, country text, sent int, delivered int, replies int, positive int, samples int, customers int)
language sql stable security definer set search_path = '' as $$
  with first_mail as (
    select distinct on (m.prospect_id) m.prospect_id, m.id as message_id, e.country,
           to_char((m.sent_at at time zone 'Europe/Berlin'), 'IYYY-"W"IW') as week
    from signalwerk.messages m
    join signalwerk.experiments e on e.id = m.experiment_id
    where m.kind = 'initial' and m.status = 'sent' and m.sent_at is not null and m.prospect_id is not null
      and e.segment_id = p_segment and e.country = any(p_countries)
    order by m.prospect_id, m.sent_at
  ),
  ev as (
    select m.prospect_id,
           bool_or(x.type = 'bounced' and x.message_id = f.message_id) as bounced,
           bool_or(x.type in ('reply', 'reply_positive', 'reply_negative', 'sample_requested')) as replied,
           bool_or(x.type in ('reply_positive', 'sample_requested')) as positive,
           bool_or(x.type = 'sample_requested') as sample
    from first_mail f
    join signalwerk.messages m on m.prospect_id = f.prospect_id
    join signalwerk.email_events x on x.message_id = m.id
    group by m.prospect_id
  ),
  ir as (
    select r.prospect_id,
           bool_or(coalesce(r.intent, '') <> 'out_of_office') as replied,
           bool_or(r.intent in ('buy', 'sample')) as positive,
           bool_or(r.intent = 'sample') as sample
    from signalwerk.inbound_replies r
    join first_mail f on f.prospect_id = r.prospect_id
    group by r.prospect_id
  )
  select f.week, f.country,
         count(*)::int as sent,
         count(*) filter (where not coalesce(ev.bounced, false))::int as delivered,
         count(*) filter (where coalesce(ev.replied, false) or coalesce(ir.replied, false))::int as replies,
         count(*) filter (where coalesce(ev.positive, false) or coalesce(ir.positive, false))::int as positive,
         count(*) filter (where coalesce(ev.sample, false) or coalesce(ir.sample, false))::int as samples,
         count(*) filter (where exists (select 1 from signalwerk.customers c where c.prospect_id = f.prospect_id))::int as customers
  from first_mail f
  left join ev on ev.prospect_id = f.prospect_id
  left join ir on ir.prospect_id = f.prospect_id
  where f.week >= to_char(((now() at time zone 'Europe/Berlin') - make_interval(weeks => greatest(p_weeks, 1) - 1)), 'IYYY-"W"IW')
  group by f.week, f.country
  order by f.week desc, f.country;
$$;

revoke all on function signalwerk.cohort_funnel(text, text[], int) from public, anon, authenticated;
grant execute on function signalwerk.cohort_funnel(text, text[], int) to service_role;
