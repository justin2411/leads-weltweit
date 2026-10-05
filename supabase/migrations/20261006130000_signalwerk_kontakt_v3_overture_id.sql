-- Premium-Labor 05.10.2026: Kontakt-Version 3 – Radar-Firmen (overture_web) tragen die Overture-ID als registry_id;
-- der Website-Abgleich meldete deshalb falsch „other_registry_id“ und verwarf die Website (keine Person aus dem
-- Impressum, keine Kontakt-Belege). Gruppe 'nachholen' prüft frische Premium-Radar-Leads UK/FR mit Version < 3 einmal
-- neu (vorher < 2). Nur Auswahl, nicht destruktiv, Freigabe unverändert.
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
                       or (c.registry_source = any(%L::text[]) and l.country = any(%L::text[])))', regs, '', '',
                       array['overture', 'overture_web'], names);
  if p_group = 'premium' then
    return query execute format('select %s from signalwerk.leads l join signalwerk.watch_companies c on c.id = l.company_id
      where %s and l.kontakt_at is null and l.premium_score is not null and %s
      order by l.premium_score desc, l.id limit %s', cols, base, pruefbar, lim);
  elsif p_group = 'nachholen' then
    -- Premium-Labor 05.10.2026: frische Premium-Leads aus dem Radar (overture_web) wurden vor Kontakt-Version 2 ohne
    -- Registersuche geprüft. Einmal neu (danach v = 3; Version 3: Overture-ID kein Registerabgleich), nur UK/FR, nur wenn die Website wieder gelesen werden darf.
    return query execute format('select %s from signalwerk.leads l join signalwerk.watch_companies c on c.id = l.company_id
      where %s and l.premium_score >= 70 and l.premium ->> %L = %L and l.event_date >= current_date - 14
        and l.kontakt_at is not null and coalesce((l.kontakt ->> %L)::int, 0) < 3
        and l.country = any(%L::text[]) and c.registry_source = %L
        and (c.website_fetched_at is null or c.website_fetched_at < now() - interval %L)
      order by l.premium_score desc, l.id limit %s', cols, base, 'tier', 'premium', 'v', names, 'overture_web',
      '20 hours', lim);
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
