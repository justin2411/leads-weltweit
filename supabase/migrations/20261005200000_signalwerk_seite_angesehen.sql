-- Seite angesehen + Test-Checkouts (Inhaber 05.10.2026). Nicht destruktiv: nichts gelöscht.
--
-- A) „Seite angesehen“ je Firma: Besuch der Landingpage über den Link der Kaltmail (?r=<Token>), nur per JS-Beacon
--    (/api/events, lib/page-viewed.ts), Link-Scanner gefiltert. Gespeichert als email_events.type = 'page_viewed'
--    (message_id der Mail, höchstens 1 je Firma und Tag über dedupe_key), ohne IP und ohne User-Agent.
--    Kontakte-Board: neue Stufe 'viewed' zwischen 'contacted' und 'replied' + Kennzeichen 'viewed' auf jeder Karte.
-- B) page_events.is_test: die 12 Test-Checkouts vom 02.10.2026 (us/web-agencies A) markiert; alle Auswertungen
--    lesen nur noch echte Ereignisse (Sicht page_events_echt).

-- A1: neuer Ereignistyp
alter table signalwerk.email_events drop constraint if exists email_events_type_check;
alter table signalwerk.email_events add constraint email_events_type_check check (type in (
  'sent','delivered','delivery_delayed','bounced','complained','failed',
  'reply','reply_positive','reply_negative','sample_requested','unsubscribed','auto_reply','page_viewed'));

-- B1: Test-Kennzeichen
alter table signalwerk.page_events add column if not exists is_test boolean not null default false;

-- B2: genau die 12 Test-Checkouts (Inhaber 05.10.2026: „12 Checkouts = Test“)
do $$
declare n int;
begin
  select count(*) into n from signalwerk.page_events
   where variant_id = '56a4fb83-3796-4abe-a39f-a47fdac512ab' and type = 'checkout_started'
     and created_at >= timestamp '2026-10-02 10:12:00' at time zone 'Europe/Berlin'
     and created_at <  timestamp '2026-10-02 20:11:00' at time zone 'Europe/Berlin';
  -- leere Datenbank (CI) = 0; sonst genau 12, sonst nichts markieren
  if n not in (0, 12) then raise exception 'erwartet 12 Test-Checkouts, gefunden %', n; end if;
  update signalwerk.page_events set is_test = true
   where variant_id = '56a4fb83-3796-4abe-a39f-a47fdac512ab' and type = 'checkout_started'
     and created_at >= timestamp '2026-10-02 10:12:00' at time zone 'Europe/Berlin'
     and created_at <  timestamp '2026-10-02 20:11:00' at time zone 'Europe/Berlin'
     and not is_test;
end $$;

-- B3: Sicht nur echter Ereignisse – alle Auswertungen lesen künftig hier
create or replace view signalwerk.page_events_echt with (security_invoker = true) as
  select id, variant_id, type, created_at from signalwerk.page_events where not is_test;
revoke all on signalwerk.page_events_echt from public, anon, authenticated;
grant select on signalwerk.page_events_echt to service_role;

-- B4: jede lesende Funktion und Sicht im Schema auf page_events_echt umstellen (nimmt die aktuelle, live
--     gültige Fassung; schreibende Funktionen bleiben unberührt). Betroffen am 05.10.2026: dashboard_live,
--     web_rollup, website_refresh, web_funnel_refresh, web_analytics_calc, ab_funnel, web_scanner, page_stats, ab_results.
do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'signalwerk' and p.prokind = 'f' and p.prosrc ~ 'signalwerk\.page_events\M'
              and p.prosrc !~* '(insert\s+into|update|delete\s+from)\s+signalwerk\.page_events\M'
  loop
    def := regexp_replace(pg_get_functiondef(r.oid), 'signalwerk\.page_events\M', 'signalwerk.page_events_echt', 'g');
    execute def;
  end loop;
  for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'signalwerk' and c.relkind = 'v' and c.relname <> 'page_events_echt'
              and pg_get_viewdef(c.oid) ~ 'signalwerk\.page_events\M'
  loop
    def := regexp_replace(pg_get_viewdef(r.oid), 'signalwerk\.page_events\M', 'signalwerk.page_events_echt', 'g');
    execute format('create or replace view signalwerk.%I with (security_invoker = true) as %s', r.relname, def);
  end loop;
end $$;

-- A2: Kontakte-Board mit Stufe „Seite angesehen“ (Rangfolge: viewed 1 < out 2 < replied 3 < sample 4)
create or replace function signalwerk.dashboard_contacts(p_segment text, p_per_stage int, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '15s' as $$
with
  first_mail as (
    select m.prospect_id, e.country, min(m.sent_at) as first_sent, max(m.sent_at) as last_sent
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
     where e.segment_id = p_segment and m.status = 'sent'
     group by 1, 2
    having (p_from is null or (min(m.sent_at) at time zone 'Europe/Berlin')::date >= p_from)
       and (p_to is null or (min(m.sent_at) at time zone 'Europe/Berlin')::date <= p_to)
  ),
  evs as (
    select m.prospect_id, ev.type, ev.occurred_at
      from signalwerk.email_events ev join signalwerk.messages m on m.id = ev.message_id
      join signalwerk.experiments e on e.id = m.experiment_id
     where e.segment_id = p_segment
       and ev.type in ('reply','reply_positive','reply_negative','sample_requested','unsubscribed','complained','page_viewed')
  ),
  best as (
    select prospect_id,
           max(case when type = 'sample_requested' then 4 when type in ('reply','reply_positive') then 3
                    when type in ('reply_negative','unsubscribed','complained') then 2 when type = 'page_viewed' then 1 end) as lvl,
           bool_or(type = 'reply_positive') as positive,
           bool_or(type = 'page_viewed') as viewed,
           max(occurred_at) as last_event
      from evs group by 1
  ),
  st as (
    select f.prospect_id, f.country, f.first_sent, greatest(f.last_sent, b.last_event) as last_at,
           case when b.lvl = 4 then 'sample' when b.lvl = 3 then 'replied' when b.lvl = 2 then 'out'
                when b.lvl = 1 then 'viewed' else 'contacted' end as stage,
           coalesce(b.positive, false) as positive, coalesce(b.viewed, false) as viewed, p.company_name, p.domain
      from first_mail f join signalwerk.prospects p on p.id = f.prospect_id
      left join best b on b.prospect_id = f.prospect_id
  ),
  ranked as (select st.*, row_number() over (partition by stage order by last_at desc) as rn from st)
select jsonb_build_object(
  'counts', (select coalesce(jsonb_agg(x), '[]') from (select stage, country, count(*) as n from st group by 1, 2) x),
  'viewed', (select coalesce(jsonb_agg(x), '[]') from (select country, count(*) as n from st where viewed group by 1) x),
  'cards', (select coalesce(jsonb_agg(jsonb_build_object('id', prospect_id, 'stage', stage, 'country', country,
              'company', company_name, 'domain', domain, 'first_sent', first_sent, 'last_at', last_at, 'positive', positive,
              'viewed', viewed)
              order by last_at desc), '[]') from ranked where rn <= greatest(1, least(p_per_stage, 1000)))
);
$$;
revoke all on function signalwerk.dashboard_contacts(text, int, date, date) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_contacts(text, int, date, date) to service_role;

-- B5: Tageswerte des 02.10. und Zwischenspeicher ohne Test-Checkouts neu rechnen
do $$
begin
  perform signalwerk.web_rollup('2026-10-02', '2026-10-02');
  perform signalwerk.website_refresh();
  perform signalwerk.web_funnel_refresh();
  perform signalwerk.web_analytics_refresh();
exception when others then
  raise notice 'Neuberechnung übersprungen: %', sqlerrm;
end $$;
