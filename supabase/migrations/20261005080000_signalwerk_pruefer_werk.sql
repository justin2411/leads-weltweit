-- Prüfer-Werk (Inhaber 05.10.2026: „Lieber 4 dauerhafte Prüfer der Leads nach Qualitätsmerkmalen, damit die Leads
-- immer besser werden und gut aufbereitet für den Kunden werden.“). Nicht destruktiv: nur neue Spalten, Indizes, View.
--
--   lead_checks.pruefer_punkte    Qualitätspunkte 0–100 des letzten Prüfer-Laufs (0 = durchgefallen)
--   lead_checks.pruefer_hinweise  Gründe/Hinweise (Abzüge, Aufbereitung) des Prüfers
--   lead_checks.pruefer_at        Zeitpunkt der letzten Prüfer-Prüfung
--   pruefer_kpi (View)            je Land: geprüft 24 h, bestanden, Qualität lieferbar %, gehalten, Ø Punkte

alter table signalwerk.lead_checks
  add column if not exists pruefer_punkte smallint,
  add column if not exists pruefer_hinweise jsonb,
  add column if not exists pruefer_at timestamptz;

-- Neues Werk in den Zählern und im Belegungsprotokoll (Erweiterung der erlaubten Werte, nichts entfernt)
alter table signalwerk.run_stats drop constraint if exists run_stats_werk_check;
alter table signalwerk.run_stats add constraint run_stats_werk_check
  check (werk in ('lead-werk', 'kunden-werk', 'proben-vorrat', 'freigabe', 'stichprobe', 'dauerpruefung', 'pruefer-werk'));
alter table signalwerk.werk_plan_log drop constraint if exists werk_plan_log_werk_check;
alter table signalwerk.werk_plan_log add constraint werk_plan_log_werk_check
  check (werk in ('lead-werk', 'kunden-werk', 'pruefer-werk'));

-- Auswahl „nach Alter der letzten Prüfung“: nur bereits geprüfte, lieferbare Leads (klein)
create index if not exists leads_zuletzt_geprueft
  on signalwerk.leads (segment_id, country, zuletzt_geprueft)
  where status = 'new' and zuletzt_geprueft is not null;

-- Dubletten im Bestand über die Telefonnummer (Kontakt-Beobachtungen, fast alle E.164)
create index if not exists observations_contact_phone
  on signalwerk.observations ((details ->> 'phone'))
  where kind = 'other' and key = 'contact' and (details ->> 'phone') is not null;

create index if not exists lead_checks_pruefer_at
  on signalwerk.lead_checks (pruefer_at desc) where pruefer_at is not null;

-- Kennzahlen fürs Dashboard und den Tagescheck: Zähler des Prüfer-Werks (run_stats) der letzten 24 h je Land
create or replace view signalwerk.pruefer_kpi
with (security_invoker = true) as
select coalesce(r.country, '?') as country,
       sum(r.candidates)::int as geprueft_24h,
       sum(r.green)::int as bestanden_24h,
       sum(r.red)::int as gehalten_24h,
       case when sum(r.candidates) > 0 then round(100.0 * sum(r.green) / sum(r.candidates), 1) end as qualitaet_pct,
       round(avg(nullif((r.extra ->> 'punkte_avg'), '')::numeric), 1) as punkte_avg,
       max(r.finished_at) as letzter_lauf
from signalwerk.run_stats r
where r.werk = 'pruefer-werk' and r.finished_at >= now() - interval '24 hours'
group by 1;
revoke all on signalwerk.pruefer_kpi from anon, authenticated;

-- Abteilung Qualität: Prüfer-Werk als Mitglied (vorhandene Abteilung, nur ergänzen)
update signalwerk.departments
set mitglieder = mitglieder || jsonb_build_array(jsonb_build_object(
      'art', 'workflow', 'ref', 'pruefer-werk.yml', 'name', 'Prüfer-Werk (4 Prüfer)', 'takt', 'rund um die Uhr')),
    updated_at = now()
where slug = 'qualitaet'
  and not exists (select 1 from jsonb_array_elements(mitglieder) m where m ->> 'ref' = 'pruefer-werk.yml');
