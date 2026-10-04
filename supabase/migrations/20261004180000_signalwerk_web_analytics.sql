-- Website-Auswertung ohne Google Analytics (Inhaber 04.10.2026: „grafiken zu den websitenaufrufen … heatmaps … bei
-- jarvis auch ein workflow wo ich die performance der website sehen kann“). Eigene, anonyme Messung: KEINE Cookies,
-- KEINE IP, KEINE vollständige Referrer-Adresse, KEINE Formulareingaben, KEINE Kennung über den Seitenaufruf hinaus.
-- Keine Öffnungsmessung von Mails (CLAUDE.md §2) – nur Klicks aus Mails auf die Landingpage (?src=mail&sv=A|B).
-- Nicht destruktiv: nur neue Tabellen, Funktionen und ein Index. Es wird nichts gelöscht; Rohereignisse bleiben
-- schmal (kleine Spalten), die Auswertung liest die Tagessummen (web_daily).

-- ---------------------------------------------------------------------------
-- Ein Zeile je Seitenaufruf (Landingpage). pv = zufällige ID nur dieses einen Aufrufs (für Scrolltiefe und
-- Verweildauer beim Verlassen); sie wird nicht über Aufrufe oder Tage hinweg wiederverwendet.
create table if not exists signalwerk.web_views (
  id          bigint generated always as identity primary key,
  pv          uuid not null unique,
  slug        text not null check (slug ~ '^[a-z]{2}/[a-z0-9-]+$'),
  variant_id  uuid references signalwerk.page_variants(id),
  src         text not null check (src in ('mail', 'direkt', 'suche', 'andere')),
  subj        text check (subj in ('A', 'B')),                       -- Betreff-Variante der Mail (nur bei src = mail)
  device      text not null check (device in ('mobil', 'desktop')),
  depth       smallint not null default 0 check (depth in (0, 25, 50, 75, 100)),
  dwell       text check (dwell in ('0-10', '10-30', '30-60', '60-180', '180+')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists web_views_created on signalwerk.web_views (created_at);

-- Klicks für die Heatmap: Position relativ zur Seite (x in % der Breite, y in % der Seitenhöhe, auf 2 % gerundet),
-- Art des Elements und Beschriftung des Knopfs/Links (Seitentext, nie Eingaben). Ohne Seitenaufruf-ID.
create table if not exists signalwerk.web_clicks (
  id          bigint generated always as identity primary key,
  slug        text not null check (slug ~ '^[a-z]{2}/[a-z0-9-]+$'),
  device      text not null check (device in ('mobil', 'desktop')),
  x           smallint not null check (x between 0 and 98 and x % 2 = 0),
  y           smallint not null check (y between 0 and 98 and y % 2 = 0),
  el          text not null check (el in ('cta', 'button', 'link', 'faq', 'video', 'feld', 'flaeche')),
  label       text check (char_length(label) <= 40),
  created_at  timestamptz not null default now()
);
create index if not exists web_clicks_created on signalwerk.web_clicks (created_at);

-- Tagessummen je Seite (Tag in deutscher Zeit). dim: pe (page_events-Typ), tv (gemessene Aufrufe), src, dev, depth,
-- dwell, mail (Betreff-Variante), hm (Heatmap-Feld „gerät|x|y“), tg (Klickziel „gerät|art|beschriftung“).
create table if not exists signalwerk.web_daily (
  day         date not null,
  slug        text not null,
  dim         text not null check (dim in ('pe', 'tv', 'src', 'dev', 'depth', 'dwell', 'mail', 'hm', 'tg')),
  key         text not null check (char_length(key) <= 80),
  n           int  not null check (n >= 0),
  updated_at  timestamptz not null default now(),
  primary key (day, slug, dim, key)
);

create index if not exists page_events_created on signalwerk.page_events (created_at);

alter table signalwerk.web_views  enable row level security;
alter table signalwerk.web_clicks enable row level security;
alter table signalwerk.web_daily  enable row level security;
revoke all on signalwerk.web_views, signalwerk.web_clicks, signalwerk.web_daily from anon, authenticated;
grant select, insert, update on signalwerk.web_views, signalwerk.web_clicks, signalwerk.web_daily to service_role;

-- ---------------------------------------------------------------------------
-- Ende eines Seitenaufrufs: größte Scrolltiefe und Verweildauer. Nur innerhalb von 6 h nach dem Aufruf.
create or replace function signalwerk.web_view_end(p_pv uuid, p_depth int, p_dwell text)
returns void
language sql volatile security definer set search_path = signalwerk, public as $$
  update signalwerk.web_views
     set depth = greatest(depth, case when p_depth in (0, 25, 50, 75, 100) then p_depth else 0 end)::smallint,
         dwell = case when p_dwell in ('0-10', '10-30', '30-60', '60-180', '180+') then p_dwell else dwell end,
         ended_at = now()
   where pv = p_pv and created_at > now() - interval '6 hours';
$$;
revoke all on function signalwerk.web_view_end(uuid, int, text) from public, anon, authenticated;
grant execute on function signalwerk.web_view_end(uuid, int, text) to service_role;

-- Tagessummen für [p_from, p_to] (deutsche Tage) neu zählen; überschreibt nur Summen, löscht nichts.
create or replace function signalwerk.web_rollup(p_from date, p_to date)
returns int
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '30s' as $$
declare lo timestamptz := p_from::timestamp at time zone 'Europe/Berlin';
        hi timestamptz := (p_to + 1)::timestamp at time zone 'Europe/Berlin';
        k int;
begin
  with v as (
    select (w.created_at at time zone 'Europe/Berlin')::date d, w.slug, w.src, w.subj, w.device, w.depth, w.dwell
      from signalwerk.web_views w where w.created_at >= lo and w.created_at < hi
  ), c as (
    select (x.created_at at time zone 'Europe/Berlin')::date d, x.slug, x.device, x.x, x.y, x.el, coalesce(x.label, '') label
      from signalwerk.web_clicks x where x.created_at >= lo and x.created_at < hi
  ), e as (
    select (pe.created_at at time zone 'Europe/Berlin')::date d, p.slug, pe.type
      from signalwerk.page_events pe
      join signalwerk.page_variants pv on pv.id = pe.variant_id
      join signalwerk.landing_pages p on p.id = pv.page_id
     where pe.created_at >= lo and pe.created_at < hi
  ), agg as (
              select d, slug, 'pe' dim, type key, count(*)::int n from e group by d, slug, type
    union all select d, slug, 'tv', 'all', count(*)::int from v group by d, slug
    union all select d, slug, 'src', src, count(*)::int from v group by d, slug, src
    union all select d, slug, 'dev', device, count(*)::int from v group by d, slug, device
    union all select d, slug, 'depth', depth::text, count(*)::int from v group by d, slug, depth
    union all select d, slug, 'dwell', coalesce(dwell, '-'), count(*)::int from v group by d, slug, coalesce(dwell, '-')
    union all select d, slug, 'mail', coalesce(subj, '-'), count(*)::int from v where src = 'mail' group by d, slug, coalesce(subj, '-')
    union all select d, slug, 'hm', device || '|' || x || '|' || y, count(*)::int from c group by d, slug, device, x, y
    union all select d, slug, 'tg', left(device || '|' || el || '|' || label, 80), count(*)::int from c group by d, slug, left(device || '|' || el || '|' || label, 80)
  )
  , up as (
    insert into signalwerk.web_daily (day, slug, dim, key, n, updated_at)
    select d, slug, dim, key, n, now() from agg
    on conflict (day, slug, dim, key) do update set n = excluded.n, updated_at = excluded.updated_at
    where signalwerk.web_daily.n is distinct from excluded.n
    returning 1
  )
  -- Summen, die es im Zeitraum nicht mehr gibt (z. B. Scrolltiefe 0 → 75 nach dem Verlassen der Seite), auf 0 setzen
  update signalwerk.web_daily w set n = 0, updated_at = now()
   where w.day between p_from and p_to and w.n <> 0
     and not exists (select 1 from agg a where a.d = w.day and a.slug = w.slug and a.dim = w.dim and a.key = w.key);
  get diagnostics k = row_count;
  return k;
end $$;
revoke all on function signalwerk.web_rollup(date, date) from public, anon, authenticated;
grant execute on function signalwerk.web_rollup(date, date) to service_role;

-- Auswertung für das Dashboard (/dashboard/website/auswertung): Tagessummen der letzten p_days Tage (ohne Heatmap),
-- Heatmap und Klickziele über den Zeitraum summiert, dazu gesendete Mails je Land/Zielgruppe/Betreff-Variante
-- (für die Klickquote der Mail-Links). Nur Zählungen, keine Personen.
create or replace function signalwerk.website_stats(p_days int default 30)
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '20s' as $$
declare dd int := least(greatest(coalesce(p_days, 30), 1), 400);
        today date := (now() at time zone 'Europe/Berlin')::date;
        since date := today - (dd - 1);
begin
  perform signalwerk.web_rollup(today - 1, today);
  return jsonb_build_object(
    'now', now(), 'days', dd, 'since', since, 'today', today,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('d', day, 's', slug, 'm', dim, 'k', key, 'n', n)), '[]')
               from signalwerk.web_daily where day >= since and dim not in ('hm', 'tg')),
    'heat', (select coalesce(jsonb_agg(jsonb_build_object('s', slug, 'm', dim, 'k', key, 'n', n)), '[]')
               from (select slug, dim, key, sum(n)::int n from signalwerk.web_daily
                      where day >= since and dim in ('hm', 'tg') group by slug, dim, key) h),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('c', country, 'g', segment_id, 'v', v, 'n', n)), '[]')
               from (select ex.country, ex.segment_id, coalesce(m.subject_variant, '-') v, count(*)::int n
                       from signalwerk.messages m join signalwerk.experiments ex on ex.id = m.experiment_id
                      where m.status = 'sent' and m.kind in ('initial', 'followup')
                        and m.sent_at >= since::timestamp at time zone 'Europe/Berlin'
                      group by 1, 2, 3) s),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('s', slug, 'g', segment_id, 'c', country, 'st', status) order by slug), '[]')
                from signalwerk.landing_pages)
  );
end $$;
revoke all on function signalwerk.website_stats(int) from public, anon, authenticated;
grant execute on function signalwerk.website_stats(int) to service_role;

-- Kennzahlen für die JARVIS-Linie „Website“ (letzte Stunde, 24 h, 30 Tage) in signalwerk.dashboard_cache ('website').
-- Frischt die Tagessummen von gestern/heute mit auf. Aufruf durch die App (im Hintergrund) und den Wachhund.
create or replace function signalwerk.website_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '30s' as $$
declare v jsonb;
        today date := (now() at time zone 'Europe/Berlin')::date;
begin
  perform signalwerk.web_rollup(today - 1, today);
  select jsonb_build_object(
    'at', now(),
    'views_60m', count(*) filter (where type = 'view' and created_at > now() - interval '1 hour'),
    'cta_60m',   count(*) filter (where type = 'cta_click' and created_at > now() - interval '1 hour'),
    'req_60m',   count(*) filter (where type = 'sample_request' and created_at > now() - interval '1 hour'),
    'buy_60m',   count(*) filter (where type = 'purchase' and created_at > now() - interval '1 hour'),
    'views_24h', count(*) filter (where type = 'view' and created_at > now() - interval '24 hours'),
    'cta_24h',   count(*) filter (where type = 'cta_click' and created_at > now() - interval '24 hours'),
    'req_24h',   count(*) filter (where type = 'sample_request' and created_at > now() - interval '24 hours'),
    'buy_24h',   count(*) filter (where type = 'purchase' and created_at > now() - interval '24 hours'),
    'views_30d', count(*) filter (where type = 'view'),
    'cta_30d',   count(*) filter (where type = 'cta_click'),
    'req_30d',   count(*) filter (where type = 'sample_request'),
    'buy_30d',   count(*) filter (where type = 'purchase'),
    'mail_views_30d', (select count(*) from signalwerk.web_views w where w.src = 'mail' and w.created_at > now() - interval '30 days'),
    'mails_30d', (select count(*) from signalwerk.messages m where m.status = 'sent' and m.kind in ('initial', 'followup')
                    and m.sent_at > now() - interval '30 days')
  ) into v
  from signalwerk.page_events where created_at > now() - interval '30 days';
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('website', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.website_refresh() from public, anon, authenticated;
grant execute on function signalwerk.website_refresh() to service_role;

-- Bisherige Aufrufe/Klicks/Anfragen/Käufe einmal in die Tagessummen übernehmen.
select signalwerk.web_rollup(
  coalesce((select (min(created_at) at time zone 'Europe/Berlin')::date from signalwerk.page_events), (now() at time zone 'Europe/Berlin')::date),
  (now() at time zone 'Europe/Berlin')::date);
