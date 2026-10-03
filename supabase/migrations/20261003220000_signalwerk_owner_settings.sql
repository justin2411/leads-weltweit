-- Steuerung aus dem Inhaber-Dashboard (Inhaber 03.10.2026: „wo ich direkt auch einfluss auf das ganze nehmen kann …
-- damit ich anpassen kann und workflows selber entscheiden kann“). Nicht destruktiv: neue Tabellen, neue Funktion;
-- dashboard_contacts gibt es zusätzlich mit Zeitraum-Parametern (4 Argumente; die 2-Argument-Fassung bleibt).
--
-- owner_settings: ein Wert je Schlüssel (JSON). Die Skripte lesen sie (scripts/lib/owner_settings.py), die
-- Konfigurationsdateien bleiben Rückfall. Harte Grenzen (Mail-Länder, countries.yaml-Limits, Notbremse, Sperrliste,
-- Frischeprüfung, Probe genau 10, keine Kaltmails über Resend) sind hier bewusst NICHT einstellbar.
create table if not exists signalwerk.owner_settings (
  key         text primary key check (key in (
                'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days',
                'sample_targets', 'sample_max_age_hours', 'buyer_countries_off')),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default 'Inhaber Dashboard'
);

-- Protokoll jeder Änderung und jeder Aktion aus dem Dashboard (wer, wann, vorher/nachher).
create table if not exists signalwerk.owner_log (
  id          bigint generated always as identity primary key,
  action      text not null,
  target      text,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now(),
  created_by  text not null default 'Inhaber Dashboard'
);
create index if not exists owner_log_created on signalwerk.owner_log (created_at desc);

-- Notizen des Inhabers zu einer Firma (Käufer).
create table if not exists signalwerk.owner_notes (
  id          bigint generated always as identity primary key,
  prospect_id uuid not null references signalwerk.prospects(id),
  note        text not null check (length(note) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists owner_notes_prospect on signalwerk.owner_notes (prospect_id, created_at desc);

alter table signalwerk.owner_settings enable row level security;
alter table signalwerk.owner_log enable row level security;
alter table signalwerk.owner_notes enable row level security;
revoke all on signalwerk.owner_settings, signalwerk.owner_log, signalwerk.owner_notes from anon, authenticated;
grant select, insert, update on signalwerk.owner_settings, signalwerk.owner_log, signalwerk.owner_notes to service_role;

-- Wer ist wo mit Zeitraum (Firmen, deren erste Mail im Zeitraum lag; null = alle).
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
              order by last_at desc), '[]') from ranked where rn <= greatest(1, least(p_per_stage, 1000)))
);
$$;
revoke all on function signalwerk.dashboard_contacts(text, int, date, date) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_contacts(text, int, date, date) to service_role;

-- Tageswerte: Absagen/Abmeldungen zählen nicht mehr als Antwort, sondern getrennt als „declined“ (Inhaber 03.10.2026:
-- Übersicht und Kontakte zählten Abmeldungen unterschiedlich).
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


-- Drill-down (Inhaber 03.10.2026: „auf alle zahlen drauf klicken … direkt die unternehmen sehe die geantwortet haben
-- und kurz was sie gesagt haben“): Firmen zu einer Kennzahl im Zeitraum (deutsche Zeit), optional ein Land.
-- Text: Betreff der Mail, gespeicherte Zusammenfassung der Antwort bzw. Bounce-Grund – nur was gespeichert ist.
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
    select msg.prospect_id, msg.country, msg.sent_at as at,
           case msg.kind when 'initial' then 'Erstmail' when 'followup' then 'Nachfassmail' else 'Nachfrage Probe' end as status,
           msg.subject as text
      from msg, rng
     where ((p_metric = 'sent' and msg.kind = 'initial') or (p_metric = 'followups' and msg.kind <> 'initial'))
       and msg.sent_at >= rng.t0 and msg.sent_at < rng.t1
    union all
    select prospect_id, country, occurred_at, 'Bounce',
           coalesce(payload #>> '{bounce,message}', payload #>> '{bounce,subType}', note, to_email)
      from ev where p_metric = 'bounced' and type = 'bounced' and coalesce(payload #>> '{bounce,type}', '') not ilike 'transient'
    union all
    select prospect_id, country, occurred_at,
           case type when 'reply_positive' then 'positiv' when 'sample_requested' then 'Probe gesendet'
                     when 'reply_negative' then 'kein Interesse' when 'unsubscribed' then 'abgemeldet' else 'Antwort' end,
           coalesce(payload ->> 'summary_de', note)
      from rep
     where (p_metric = 'replies' and type in ('reply','reply_positive','sample_requested'))
        or (p_metric = 'positive' and type in ('reply_positive','sample_requested'))
        or (p_metric = 'declined' and type in ('reply_negative','unsubscribed'))
        or (p_metric in ('samples_requested','samples_sent') and type = 'sample_requested')
    union all
    select null::uuid, w.country, w.created_at, case when w.status = 'sent' then 'Website · gesendet' else 'Website · offen' end,
           w.company_name || coalesce(' · ' || w.note, '')
      from web w, rng where p_metric = 'samples_requested' and w.created_at >= rng.t0 and w.created_at < rng.t1
    union all
    select null::uuid, w.country, w.sent_at, 'Website · gesendet', w.company_name
      from web w, rng where p_metric = 'samples_sent' and w.status = 'sent' and w.sent_at >= rng.t0 and w.sent_at < rng.t1
    union all
    select c.prospect_id, c.country, s.started_on::timestamp at time zone 'Europe/Berlin',
           coalesce(s.package, 'Abo') || ' · ' || round(coalesce(s.amount_cents, coalesce(s.price_eur_month, 0) * 100) / 100.0)::text,
           c.company_name
      from signalwerk.subscriptions s join signalwerk.customers c on c.id = s.customer_id
     where p_metric in ('customers', 'revenue') and s.segment_id = p_segment and s.started_on between p_from and p_to
       and (p_country is null or c.country = p_country) and s.status in ('active', 'past_due') and c.status <> 'cancelled'
       and not (c.status = 'trial' and (c.stripe_customer_id is not null or coalesce(c.notes, '') like '%Stripe-Testmodus%'))
  )
select jsonb_build_object(
  'total', (select count(*) from rows),
  'rows', coalesce((select jsonb_agg(jsonb_build_object('prospect_id', r.prospect_id, 'company', coalesce(p.company_name, r.text),
             'domain', p.domain, 'country', r.country, 'at', r.at, 'status', r.status,
             'text', case when p.id is null and r.status like 'Website%' then null else left(r.text, 300) end) order by r.at desc)
           from (select * from rows order by at desc limit greatest(1, least(p_limit, 1000))) r
           left join signalwerk.prospects p on p.id = r.prospect_id), '[]')
);
$$;
revoke all on function signalwerk.dashboard_list(text, text, date, date, text, int) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_list(text, text, date, date, text, int) to service_role;
