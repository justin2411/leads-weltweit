-- Werke im Dashboard (Inhaber 03.10.2026: „die aktuellen werke sehen … ob die laufen und was die aktuell produzieren
-- und was sie produziert haben in bestimmten zeiträumen und welche qualitätsfilter es gibt und wie dort jeweils die
-- zahlen sind“). Nicht destruktiv: neue Tabelle für Zähler je Lauf, neue Lesefunktionen.

-- Zähler je Lauf und Teil (Lead-Werk, Kunden-Werk, Proben-Vorrat schreiben sie am Laufende; scripts/lib/run_stats.py).
create table if not exists signalwerk.run_stats (
  id          bigint generated always as identity primary key,
  werk        text not null check (werk in ('lead-werk', 'kunden-werk', 'proben-vorrat')),
  run_id      text,                       -- GITHUB_RUN_ID
  part        text,                       -- Teil der Matrix bzw. Shard
  segment_id  text,
  country     text,
  started_at  timestamptz,
  finished_at timestamptz not null default now(),
  candidates  int not null default 0,     -- Vorrat/Kandidaten dieses Teils
  processed   int not null default 0,     -- geprüft
  green       int not null default 0,     -- lieferbar bzw. Käufer ok / Probe gebaut
  yellow      int not null default 0,     -- Rohbestand (unvollständig) bzw. nur Anruf/Brief
  red         int not null default 0,     -- verworfen
  reasons     jsonb not null default '{}',-- Grund -> Anzahl
  extra       jsonb not null default '{}'
);
create index if not exists run_stats_werk_time on signalwerk.run_stats (werk, finished_at desc);
alter table signalwerk.run_stats enable row level security;
revoke all on signalwerk.run_stats from anon, authenticated;
grant select, insert on signalwerk.run_stats to service_role;

-- Produktion einer Zielgruppe je Tag (deutsche Zeit): neue Leads je Land und Quelle, neue Käufer je Land und Status.
create or replace function signalwerk.dashboard_production(p_segment text, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '25s' as $$
with rng as (select (p_from::timestamp at time zone 'Europe/Berlin') as t0, ((p_to + 1)::timestamp at time zone 'Europe/Berlin') as t1)
select jsonb_build_object(
  'leads', (select coalesce(jsonb_agg(x), '[]') from (
      select (l.created_at at time zone 'Europe/Berlin')::date as day, l.country, l.source_name as source, count(*) as n
        from signalwerk.leads l, rng
       where l.created_at >= rng.t0 and l.created_at < rng.t1 and l.segment_id = p_segment
       group by 1, 2, 3) x),
  'prospects', (select coalesce(jsonb_agg(x), '[]') from (
      select (p.created_at at time zone 'Europe/Berlin')::date as day, p.country, p.check_status as status, count(*) as n
        from signalwerk.prospects p, rng
       where p.created_at >= rng.t0 and p.created_at < rng.t1 and p.segment_id = p_segment
       group by 1, 2, 3) x),
  -- Prüfgründe der Käufer (aus prospects.check_reason) je Status – ein Durchlauf mit festen Kategorien
  'buyer_reasons', (select coalesce(jsonb_agg(x) filter (where x.n > 0), '[]') from (
      select c.status, k.reason, k.n from (
        select p.check_status as status,
               count(*) filter (where p.check_reason ilike '%keine E-Mail%') as no_mail,
               count(*) filter (where p.check_reason ilike '%Rechtsform%') as legal,
               count(*) filter (where p.check_reason ilike '%nur allgemeine%') as generic,
               count(*) filter (where p.check_reason ilike '%keine Quelle%') as source,
               count(*) filter (where p.check_reason ilike '%Funktionsadresse%' or p.check_reason ilike '%Rollenadresse%') as role,
               count(*) filter (where p.check_reason ilike '%gesperrt%' or p.check_reason ilike '%Sperrliste%') as blocked,
               count(*) filter (where p.check_reason ilike '%Freemail%') as freemail,
               count(*) filter (where p.check_reason ilike '%Größenangabe%') as size_hint,
               count(*) filter (where p.check_reason ilike '%Mail-Domain%passt nicht%') as domain_hint
          from signalwerk.prospects p, rng
         where p.created_at >= rng.t0 and p.created_at < rng.t1 and p.segment_id = p_segment
         group by 1) c,
      lateral (values ('keine E-Mail-Adresse', c.no_mail), ('Rechtsform nicht belegt (nur Kapitalgesellschaften)', c.legal),
                      ('nur allgemeine Adressen erlaubt', c.generic), ('Fundstelle der Adresse fehlt', c.source),
                      ('Funktionsadresse', c.role), ('Sperrliste', c.blocked), ('Freemail-Adresse', c.freemail),
                      ('Größe nicht belegt (nur Hinweis)', c.size_hint), ('Mail-Domain ≠ Website (nur Hinweis)', c.domain_hint)) k(reason, n)
    ) x),
  'runs', (select coalesce(jsonb_agg(x), '[]') from (
      select werk, segment_id, country, sum(candidates) as candidates, sum(processed) as processed, sum(green) as green,
             sum(yellow) as yellow, sum(red) as red, count(*) as parts, max(finished_at) as last_at
        from signalwerk.run_stats, rng
       where finished_at >= rng.t0 and finished_at < rng.t1 and (segment_id = p_segment or segment_id is null)
       group by 1, 2, 3) x),
  'run_reasons', (select coalesce(jsonb_agg(x), '[]') from (
      select werk, key as reason, sum(value::text::int) as n
        from signalwerk.run_stats r, rng, jsonb_each(r.reasons)
       where r.finished_at >= rng.t0 and r.finished_at < rng.t1 and (r.segment_id = p_segment or r.segment_id is null)
         and jsonb_typeof(value) = 'number'
       group by 1, 2) x),
  'last_run', (select coalesce(jsonb_object_agg(werk, last_at), '{}') from (
      select werk, max(finished_at) as last_at from signalwerk.run_stats group by 1) x)
);
$$;
revoke all on function signalwerk.dashboard_production(text, date, date) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_production(text, date, date) to service_role;

-- Drill-down zusätzlich für die Werke: neue Leads, neue Käufer (mail-fähig bzw. nur Anruf/Brief).
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
revoke all on function signalwerk.dashboard_list(text, text, date, date, text, int) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_list(text, text, date, date, text, int) to service_role;

-- Produktion je Tag schnell aus dem Index lesen (bereits CONCURRENTLY angelegt).
create index if not exists leads_seg_created_cover_idx on signalwerk.leads (segment_id, created_at) include (country, source_name);
