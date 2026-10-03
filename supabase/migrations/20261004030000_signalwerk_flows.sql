-- Baukasten (Inhaber 03.10.2026: „Flows per Drag & Drop selber bauen … ich sehe die ganze Zeit Daten … wenn es mir
-- gefällt, hänge ich es an die große Pipeline, die dann bei allen neuen Leads genutzt wird“).
-- Nicht destruktiv: neue Tabelle und Funktionen; eine Prüfregel (check constraint) nur ERWEITERT, nichts gelöscht.
--   flows               gespeicherte Flows (Entwurf / aktiv in der Pipeline / aus / archiviert), def = Flow-JSON (app/lib/flow.ts)
--   lead_checks         failed_stage jetzt 1–4 (Stufe 4 = Inhaber-Regeln: machen die Freigabe nur strenger)
--   flow_lead_rows      Stichprobe Kunden-Leads als flache Zeilen (Felder wie app/lib/flow.ts FIELDS, neueste zuerst)
--   flow_buyer_rows     Stichprobe Käufer (prospects) als flache Zeilen
--   flow_source_count   Gesamtzahl einer Quelle (gleiche Filter)
--   flow_release_held   Regel aus/geändert: von dieser Regel (Stufe 4) zurückgehaltene Leads gehen zurück an die normale
--                       Freigabe (Status 'new' – vor jeder Probe/Lieferung prüft die Drei-Stufen-Freigabe sie erneut)
-- Die Zeilen-Funktionen bauen ihre Abfrage per EXECUTE … USING: so plant Postgres je Aufruf mit den echten Werten
-- (leere Filter fallen weg, seltene Status nutzen den passenden Index) statt mit einem allgemeinen Plan.

-- 1) Flows
create table if not exists signalwerk.flows (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  def           jsonb not null check (jsonb_typeof(def) = 'object'),
  status        text not null default 'entwurf' check (status in ('entwurf', 'aktiv', 'aus', 'archiv')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  activated_at  timestamptz,
  snapshot      jsonb                          -- Zahlen beim Anschließen, z. B. {"sample": 2000, "pass": 1700, "hold": 300}
);
create index if not exists flows_status on signalwerk.flows (status, updated_at desc);
create or replace trigger flows_touch before update on signalwerk.flows
  for each row execute function signalwerk.touch_updated_at();
alter table signalwerk.flows enable row level security;
revoke all on signalwerk.flows from anon, authenticated;
grant select, insert, update on signalwerk.flows to service_role;

-- 2) Freigabe Stufe 4 (Inhaber-Regeln) – Liste nur erweitert (1–3 → 1–4)
alter table signalwerk.lead_checks drop constraint if exists lead_checks_failed_stage_check;
alter table signalwerk.lead_checks add constraint lead_checks_failed_stage_check check (failed_stage between 1 and 4);

-- 3) Kunden-Leads als flache Zeilen. „Heute“ = UTC-Datum (wie Python datetime.now(timezone.utc).date()).
--    contact/person/quality = observations(kind 'other') – EIN Nachschlag je Lead.
--    Spalten telefon … source_url nur für den Export (nie an den Browser).
create or replace function signalwerk.flow_lead_rows(p_segment text, p_countries text[], p_status text[], p_limit int)
returns table (
  id text, cid text, land text, segment text, signal text, dringlichkeit text, status text, quelle text,
  alter_tage int, erfasst_tage int, firma text, rechtsform text, ort text, region text, branche text, text text,
  hat_website boolean, hat_telefon boolean, telefon_art text, hat_email boolean, email_art text, hat_person boolean,
  rolle text, vollstaendig boolean, geprueft text,
  telefon text, email text, website text, adresse text, person text, event_date date, source_url text)
language plpgsql stable set search_path = signalwerk, public set statement_timeout = '25s' as $fn$
begin
  return query execute $q$
    with l as (
      select x.id, x.company_id, x.country, x.segment_id, x.signal_type, x.urgency, x.status, x.source_name,
             x.event_summary, x.event_date, x.source_date, x.source_url, x.created_at
        from signalwerk.leads x
       where ($1::text is null or x.segment_id = $1)
         and ($2::text[] is null or x.country = any($2))
         and ($3::text[] is null or x.status = any($3))
       order by x.created_at desc
       limit $4),
    t as (select (now() at time zone 'utc')::date as today)
    select l.id::text, l.company_id::text, l.country, l.segment_id, l.signal_type, l.urgency, l.status, l.source_name,
           (t.today - coalesce(l.event_date, l.source_date, (l.created_at at time zone 'utc')::date))::int,
           (t.today - (l.created_at at time zone 'utc')::date)::int,
           w.name, w.legal_form, w.city, w.region, w.industry, l.event_summary,
           coalesce(btrim(w.website), '') <> '',
           coalesce(btrim(w.phone_main), '') <> '' or coalesce(btrim(o.d->'contact'->>'phone'), '') <> '',
           o.d->'contact'->>'phone_type',
           coalesce(btrim(o.d->'contact'->>'email'), '') <> '',
           o.d->'contact'->>'email_type',
           coalesce(btrim(o.d->'person'->>'name'), '') <> '',
           o.d->'person'->>'role',
           coalesce(lower(o.d->'quality'->>'complete') = 'true', false),
           c.result,
           coalesce(nullif(btrim(o.d->'contact'->>'phone'), ''), nullif(btrim(w.phone_main), '')),
           nullif(btrim(o.d->'contact'->>'email'), ''),
           nullif(btrim(w.website), ''),
           w.address,
           nullif(btrim(o.d->'person'->>'name'), ''),
           l.event_date, l.source_url
      from l
     cross join t
      left join signalwerk.watch_companies w on w.id = l.company_id
      left join lateral (select jsonb_object_agg(ob.key, ob.details) as d from signalwerk.observations ob
                          where ob.company_id = l.company_id and ob.kind = 'other'
                            and ob.key in ('contact', 'person', 'quality')) o on true
      left join signalwerk.lead_checks c on c.lead_id = l.id
     order by l.created_at desc
  $q$ using nullif(btrim(p_segment), ''),
            case when coalesce(cardinality(p_countries), 0) = 0 then null else p_countries end,
            case when coalesce(cardinality(p_status), 0) = 0 then null else p_status end,
            least(greatest(coalesce(p_limit, 1000), 1), 5000);
end $fn$;
revoke all on function signalwerk.flow_lead_rows(text, text[], text[], int) from public, anon, authenticated;
grant execute on function signalwerk.flow_lead_rows(text, text[], text[], int) to service_role;

-- 4) Käufer als flache Zeilen (p_status filtert check_status). Nie für die Pipeline nutzbar.
create or replace function signalwerk.flow_buyer_rows(p_segment text, p_countries text[], p_status text[], p_limit int)
returns table (
  id text, cid text, land text, segment text, firma text, rechtsform text, region text,
  hat_website boolean, hat_email boolean, email_generisch boolean, hat_telefon boolean, pruefung text, grund text,
  spezialisierung text, alter_tage int, angeschrieben boolean,
  email text, telefon text, website text, adresse text)
language plpgsql stable set search_path = signalwerk, public set statement_timeout = '25s' as $fn$
begin
  return query execute $q$
    with p as (
      select x.id, x.country, x.segment_id, x.company_name, x.legal_form, x.region, x.website, x.email,
             x.email_is_generic, x.phone, x.check_status, x.check_reason, x.specialization, x.published_address, x.created_at
        from signalwerk.prospects x
       where ($1::text is null or x.segment_id = $1)
         and ($2::text[] is null or x.country = any($2))
         and ($3::text[] is null or x.check_status = any($3))
       order by x.created_at desc
       limit $4)
    select p.id::text, null::text, p.country, p.segment_id, p.company_name, p.legal_form, p.region,
           coalesce(btrim(p.website), '') <> '',
           coalesce(btrim(p.email), '') <> '',
           p.email_is_generic,
           coalesce(btrim(p.phone), '') <> '',
           p.check_status, p.check_reason, p.specialization,
           ((now() at time zone 'utc')::date - (p.created_at at time zone 'utc')::date)::int,
           exists (select 1 from signalwerk.messages m where m.prospect_id = p.id and m.status = 'sent'),
           nullif(btrim(p.email), ''), nullif(btrim(p.phone), ''), nullif(btrim(p.website), ''), p.published_address
      from p
     order by p.created_at desc
  $q$ using nullif(btrim(p_segment), ''),
            case when coalesce(cardinality(p_countries), 0) = 0 then null else p_countries end,
            case when coalesce(cardinality(p_status), 0) = 0 then null else p_status end,
            least(greatest(coalesce(p_limit, 1000), 1), 5000);
end $fn$;
revoke all on function signalwerk.flow_buyer_rows(text, text[], text[], int) from public, anon, authenticated;
grant execute on function signalwerk.flow_buyer_rows(text, text[], text[], int) to service_role;

-- 5) Gesamtzahl einer Quelle (p_source 'leads' | 'kaeufer'; gleiche Filter wie oben)
create or replace function signalwerk.flow_source_count(p_source text, p_segment text, p_countries text[], p_status text[])
returns bigint
language plpgsql stable set search_path = signalwerk, public set statement_timeout = '25s' as $fn$
declare
  n bigint;
  seg text := nullif(btrim(p_segment), '');
  cs text[] := case when coalesce(cardinality(p_countries), 0) = 0 then null else p_countries end;
  st text[] := case when coalesce(cardinality(p_status), 0) = 0 then null else p_status end;
begin
  if p_source = 'leads' then
    execute $q$ select count(*) from signalwerk.leads x
                 where ($1::text is null or x.segment_id = $1) and ($2::text[] is null or x.country = any($2))
                   and ($3::text[] is null or x.status = any($3)) $q$ into n using seg, cs, st;
  elsif p_source = 'kaeufer' then
    execute $q$ select count(*) from signalwerk.prospects x
                 where ($1::text is null or x.segment_id = $1) and ($2::text[] is null or x.country = any($2))
                   and ($3::text[] is null or x.check_status = any($3)) $q$ into n using seg, cs, st;
  else
    raise exception 'flow_source_count: unbekannte Quelle %', p_source using errcode = '22023';
  end if;
  return n;
end $fn$;
revoke all on function signalwerk.flow_source_count(text, text, text[], text[]) from public, anon, authenticated;
grant execute on function signalwerk.flow_source_count(text, text, text[], text[]) to service_role;

-- 6) Regel aus/geändert: nur Leads, deren letzte Prüfung in Stufe 4 (Inhaber-Regeln) u. a. an DIESER Regel scheiterte
--    (Grund „s4:regel:<erste 8 Zeichen der Flow-ID>“), gehen zurück auf 'new'; die Freigabe prüft sie vor jeder
--    Probe/Lieferung erneut (auch gegen die übrigen aktiven Regeln). An Stufe 1–3 Gescheiterte bleiben 'held'.
create or replace function signalwerk.flow_release_held(p_flow uuid)
returns int
language sql volatile set search_path = signalwerk, public set statement_timeout = '25s' as $fn$
  with upd as (
    update signalwerk.leads l set status = 'new'
      from signalwerk.lead_checks c
     where c.lead_id = l.id and l.status = 'held' and c.failed_stage = 4
       and c.reasons ? ('s4:regel:' || left(lower(p_flow::text), 8))
    returning l.id)
  select count(*)::int from upd;
$fn$;
revoke all on function signalwerk.flow_release_held(uuid) from public, anon, authenticated;
grant execute on function signalwerk.flow_release_held(uuid) to service_role;
