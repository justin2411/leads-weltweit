-- Website-Analyse wie GA4/Plausible, ohne Cookies (Inhaber 04.10.2026: „pass die website mehr mit daten an die z.b.
-- auch google analytics oder marketing firmen empfehlen, ich will das jarvis super auswertungen hat“).
--
-- Datenschutz unverändert (cookielos, §25 TDDDG/PECR/CNIL): im Browser wird nichts gespeichert oder ausgelesen; eindeutige
-- Besucher nur über den Tages-Hash (Salz wird nach einem Tag verworfen). Neu:
--   web_hits  + browser (Familie aus dem User-Agent, nur die Klasse), utm_medium, utm_campaign (bereinigt, ohne Personenbezug)
--   web_events  Zählungen ohne Kennung: CTA-Klick, Formular begonnen/abgeschickt, Video gestartet/zu Ende
--   web_vitals  Core Web Vitals echter Besuche (LCP, INP, CLS) als Messwert ohne Kennung
-- Auswertung vorgerechnet in dashboard_cache ('website_analytics', web_analytics_refresh) für 24 h / 7 T / 30 T, je
-- Zeitraum mit Vorzeitraum, für alle Länder und US/UK/FR. Nicht destruktiv: nur neue Spalten, Tabellen und Funktionen.

alter table signalwerk.web_hits add column if not exists browser text
  check (browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'andere'));
alter table signalwerk.web_hits add column if not exists utm_medium text
  check (utm_medium is null or (char_length(utm_medium) <= 40 and utm_medium ~ '^[a-z0-9][a-z0-9._-]*$'));
alter table signalwerk.web_hits add column if not exists utm_campaign text
  check (utm_campaign is null or (char_length(utm_campaign) <= 40 and utm_campaign ~ '^[a-z0-9][a-z0-9._-]*$'));

create table if not exists signalwerk.web_events (
  id          bigint generated always as identity primary key,
  day         date not null,
  stage       text not null check (stage in ('start', 'landing', 'tarif', 'danke')),
  country     text not null check (country ~ '^[A-Z]{2}$'),
  slug        text check (slug is null or slug ~ '^[a-z]{2}/[a-z0-9-]+$'),
  kind        text not null check (kind in ('cta', 'form_start', 'form_submit', 'video_start', 'video_done')),
  created_at  timestamptz not null default now()
);
create index if not exists web_events_created on signalwerk.web_events (created_at);

create table if not exists signalwerk.web_vitals (
  id          bigint generated always as identity primary key,
  day         date not null,
  stage       text not null check (stage in ('start', 'landing', 'tarif', 'danke')),
  country     text not null check (country ~ '^[A-Z]{2}$'),
  slug        text check (slug is null or slug ~ '^[a-z]{2}/[a-z0-9-]+$'),
  device      text check (device in ('mobil', 'desktop')),
  lcp_ms      int check (lcp_ms between 0 and 60000),
  inp_ms      int check (inp_ms between 0 and 60000),
  cls_m       int check (cls_m between 0 and 10000),   -- CLS × 1000
  created_at  timestamptz not null default now()
);
create index if not exists web_vitals_created on signalwerk.web_vitals (created_at);

alter table signalwerk.web_events enable row level security;
alter table signalwerk.web_vitals enable row level security;
revoke all on signalwerk.web_events, signalwerk.web_vitals from anon, authenticated;
revoke delete, truncate on signalwerk.web_events, signalwerk.web_vitals from service_role;
grant select, insert on signalwerk.web_events, signalwerk.web_vitals to service_role;

-- ---------------------------------------------------------------------------
-- Kennzahlen eines Zeitraums (p_country null = alle). Besucher = (Tag, Hash) wie im Trichter.
--   k   Kopfzahlen: visitors, views, engaged (GA4: ≥ 10 s sichtbar oder ≥ 2 Aufrufe oder Checkout), eng_s (Summe
--       sichtbarer Sekunden), scroll_n/scroll75 (Aufrufe mit Messung / davon ≥ 75 %), tarif, stripe, danke (Besucher),
--       ttc_s (Median Sekunden vom ersten Aufruf bis zum Checkout), cta/forms/formd/vid/vidd (Ereignisse),
--       lcp/inp/cls (p75 aller Seiten), vit_n
--   ch  Kanäle (Art, Quelle, Medium, Kampagne) mit Besuchern, Tarif, Checkout
--   en/ex Einstiegs- und Ausstiegsseiten (Stufe|Slug)     br/dv/co  Browser, Gerät, Land (Besucher)
--   wh  Aufrufe je Wochentag (1 = Mo) und Stunde, deutsche Zeit
--   sc  Scrolltiefe je Stufe          ev  Ereignisse je Stufe und Art
--   vi  Web Vitals p75 je Seite (Stufe|Slug), mindestens 1 Messung
--   ab  A/B-Varianten (page_events): Aufrufe, CTA, Probe, Checkout, Kauf je Variante
create or replace function signalwerk.web_analytics_calc(p_lo timestamptz, p_hi timestamptz, p_country text default null)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '20s' as $$
  with h as (
    select day, vh, stage, country, slug, device, browser, src, ref, utm_medium, utm_campaign, dwell_s, scroll, created_at
      from signalwerk.web_hits
     where created_at >= p_lo and created_at < p_hi and (p_country is null or country = p_country)
  ), vis as (
    select day, vh, count(*) n_all, count(*) filter (where stage <> 'stripe') n_views,
           coalesce(max(dwell_s), 0) mx, coalesce(sum(dwell_s), 0) eng,
           min(created_at) t0, min(created_at) filter (where stage = 'stripe') t_co,
           (array_agg(stage || '|' || coalesce(slug, '-') order by created_at) filter (where stage <> 'stripe'))[1] entry,
           (array_agg(stage || '|' || coalesce(slug, '-') order by created_at desc) filter (where stage <> 'stripe'))[1] exit,
           (array_agg(device order by created_at) filter (where device is not null))[1] dev,
           (array_agg(browser order by created_at) filter (where browser is not null))[1] br,
           (array_agg(country order by created_at))[1] co,
           (array_agg(src order by created_at) filter (where src is not null))[1] src,
           (array_agg(coalesce(ref, '-') order by created_at) filter (where src is not null))[1] ref,
           (array_agg(coalesce(utm_medium, '-') order by created_at) filter (where src is not null))[1] med,
           (array_agg(coalesce(utm_campaign, '-') order by created_at) filter (where src is not null))[1] camp,
           bool_or(stage = 'tarif') t_tarif, bool_or(stage = 'stripe') t_stripe, bool_or(stage = 'danke') t_danke
      from h group by day, vh
  ), ev as (
    select stage, kind, count(*)::int n from signalwerk.web_events
     where created_at >= p_lo and created_at < p_hi and (p_country is null or country = p_country) group by 1, 2
  ), vt as (
    select stage, coalesce(slug, '-') slug, lcp_ms, inp_ms, cls_m from signalwerk.web_vitals
     where created_at >= p_lo and created_at < p_hi and (p_country is null or country = p_country)
  )
  select jsonb_build_object(
    'k', (select jsonb_build_object(
            'visitors', count(*), 'views', coalesce(sum(n_views), 0),
            'engaged', count(*) filter (where n_all >= 2 or mx >= 10 or t_stripe), 'eng_s', coalesce(sum(eng), 0),
            'tarif', count(*) filter (where t_tarif), 'stripe', count(*) filter (where t_stripe), 'danke', count(*) filter (where t_danke),
            'ttc_s', (select percentile_cont(.5) within group (order by extract(epoch from t_co - t0)) from vis where t_co is not null),
            'scroll_n', (select count(*) from h where scroll is not null and stage <> 'stripe'),
            'scroll75', (select count(*) from h where scroll >= 75),
            'cta', (select coalesce(sum(n), 0) from ev where kind = 'cta'),
            'forms', (select coalesce(sum(n), 0) from ev where kind = 'form_start'),
            'formd', (select coalesce(sum(n), 0) from ev where kind = 'form_submit'),
            'vid', (select coalesce(sum(n), 0) from ev where kind = 'video_start'),
            'vidd', (select coalesce(sum(n), 0) from ev where kind = 'video_done'),
            'lcp', (select percentile_cont(.75) within group (order by lcp_ms) from vt where lcp_ms is not null),
            'inp', (select percentile_cont(.75) within group (order by inp_ms) from vt where inp_ms is not null),
            'cls', (select percentile_cont(.75) within group (order by cls_m) from vt where cls_m is not null),
            'vit_n', (select count(*) from vt))
          from vis),
    'ch', coalesce((select jsonb_agg(jsonb_build_object('s', src, 'r', ref, 'm', med, 'c', camp, 'n', n, 't', t, 'k', k) order by n desc)
                      from (select coalesce(src, '-') src, ref, med, camp, count(*)::int n,
                                   count(*) filter (where t_tarif)::int t, count(*) filter (where t_stripe)::int k
                              from vis group by 1, 2, 3, 4 order by count(*) desc limit 15) x), '[]'::jsonb),
    'en', coalesce((select jsonb_object_agg(entry, n) from (select entry, count(*)::int n from vis where entry is not null group by 1 order by 2 desc limit 10) x), '{}'::jsonb),
    'ex', coalesce((select jsonb_object_agg(exit, n) from (select exit, count(*)::int n from vis where exit is not null group by 1 order by 2 desc limit 10) x), '{}'::jsonb),
    'br', coalesce((select jsonb_object_agg(coalesce(br, '-'), n) from (select br, count(*)::int n from vis group by 1) x), '{}'::jsonb),
    'dv', coalesce((select jsonb_object_agg(coalesce(dev, '-'), n) from (select dev, count(*)::int n from vis group by 1) x), '{}'::jsonb),
    'co', coalesce((select jsonb_object_agg(co, n) from (select co, count(*)::int n from vis group by 1) x), '{}'::jsonb),
    'wh', coalesce((select jsonb_agg(jsonb_build_array(d, hr, n))
                      from (select extract(isodow from created_at at time zone 'Europe/Berlin')::int d,
                                   extract(hour from created_at at time zone 'Europe/Berlin')::int hr, count(*)::int n
                              from h where stage <> 'stripe' group by 1, 2) x), '[]'::jsonb),
    'sc', coalesce((select jsonb_agg(jsonb_build_object('st', stage, 's', scroll, 'n', n))
                      from (select stage, scroll, count(*)::int n from h where scroll is not null and stage <> 'stripe' group by 1, 2) x), '[]'::jsonb),
    'ev', coalesce((select jsonb_agg(jsonb_build_object('st', stage, 'k', kind, 'n', n)) from ev), '[]'::jsonb),
    'vi', coalesce((select jsonb_agg(jsonb_build_object('p', stage || '|' || slug, 'n', n, 'lcp', lcp, 'inp', inp, 'cls', cls) order by lcp desc nulls last)
                      from (select stage, slug, count(*)::int n,
                                   percentile_cont(.75) within group (order by lcp_ms) lcp,
                                   percentile_cont(.75) within group (order by inp_ms) inp,
                                   percentile_cont(.75) within group (order by cls_m) cls
                              from vt group by 1, 2 order by 4 desc nulls last limit 12) x), '[]'::jsonb),
    'ab', coalesce((select jsonb_agg(jsonb_build_object('p', slug, 'v', vkey, 'st', vstatus, 'views', views, 'cta', cta, 'req', req, 'co', co, 'buy', buy) order by views desc)
                      from (select lp.slug, pv.variant_key vkey, pv.status vstatus,
                                   count(*) filter (where pe.type = 'view')::int views,
                                   count(*) filter (where pe.type = 'cta_click')::int cta,
                                   count(*) filter (where pe.type = 'sample_request')::int req,
                                   count(*) filter (where pe.type = 'checkout_started')::int co,
                                   count(*) filter (where pe.type = 'purchase')::int buy
                              from signalwerk.page_events pe
                              join signalwerk.page_variants pv on pv.id = pe.variant_id
                              join signalwerk.landing_pages lp on lp.id = pv.page_id
                             where pe.created_at >= p_lo and pe.created_at < p_hi
                               and (p_country is null or upper(lp.country) = p_country)
                             group by 1, 2, 3 order by 4 desc limit 12) x), '[]'::jsonb)
  );
$$;
revoke all on function signalwerk.web_analytics_calc(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function signalwerk.web_analytics_calc(timestamptz, timestamptz, text) to service_role;

-- Vorrechnen: je Zeitraum (24 h rollierend, 7 und 30 deutsche Kalendertage) und Land (alle, US, UK, FR) der
-- aktuelle Zeitraum und für die Kopfzahlen der gleich lange Vorzeitraum (▲/▼).
create or replace function signalwerk.web_analytics_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '60s' as $$
declare today date := (now() at time zone 'Europe/Berlin')::date;
        hi timestamptz := now() + interval '1 minute';
        b7 timestamptz := (today - 6)::timestamp at time zone 'Europe/Berlin';
        b14 timestamptz := (today - 13)::timestamp at time zone 'Europe/Berlin';
        b30 timestamptz := (today - 29)::timestamp at time zone 'Europe/Berlin';
        b60 timestamptz := (today - 59)::timestamp at time zone 'Europe/Berlin';
        c text;
        p jsonb := '{}'::jsonb;
        v jsonb;
begin
  foreach c in array array['ALL', 'US', 'UK', 'FR'] loop
    p := p || jsonb_build_object(c, jsonb_build_object(
      '24h', jsonb_build_object('cur', signalwerk.web_analytics_calc(now() - interval '24 hours', hi, nullif(c, 'ALL')),
                                'prev', signalwerk.web_analytics_calc(now() - interval '48 hours', now() - interval '24 hours', nullif(c, 'ALL'))->'k'),
      '7d',  jsonb_build_object('cur', signalwerk.web_analytics_calc(b7, hi, nullif(c, 'ALL')),
                                'prev', signalwerk.web_analytics_calc(b14, b7, nullif(c, 'ALL'))->'k'),
      '30d', jsonb_build_object('cur', signalwerk.web_analytics_calc(b30, hi, nullif(c, 'ALL')),
                                'prev', signalwerk.web_analytics_calc(b60, b30, nullif(c, 'ALL'))->'k')));
  end loop;
  v := jsonb_build_object('at', now(), 'since', (select min(created_at) from signalwerk.web_hits), 'c', p);
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('website_analytics', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.web_analytics_refresh() from public, anon, authenticated;
grant execute on function signalwerk.web_analytics_refresh() to service_role;
