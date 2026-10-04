-- JARVIS-Plan Gruppe C (C3 + C4). Nicht destruktiv: eine lesende Funktion und zwei neue Spalten. Nichts gelöscht.
--   datenfluss_stand()        je Station der Kette: letzter Zuwachs und Zahl der Stunden mit Zuwachs in 7 Tagen
--                             (übliches Intervall = 168 h ÷ aktive Stunden). scripts/datenfluss.py stillstand
--                             (Wachhund + Tagescheck) meldet „Datenfluss steht still“, wenn eine Station länger als
--                             3× ihr übliches Intervall keinen Zuwachs hat. extra = fertige Proben im Vorrat.
--   agent_tasks.wirkung       Lernschleife Auftrag → Wirkung: 72 h nach einem fertigen Auftrag (Art leads/kaeufer/quelle)
--   agent_tasks.wirkung_at    die Kennzahl vorher/nachher aus kpi_daily (scripts/datenfluss.py wirkung, Wachhund 1×/h).

create or replace function signalwerk.datenfluss_stand()
returns table (station text, last_at timestamptz, active_hours integer, extra numeric)
language sql stable set search_path = signalwerk, public as $$
  with h as (
    select generate_series(date_trunc('hour', now()) - interval '167 hours', date_trunc('hour', now()),
                           interval '1 hour') as h0
  )
  select 'leads'::text, (select max(created_at) from signalwerk.leads),
         (select count(*) from h where exists (select 1 from signalwerk.leads l
            where l.created_at >= h.h0 and l.created_at < h.h0 + interval '1 hour'))::int,
         null::numeric
  union all
  select 'kaeufer', (select max(created_at) from signalwerk.prospects
                      where check_status = 'ok' and created_at >= now() - interval '30 days'),
         (select count(*) from h where exists (select 1 from signalwerk.prospects p
            where p.created_at >= h.h0 and p.created_at < h.h0 + interval '1 hour' and p.check_status = 'ok'))::int,
         null
  union all
  select 'proben', (select max(built_at) from signalwerk.sample_stock),
         (select count(*) from h where exists (select 1 from signalwerk.sample_stock s
            where s.built_at >= h.h0 and s.built_at < h.h0 + interval '1 hour'))::int,
         (select count(*) from signalwerk.sample_stock where status = 'ready')::numeric
  union all
  select 'mails', (select max(sent_at) from signalwerk.messages where status = 'sent'),
         (select count(*) from h where exists (select 1 from signalwerk.messages m
            where m.sent_at >= h.h0 and m.sent_at < h.h0 + interval '1 hour' and m.status = 'sent'))::int,
         null
  union all
  -- Antworten gelesen: was der Antwort-Assistent aus den Postfächern holt (Antworten, Abmeldungen, Rückläufer)
  select 'antworten', greatest((select max(received_at) from signalwerk.inbound_replies),
                               (select max(created_at) from signalwerk.email_events
                                 where type in ('reply', 'unsubscribed', 'sample_requested', 'bounced'))),
         (select count(*) from h where exists (select 1 from signalwerk.inbound_replies r
            where r.received_at >= h.h0 and r.received_at < h.h0 + interval '1 hour')
            or exists (select 1 from signalwerk.email_events e
            where e.created_at >= h.h0 and e.created_at < h.h0 + interval '1 hour'
              and e.type in ('reply', 'unsubscribed', 'sample_requested', 'bounced')))::int,
         null;
$$;

revoke all on function signalwerk.datenfluss_stand() from public, anon, authenticated;
grant execute on function signalwerk.datenfluss_stand() to service_role;

alter table signalwerk.agent_tasks add column if not exists wirkung jsonb;
alter table signalwerk.agent_tasks add column if not exists wirkung_at timestamptz;
comment on column signalwerk.agent_tasks.wirkung is
  'Lernschleife: Kennzahl vorher/nachher (kpi_daily, je bis 3 Tage) 72 h nach Abschluss, scripts/datenfluss.py wirkung';
