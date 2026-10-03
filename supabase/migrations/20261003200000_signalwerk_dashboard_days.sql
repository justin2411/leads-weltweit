-- Inhaber-Dashboard v2 (Inhaber 03.10.2026: „ganz wenig text und grafiken die es zeigen“): Tageswerte für die
-- Grafiken – gesendete Mails je Tag (deutsche Zeit) und Land sowie Antworten/Proben je Tag, letzte p_days Tage.
-- Nur lesend, nicht destruktiv; Aufruf nur mit dem Service-Schlüssel.
create or replace function signalwerk.dashboard_days(p_days int default 14)
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '10s' as $$
select jsonb_build_object(
  'sent', (select coalesce(jsonb_agg(x), '[]') from (
            select (m.sent_at at time zone 'Europe/Berlin')::date as day, e.country, e.segment_id, count(*) as n
              from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
             where m.status = 'sent' and m.sent_at >= now() - make_interval(days => greatest(1, least(p_days, 90)) + 1)
             group by 1, 2, 3) x),
  'events', (select coalesce(jsonb_agg(x), '[]') from (
            select (ev.occurred_at at time zone 'Europe/Berlin')::date as day, ev.type, e.country, count(*) as n
              from signalwerk.email_events ev
              left join signalwerk.messages m on m.id = ev.message_id
              left join signalwerk.experiments e on e.id = m.experiment_id
             where ev.type in ('reply', 'reply_positive', 'reply_negative', 'sample_requested', 'unsubscribed')
               and ev.occurred_at >= now() - make_interval(days => greatest(1, least(p_days, 90)) + 1)
             group by 1, 2, 3) x)
);
$$;

revoke all on function signalwerk.dashboard_days(int) from public, anon, authenticated;
grant execute on function signalwerk.dashboard_days(int) to service_role;
