-- Nur noch Premium (Inhaber 05.10.2026: „wir brauchen keine normalen leads mehr nur noch premium leads“).
-- Nicht destruktiv: eine Spalte am Proben-Vorrat, Reihenfolge beim Abruf (Premium zuerst), eine lesende Funktion.
-- Prüfungen beim Abruf (reserviert, blocking, Freigabe < 26 h, geliefert, Sperrliste) bleiben unverändert.

alter table signalwerk.sample_stock add column if not exists premium_n smallint;
comment on column signalwerk.sample_stock.premium_n is
  'Wie viele der 10 Leads beim Bauen Premium waren (scripts/lib/premium.py). 10 = reine Premium-Probe; weniger = mit Standard aufgefüllt.';

create or replace function signalwerk.add_sample_stock(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'signalwerk', 'public'
as $function$
declare
  v_id uuid;
  v_leads uuid[] := array(select jsonb_array_elements_text(p->'lead_ids')::uuid);
  v_cos uuid[] := array(select jsonb_array_elements_text(p->'company_ids')::uuid);
  n int;
begin
  if (select count(distinct x) from unnest(v_leads) x) <> 10 or (select count(distinct x) from unnest(v_cos) x) <> 10 then
    raise exception 'Probe braucht genau 10 verschiedene Leads und Firmen';
  end if;
  update signalwerk.leads set status = 'reserved' where id = any(v_leads) and status = 'new';
  get diagnostics n = row_count;
  if n <> 10 then
    raise exception 'Leads nicht mehr frei (% von 10)', n;
  end if;
  insert into signalwerk.sample_stock (segment_id, country, lang, wish, wish_match, signal_types, lead_ids, company_ids,
                                       score, newest_event, oldest_event, storage_path, subject, expires_at, premium_n)
  values (p->>'segment_id', p->>'country', p->>'lang',
          coalesce(array(select jsonb_array_elements_text(p->'wish')), '{}'),
          coalesce(p->'wish_match', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(p->'signal_types')), '{}'),
          v_leads, v_cos, coalesce((p->>'score')::numeric, 0),
          (p->>'newest_event')::date, (p->>'oldest_event')::date,
          p->>'storage_path', p->>'subject', (p->>'expires_at')::timestamptz,
          least(10, greatest(0, (p->>'premium_n')::int))::smallint)
  returning id into v_id;
  return v_id;
end $function$;

-- Abruf nach dem Klick: Proben mit mehr Premium-Leads zuerst, dann wie bisher (Wunsch, Punktzahl, neueste).
create or replace function signalwerk.claim_sample_stock(p_segment text, p_country text, p_wish text[], p_request uuid)
returns table(id uuid, storage_path text, subject text, lang text)
language plpgsql
security definer
set search_path to 'signalwerk', 'public'
as $function$
#variable_conflict use_column
declare r record; why text;
begin
  for r in
    select s.id, s.storage_path, s.subject, s.lang, s.lead_ids, s.company_ids, s.gate_checked_at
      from signalwerk.sample_stock s
     where s.segment_id = p_segment and s.country = p_country and s.status = 'ready' and s.expires_at > now()
     order by coalesce(s.premium_n, 0) desc,
              (select coalesce(sum(coalesce((s.wish_match->>k)::int, 0)), 0)
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

-- Premium-Stand je Zielgruppe × Land (Tagescheck, Dashboard): freie Premium-Leads (frisch ≤ 30 Tage),
-- fertige Proben, davon reine Premium-Proben (10/10). zu_klein = eine fertige Probe ist mit Standard-Leads aufgefüllt
-- oder es gibt keine 10 freien Premium-Firmen für die nächste Probe.
-- nutzt den Teilindex leads_premium (segment_id, country, premium_score) aus 20261005080000
create or replace function signalwerk.premium_status()
returns table (segment_id text, country text, premium_frei int, proben int, proben_premium int, premium_in_proben int,
               zu_klein boolean)
language sql stable
set search_path = signalwerk, public
as $fn$
  with s as (
    select segment_id, country, count(*)::int proben,
           count(*) filter (where coalesce(premium_n, 0) >= 10)::int proben_premium,
           coalesce(sum(premium_n), 0)::int premium_in_proben
      from signalwerk.sample_stock
     where status = 'ready' and expires_at > now()
     group by 1, 2),
  l as (
    select segment_id, country, count(distinct company_id)::int premium_frei
      from signalwerk.leads
     where status = 'new' and premium_score >= 70 and premium->>'tier' = 'premium'
       and event_date >= current_date - 30
     group by 1, 2),
  p as (select distinct segment_id, country from signalwerk.landing_pages where status = 'live')
  select p.segment_id, p.country, coalesce(l.premium_frei, 0), coalesce(s.proben, 0), coalesce(s.proben_premium, 0),
         coalesce(s.premium_in_proben, 0),
         coalesce(s.proben_premium, 0) < coalesce(s.proben, 0) or coalesce(l.premium_frei, 0) < 10
    from p left join s using (segment_id, country) left join l using (segment_id, country)
   order by 1, 2
$fn$;

revoke all on function signalwerk.premium_status() from public, anon, authenticated;
grant execute on function signalwerk.premium_status() to service_role;
