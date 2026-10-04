-- Gehirn optimiert sich selbst (Inhaber 04.10.2026: „Bau es so das sich auch das gehirn weiter selbstoptimiert“).
-- Nicht destruktiv: neue Spalten mit Standardwerten, zwei neue Tabellen, eine lesende Funktion, eine neue Routine.
-- Nichts gelöscht, keine Löschrechte.
--   brain_routines.takt       Läufe je Tag (0,5 = jeden 2. Tag, 1, 2, 4); das Meta-Review halbiert/verdoppelt ihn
--   brain_routines.meta_at    letzte Anpassung durch das Meta-Review (danach zählen nur neue Läufe)
--   agent_tasks.routine_id    welche Gehirn-Routine den Auftrag angelegt hat (Bewertung je Routine)
--   brain_knowledge.typ       notiz | gelernt | fehlermuster (Meta-Review schreibt gelernt/fehlermuster)
--   brain_improvements        höchstens 3 offene Verbesserungsvorschläge für docs/GEHIRN-SITZUNG.md mit Beleg
--   brain_meta_runs           ein Lauf je deutschem Tag: Gehirn-Score, Basis, Änderungen
--   gehirn_score_teile()      Rohwerte des Gehirn-Scores (Antwortquote, Zustellrate, Fehlerquote, grün/Platz-Stunde)

alter table signalwerk.brain_routines add column if not exists takt numeric not null default 1;
alter table signalwerk.brain_routines drop constraint if exists brain_routines_takt_check;
alter table signalwerk.brain_routines add constraint brain_routines_takt_check check (takt in (0.5, 1, 2, 4));
alter table signalwerk.brain_routines add column if not exists meta_at timestamptz;
comment on column signalwerk.brain_routines.takt is 'Läufe je Tag: 0.5 = jeden 2. Tag, 1, 2, 4 (scripts/brain_meta.py)';

alter table signalwerk.agent_tasks add column if not exists routine_id uuid references signalwerk.brain_routines(id);
create index if not exists agent_tasks_routine on signalwerk.agent_tasks (routine_id, created_at desc) where routine_id is not null;

alter table signalwerk.brain_knowledge add column if not exists typ text not null default 'notiz';
alter table signalwerk.brain_knowledge drop constraint if exists brain_knowledge_typ_check;
alter table signalwerk.brain_knowledge add constraint brain_knowledge_typ_check check (typ in ('notiz', 'gelernt', 'fehlermuster'));

create table if not exists signalwerk.brain_improvements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  regel       text not null check (regel ~ '^[a-z0-9-]{2,60}$'),        -- Herkunft, z. B. art-vorrang-leads
  abschnitt   text not null check (char_length(btrim(abschnitt)) between 1 and 40),
  kurz_titel  text not null check (char_length(btrim(kurz_titel)) between 2 and 60),
  vorschlag   text not null check (char_length(btrim(vorschlag)) between 5 and 300),
  beleg       text not null check (char_length(btrim(beleg)) between 3 and 300),
  status      text not null default 'offen' check (status in ('offen', 'uebernommen', 'verworfen')),
  pr_url      text,
  notiz       text check (notiz is null or char_length(notiz) <= 160),
  erledigt_at timestamptz
);
create unique index if not exists brain_improvements_open on signalwerk.brain_improvements (regel) where status = 'offen';
create index if not exists brain_improvements_recent on signalwerk.brain_improvements (status, created_at desc);

create table if not exists signalwerk.brain_meta_runs (
  day        date primary key,                  -- deutscher Kalendertag
  at         timestamptz not null default now(),
  score      numeric,
  basis      text not null,                     -- ok | noch keine Basis
  ergebnis   jsonb not null default '{}'::jsonb
);

-- Rohwerte des Gehirn-Scores bis Ende des deutschen Tages p_day (Fenster 14 Tage; Stichprobe/Lead-Werk nur dieser Tag)
create or replace function signalwerk.gehirn_score_teile(p_day date, p_segment text, p_countries text[])
returns table (gesendet bigint, antworten bigint, bounces bigint, geprueft bigint, fehler bigint, gruen bigint, platz_h numeric)
language sql stable set search_path = signalwerk, public as $$
  with b as (
    select ((p_day - 13)::timestamp at time zone 'Europe/Berlin') as w0,
           (p_day::timestamp at time zone 'Europe/Berlin') as d0,
           ((p_day + 1)::timestamp at time zone 'Europe/Berlin') as t1
  ), m as (
    select x.id, x.prospect_id
      from signalwerk.messages x join signalwerk.prospects p on p.id = x.prospect_id, b
     where x.status = 'sent' and x.kind = 'initial' and x.sent_at >= b.w0 and x.sent_at < b.t1
       and p.segment_id = p_segment and p.country = any(p_countries)
  ), ev as (
    select e.type, mm.prospect_id
      from signalwerk.email_events e join signalwerk.messages mm on mm.id = e.message_id
      join signalwerk.prospects p on p.id = mm.prospect_id, b
     where e.occurred_at >= b.w0 and e.occurred_at < b.t1
       and p.segment_id = p_segment and p.country = any(p_countries)
  ), st as (
    select coalesce(sum(r.candidates), 0)::bigint as geprueft, coalesce(sum(r.red), 0)::bigint as fehler
      from signalwerk.run_stats r, b
     where r.werk = 'stichprobe' and r.segment_id = p_segment and r.country = any(p_countries)
       and r.finished_at >= b.d0 and r.finished_at < b.t1
  ), lw as (
    select coalesce(sum(r.green), 0)::bigint as gruen,
           coalesce(sum(extract(epoch from (r.finished_at - r.started_at))) / 3600.0, 0)::numeric as platz_h
      from signalwerk.run_stats r, b
     where r.werk = 'lead-werk' and r.segment_id = p_segment and r.country = any(p_countries)
       and r.finished_at >= b.d0 and r.finished_at < b.t1 and r.started_at is not null and r.finished_at > r.started_at
  )
  select (select count(*) from m),
         (select count(distinct prospect_id) from ev
           where type in ('reply', 'reply_positive', 'reply_negative', 'sample_requested')),
         (select count(distinct prospect_id) from ev where type = 'bounced'),
         st.geprueft, st.fehler, lw.gruen, round(lw.platz_h, 2)
    from st, lw;
$$;

revoke all on function signalwerk.gehirn_score_teile(date, text, text[]) from public, anon, authenticated;
grant execute on function signalwerk.gehirn_score_teile(date, text, text[]) to service_role;

alter table signalwerk.brain_improvements enable row level security;
alter table signalwerk.brain_meta_runs enable row level security;
revoke all on signalwerk.brain_improvements, signalwerk.brain_meta_runs from anon, authenticated;
revoke delete, truncate on signalwerk.brain_improvements, signalwerk.brain_meta_runs from service_role;
grant select, insert, update on signalwerk.brain_improvements, signalwerk.brain_meta_runs to service_role;

-- Meta-Review als Gehirn-Routine (täglich 21:10 deutscher Zeit); das Meta-Review passt sich selbst nie an
insert into signalwerk.brain_routines (name, aufgabe, uhrzeit, tage, dauer_min, created_by)
select 'Meta-Review Gehirn',
       'python scripts/brain_meta.py lauf --apply ausführen: Routinen und Auftragsarten nach Wirkung bewerten, Takt anpassen, Gelerntes und Fehlermuster notieren, Gehirn-Score speichern, höchstens 3 Verbesserungsvorschläge für docs/GEHIRN-SITZUNG.md. Ergebnis kurz melden.',
       '21:10', 'taeglich', 10, 'Gehirn'
 where not exists (select 1 from signalwerk.brain_routines where name = 'Meta-Review Gehirn');
