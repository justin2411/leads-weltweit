-- A/B je Schritt (Inhaber 04.10.2026: „das gehirn soll jeden einzelnen unserer steps a/b splittesten können, damit es
-- mit den quoten immer genau schauen kann wo es KPIs weiter optimieren kann damit am ende mehr kunden bei rauskommen“).
-- Nicht destruktiv: zwei neue Tabellen, eine neue Spalte, eine Sicht, eine Funktion, Startzeilen für den laufenden
-- Betreff-A/B. Nichts gelöscht, keine Löschrechte. Schritte und Regeln: app/lib/ab-schritte.json, scripts/lib/ab.py.
--   ab_tests        ein Test je Schritt × Land × Element (A = heutiger Stand, B = eine Änderung); höchstens ein
--                   laufender Test je Schritt und Land (Index unten); Status entwurf → laeuft → gewonnen | gestoppt
--   ab_events       exposure (Variante bekommen/gesehen) und conversion (Ziel erreicht) je Einheit, doppelte ignoriert.
--                   Einheit = Käufer-ID, Probe-/Checkout-ID oder Tages-Besucher-Hash – nie IP, Cookie oder E-Mail-Adresse
--   messages.ab     Marken {test_id: variante} einer Mail (Nachfass-Abstand wird beim Anlegen zugewiesen)
--   ab_results      n und k je Test und Variante: Mails → Antworten aus inbound_replies nach dem Kontakt,
--                   Landingpage → page_events seit Teststart, sonst ab_events
--   ab_funnel()     Trichter je Station für die Test-Freigabe (Webagenturen US/UK/FR) – Quote und Engpass im Dashboard

create table if not exists signalwerk.ab_tests (
  id          uuid primary key default gen_random_uuid(),
  step        text not null,
  segment_id  text not null default 'S2',
  country     text not null check (country ~ '^[A-Z]{2}$'),
  element     text not null check (element ~ '^[a-z_]{2,30}$'),
  hypothese   text not null check (char_length(btrim(hypothese)) between 5 and 160),
  messung     text not null default 'ereignis',
  varianten   jsonb not null check (jsonb_typeof(varianten) = 'array' and jsonb_array_length(varianten) = 2),
  status      text not null default 'entwurf',
  quelle      text,
  salt        text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  min_n       integer not null default 100 check (min_n between 10 and 100000),
  gestartet   timestamptz,
  beendet     timestamptz,
  gewinner    text check (gewinner is null or gewinner in ('A', 'B')),
  grund       text check (grund is null or char_length(grund) <= 160),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table signalwerk.ab_tests drop constraint if exists ab_tests_step_check;
alter table signalwerk.ab_tests add constraint ab_tests_step_check check (step in (
  'mail_betreff', 'mail_einstieg', 'mail_zeit', 'nachfass', 'antwort', 'landing', 'probe_mail', 'probe_nachfrage',
  'tarif', 'checkout'));
alter table signalwerk.ab_tests drop constraint if exists ab_tests_status_check;
alter table signalwerk.ab_tests add constraint ab_tests_status_check check (status in ('entwurf', 'laeuft', 'gewonnen', 'gestoppt'));
alter table signalwerk.ab_tests drop constraint if exists ab_tests_messung_check;
alter table signalwerk.ab_tests add constraint ab_tests_messung_check check (messung in ('antwort', 'positiv', 'probe', 'ereignis'));
alter table signalwerk.ab_tests drop constraint if exists ab_tests_quelle_check;
alter table signalwerk.ab_tests add constraint ab_tests_quelle_check
  check (quelle is null or quelle in ('page_variants', 'messages.subject_variant'));
-- Höchstens ein laufender Test je Schritt und Land (Inhaber: eine Sache pro Test, saubere Ergebnisse)
create unique index if not exists ab_tests_one_running on signalwerk.ab_tests (step, country) where status = 'laeuft';
create index if not exists ab_tests_status on signalwerk.ab_tests (status, step);
create or replace trigger ab_tests_touch before update on signalwerk.ab_tests
  for each row execute function signalwerk.touch_updated_at();

create table if not exists signalwerk.ab_events (
  id          bigint generated always as identity primary key,
  test_id     uuid not null references signalwerk.ab_tests(id),
  variant     text not null check (variant in ('A', 'B')),
  unit        text not null check (char_length(unit) between 1 and 80),
  kind        text not null check (kind in ('exposure', 'conversion')),
  created_at  timestamptz not null default now(),
  unique (test_id, unit, kind)
);
create index if not exists ab_events_test on signalwerk.ab_events (test_id, kind, variant);
create index if not exists ab_events_unit on signalwerk.ab_events (unit);

alter table signalwerk.messages add column if not exists ab jsonb;
comment on column signalwerk.messages.ab is 'A/B-Marken {test_id: A|B} dieser Mail (scripts/lib/ab.py), Messung in ab_events';

-- Ergebnis je Test und Variante
create or replace view signalwerk.ab_results with (security_invoker = true) as
with v as (
  select t.id, t.step, t.segment_id, t.country, t.status, t.quelle, t.messung, t.gestartet, t.beendet,
         x.value ->> 'key' as variant, x.value ->> 'variant_id' as variant_id
    from signalwerk.ab_tests t, jsonb_array_elements(t.varianten) x
   where t.status <> 'entwurf'
), ev as (
  select test_id, variant, count(*) filter (where kind = 'exposure') as n, count(*) filter (where kind = 'conversion') as k
    from signalwerk.ab_events group by 1, 2
), mail as (
  select e.test_id, e.variant,
         count(*) filter (where exists (
           select 1 from signalwerk.inbound_replies r
            where r.prospect_id = e.pid and r.received_at > e.created_at
              and coalesce(r.intent, 'other') not in ('unsubscribe', 'out_of_office'))) as k_antwort,
         count(*) filter (where exists (
           select 1 from signalwerk.inbound_replies r
            where r.prospect_id = e.pid and r.received_at > e.created_at and r.intent in ('buy', 'sample'))) as k_positiv
    from (select test_id, variant, created_at,
                 case when unit ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then unit::uuid end as pid
            from signalwerk.ab_events where kind = 'exposure') e
   where e.pid is not null
   group by 1, 2
), pages as (
  select v.id as test_id, v.variant,
         count(*) filter (where pe.type = 'view') as n, count(*) filter (where pe.type = 'sample_request') as k
    from v join signalwerk.page_events pe
      on pe.variant_id::text = v.variant_id and pe.created_at >= v.gestartet and (v.beendet is null or pe.created_at <= v.beendet)
   where v.quelle = 'page_variants'
   group by 1, 2
)
select v.id as test_id, v.step, v.segment_id, v.country, v.status, v.variant,
       (case when v.quelle = 'page_variants' then coalesce(p.n, 0) else coalesce(ev.n, 0) end)::bigint as n,
       (case when v.quelle = 'page_variants' then coalesce(p.k, 0)
             when v.messung = 'antwort' then coalesce(m.k_antwort, 0)
             when v.messung = 'positiv' then coalesce(m.k_positiv, 0)
             else coalesce(ev.k, 0) end)::bigint as k,
       coalesce(m.k_positiv, 0)::bigint as k_positiv
  from v
  left join ev on ev.test_id = v.id and ev.variant = v.variant
  left join mail m on m.test_id = v.id and m.variant = v.variant
  left join pages p on p.test_id = v.id and p.variant = v.variant;

-- Trichter je Station (letzte p_days Tage) für Segment × Land der Test-Freigabe
create or replace function signalwerk.ab_funnel(p_segments text[], p_countries text[], p_days int default 30)
returns table (station text, n bigint, k bigint)
language sql stable set search_path = signalwerk, public as $$
  with since as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as t
  ), ex as (
    select id from signalwerk.experiments where segment_id = any(p_segments) and upper(country) = any(p_countries)
  ), sent as (
    select m.kind,
           exists (select 1 from signalwerk.inbound_replies r
                    where r.prospect_id = m.prospect_id and r.received_at > m.sent_at
                      and coalesce(r.intent, 'other') not in ('unsubscribe', 'out_of_office')) as replied
      from signalwerk.messages m, since
     where m.status = 'sent' and m.sent_at >= since.t and m.experiment_id in (select id from ex)
       and m.kind in ('initial', 'followup', 'sample_followup')
  ), auto as (
    select count(*) as n,
           count(*) filter (where exists (
             select 1 from signalwerk.inbound_replies r2
              where r2.prospect_id = r.prospect_id and r2.received_at > r.received_at and r2.intent in ('buy', 'sample'))) as k
      from signalwerk.inbound_replies r join signalwerk.prospects p on p.id = r.prospect_id, since
     where r.auto_action = 'faq' and r.received_at >= since.t
       and p.segment_id = any(p_segments) and upper(p.country) = any(p_countries)
  ), lp as (
    select id, slug from signalwerk.landing_pages where segment_id = any(p_segments) and upper(country) = any(p_countries)
  ), ev as (
    select e.type, count(*) as c
      from signalwerk.page_events e join signalwerk.page_variants v on v.id = e.variant_id, since
     where e.created_at >= since.t and v.page_id in (select id from lp)
     group by 1
  ), probes as (
    select count(*) as c from signalwerk.sample_requests s, since
     where s.sent_at >= since.t and not coalesce(s.is_test, false)
       and s.segment_id = any(p_segments) and upper(s.country) = any(p_countries)
  ), tarif as (
    select coalesce(count(*), 0) as c from signalwerk.web_visitors w, since
     where w.page = 'tarif' and w.day >= (since.t at time zone 'Europe/Berlin')::date and w.slug in (select slug from lp)
  )
  select 'mail'::text, count(*) filter (where kind = 'initial'), count(*) filter (where kind = 'initial' and replied) from sent
  union all select 'nachfass', count(*) filter (where kind = 'followup'), count(*) filter (where kind = 'followup' and replied) from sent
  union all select 'probe_nachfrage', count(*) filter (where kind = 'sample_followup'), count(*) filter (where kind = 'sample_followup' and replied) from sent
  union all select 'antwort', n, k from auto
  union all select 'landing', coalesce((select c from ev where type = 'view'), 0), coalesce((select c from ev where type = 'sample_request'), 0)
  union all select 'probe', (select c from probes), (select c from tarif)
  union all select 'tarif', (select c from tarif), coalesce((select c from ev where type = 'checkout_started'), 0)
  union all select 'checkout', coalesce((select c from ev where type = 'checkout_started'), 0), coalesce((select c from ev where type = 'purchase'), 0);
$$;
revoke all on function signalwerk.ab_funnel(text[], text[], int) from public, anon, authenticated;
grant execute on function signalwerk.ab_funnel(text[], text[], int) to service_role;

-- Rechte: nur serverseitig (Service-Schlüssel), keine Löschrechte
alter table signalwerk.ab_tests enable row level security;
alter table signalwerk.ab_events enable row level security;
revoke all on signalwerk.ab_tests, signalwerk.ab_events, signalwerk.ab_results from anon, authenticated;
revoke delete, truncate on signalwerk.ab_tests, signalwerk.ab_events from service_role;
grant select, insert, update on signalwerk.ab_tests, signalwerk.ab_events to service_role;
grant select on signalwerk.ab_results to service_role;

-- Betreff-A/B vom 04.10.2026 (drafts.SUBJECTS, Zuteilung fest je Käufer = leeres Salz) als laufende Tests einbinden,
-- statt ihn doppelt zu führen. Nur, wenn es für Schritt und Land noch keinen Test gibt.
insert into signalwerk.ab_tests (step, segment_id, country, element, hypothese, messung, varianten, status, quelle, salt,
                                 min_n, gestartet, created_by)
select 'mail_betreff', 'S2', x.country, 'betreff',
       'Betreff B nennt das Signal (noch keine Website) zuerst und bringt mehr Antworten', 'antwort',
       jsonb_build_array(jsonb_build_object('key', 'A', 'betreff', x.a), jsonb_build_object('key', 'B', 'betreff', x.b)),
       'laeuft', 'messages.subject_variant', '', 100, now(), 'Migration (Betreff-A/B 04.10.2026)'
  from (values
    ('US', 'Local businesses across the US without a website', 'No website yet: local businesses across the US'),
    ('UK', 'Local businesses across the UK without a website', 'No website yet: local businesses across the UK'),
    ('FR', 'Entreprises en France sans site web', 'Pas encore de site web : entreprises partout en France')
  ) as x(country, a, b)
 where not exists (select 1 from signalwerk.ab_tests t where t.step = 'mail_betreff' and t.country = x.country);
