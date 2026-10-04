-- Eindeutige Besucher der Website (Inhaber 04.10.2026: „kannst du dort nur eindeutige nutzer tracken nicht wenn jemand
-- wie ich mehrmals aufgerufen hat“) und JARVIS-Linie „Website“ = Landingpage → Tarif → Stripe → Danke → Kunden.
--
-- Datenschutz (app/content/legal.ts Abschnitt 5): KEINE Cookies, KEINE gespeicherte IP, KEIN gespeicherter User-Agent.
-- /api/events bildet serverseitig einen Tages-Besucher-Schlüssel = SHA-256(Tages-Salz | IP | User-Agent | Datum) und
-- speichert nur diesen Hash. Das Salz ist ein Zufallswert je Tag, liegt nur hier in der Datenbank und wird verworfen
-- (auf NULL gesetzt), sobald ein neuer Tag beginnt – danach lässt sich der Hash keiner IP mehr zuordnen, auch nicht
-- durch uns. Zählung „eindeutig je Tag“ (count distinct Hash). Inhaber-Sitzung und Vorschau zählen nicht (App).
--
-- Nicht destruktiv: neue Tabellen und Funktionen, die Prüfregel der Tagessummen nur um zwei Arten erweitert,
-- website_refresh()/web_rollup() neu (alle bisherigen Kennzahlen bleiben). Es wird nichts gelöscht.

-- ---------------------------------------------------------------------------
-- Tages-Salz: eine Zeile je Tag (deutsche Zeit). Ältere Salze werden auf NULL gesetzt (verworfen), die Zeile bleibt.
create table if not exists signalwerk.web_salt (
  day           date primary key,
  salt          text check (salt is null or salt ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  discarded_at  timestamptz
);
alter table signalwerk.web_salt enable row level security;
revoke all on signalwerk.web_salt from anon, authenticated;
grant select, insert, update on signalwerk.web_salt to service_role;

-- Ein Besucher je Tag, Seitenart und Landingpage: nur der Hash, dazu die Zahl seiner Aufrufe an diesem Tag.
create table if not exists signalwerk.web_visitors (
  day       date not null,
  page      text not null check (page in ('landing', 'tarif')),
  slug      text not null check (slug ~ '^[a-z]{2}/[a-z0-9-]+$'),
  vh        text not null check (vh ~ '^[0-9a-f]{64}$'),
  n         int  not null default 1 check (n >= 1),
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  primary key (day, page, slug, vh)
);
create index if not exists web_visitors_last on signalwerk.web_visitors (last_at);
alter table signalwerk.web_visitors enable row level security;
revoke all on signalwerk.web_visitors from anon, authenticated;
grant select, insert, update on signalwerk.web_visitors to service_role;

-- Tagessummen: zwei neue Arten. uv = eindeutige Besucher (key landing|tarif), av = Aufrufe gesamt (key tarif).
alter table signalwerk.web_daily drop constraint if exists web_daily_dim_check;
alter table signalwerk.web_daily add constraint web_daily_dim_check
  check (dim in ('pe', 'tv', 'src', 'dev', 'depth', 'dwell', 'mail', 'hm', 'tg', 'uv', 'av'));

-- ---------------------------------------------------------------------------
-- Salz des heutigen Tages (legt es beim ersten Aufruf des Tages an) und verwirft alle älteren.
create or replace function signalwerk.web_salt_today()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public as $$
declare d date := (now() at time zone 'Europe/Berlin')::date;
        s text;
begin
  insert into signalwerk.web_salt (day, salt)
  values (d, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (day) do nothing;
  update signalwerk.web_salt set salt = null, discarded_at = now() where day < d and salt is not null;
  select w.salt into s from signalwerk.web_salt w where w.day = d;
  return jsonb_build_object('day', d, 'salt', s);
end $$;
revoke all on function signalwerk.web_salt_today() from public, anon, authenticated;
grant execute on function signalwerk.web_salt_today() to service_role;

-- Ein Aufruf eines Besuchers: neu → Zeile, sonst Aufrufe +1. p_day = Tag des Salzes (aus web_salt_today).
create or replace function signalwerk.web_visit(p_page text, p_slug text, p_vh text, p_day date)
returns void
language sql volatile security definer set search_path = signalwerk, public as $$
  insert into signalwerk.web_visitors (day, page, slug, vh)
  select p_day, p_page, p_slug, lower(p_vh)
   where p_day between (now() at time zone 'Europe/Berlin')::date - 1 and (now() at time zone 'Europe/Berlin')::date
  on conflict (day, page, slug, vh) do update set n = signalwerk.web_visitors.n + 1, last_at = now();
$$;
revoke all on function signalwerk.web_visit(text, text, text, date) from public, anon, authenticated;
grant execute on function signalwerk.web_visit(text, text, text, date) to service_role;

-- ---------------------------------------------------------------------------
-- Tagessummen für [p_from, p_to] (deutsche Tage) neu zählen; wie 20261004180000, dazu uv/av aus web_visitors.
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
  ), u as (
    select u.day d, u.slug, u.page, u.n from signalwerk.web_visitors u where u.day between p_from and p_to
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
    union all select d, slug, 'uv', page, count(*)::int from u group by d, slug, page
    union all select d, slug, 'av', page, sum(n)::int from u where page = 'tarif' group by d, slug, page
  )
  , up as (
    insert into signalwerk.web_daily (day, slug, dim, key, n, updated_at)
    select d, slug, dim, key, n, now() from agg
    on conflict (day, slug, dim, key) do update set n = excluded.n, updated_at = excluded.updated_at
    where signalwerk.web_daily.n is distinct from excluded.n
    returning 1
  )
  update signalwerk.web_daily w set n = 0, updated_at = now()
   where w.day between p_from and p_to and w.n <> 0
     and not exists (select 1 from agg a where a.d = w.day and a.slug = w.slug and a.dim = w.dim and a.key = w.key);
  get diagnostics k = row_count;
  return k;
end $$;
revoke all on function signalwerk.web_rollup(date, date) from public, anon, authenticated;
grant execute on function signalwerk.web_rollup(date, date) to service_role;

-- Kennzahlen für die JARVIS-Linie „Website“ in signalwerk.dashboard_cache ('website'): wie 20261004181000, dazu
-- eindeutige Besucher Landingpage (land_*) und Tarif (tarif_*) – „eindeutig je Tag“ = verschiedene (Tag, Hash) –,
-- gestartete Stripe-Checkouts (co_*, serverseitig in /api/checkout) und Käufe (buy_*, Stripe-Webhook).
create or replace function signalwerk.website_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '30s' as $$
declare v jsonb;
        u jsonb;
        today date := (now() at time zone 'Europe/Berlin')::date;
begin
  perform signalwerk.web_rollup(today - 1, today);
  select jsonb_build_object(
    'land_60m',  count(distinct (day, vh)) filter (where page = 'landing' and last_at > now() - interval '1 hour'),
    'land_24h',  count(distinct (day, vh)) filter (where page = 'landing' and last_at > now() - interval '24 hours'),
    'land_30d',  count(distinct (day, vh)) filter (where page = 'landing'),
    'tarif_60m', count(distinct (day, vh)) filter (where page = 'tarif' and last_at > now() - interval '1 hour'),
    'tarif_24h', count(distinct (day, vh)) filter (where page = 'tarif' and last_at > now() - interval '24 hours'),
    'tarif_30d', count(distinct (day, vh)) filter (where page = 'tarif'),
    'tarif_views_30d', coalesce(sum(n) filter (where page = 'tarif'), 0),
    'visitors_since', min(first_at)
  ) into u
  from signalwerk.web_visitors where day >= today - 29;
  select jsonb_build_object(
    'at', now(),
    'views_60m', count(*) filter (where type = 'view' and created_at > now() - interval '1 hour'),
    'cta_60m',   count(*) filter (where type = 'cta_click' and created_at > now() - interval '1 hour'),
    'req_60m',   count(*) filter (where type = 'sample_request' and created_at > now() - interval '1 hour'),
    'co_60m',    count(*) filter (where type = 'checkout_started' and created_at > now() - interval '1 hour'),
    'buy_60m',   count(*) filter (where type = 'purchase' and created_at > now() - interval '1 hour'),
    'views_24h', count(*) filter (where type = 'view' and created_at > now() - interval '24 hours'),
    'cta_24h',   count(*) filter (where type = 'cta_click' and created_at > now() - interval '24 hours'),
    'req_24h',   count(*) filter (where type = 'sample_request' and created_at > now() - interval '24 hours'),
    'co_24h',    count(*) filter (where type = 'checkout_started' and created_at > now() - interval '24 hours'),
    'buy_24h',   count(*) filter (where type = 'purchase' and created_at > now() - interval '24 hours'),
    'views_30d', count(*) filter (where type = 'view'),
    'cta_30d',   count(*) filter (where type = 'cta_click'),
    'req_30d',   count(*) filter (where type = 'sample_request'),
    'co_30d',    count(*) filter (where type = 'checkout_started'),
    'buy_30d',   count(*) filter (where type = 'purchase'),
    'mail_views_30d', (select count(*) from signalwerk.web_views w where w.src = 'mail' and w.created_at > now() - interval '30 days'),
    -- nur Mails seit Beginn der Messung (vorher hatten die Links kein ?src=mail) – sonst falscher Engpass
    'mails_30d', (select count(*) from signalwerk.messages m where m.status = 'sent' and m.kind in ('initial', 'followup')
                    and m.sent_at > greatest(now() - interval '30 days',
                                             coalesce((select min(w.created_at) from signalwerk.web_views w), 'infinity'::timestamptz)))
  ) || u into v
  from signalwerk.page_events where created_at > now() - interval '30 days';
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('website', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.website_refresh() from public, anon, authenticated;
grant execute on function signalwerk.website_refresh() to service_role;
