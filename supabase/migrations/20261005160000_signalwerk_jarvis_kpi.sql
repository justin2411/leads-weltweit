-- JARVIS-Zentrale: KPI-Leiste und Werke-Karte (Radar, Bewertung/Premium, Feedback) – Inhaber 05.10.2026:
-- „alle benötigten KPIs sehen … Website-Daten wie bei Google Analytics mit einem Trichter“.
-- Nicht destruktiv: eine neue lesende Funktion zentrale_extra(); zentrale_cache_refresh() (create or replace)
-- hängt ihr Ergebnis als Feld 'extra' an den Zwischenspeicher 'zentrale' (Wachhund alle 15 min). Nie live im Abruf.
--   premium          lieferbare Premium-Leads S2 × US/UK/FR (status new, premium_score ≥ 70, tier premium; Index leads_premium)
--   radar_24h        neue Leads aus dem Veränderungs-Radar (S2, 24 h)
--   bewertet_24h     neue S2-Leads mit Premium-Bewertung (24 h), davon premium_24h Stufe premium
--   feedback         Kundenbewertungen 7 T (gut/schlecht), gewonnen 30 T, ausgegebene Links 7 T, letztes Signal
--   p.7 / p.30       Mails gesendet, Rückläufer, Beschwerden, Antworten, positive Antworten, Probe-Anfragen je Zeitraum

create or replace function signalwerk.zentrale_extra()
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '20s' as $$
  with neu as (
    select count(*) filter (where source_name = 'Website check (change radar)') as radar,
           count(*) filter (where premium_score is not null) as bewertet,
           count(*) filter (where premium_score >= 70 and premium->>'tier' = 'premium') as premium
      from signalwerk.leads
     where segment_id = 'S2' and created_at > now() - interval '24 hours'
  ), prem as (
    select country, count(*) as n from signalwerk.leads
     where segment_id = 'S2' and country in ('US', 'UK', 'FR') and status = 'new'
       and premium_score is not null and premium_score >= 70 and premium->>'tier' = 'premium'
     group by country
  ), per as (
    select d, jsonb_build_object(
      'sent', (select count(*) from signalwerk.messages where status = 'sent' and sent_at > now() - make_interval(days => d)),
      'bounced', (select count(*) from signalwerk.email_events where type = 'bounced' and created_at > now() - make_interval(days => d)),
      'complained', (select count(*) from signalwerk.email_events where type = 'complained' and created_at > now() - make_interval(days => d)),
      'antworten', (select count(*) from signalwerk.inbound_replies
                     where received_at > now() - make_interval(days => d) and coalesce(intent, '') not in ('out_of_office')),
      'positiv', (select count(*) from signalwerk.inbound_replies
                   where received_at > now() - make_interval(days => d) and intent in ('buy', 'sample', 'question')),
      'proben', (select count(*) from signalwerk.sample_requests
                  where created_at > now() - make_interval(days => d) and not coalesce(is_test, false))
              + (select count(*) from signalwerk.email_events
                  where type = 'sample_requested' and occurred_at > now() - make_interval(days => d))) as v
      from unnest(array[7, 30]) d
  )
  select jsonb_build_object(
    'at', now(),
    'premium', (select coalesce(sum(n), 0) from prem),
    'premium_land', (select coalesce(jsonb_object_agg(country, n), '{}'::jsonb) from prem),
    'radar_24h', (select radar from neu),
    'bewertet_24h', (select bewertet from neu),
    'premium_24h', (select premium from neu),
    'feedback', jsonb_build_object(
      'n_7d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '7 days' and (rating is not null or won)),
      'gut_7d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '7 days' and rating = 'gut'),
      'schlecht_7d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '7 days' and rating = 'schlecht'),
      'won_30d', (select count(*) from signalwerk.lead_feedback where updated_at > now() - interval '30 days' and won),
      'links_7d', (select count(*) from signalwerk.lead_feedback_links where created_at > now() - interval '7 days'),
      'letzte', greatest((select max(created_at) from signalwerk.lead_feedback_links),
                         (select max(updated_at) from signalwerk.lead_feedback))),
    'p', (select jsonb_object_agg(d::text, v) from per)
  )
$$;
revoke all on function signalwerk.zentrale_extra() from public, anon, authenticated;
grant execute on function signalwerk.zentrale_extra() to service_role;

-- Wachhund (alle 15 min): langsamen Teil + Zusatz vorrechnen. Fällt der Zusatz aus, bleibt der Rest (extra = null).
create or replace function signalwerk.zentrale_cache_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '60s' as $$
declare v jsonb; x jsonb;
begin
  v := signalwerk.zentrale_langsam();
  begin
    x := signalwerk.zentrale_extra();
  exception when others then x := null;
  end;
  v := v || jsonb_build_object('extra', x);
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('zentrale', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.zentrale_cache_refresh() from public, anon, authenticated;
grant execute on function signalwerk.zentrale_cache_refresh() to service_role;

-- Link-Scanner der Empfänger (Gehirn 05.10.2026, Prinzip wie PR #404): Aufrufe aus einer Mail (src = mail) bis 120 s nach
-- dem Versand einer Mail ins selbe Land (gleiche Betreff-Variante) sind Sicherheits-Scanner, keine Besucher. Dazu ihre
-- Folge-Ereignisse (Aufruf, Probe-Klick, Anfrage, Checkout bis 60 s nach dem Scanner-Aufruf auf derselben Seite).
-- Nur Zählung je Seite für den Trichter (abziehen, getrennt ausweisen); Rohdaten, Sperrliste und Versand unverändert.
create or replace function signalwerk.web_scanner(p_days int default 7)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '10s' as $$
  with since as (
    select ((now() at time zone 'Europe/Berlin')::date - (least(greatest(coalesce(p_days, 7), 1), 400) - 1))::timestamp
           at time zone 'Europe/Berlin' as t
  ), sc as (
    select w.slug, w.created_at from signalwerk.web_views w, since
     where w.created_at >= since.t and w.src = 'mail'
       and exists (select 1 from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
                    where m.status = 'sent' and m.kind in ('initial', 'followup')
                      and m.sent_at between w.created_at - interval '120 seconds' and w.created_at
                      and lower(e.country) = left(w.slug, 2)
                      and (w.subj is null or m.subject_variant is null or m.subject_variant = w.subj))
  ), ev as (
    select lp.slug, p.type from signalwerk.page_events p
      join signalwerk.page_variants v on v.id = p.variant_id
      join signalwerk.landing_pages lp on lp.id = v.page_id, since
     where p.created_at >= since.t and p.type in ('view', 'cta_click', 'sample_request', 'checkout_started')
       and exists (select 1 from sc where sc.slug = lp.slug
                     and sc.created_at between p.created_at - interval '60 seconds' and p.created_at + interval '5 seconds')
  )
  select jsonb_build_object('at', now(), 'since', (select t from since), 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('s', x.slug,
             'besuche', (select count(*) from sc where sc.slug = x.slug),
             'views', (select count(*) from ev where ev.slug = x.slug and ev.type = 'view'),
             'klick', (select count(*) from ev where ev.slug = x.slug and ev.type = 'cta_click'),
             'anfrage', (select count(*) from ev where ev.slug = x.slug and ev.type = 'sample_request'),
             'checkout', (select count(*) from ev where ev.slug = x.slug and ev.type = 'checkout_started')))
      from (select distinct slug from sc) x), '[]'::jsonb))
$$;
revoke all on function signalwerk.web_scanner(int) from public, anon, authenticated;
grant execute on function signalwerk.web_scanner(int) to service_role;
