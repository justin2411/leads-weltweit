-- JARVIS-Zentrale, Nachbesserung (Prüfung PR #400): nicht destruktiv, nur create or replace.
--  1. zentrale_langsam: Kunden-Werk zählt nur mail-fähige Fokus-Käufer (S2 × US/UK/FR), nicht alle Länder/Segmente.
--  2. zentrale_schnell: plan_log je Werk (letzte zwei verschiedene Pläne) statt der letzten 8 Zeilen gesamt;
--     neues Feld scout_last (eigenes Signal des Quellen-Scouts statt Herzschlag des Lead-Werks).

create or replace function signalwerk.zentrale_schnell()
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '3s' as $$
  select jsonb_build_object(
    'now', now(),
    'beats', coalesce((select jsonb_agg(x) from (
        select werk, max(beat_at) as last_beat,
               count(*) filter (where beat_at > now() - interval '15 minutes'
                                  and coalesce(note, '') !~ '^(fertig|abgebrochen)') as plaetze,
               sum(processed) filter (where beat_at > now() - interval '60 minutes') as processed_60m,
               sum(green) filter (where beat_at > now() - interval '60 minutes') as green_60m
          from signalwerk.werk_heartbeat group by werk) x), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select id, agent, rolle, kind, market, left(brief, 120) as brief, status, progress, left(step, 120) as step,
               created_by, created_at, started_at, finished_at, left(grund, 160) as grund
          from signalwerk.agent_tasks
         where status in ('offen', 'laeuft') or created_at > now() - interval '15 minutes'
            or finished_at > now() - interval '15 minutes'
         order by created_at desc limit 60) x), '[]'::jsonb),
    'handoffs', coalesce((select jsonb_agg(x) from (
        select id, created_at, regel, von, an, left(titel, 60) as titel, status, market
          from signalwerk.handoffs where status in ('wartet', 'beauftragt') order by created_at desc limit 20) x), '[]'::jsonb),
    'gaps', coalesce((select jsonb_agg(x order by x.rang) from (
        select slug, ziel_key, ist, soll, luecke, rang, left(titel, 60) as titel, left(grund, 160) as grund, modus, updated_at
          from signalwerk.department_gaps order by rang limit 9) x), '[]'::jsonb),
    'owner', coalesce((select jsonb_object_agg(key, value) from signalwerk.owner_settings
        where key in ('send_paused', 'werke_paused', 'followup_enabled', 'slot_plan', 'sample_targets', 'slot_autopilot')), '{}'::jsonb),
    'brain_enabled', (select brain_enabled from signalwerk.settings order by id limit 1),
    -- je Werk die letzten zwei verschiedenen Pläne (Lead-Werk schreibt je Start mehrere gleiche Zeilen)
    'plan_log', coalesce((select jsonb_agg(x order by x.at desc) from (
        select werk, at, mode, bremse, plan, reasons from (
          select d.*, row_number() over (partition by d.werk order by d.at desc) as rn from (
            select distinct on (werk, plan) werk, at, mode, bremse, plan, reasons
              from signalwerk.werk_plan_log where at > now() - interval '7 days'
             order by werk, plan, at desc) d) y
         where rn <= 2) x), '[]'::jsonb),
    -- Quellen-Scout: eigenes Signal (Entscheidung, Auftrag oder Start mit „Scout“), null = keine Messung
    'scout_last', (select max(t) from (
        select max(created_at) as t from signalwerk.decisions
         where created_at > now() - interval '7 days' and (subject ilike '%scout%' or kurz_titel ilike '%scout%')
        union all
        select max(created_at) from signalwerk.agent_tasks where created_at > now() - interval '7 days' and created_by ilike '%scout%'
        union all
        select max(created_at) from signalwerk.start_requests where created_at > now() - interval '7 days' and created_by ilike '%scout%') s),
    'msg', jsonb_build_object(
        'sent_60m', (select count(*) from signalwerk.messages where status = 'sent' and sent_at > now() - interval '60 minutes'),
        'sent_24h', (select count(*) from signalwerk.messages where status = 'sent' and sent_at > now() - interval '24 hours'),
        'sent_heute', (select count(*) from signalwerk.messages where status = 'sent'
                         and sent_at >= (date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')),
        'last_sent_at', (select max(sent_at) from signalwerk.messages where status = 'sent' and sent_at > now() - interval '30 days'),
        'blocked_60m', (select count(*) from signalwerk.messages where status = 'blocked' and updated_at > now() - interval '60 minutes'),
        'freigegeben', (select count(*) from signalwerk.messages where status = 'approved')),
    'ev24', coalesce((select jsonb_object_agg(type, n) from (
        select type, count(*) as n from signalwerk.email_events where created_at > now() - interval '24 hours' group by type) x), '{}'::jsonb),
    'replies', jsonb_build_object(
        'offen', (select count(*) from signalwerk.inbound_replies where status = 'offen'),
        'heiss', (select count(*) from signalwerk.inbound_replies where status = 'offen' and intent = 'buy')),
    'acks', coalesce((select jsonb_object_agg(werk, seen) from (
        select werk, max(seen_at) as seen from signalwerk.settings_ack group by werk) x), '{}'::jsonb),
    'starts', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select id, created_at, workflow, status, started_at from signalwerk.start_requests
         where created_at > now() - interval '3 hours' order by created_at desc limit 20) x), '[]'::jsonb),
    'subs', jsonb_build_object(
        'aktiv', (select count(*) from signalwerk.subscriptions where status in ('active', 'past_due')),
        'neueste', (select max(created_at) from signalwerk.subscriptions where status in ('active', 'past_due'))),
    'held_60m', (select count(*) from signalwerk.lead_checks where result <> 'released' and checked_at > now() - interval '60 minutes'),
    'ticker', coalesce((select jsonb_agg(x order by x.at desc) from (
        (select created_at as at, 'decision' as art, left(coalesce(kurz_titel, subject), 60) as titel, id::text as ref
           from signalwerk.decisions where created_at > now() - interval '48 hours' and type <> 'daily_note' order by created_at desc limit 5)
        union all
        (select finished_at, 'task', left(coalesce(step, brief), 60), agent::text from signalwerk.agent_tasks
          where status = 'fertig' and finished_at > now() - interval '48 hours' order by finished_at desc limit 5)
        union all
        (select created_at, 'start', workflow, id::text from signalwerk.start_requests
          where created_at > now() - interval '48 hours' order by created_at desc limit 3)
        union all
        (select created_at, 'positiv', 'Positive Antwort', id::text from signalwerk.email_events
          where type in ('reply_positive', 'sample_requested') and created_at > now() - interval '48 hours' order by created_at desc limit 3)
        order by 1 desc limit 5) x), '[]'::jsonb)
  )
$$;
revoke all on function signalwerk.zentrale_schnell() from public, anon, authenticated;
grant execute on function signalwerk.zentrale_schnell() to service_role;

create or replace function signalwerk.zentrale_langsam()
returns jsonb
language plpgsql stable security definer set search_path = signalwerk, public
set statement_timeout = '30s' as $$
declare
  v_lage jsonb;
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  begin
    v_lage := signalwerk.firma_lage('S2', array['US', 'UK', 'FR']);
  exception when others then v_lage := null;
  end;
  return jsonb_build_object(
    'at', now(),
    'lage', v_lage,
    'runs', coalesce((select jsonb_object_agg(werk, x) from (
        select werk, jsonb_build_object(
                 'processed_60m', coalesce(sum(processed) filter (where zaehlt and finished_at > now() - interval '60 minutes'), 0),
                 'green_60m', coalesce(sum(green) filter (where zaehlt and finished_at > now() - interval '60 minutes'), 0),
                 'processed_24h', coalesce(sum(processed) filter (where zaehlt), 0), 'green_24h', coalesce(sum(green) filter (where zaehlt), 0),
                 'red_24h', coalesce(sum(red) filter (where zaehlt), 0), 'last', max(finished_at)) as x
          from (select r0.*,
                       -- Käufer zählen nur in Mail-Ländern der Zielgruppe (Inhaber 02.10.2026): Kunden-Werk nur S2 × US/UK/FR
                       (r0.werk <> 'kunden-werk' or (r0.segment_id = 'S2' and r0.country = any (array['US', 'UK', 'FR']))) as zaehlt
                  from signalwerk.run_stats r0 where r0.finished_at > now() - interval '26 hours') rs
         group by werk) r), '{}'::jsonb),
    'tank', coalesce((select jsonb_object_agg(country, n) from (
        select country, count(*) as n from signalwerk.sample_stock
         where segment_id = 'S2' and status = 'ready' group by country) t), '{}'::jsonb),
    'tank_24h', (select count(*) from signalwerk.sample_stock where segment_id = 'S2' and sent_at > now() - interval '24 hours'),
    'kpi', coalesce((select jsonb_agg(x order by x.day) from (
        select day, metric, sum(value) as value, max(updated_at) as updated_at from signalwerk.kpi_daily
         where day >= v_heute - 14 and segment_id = 'S2' and country in ('ALL', 'US', 'UK', 'FR')
           and metric in ('gehirn_score', 'leads_neu', 'kaeufer_ok', 'proben_bereit', 'proben_gesendet', 'mrr_cents', 'freigabe_quote')
           and (metric <> 'gehirn_score' or country = 'ALL')
         group by day, metric) x), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(x order by x.sort) from (
        select key, titel, einheit, soll, richtung, sort, quelle, updated_at from signalwerk.company_goals) x), '[]'::jsonb),
    'deliv', (select to_jsonb(x) from (select day, at, status, gruende from signalwerk.deliverability_daily order by day desc limit 1) x),
    'lern', jsonb_build_object(
        'messen', (select count(*) from signalwerk.decisions where ergebnis is not null and gemessen_at > now() - interval '7 days')
                + (select count(*) from signalwerk.agent_tasks where wirkung is not null and wirkung_at > now() - interval '7 days'),
        'lehre', (select count(*) from signalwerk.brain_knowledge where coalesce(status, 'aktiv') = 'aktiv' and coalesce(vertrauen, 0) >= 0.7),
        'erwartungen', (select count(*) from signalwerk.decisions where erwartung is not null and ergebnis is null),
        'eval', (select to_jsonb(x) from (select created_at, faelle, richtig, score from signalwerk.brain_evals order by created_at desc limit 1) x),
        'last_decision', (select max(created_at) from signalwerk.decisions),
        'messen_liste', coalesce((select jsonb_agg(x) from (
            select gemessen_at as at, left(coalesce(kurz_titel, subject), 60) as titel, left(coalesce(ergebnis_notiz, ergebnis), 160) as grund
              from signalwerk.decisions where ergebnis is not null order by gemessen_at desc nulls last limit 5) x), '[]'::jsonb),
        'lehre_liste', coalesce((select jsonb_agg(x) from (
            select updated_at as at, left(titel, 60) as titel, round(coalesce(vertrauen, 0)::numeric, 2) as vertrauen
              from signalwerk.brain_knowledge where coalesce(status, 'aktiv') = 'aktiv' order by updated_at desc limit 5) x), '[]'::jsonb)),
    'storage', (select jsonb_build_object('db_bytes', value -> 'db_bytes', 'at', updated_at) from signalwerk.dashboard_cache where name = 'storage'),
    'llm_heute', (select coalesce(sum(cost_eur), 0) from signalwerk.llm_usage
                   where at >= (date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')),
    'sperre', jsonb_build_object(
        'gesamt', (select count(*) from signalwerk.suppression),
        'neu_24h', (select count(*) from signalwerk.suppression where created_at > now() - interval '24 hours')),
    'cache_wachhund', (select max(updated_at) from signalwerk.dashboard_cache where name in ('stock', 'storage'))
  );
end $$;
revoke all on function signalwerk.zentrale_langsam() from public, anon, authenticated;
grant execute on function signalwerk.zentrale_langsam() to service_role;

select signalwerk.zentrale_cache_refresh();
