-- Radar-Kandidaten v6 (Lead-Werk hoch, Inhaber 05.10.2026: „ne lead werk soll hochgefahren werden“).
-- Problem (gemessen 05.10.2026): v5 las die Leads in event_date-Reihenfolge und übersprang dabei alle in den letzten
-- 2 Tagen schon geprüften Firmen (Nachschlagen je Zeile in observations). Je mehr das Radar prüfte und je mehr Teile
-- parallel liefen (Aufteilung hash mod K: jeder Teil braucht K × so viele Zeilen), desto länger: US mit 6 Teilen 10 s
-- > statement_timeout 8 s, unter Last auch FR – alle Radar-Teile brachen mit 57014 ab.
-- Lösung: leads.radar_due (nächste Nachprüfung frühestens an diesem Tag; null = source_date + 2) mit Teilindex in
-- Fälligkeits-Reihenfolge; das Radar setzt radar_due nach jeder Prüfung (radar_mark_due). Die Sperre „höchstens alle
-- 2 Tage, nie zweimal am Tag“ bleibt unverändert an observations.last_seen (gleicher Filter wie v5).
-- Nicht destruktiv: neue Spalte, neuer Index, neue Funktion, gleiche Signatur und Spalten von radar_candidates.
alter table signalwerk.leads add column if not exists radar_due date;
comment on column signalwerk.leads.radar_due is 'Veränderungs-Radar: nächste Nachprüfung frühestens an diesem Tag (null = source_date + 2). Gesetzt von scripts/lib/radar.py über radar_mark_due; nur Reihenfolge/Tempo, die Sperre 1 Abruf je Seite und Tag bleibt observations.last_seen.';

-- angewandt mit „create index concurrently“ (keine Schreibsperre); hier für neue Umgebungen
create index if not exists leads_radar_due on signalwerk.leads
  (country, (coalesce(radar_due, source_date + 2)), event_date, id) include (company_id)
  where segment_id = 'S2' and status = 'new'
    and signal_type in ('no_https', 'website_not_mobile', 'website_outdated', 'website_broken', 'cert_expiring');

-- schon geprüfte Firmen: nächste Prüfung = letzte Radar-Prüfung + 2 Tage (sonst stünden sie vorn und würden übersprungen)
update signalwerk.leads l set radar_due = r.last_seen + 2
  from signalwerk.observations r
 where r.company_id = l.company_id and r.kind = 'website_audit' and r.key = 'radar' and r.last_seen > current_date - 2
   and l.segment_id = 'S2' and l.status = 'new'
   and l.signal_type in ('no_https', 'website_not_mobile', 'website_outdated', 'website_broken', 'cert_expiring')
   and l.radar_due is null;

create or replace function signalwerk.radar_mark_due(p_ids uuid[], p_due date)
returns int
language sql
set search_path = signalwerk, public
as $fn$
  with u as (update signalwerk.leads set radar_due = p_due where id = any(p_ids) returning 1)
  select count(*)::int from u;
$fn$;
revoke all on function signalwerk.radar_mark_due(uuid[], date) from public, anon, authenticated;
grant execute on function signalwerk.radar_mark_due(uuid[], date) to service_role;

-- Plan fest vorgegeben (gemessen 05.10.2026 unter Last): der Planer wählte sonst Bitmap-Scan über alle fälligen Leads
-- + Merge-Join über alle Radar-Beobachtungen (US 29 s); so liest er den Fälligkeits-Index in Reihenfolge bis zum Limit
-- (US, Teil 3/6, 1.000 Zeilen: ~4.300 Indexzeilen). Das Radar fragt je Abruf höchstens 1.000 / Teile Zeilen ab.
create or replace function signalwerk.radar_candidates(p_country text, p_limit int, p_min_days int default 7,
                                                       p_part int default 0, p_parts int default 1)
returns table (company_id uuid, name text, country text, website text, phone_main text, lead_id uuid,
               lead_signal text, lead_checked date, lead_details jsonb, radar jsonb, radar_first date,
               radar_last date, contact jsonb, person jsonb)
language plpgsql stable
set search_path = signalwerk, public
set enable_bitmapscan = off
set enable_hashjoin = off
set enable_mergejoin = off
as $fn$
begin
  return query execute format($q$
  with pick as materialized (
    select l.id, l.company_id, l.signal_type, l.source_date, l.event_date,
           coalesce(l.radar_due, l.source_date + 2) as due
      from signalwerk.leads l
     where l.segment_id = 'S2' and l.country = %L and l.status = 'new'
       and l.signal_type in ('no_https', 'website_not_mobile', 'website_outdated', 'website_broken', 'cert_expiring')
       and coalesce(l.radar_due, l.source_date + 2) <= current_date
       and l.source_date <= current_date - %s
       %s
       and exists (select 1 from signalwerk.watch_companies c0
                    where c0.id = l.company_id and c0.website is not null and c0.website <> '')
       and not exists (select 1 from signalwerk.lead_checks k
                        where k.lead_id = l.id and k.rechecked and k.checked_at >= current_date)
       and not exists (select 1 from signalwerk.observations r0
                        where r0.company_id = l.company_id and r0.kind = 'website_audit' and r0.key = 'radar'
                          and r0.last_seen > current_date - %s)
     order by coalesce(l.radar_due, l.source_date + 2), l.event_date, l.id
     limit %s)
  -- Details je Zeile über den eindeutigen Index (company_id, kind, key); ein Left Join las sonst alle Radar-Zustände
  -- je Zeile (88.000 × 200, 8 s)
  select c.id, c.name, c.country, c.website, c.phone_main, p.id, p.signal_type, p.source_date,
         (select f.details from signalwerk.observations f
           where f.company_id = p.company_id and f.kind = 'filing' and f.key = 'website_check'),
         r.details, r.first_seen, r.last_seen,
         (select ct.details from signalwerk.observations ct
           where ct.company_id = p.company_id and ct.kind = 'other' and ct.key = 'contact'),
         (select pp.details from signalwerk.observations pp
           where pp.company_id = p.company_id and pp.kind = 'other' and pp.key = 'person')
    from pick p
    join signalwerk.watch_companies c on c.id = p.company_id
    left join lateral (select r1.details, r1.first_seen, r1.last_seen from signalwerk.observations r1
                        where r1.company_id = p.company_id and r1.kind = 'website_audit' and r1.key = 'radar') r on true
   order by p.due, p.event_date, p.id$q$,
    p_country, greatest(1, p_min_days),
    case when coalesce(p_parts, 1) > 1
         then format('and mod(abs(hashtext(l.company_id::text)), %s) = %s', p_parts, greatest(0, p_part))
         else '' end,
    greatest(1, p_min_days),
    greatest(0, least(p_limit, 20000)));
end
$fn$;

revoke all on function signalwerk.radar_candidates(text, int, int, int, int) from public, anon, authenticated;
grant execute on function signalwerk.radar_candidates(text, int, int, int, int) to service_role;

-- Heute vom Prüfer nachgeprüfte Leads (lead_checks.rechecked, Website schon abgerufen) darf das Radar heute nicht
-- prüfen (1 Abruf je Seite und Tag). Gemessen 05.10.2026: 13.200 von ~21.000 FR-Kandidaten – der Index-Scan musste sie
-- alle überspringen. radar_skip_rechecked schiebt sie auf morgen (nur radar_due, gesperrte Zeilen werden übersprungen,
-- nie gewartet); das Radar ruft es zu Beginn jedes Landes auf.
create or replace function signalwerk.radar_skip_rechecked(p_country text, p_limit int default 5000)
returns int
language sql
set search_path = signalwerk, public
as $fn$
  with c as (
    select l.id
      from signalwerk.lead_checks k
      join signalwerk.leads l on l.id = k.lead_id
     where k.rechecked and k.checked_at >= current_date
       and l.segment_id = 'S2' and l.country = p_country and l.status = 'new'
       and l.signal_type in ('no_https', 'website_not_mobile', 'website_outdated', 'website_broken', 'cert_expiring')
       and coalesce(l.radar_due, l.source_date + 2) <= current_date
     limit greatest(1, least(p_limit, 20000))
       for update of l skip locked),
  u as (update signalwerk.leads l set radar_due = current_date + 1 from c where l.id = c.id returning 1)
  select count(*)::int from u;
$fn$;
revoke all on function signalwerk.radar_skip_rechecked(text, int) from public, anon, authenticated;
grant execute on function signalwerk.radar_skip_rechecked(text, int) to service_role;
