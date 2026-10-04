-- Radar-Kandidaten v5: von den Leads aus über den Teilindex leads_radar (v4 lief für US/UK/FR in die Zeitgrenze:
-- der Planer schätzte den Aufteilungs-Filter mod(hashtext(c.id)) falsch und las watch_companies komplett).
-- Aufteilung nur bei p_parts > 1 und auf l.company_id; Details (Kontakt, Person, Befund) erst nach dem Limit.
-- Gleiche Signatur und gleiche Ergebnis-Spalten wie v4 (create or replace, nichts gelöscht). UK 1.000 Zeilen: 0,7 s.
create or replace function signalwerk.radar_candidates(p_country text, p_limit int, p_min_days int default 7,
                                                       p_part int default 0, p_parts int default 1)
returns table (company_id uuid, name text, country text, website text, phone_main text, lead_id uuid,
               lead_signal text, lead_checked date, lead_details jsonb, radar jsonb, radar_first date,
               radar_last date, contact jsonb, person jsonb)
language plpgsql stable
set search_path = signalwerk, public
as $fn$
begin
  return query execute format($q$
  with pick as (
    select l.id, l.company_id, l.signal_type, l.source_date, l.event_date, r.details as radar, r.first_seen, r.last_seen
      from signalwerk.leads l
      join signalwerk.watch_companies c on c.id = l.company_id
      left join signalwerk.observations r on r.company_id = l.company_id and r.kind = 'website_audit' and r.key = 'radar'
     where l.segment_id = 'S2' and l.country = %L and l.status = 'new'
       and l.signal_type in ('no_https', 'website_not_mobile', 'website_outdated', 'website_broken', 'cert_expiring')
       and l.source_date <= current_date - %s
       and c.website is not null and c.website <> ''
       and not exists (select 1 from signalwerk.lead_checks k
                        where k.lead_id = l.id and k.rechecked and k.checked_at >= current_date)
       and (r.last_seen is null or r.last_seen <= current_date - %s)
       %s
     order by l.event_date, l.id
     limit %s)
  select c.id, c.name, c.country, c.website, c.phone_main, p.id, p.signal_type, p.source_date,
         f.details, p.radar, p.first_seen, p.last_seen, ct.details, pp.details
    from pick p
    join signalwerk.watch_companies c on c.id = p.company_id
    left join signalwerk.observations f on f.company_id = p.company_id and f.kind = 'filing' and f.key = 'website_check'
    left join signalwerk.observations ct on ct.company_id = p.company_id and ct.kind = 'other' and ct.key = 'contact'
    left join signalwerk.observations pp on pp.company_id = p.company_id and pp.kind = 'other' and pp.key = 'person'
   order by p.event_date, p.id$q$,
    p_country, greatest(1, p_min_days), greatest(1, p_min_days),
    case when coalesce(p_parts, 1) > 1
         then format('and mod(abs(hashtext(l.company_id::text)), %s) = %s', p_parts, greatest(0, p_part))
         else '' end,
    greatest(0, least(p_limit, 20000)));
end
$fn$;

revoke all on function signalwerk.radar_candidates(text, int, int, int, int) from public, anon, authenticated;
grant execute on function signalwerk.radar_candidates(text, int, int, int, int) to service_role;
