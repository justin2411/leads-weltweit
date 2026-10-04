-- Website-Trichter (Inhaber 04.10.2026: „ich will hier einen trichter sehen von startseite angefangen dann landingpage,
-- dann tarifseite, dann stripe und dann danke seite wieviel dort überall waren … mit werten wie bounce rate aufrufe
-- eindeutige aufrufe ähnlich wie bei google analytics, damit es jarvis und ich auswerten können“).
--
-- Eine schlanke Zeile je Seitenaufruf der fünf Stufen: Startseite (/, /fr, /de), Landingpage, Tarif (/start),
-- Stripe (gestarteter Checkout, serverseitig in /api/checkout) und Danke (Seitenaufruf nach dem Kauf).
-- Datenschutz wie 20261004200000 (app/content/legal.ts Abschnitt 5): KEINE Cookies, KEINE IP, KEIN User-Agent – nur der
-- Tages-Besucher-Hash (vh, Salz wird am Folgetag verworfen). Herkunft nur als Art (src) und Domain bzw. utm_source (ref)
-- ohne Pfad und Parameter. Land: bei Landingpage/Tarif/Stripe/Danke der Markt der Seite, bei der Startseite das
-- Länderkürzel, das der Hoster aus der IP ableitet (nur das Kürzel). Inhaber, Vorschau und Bots zählt die App nicht.
--
-- Nicht destruktiv: neue Tabelle und Funktionen, keine Löschrechte, es wird nichts gelöscht. Auswertung vorgerechnet in
-- signalwerk.dashboard_cache ('website_funnel') für 24 h, 7 und 30 Tage.

create table if not exists signalwerk.web_hits (
  id          bigint generated always as identity primary key,
  pv          uuid not null unique default gen_random_uuid(),   -- zufällige ID nur dieses Aufrufs (für das Ende)
  day         date not null,                                    -- deutscher Tag des Salzes
  vh          text not null check (vh ~ '^[0-9a-f]{64}$'),
  stage       text not null check (stage in ('start', 'landing', 'tarif', 'stripe', 'danke')),
  country     text not null check (country ~ '^[A-Z]{2}$'),     -- XX = unbekannt
  slug        text check (slug is null or slug ~ '^[a-z]{2}/[a-z0-9-]+$'),
  device      text check (device in ('mobil', 'desktop')),
  src         text check (src in ('mail', 'direkt', 'suche', 'andere')),
  ref         text check (ref is null or (char_length(ref) <= 60 and ref ~ '^[a-z0-9][a-z0-9._-]*$')),
  dwell_s     smallint check (dwell_s between 0 and 1800),       -- sichtbare Zeit in Sekunden, höchstens 30 min
  scroll      smallint check (scroll in (0, 25, 50, 75, 100)),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists web_hits_created on signalwerk.web_hits (created_at);
create index if not exists web_hits_visitor on signalwerk.web_hits (day, vh);

alter table signalwerk.web_hits enable row level security;
revoke all on signalwerk.web_hits from anon, authenticated;
revoke delete, truncate on signalwerk.web_hits from service_role;
grant select, insert, update on signalwerk.web_hits to service_role;

-- ---------------------------------------------------------------------------
-- Ende eines Aufrufs (pagehide/visibilitychange): längste Verweildauer und größte Scrolltiefe, nur innerhalb 6 h.
create or replace function signalwerk.web_hit_end(p_pv uuid, p_dwell int, p_scroll int)
returns void
language sql volatile security definer set search_path = signalwerk, public as $$
  update signalwerk.web_hits
     set dwell_s = greatest(coalesce(dwell_s, 0), least(greatest(coalesce(p_dwell, 0), 0), 1800))::smallint,
         scroll = (case when p_scroll in (0, 25, 50, 75, 100) then greatest(coalesce(scroll, 0), p_scroll) else scroll end)::smallint,
         ended_at = now()
   where pv = p_pv and stage <> 'stripe' and created_at > now() - interval '6 hours';
$$;
revoke all on function signalwerk.web_hit_end(uuid, int, int) from public, anon, authenticated;
grant execute on function signalwerk.web_hit_end(uuid, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Kennzahlen eines Zeitraums. Einheit „Besucher“ = (Tag, Hash) – eindeutig je Tag wie web_visitors.
--   uv  eindeutige Besucher der Stufe          v   Aufrufe
--   b   Absprünge: Besucher mit genau 1 Aufruf am Tag (alle Stufen) und < 10 s sichtbar (ohne Messung zählt als < 10 s)
--   dw/dn  Summe/Anzahl gemessener Verweildauern (Sekunden) → Ø Zeit
--   nx  Besucher, die am selben Tag auch die nächste Stufe erreichten (Weiter-Quote)
-- Gerät, Herkunft und Domain des Besuchers = die seines ersten Aufrufs am Tag (Einstieg).
create or replace function signalwerk.web_funnel_calc(p_lo timestamptz, p_hi timestamptz)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '20s' as $$
  with h as (
    select day, vh, stage, country, device, src, ref, dwell_s, created_at
      from signalwerk.web_hits where created_at >= p_lo and created_at < p_hi
  ), vis as (
    select day, vh, count(*) n_all,
           (array_agg(device order by created_at) filter (where device is not null))[1] dev,
           (array_agg(src order by created_at) filter (where src is not null))[1] src,
           (array_agg(ref order by created_at) filter (where src is not null))[1] ref,
           array_agg(distinct stage) stages
      from h group by day, vh
  ), vs as (
    select day, vh, stage, country, count(*) v, coalesce(sum(dwell_s), 0) dw, count(dwell_s) dn, coalesce(max(dwell_s), 0) mx
      from h group by day, vh, stage, country
  ), j as (
    select vs.stage, vs.country, coalesce(vis.dev, '-') dev, coalesce(vis.src, '-') src, vis.ref, vs.v, vs.dw, vs.dn,
           (vis.n_all = 1 and vs.mx < 10) bounce,
           coalesce((case vs.stage when 'start' then 'landing' when 'landing' then 'tarif' when 'tarif' then 'stripe'
                                   when 'stripe' then 'danke' end) = any(vis.stages), false) nx
      from vs join vis using (day, vh)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('st', stage, 'c', country, 'dv', dev, 'sr', src, 'uv', uv, 'v', v,
                                                          'b', b, 'dw', dw, 'dn', dn, 'nx', nx))
                        from (select stage, country, dev, src, count(*)::int uv, sum(v)::int v,
                                     count(*) filter (where bounce)::int b, sum(dw)::bigint dw, sum(dn)::int dn,
                                     count(*) filter (where nx)::int nx
                                from j group by 1, 2, 3, 4) r), '[]'::jsonb),
    'refs', coalesce((select jsonb_agg(jsonb_build_object('st', stage, 'c', country, 'r', ref, 'n', n))
                        from (select stage, country, ref, count(*)::int n,
                                     row_number() over (partition by stage, country order by count(*) desc, ref) k
                                from j where ref is not null group by 1, 2, 3) r where k <= 8), '[]'::jsonb),
    'tot', coalesce((select jsonb_object_agg(country, n)
                       from (select country, count(distinct (day, vh))::int n from vs group by country) t), '{}'::jsonb),
    'all', (select count(*)::int from vis)
  );
$$;
revoke all on function signalwerk.web_funnel_calc(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function signalwerk.web_funnel_calc(timestamptz, timestamptz) to service_role;

-- Vorrechnen für Dashboard und JARVIS: 24 h (rollierend), 7 und 30 Tage (deutsche Kalendertage inkl. heute), dazu
-- abgeschlossene Käufe (Stripe-Webhook, page_events „purchase“) je Land und Zeitraum.
create or replace function signalwerk.web_funnel_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '30s' as $$
declare today date := (now() at time zone 'Europe/Berlin')::date;
        hi timestamptz := now() + interval '1 minute';
        lo7 timestamptz := (today - 6)::timestamp at time zone 'Europe/Berlin';
        lo30 timestamptz := (today - 29)::timestamp at time zone 'Europe/Berlin';
        v jsonb;
begin
  v := jsonb_build_object(
    'at', now(),
    'since', (select min(created_at) from signalwerk.web_hits),
    'p', jsonb_build_object(
      '24h', signalwerk.web_funnel_calc(now() - interval '24 hours', hi),
      '7d',  signalwerk.web_funnel_calc(lo7, hi),
      '30d', signalwerk.web_funnel_calc(lo30, hi)),
    -- JARVIS-Linie „Website“, Station Startseite: Besucher der letzten Stunde und wie viele davon weiter zur Landingpage
    'live', (select jsonb_build_object(
               'start_60m', count(distinct (h.day, h.vh)) filter (where h.stage = 'start'),
               'start_land_60m', count(distinct (h.day, h.vh)) filter (where h.stage = 'landing' and h.has_start))
               from (select x.day, x.vh, x.stage,
                            exists (select 1 from signalwerk.web_hits s where s.day = x.day and s.vh = x.vh and s.stage = 'start') has_start
                       from signalwerk.web_hits x where x.created_at > now() - interval '1 hour') h),
    'buy', (select jsonb_build_object(
              '24h', coalesce(jsonb_object_agg(c, n24) filter (where n24 > 0), '{}'::jsonb),
              '7d',  coalesce(jsonb_object_agg(c, n7) filter (where n7 > 0), '{}'::jsonb),
              '30d', coalesce(jsonb_object_agg(c, n30) filter (where n30 > 0), '{}'::jsonb))
              from (select upper(p.country) c,
                           count(*) filter (where pe.created_at > now() - interval '24 hours')::int n24,
                           count(*) filter (where pe.created_at >= lo7)::int n7,
                           count(*)::int n30
                      from signalwerk.page_events pe
                      join signalwerk.page_variants pv on pv.id = pe.variant_id
                      join signalwerk.landing_pages p on p.id = pv.page_id
                     where pe.type = 'purchase' and pe.created_at >= lo30 and p.country is not null
                     group by 1) b));
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('website_funnel', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.web_funnel_refresh() from public, anon, authenticated;
grant execute on function signalwerk.web_funnel_refresh() to service_role;
