-- Website-Auswertung, Nachtrag: Mail-Klickquote für den JARVIS-Engpass nur über Mails seit Beginn der Messung
-- (ältere Mail-Links hatten noch kein ?src=mail). Nur die Funktionen website_stats() und website_refresh() neu, nicht destruktiv.

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
                        and m.sent_at >= greatest(since::timestamp at time zone 'Europe/Berlin',
                                                  coalesce((select min(w.created_at) from signalwerk.web_views w), 'infinity'::timestamptz))
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
    -- nur Mails seit Beginn der Messung (vorher hatten die Links kein ?src=mail) – sonst falscher Engpass „Aufrufe“
    'mails_30d', (select count(*) from signalwerk.messages m where m.status = 'sent' and m.kind in ('initial', 'followup')
                    and m.sent_at > greatest(now() - interval '30 days',
                                             coalesce((select min(w.created_at) from signalwerk.web_views w), 'infinity'::timestamptz)))
  ) into v
  from signalwerk.page_events where created_at > now() - interval '30 days';
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('website', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.website_refresh() from public, anon, authenticated;
grant execute on function signalwerk.website_refresh() to service_role;

