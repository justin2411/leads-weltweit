-- Drei-Stufen-Freigabe je Lead (Inhaber 03.10.2026: „alle leads müssen individuell geprüft werden, es dürfen keine
-- fehler passieren … prüfung immer der trigger an sich ob er auch wirklich passt, danach ob die lead qualität … stimmt
-- und vollständig ist und danach ob er sinnvoll ist es so dem kunden zu übermitteln“) und Werke-Aktivität fürs Dashboard.
-- Nicht destruktiv: neue Tabellen/Spalten/Funktionen, zwei Prüfregeln (check constraints) nur ERWEITERT, nichts gelöscht.
--   lead_checks          Ergebnis der Freigabe je Lead (freigegeben / durchgefallen mit Stufe und Gründen)
--   leads.status 'held'  durchgefallen: geht nie raus (Grund in lead_checks), Daten bleiben
--   werk_heartbeat       „lebt“-Zeichen der laufenden Werke (alle ~2 min), damit das Dashboard „läuft“ ehrlich zeigt
--   sample_stock.gate_checked_at  letzte bestandene Freigabe aller 10 Leads einer Vorrats-Probe
--   claim_sample_stock   gibt nur Proben heraus, deren 10 Leads in den letzten 26 h freigegeben wurden, nicht gesperrt
--                        und an niemanden geliefert sind (sonst verworfen, Leads frei, Probe wird neu gebaut)
--   expire_sample_stock  Webagenturen (S2) ohne Verfall nach Alter (Inhaber 03.10.2026: „bei webagencys ist das kein thema“)
--   discard_sample_stock fertige Probe verwerfen (Freigabe nicht bestanden), Leads freigeben
--   dashboard_activity   letzte Aktivität je Werk (schnell, für Live-Anzeigen)
--   dashboard_production + 'run_stages' (Zähler je Prüfstufe aus run_stats.extra->'stufen')

-- 1) Lead-Status „held“ (Freigabe nicht bestanden) – Liste nur erweitert
alter table signalwerk.leads drop constraint if exists leads_status_check;
alter table signalwerk.leads add constraint leads_status_check
  check (status = any (array['new','sample','delivered','expired','reserved','held'])) not valid;
alter table signalwerk.leads validate constraint leads_status_check;

-- 2) Ergebnis der Freigabe je Lead
create table if not exists signalwerk.lead_checks (
  lead_id      uuid primary key references signalwerk.leads(id) on delete cascade,
  result       text not null check (result in ('released', 'failed')),
  failed_stage smallint check (failed_stage between 1 and 3),
  reasons      jsonb not null default '[]',
  context      text,                     -- vorrat | probe | lieferung | stichprobe
  rechecked    boolean not null default false,  -- Trigger heute live nachgeprüft (Website/Domain)
  checked_at   timestamptz not null default now()
);
create index if not exists lead_checks_time on signalwerk.lead_checks (checked_at desc);
alter table signalwerk.lead_checks enable row level security;
revoke all on signalwerk.lead_checks from anon, authenticated;
grant select, insert, update on signalwerk.lead_checks to service_role;

-- 3) Zähler je Lauf auch für Freigabe und tägliche Stichprobe
alter table signalwerk.run_stats drop constraint if exists run_stats_werk_check;
alter table signalwerk.run_stats add constraint run_stats_werk_check
  check (werk = any (array['lead-werk','kunden-werk','proben-vorrat','freigabe','stichprobe']));

-- 4) Lebenszeichen der Werke
create table if not exists signalwerk.werk_heartbeat (
  werk       text not null,
  part       text not null,
  run_id     text,
  started_at timestamptz,
  beat_at    timestamptz not null default now(),
  processed  int not null default 0,
  green      int not null default 0,
  note       text,
  primary key (werk, part)
);
alter table signalwerk.werk_heartbeat enable row level security;
revoke all on signalwerk.werk_heartbeat from anon, authenticated;
grant select, insert, update on signalwerk.werk_heartbeat to service_role;

-- 5) Vorrats-Proben: letzte bestandene Freigabe
alter table signalwerk.sample_stock add column if not exists gate_checked_at timestamptz;

create or replace function signalwerk.mark_sample_stock_checked(p_stock uuid)
returns void language sql security definer set search_path = signalwerk, public as $$
  update signalwerk.sample_stock set gate_checked_at = now() where id = p_stock and status = 'ready';
$$;

create or replace function signalwerk.discard_sample_stock(p_stock uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = signalwerk, public as $$
declare r record;
begin
  select * into r from signalwerk.sample_stock where id = p_stock for update;
  if not found or r.status <> 'ready' then
    return false;
  end if;
  update signalwerk.sample_stock set status = 'expired', released_at = now(), note = coalesce(p_note, 'Freigabe nicht bestanden')
   where id = p_stock;
  update signalwerk.leads set status = 'new' where id = any(r.lead_ids) and status = 'reserved';
  return true;
end $$;

-- 6) Verfall: Webagenturen (S2) nie nach Alter (Konstante keep), hängende Vergaben weiter nach 30 min.
--    Gleiche Signatur wie bisher (eine zweite Fassung mit Parameter wäre für PostgREST mehrdeutig).
create or replace function signalwerk.expire_sample_stock(p_hours integer default 48)
returns integer language plpgsql security definer set search_path = signalwerk, public as $function$
declare r record; n int := 0; keep text[] := array['S2'];
begin
  for r in select * from signalwerk.sample_stock
            where (status = 'ready' and not (segment_id = any(keep))
                   and (expires_at <= now() or built_at < now() - make_interval(hours => p_hours)))
               or (status = 'claimed' and claimed_at < now() - interval '30 minutes')
            for update skip locked
  loop
    if r.status = 'ready' then
      update signalwerk.sample_stock set status = 'expired', released_at = now(), note = 'Verfall (Alter)' where id = r.id;
      update signalwerk.leads set status = 'new' where id = any(r.lead_ids) and status = 'reserved';
    else
      update signalwerk.sample_stock set status = 'failed', released_at = now(), note = 'Vergabe hing > 30 min'
       where id = r.id;
      update signalwerk.leads set status = 'sample' where id = any(r.lead_ids) and status = 'reserved';
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$;
-- S2-Vorrat ohne Verfall: bestehende fertige Proben bekommen ein fernes Ablaufdatum
update signalwerk.sample_stock set expires_at = built_at + interval '3650 days'
 where segment_id = 'S2' and status = 'ready';

-- 7) Herausgabe nur mit frischer Freigabe; zusätzlich Sperrliste und Exklusivität direkt beim Abruf
create or replace function signalwerk.claim_sample_stock(p_segment text, p_country text, p_wish text[], p_request uuid)
returns table(id uuid, storage_path text, subject text, lang text)
language plpgsql security definer set search_path = signalwerk, public as $function$
#variable_conflict use_column
declare r record; why text;
begin
  for r in
    select s.id, s.storage_path, s.subject, s.lang, s.lead_ids, s.company_ids, s.gate_checked_at
      from signalwerk.sample_stock s
     where s.segment_id = p_segment and s.country = p_country and s.status = 'ready' and s.expires_at > now()
     order by (select coalesce(sum(coalesce((s.wish_match->>k)::int, 0)), 0)
                 from unnest(coalesce(p_wish, '{}'::text[])) k) desc,
              s.score desc, s.built_at desc
     for update of s skip locked
  loop
    why := null;
    if (select count(*) from signalwerk.leads l where l.id = any(r.lead_ids) and l.status = 'reserved') <> 10 then
      why := 'Leads nicht mehr reserviert';
    elsif exists (select 1 from signalwerk.observations o
                   where o.company_id = any(r.company_ids) and o.kind = 'other' and o.key = 'quality'
                     and o.details->>'blocking' = 'true') then
      why := 'Qualitätsprüfung blocking';
    elsif r.gate_checked_at is null or r.gate_checked_at < now() - interval '26 hours'
       or (select count(*) from signalwerk.lead_checks c
            where c.lead_id = any(r.lead_ids) and c.result = 'released' and c.checked_at >= r.gate_checked_at - interval '2 hours') <> 10 then
      why := 'Freigabe fehlt oder älter als 26 h';
    elsif exists (select 1 from signalwerk.deliveries d where d.lead_ids && r.lead_ids) then
      why := 'Lead schon geliefert';
    elsif exists (select 1 from signalwerk.observations o
                   where o.company_id = any(r.company_ids) and o.kind = 'other' and o.key = 'contact'
                     and o.details->>'email' is not null
                     and signalwerk.is_suppressed(o.details->>'email')) then
      why := 'Sperrliste';
    end if;
    if why is not null then
      update signalwerk.sample_stock set status = 'expired', released_at = now(), note = 'beim Abruf ungültig: ' || why
       where sample_stock.id = r.id;
      update signalwerk.leads set status = 'new' where leads.id = any(r.lead_ids) and leads.status = 'reserved';
      continue;
    end if;
    update signalwerk.sample_stock set status = 'claimed', claimed_at = now(), request_id = p_request
     where sample_stock.id = r.id;
    id := r.id; storage_path := r.storage_path; subject := r.subject; lang := r.lang;
    return next;
    return;
  end loop;
end $function$;

-- 8) Aktivität je Werk (schnell): Live-Anzeigen im Dashboard
create or replace function signalwerk.dashboard_activity()
returns jsonb language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '10s' as $$
select jsonb_build_object(
  'now', now(),
  'heartbeats', (select coalesce(jsonb_agg(x), '[]') from (
      select werk, part, run_id, started_at, beat_at, processed, green, note from signalwerk.werk_heartbeat
       where beat_at >= now() - interval '1 day') x),
  'last_run', (select coalesce(jsonb_object_agg(werk, last_at), '{}') from (
      select werk, max(finished_at) as last_at from signalwerk.run_stats group by 1) x),
  'last_lead_at', (select max(created_at) from signalwerk.leads),
  'leads_15m', (select count(*) from signalwerk.leads where created_at >= now() - interval '15 minutes'),
  'leads_60m', (select count(*) from signalwerk.leads where created_at >= now() - interval '60 minutes'),
  'last_prospect_at', (select max(created_at) from signalwerk.prospects),
  'last_prospect_checked_at', (select max(checked_at) from signalwerk.prospects),
  'buyers_ok_60m', (select count(*) from signalwerk.prospects where check_status = 'ok' and checked_at >= now() - interval '60 minutes'),
  'last_sent_at', (select max(sent_at) from signalwerk.messages where status = 'sent'),
  'sent_15m', (select count(*) from signalwerk.messages where status = 'sent' and sent_at >= now() - interval '15 minutes'),
  'sent_60m', (select count(*) from signalwerk.messages where status = 'sent' and sent_at >= now() - interval '60 minutes'),
  'last_reply_at', (select max(occurred_at) from signalwerk.email_events
                     where type in ('reply','reply_positive','reply_negative','sample_requested')),
  'replies_60m', (select count(*) from signalwerk.email_events
                   where type in ('reply','reply_positive','reply_negative','sample_requested') and occurred_at >= now() - interval '60 minutes'),
  'stock_last_built', (select max(built_at) from signalwerk.sample_stock),
  'stock_built_60m', (select count(*) from signalwerk.sample_stock where built_at >= now() - interval '60 minutes'),
  'stock_sent_60m', (select count(*) from signalwerk.sample_stock where status = 'sent' and sent_at >= now() - interval '60 minutes'),
  'last_stock_sent_at', (select max(sent_at) from signalwerk.sample_stock where status = 'sent'),
  'last_request_at', (select max(created_at) from signalwerk.sample_requests),
  'last_gate_at', (select max(checked_at) from signalwerk.lead_checks),
  'gate_60m', (select coalesce(jsonb_object_agg(result, n), '{}') from (
      select result, count(*) as n from signalwerk.lead_checks where checked_at >= now() - interval '60 minutes' group by 1) x),
  'stichprobe', (select coalesce(jsonb_agg(x), '[]') from (
      select distinct on (country) country, finished_at, candidates, green, red, reasons
        from signalwerk.run_stats where werk = 'stichprobe' order by country, finished_at desc) x)
);
$$;
revoke all on function signalwerk.dashboard_activity() from public, anon, authenticated;
grant execute on function signalwerk.dashboard_activity() to service_role;

-- 9) Produktion: zusätzlich Zähler je Prüfstufe (run_stats.extra->'stufen')
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
  -- Käufer, die eine Nachprüfung (Registernummer) im Zeitraum auf mail-fähig gehoben hat (created_at liegt davor)
  'prospects_rechecked', (select coalesce(jsonb_agg(x), '[]') from (
      select (p.checked_at at time zone 'Europe/Berlin')::date as day, p.country, count(*) as n
        from signalwerk.prospects p, rng
       where p.checked_at >= rng.t0 and p.checked_at < rng.t1 and p.created_at < rng.t0
         and p.segment_id = p_segment and p.check_status = 'ok'
       group by 1, 2) x),
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
      select werk, r.country, key as reason, sum(value::text::int) as n
        from signalwerk.run_stats r, rng, jsonb_each(r.reasons)
       where r.finished_at >= rng.t0 and r.finished_at < rng.t1 and (r.segment_id = p_segment or r.segment_id is null)
         and jsonb_typeof(value) = 'number'
       group by 1, 2, 3) x),
  'run_stages', (select coalesce(jsonb_agg(x), '[]') from (
      select werk, r.country, coalesce(r.extra->>'teil', '') as teil, key as stage, sum(value::text::bigint) as n
        from signalwerk.run_stats r, rng, jsonb_each(coalesce(r.extra->'stufen', '{}'))
       where r.finished_at >= rng.t0 and r.finished_at < rng.t1 and (r.segment_id = p_segment or r.segment_id is null)
         and jsonb_typeof(value) = 'number'
       group by 1, 2, 3, 4) x),
  'last_run', (select coalesce(jsonb_object_agg(werk, last_at), '{}') from (
      select werk, max(finished_at) as last_at from signalwerk.run_stats group by 1) x)
);
$$;
revoke all on function signalwerk.dashboard_production(text, date, date) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_production(text, date, date) to service_role;

-- 10) Werke per Klick an/aus (Inhaber 03.10.2026: „alles direkt per click an und ausschalten können jedes werk“):
--     neuer Schlüssel werke_paused = {"lead-werk": "<seit>", …}. Sicherheitsfunktionen (Abmeldung, Webhook-Sperren,
--     Sperrliste, Notbremse, Abmelde-Erkennung) sind bewusst nicht schaltbar. Liste nur erweitert.
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days',
  'sample_targets', 'sample_max_age_hours', 'buyer_countries_off', 'werke_paused'));
