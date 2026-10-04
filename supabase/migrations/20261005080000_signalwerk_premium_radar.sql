-- Premium-Bewertung je Lead und Veränderungs-Radar S2 (Inhaber 05.10.2026: „sehr gute, einzigartige Trigger“).
-- Nicht destruktiv: zwei neue Spalten, ein Teilindex, eine lesende Funktion.

alter table signalwerk.leads add column if not exists premium_score smallint;
alter table signalwerk.leads add column if not exists premium jsonb;
comment on column signalwerk.leads.premium_score is
  'Premium-Punktzahl 0–100 (scripts/lib/premium.py): Frische eines datierten Ereignisses, Kombi-Anlass, Beleg, Ansprechperson, Kontakt. Nur Reihenfolge, nie Freigabe.';
comment on column signalwerk.leads.premium is '{"tier": "premium"|"standard", "reasons": [...], "on": Datum}';

create index if not exists leads_premium on signalwerk.leads (segment_id, country, premium_score desc)
  where premium_score is not null and status = 'new';

-- Radar-Kandidaten in Prüfreihenfolge (Teilindex: ohne ihn lief die Abfrage für FR in die Zeitgrenze)
create index if not exists leads_radar on signalwerk.leads (country, event_date, id)
  where segment_id = 'S2' and status = 'new'
    and signal_type in ('no_https', 'website_not_mobile', 'website_outdated', 'website_broken', 'cert_expiring');

-- Radar: bekannte S2-Firmen mit Website und offenem Lead, heute nicht nachgeprüft (ob die Firma schon an einen Käufer
-- ging, prüft lib/radar.py vor jedem neuen Lead – als Teil dieser Abfrage war das bei kaltem Cache zu langsam),
-- Radar-Prüfung älter als p_min_days Tage (oder nie), Lead selbst mindestens p_min_days alt (sonst gerade erst geprüft).
-- Älteste Prüfungen zuerst (Index segment_id, country, status, event_date).
-- Die erste Fassung (text, int, int) bleibt bestehen (kein Löschen); lib/radar.py ruft immer mit allen fünf
-- Argumenten auf, damit PostgREST eindeutig diese Fassung wählt.
create or replace function signalwerk.radar_candidates(p_country text, p_limit int, p_min_days int default 7,
                                                       p_part int default 0, p_parts int default 1)
returns table (company_id uuid, name text, country text, website text, phone_main text, lead_id uuid,
               lead_signal text, lead_checked date, lead_details jsonb, radar jsonb, radar_first date,
               radar_last date, contact jsonb, person jsonb)
language plpgsql stable
set search_path = signalwerk, public
as $fn$
begin
  -- dynamisch mit festen Werten: nur so nutzt Postgres die Index-Reihenfolge (allgemeiner Plan: 39 s statt 1 s, US)
  return query execute format($q$
  select c.id, c.name, c.country, c.website, c.phone_main, l.id, l.signal_type, l.source_date,
         f.details, r.details, r.first_seen, r.last_seen, ct.details, pp.details
  from signalwerk.leads l
  join signalwerk.watch_companies c on c.id = l.company_id
  left join signalwerk.observations r on r.company_id = c.id and r.kind = 'website_audit' and r.key = 'radar'
  left join signalwerk.observations f on f.company_id = c.id and f.kind = 'filing' and f.key = 'website_check'
  left join signalwerk.observations ct on ct.company_id = c.id and ct.kind = 'other' and ct.key = 'contact'
  left join signalwerk.observations pp on pp.company_id = c.id and pp.kind = 'other' and pp.key = 'person'
  left join signalwerk.lead_checks k on k.lead_id = l.id and k.rechecked and k.checked_at >= current_date
  where l.segment_id = 'S2' and l.country = %L and l.status = 'new'
    and l.signal_type in ('no_https', 'website_not_mobile', 'website_outdated', 'website_broken', 'cert_expiring')
    and l.source_date <= current_date - %s
    and c.website is not null and c.website <> ''
    and k.lead_id is null
    and (r.last_seen is null or r.last_seen <= current_date - %s)
    and mod(abs(hashtext(c.id::text)), %s) = %s
  order by l.event_date, l.id
  limit %s$q$, p_country, greatest(1, p_min_days), greatest(1, p_min_days),
    greatest(1, p_parts), greatest(0, p_part), greatest(0, least(p_limit, 20000)));
end
$fn$;

revoke all on function signalwerk.radar_candidates(text, int, int, int, int) from public, anon, authenticated;
grant execute on function signalwerk.radar_candidates(text, int, int, int, int) to service_role;
