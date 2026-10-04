-- Kontakt-Werk (Inhaber 05.10.2026, Plan docs/GEHIRN-AUFBAU.md): Ansprechperson aus dem Register und Telefon/E-Mail
-- von der Firmenwebsite zusammenführen und gegenprüfen (scripts/kontaktwerk.py, lib/kontakt.py).
-- Nicht destruktiv: zwei neue Spalten, ein Teilindex, eine lesende Funktion, eine View, erweiterte Werk-Listen.
--
--   leads.kontakt     Ergebnis der Gegenprüfung (Stufe, Belege je Angabe, Widersprüche, Funde, Premium-Punkt)
--   leads.kontakt_at  Zeitpunkt der letzten Gegenprüfung (nach 30 Tagen erneut)

-- Premium-Spalten wie in der Premium-Radar-Migration (idempotent, falls diese noch nicht angewendet ist)
alter table signalwerk.leads add column if not exists premium_score smallint;
alter table signalwerk.leads add column if not exists premium jsonb;
alter table signalwerk.leads add column if not exists kontakt jsonb;
alter table signalwerk.leads add column if not exists kontakt_at timestamptz;
comment on column signalwerk.leads.kontakt is
  'Kontakt-Werk (scripts/lib/kontakt.py): {"stufe": bestaetigt|teilweise|widerspruch|leer, "person", "phone", "email", "widerspruch", "funde", "premium_punkt", "on"}. Ändert nie die Freigabe.';
comment on column signalwerk.leads.kontakt_at is 'Letzte Gegenprüfung durch das Kontakt-Werk';

-- noch nie gegengeprüfte lieferbare S2-Leads (Auswahl je ID-Ausschnitt)
create index if not exists leads_kontakt_offen on signalwerk.leads (id)
  where segment_id = 'S2' and status = 'new' and kontakt_at is null;
create index if not exists leads_kontakt_alt on signalwerk.leads (kontakt_at)
  where segment_id = 'S2' and status = 'new' and kontakt_at is not null;

-- Premium zuerst: kleiner Teilindex nur der offenen Premium-Leads (ohne ihn 5–50 s je Abfrage)
create index if not exists leads_kontakt_premium on signalwerk.leads (premium_score desc, id) include (company_id, country)
  where segment_id = 'S2' and status = 'new' and kontakt_at is null and premium_score is not null;

-- Kandidaten des Kontakt-Werks. Gruppen (Reihenfolge im Werk): premium, register (Registernummer bekannt),
-- name (UK/FR ohne Nummer und ohne Website: Suche nach Name + Postleitzahl), web (eigene Website),
-- alt (Prüfung älter als 30 Tage). Nur prüfbare Leads: US ohne Website und ohne Registernummer hat keine kostenlose
-- Quelle. Je Gruppe eine eigene Abfrage mit festen Werten (wie radar_candidates: allgemeine Pläne waren zu langsam).
create or replace function signalwerk.kontakt_candidates(p_countries text[], p_group text, p_limit int,
                                                         p_lo uuid default null, p_hi uuid default null,
                                                         p_uk_register boolean default true)
returns table (lead_id uuid, company_id uuid, country text, premium_score smallint, premium jsonb, name text,
               city text, region text, address text, website text, phone_main text, registry_source text,
               registry_id text, website_fetched_at timestamptz)
language plpgsql stable
set search_path = signalwerk, public
as $fn$
declare
  cols text := 'l.id, c.id, l.country, l.premium_score, l.premium, c.name, c.city, c.region, c.address, c.website,
                c.phone_main, c.registry_source, c.registry_id, c.website_fetched_at';
  base text;
  pruefbar text;
  regs text[] := case when p_uk_register then array['rge', 'bodacc_siren', 'ny_dos', 'companies_house']
                      else array['rge', 'bodacc_siren', 'ny_dos'] end;
  names text[] := case when p_uk_register then array['FR', 'UK'] else array['FR'] end;
  lim int := least(greatest(coalesce(p_limit, 1), 1), 2000);
begin
  base := format('l.segment_id = %L and l.status = %L and l.country = any(%L::text[])', 'S2', 'new', p_countries)
       || case when p_lo is not null then format(' and l.id >= %L::uuid', p_lo) else '' end
       || case when p_hi is not null then format(' and l.id < %L::uuid', p_hi) else '' end;
  pruefbar := format('(c.registry_source = any(%L::text[]) or coalesce(c.website, %L) <> %L
                       or (c.registry_source = %L and l.country = any(%L::text[])))', regs, '', '', 'overture', names);
  if p_group = 'premium' then
    return query execute format('select %s from signalwerk.leads l join signalwerk.watch_companies c on c.id = l.company_id
      where %s and l.kontakt_at is null and l.premium_score is not null and %s
      order by l.premium_score desc, l.id limit %s', cols, base, pruefbar, lim);
  elsif p_group = 'register' then
    return query execute format('select %s from signalwerk.watch_companies c join signalwerk.leads l on l.company_id = c.id
      where c.registry_source = any(%L::text[]) and %s and l.kontakt_at is null limit %s', cols, regs, base, lim);
  elsif p_group = 'name' then
    return query execute format('select %s from signalwerk.leads l join signalwerk.watch_companies c on c.id = l.company_id
      where %s and l.kontakt_at is null and l.country = any(%L::text[]) and c.registry_source = %L
        and coalesce(c.website, %L) = %L
      order by l.id limit %s', cols, base, names, 'overture', '', '', lim);
  elsif p_group = 'web' then
    return query execute format('select %s from signalwerk.leads l join signalwerk.watch_companies c on c.id = l.company_id
      where %s and l.kontakt_at is null and coalesce(c.website, %L) <> %L
      order by l.id limit %s', cols, base, '', '', lim);
  elsif p_group = 'alt' then
    return query execute format('select %s from signalwerk.leads l join signalwerk.watch_companies c on c.id = l.company_id
      where %s and l.kontakt_at < now() - interval %L and %s
      order by l.kontakt_at limit %s', cols, base, '30 days', pruefbar, lim);
  end if;
end
$fn$;

revoke all on function signalwerk.kontakt_candidates(text[], text, int, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function signalwerk.kontakt_candidates(text[], text, int, uuid, uuid, boolean) to service_role;

-- Neues Werk in Zählern und Belegungsprotokoll (Erweiterung der erlaubten Werte, nichts entfernt)
alter table signalwerk.run_stats drop constraint if exists run_stats_werk_check;
alter table signalwerk.run_stats add constraint run_stats_werk_check
  check (werk in ('lead-werk', 'kunden-werk', 'proben-vorrat', 'freigabe', 'stichprobe', 'dauerpruefung', 'pruefer-werk',
                  'kontakt-werk'));
alter table signalwerk.werk_plan_log drop constraint if exists werk_plan_log_werk_check;
alter table signalwerk.werk_plan_log add constraint werk_plan_log_werk_check
  check (werk in ('lead-werk', 'kunden-werk', 'pruefer-werk', 'kontakt-werk'));

-- Kennzahlen (Dashboard, Tagescheck): Kontakt-Werk der letzten 24 h je Land
create or replace view signalwerk.kontakt_kpi
with (security_invoker = true) as
select coalesce(r.country, '?') as country,
       sum(r.processed)::int as geprueft_24h,
       sum(r.green)::int as bestaetigt_24h,
       sum(r.yellow)::int as teilweise_24h,
       sum(r.red)::int as widerspruch_24h,
       sum(nullif(r.extra ->> 'personen_neu', '')::int)::int as personen_neu_24h,
       max(r.finished_at) as letzter_lauf
from signalwerk.run_stats r
where r.werk = 'kontakt-werk' and r.finished_at >= now() - interval '24 hours'
group by 1;
revoke all on signalwerk.kontakt_kpi from anon, authenticated;
