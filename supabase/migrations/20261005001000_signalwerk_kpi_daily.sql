-- KPI-Tageswerte (JARVIS-Plan W1-1): Zeitreihe je Tag × Land × Kennzahl für alle Stationen, nicht nur für Mails.
-- Nicht destruktiv: eine neue Tabelle und eine lesende Funktion. Nichts gelöscht, keine Löschrechte.
--   kpi_daily      Tageswert (deutscher Kalendertag) je Land, Segment und Kennzahl; Upsert über den Schlüssel,
--                  dadurch ist der Lauf beliebig oft wiederholbar (scripts/kpi_snapshot.py, .github/workflows/kpi-tag.yml)
--   kpi_day()      rechnet die Werte eines Tages aus den Rohdaten. Bestandswerte (lieferbar, Käufer, Proben bereit,
--                  offene Antworten, MRR) sind Momentaufnahmen „jetzt“ – deshalb läuft der Schnappschuss kurz vor
--                  Mitternacht deutscher Zeit. Käufer zählen nur mit check_status = ok (Inhaber 02.10.2026).

create table if not exists signalwerk.kpi_daily (
  day         date not null,
  country     text not null check (country ~ '^([A-Z]{2}|ALL)$'),
  segment_id  text not null,
  metric      text not null check (metric ~ '^[a-z_]{2,40}$'),
  value       numeric,
  updated_at  timestamptz not null default now(),
  primary key (day, country, segment_id, metric)
);
comment on table signalwerk.kpi_daily is 'KPI je Tag (Europe/Berlin) × Land × Segment × Kennzahl, scripts/kpi_snapshot.py';
create index if not exists kpi_daily_metric_day on signalwerk.kpi_daily (metric, day desc);

create or replace function signalwerk.kpi_day(p_day date, p_segment text, p_countries text[])
returns table (country text, metric text, value numeric)
language sql stable set search_path = signalwerk, public as $$
  with b as (
    select (p_day::timestamp at time zone 'Europe/Berlin') as t0,
           ((p_day + 1)::timestamp at time zone 'Europe/Berlin') as t1
  ), c as (
    select unnest(p_countries) as country
  ), lead_stock as (
    select l.country, count(*) as n,
           percentile_cont(0.5) within group (order by (p_day - l.event_date)) as age
      from signalwerk.leads l
     where l.segment_id = p_segment and l.country = any(p_countries) and l.status = 'new'
     group by 1
  ), lead_new as (
    select l.country, count(*) as n
      from signalwerk.leads l, b
     where l.segment_id = p_segment and l.created_at >= b.t0 and l.created_at < b.t1 and l.country = any(p_countries)
     group by 1
  ), buyers as (
    select p.country, count(*) as ok,
           count(*) filter (where not exists (select 1 from signalwerk.messages m where m.prospect_id = p.id)) as frei,
           count(*) filter (where p.created_at >= b.t0 and p.created_at < b.t1) as neu
      from signalwerk.prospects p, b
     where p.check_status = 'ok' and p.segment_id = p_segment and p.country = any(p_countries)
     group by 1
  ), gate as (
    select l.country, count(*) filter (where lc.result = 'released') as ok, count(*) as n
      from signalwerk.lead_checks lc join signalwerk.leads l on l.id = lc.lead_id, b
     where lc.checked_at >= b.t0 and lc.checked_at < b.t1 and l.segment_id = p_segment
     group by 1
  ), stock as (
    select s.country, count(*) as n
      from signalwerk.sample_stock s
     where s.status = 'ready' and s.segment_id = p_segment
     group by 1
  ), sent as (
    select s.country, count(*) as n
      from signalwerk.sample_requests s, b
     where s.sent_at >= b.t0 and s.sent_at < b.t1 and not coalesce(s.is_test, false) and s.segment_id = p_segment
     group by 1
  ), runs as (
    select r.country, sum(r.green) as green,
           sum(extract(epoch from (r.finished_at - r.started_at))) / 3600.0 as slot_h
      from signalwerk.run_stats r, b
     where r.werk = 'lead-werk' and r.segment_id = p_segment and r.finished_at >= b.t0 and r.finished_at < b.t1
       and r.started_at is not null and r.finished_at > r.started_at
     group by 1
  ), replies as (
    select coalesce(p.country, 'ALL') as country, count(*) as n
      from signalwerk.inbound_replies r left join signalwerk.prospects p on p.id = r.prospect_id
     where r.status = 'offen'
     group by 1
  ), mrr as (
    select upper(coalesce(s.filters ->> 'country', 'ALL')) as country, sum(coalesce(s.amount_cents, 0)) as cents
      from signalwerk.subscriptions s
     where s.status = 'active' and s.segment_id = p_segment
     group by 1
  )
  select c.country, x.metric, x.value
    from c
    left join lead_stock ls on ls.country = c.country
    left join lead_new ln on ln.country = c.country
    left join buyers bu on bu.country = c.country
    left join gate g on g.country = c.country
    left join stock st on st.country = c.country
    left join sent se on se.country = c.country
    left join runs ru on ru.country = c.country
    left join replies re on re.country = c.country
    left join mrr mr on mr.country = c.country
    cross join lateral (values
      ('leads_lieferbar', coalesce(ls.n, 0)::numeric),
      ('leads_neu', coalesce(ln.n, 0)::numeric),
      ('leads_alter_median_tage', round(ls.age::numeric, 1)),
      ('kaeufer_ok', coalesce(bu.ok, 0)::numeric),
      ('kaeufer_frei', coalesce(bu.frei, 0)::numeric),
      ('kaeufer_neu', coalesce(bu.neu, 0)::numeric),
      ('freigabe_quote', case when g.n > 0 then round(g.ok::numeric / g.n, 4) end),
      ('freigabe_n', coalesce(g.n, 0)::numeric),
      ('proben_bereit', coalesce(st.n, 0)::numeric),
      ('proben_gesendet', coalesce(se.n, 0)::numeric),
      ('gruen_je_platzstunde', case when ru.slot_h > 0 then round(ru.green / ru.slot_h, 1) end),
      ('antworten_offen', coalesce(re.n, 0)::numeric),
      ('mrr_cents', coalesce(mr.cents, 0)::numeric)
    ) as x(metric, value)
  union all
  select 'ALL', 'antworten_offen', count(*)::numeric from signalwerk.inbound_replies where status = 'offen'
  union all
  select 'ALL', 'mrr_cents', coalesce(sum(amount_cents), 0)::numeric
    from signalwerk.subscriptions where status = 'active' and segment_id = p_segment;
$$;

revoke all on function signalwerk.kpi_day(date, text, text[]) from public, anon, authenticated;
alter table signalwerk.kpi_daily enable row level security;
revoke all on signalwerk.kpi_daily from anon, authenticated;
revoke delete, truncate on signalwerk.kpi_daily from service_role;
grant execute on function signalwerk.kpi_day(date, text, text[]) to service_role;
grant select, insert, update on signalwerk.kpi_daily to service_role;
