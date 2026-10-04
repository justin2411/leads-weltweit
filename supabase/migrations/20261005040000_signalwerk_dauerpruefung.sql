-- Dauerprüfung (Inhaber 04.10.2026: „Qualitätsagenten bitte mehrere, auch die die Kunden-Leads immer nochmal dauerhaft
-- überprüfen – je länger die liegen, desto bessere Qualität, weil sie so oft geprüft wurden“). Token-frei
-- (scripts/dauerpruefung.py, .github/workflows/dauerpruefung.yml). Nicht destruktiv: neue Spalten, Indizes,
-- Funktionen, eine Sicht; eine Prüfregel (run_stats.werk) nur ERWEITERT. Nichts gelöscht.
--   leads/prospects: pruef_anzahl (bestandene Prüfungen), zuletzt_geprueft, naechste_pruefung, qualitaet_score 0–100
--   prospects.pruef_hinweis  Abweichung ohne Statuswechsel (kein MX, Website weg, Bounce) – check_status ändert nur
--                            die bestehende Prüflogik (outreach.py check_values)
--   quality_score()          Wert aus bestandenen Prüfungen und Alter (Spiegel: scripts/lib/quality.py score)
--   lead_quality_apply()     Ergebnis einer Freigabe übernehmen (bestanden: Zähler +1, Abstand wächst; sonst Wert fällt)
--   prospect_quality_apply() dasselbe für Käufer
--   pruef_stats_daily        Tageszahlen je Art/Zielgruppe/Land (für JARVIS-Karten, Tagescheck, LLM-Agenten)
--   pruef_kpi()              Tageszahlen + Bestand (geprüft, Ø-Wert, ab 70, fällig) + Ausreißer

alter table signalwerk.leads add column if not exists pruef_anzahl smallint not null default 0;
alter table signalwerk.leads add column if not exists zuletzt_geprueft timestamptz;
alter table signalwerk.leads add column if not exists naechste_pruefung timestamptz;
alter table signalwerk.leads add column if not exists qualitaet_score smallint;
create index if not exists leads_naechste_pruefung on signalwerk.leads (naechste_pruefung)
  where naechste_pruefung is not null and status = 'new';
create index if not exists leads_qualitaet on signalwerk.leads (segment_id, country, qualitaet_score desc)
  where qualitaet_score is not null and status = 'new';

alter table signalwerk.prospects add column if not exists pruef_anzahl smallint not null default 0;
alter table signalwerk.prospects add column if not exists zuletzt_geprueft timestamptz;
alter table signalwerk.prospects add column if not exists naechste_pruefung timestamptz;
alter table signalwerk.prospects add column if not exists qualitaet_score smallint;
alter table signalwerk.prospects add column if not exists pruef_hinweis text;
create index if not exists prospects_naechste_pruefung on signalwerk.prospects (naechste_pruefung)
  where naechste_pruefung is not null and check_status = 'ok';
create index if not exists prospects_qualitaet on signalwerk.prospects (segment_id, country, qualitaet_score desc)
  where qualitaet_score is not null and check_status = 'ok';

-- Zähler je Lauf: neues Werk „dauerpruefung“ (Liste nur erweitert)
alter table signalwerk.run_stats drop constraint if exists run_stats_werk_check;
alter table signalwerk.run_stats add constraint run_stats_werk_check
  check (werk = any (array['lead-werk','kunden-werk','proben-vorrat','freigabe','stichprobe','dauerpruefung']));

-- Wert 0–100: 25 + 15 je bestandener Prüfung (höchstens 4) + 1 je 2 Tage im Bestand (höchstens 15)
create or replace function signalwerk.quality_score(p_passed integer, p_created timestamptz)
returns smallint language sql stable set search_path = signalwerk, public as $$
  select least(100, 25 + 15 * least(greatest(p_passed, 0), 4)
                    + least(15, greatest(0, floor(extract(epoch from (now() - coalesce(p_created, now()))) / 172800)::int)))::smallint;
$$;

-- p_rows: [{"id": uuid, "ok": bool}]; Abstand nach n bestandenen Prüfungen = p_intervals[min(n, Länge)] Tage
create or replace function signalwerk.lead_quality_apply(p_rows jsonb, p_intervals integer[] default array[1,3,7,14,30])
returns integer language plpgsql security definer set search_path = signalwerk, public as $$
declare n int;
begin
  update signalwerk.leads l set
    pruef_anzahl = case when r.ok then least(l.pruef_anzahl + 1, 30000) else l.pruef_anzahl end,
    zuletzt_geprueft = now(),
    naechste_pruefung = case when r.ok
      then now() + make_interval(days => p_intervals[least(l.pruef_anzahl + 1, array_length(p_intervals, 1))])
      else null end,
    qualitaet_score = case when r.ok then signalwerk.quality_score(l.pruef_anzahl + 1, l.created_at)
      else greatest(0, coalesce(l.qualitaet_score, 0) - 50)::smallint end
  from jsonb_to_recordset(coalesce(p_rows, '[]')) as r(id uuid, ok boolean)
  where l.id = r.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- p_rows: [{"id": uuid, "result": "ok"|"hinweis"|"abgelehnt", "hinweis": text}]
create or replace function signalwerk.prospect_quality_apply(p_rows jsonb, p_intervals integer[] default array[1,3,7,14,30],
                                                             p_hint_days integer default 1)
returns integer language plpgsql security definer set search_path = signalwerk, public as $$
declare n int;
begin
  update signalwerk.prospects p set
    pruef_anzahl = case when r.result = 'ok' then least(p.pruef_anzahl + 1, 30000) else p.pruef_anzahl end,
    zuletzt_geprueft = now(),
    naechste_pruefung = case r.result
      when 'ok' then now() + make_interval(days => p_intervals[least(p.pruef_anzahl + 1, array_length(p_intervals, 1))])
      when 'hinweis' then now() + make_interval(days => greatest(1, p_hint_days))
      else null end,
    qualitaet_score = case when r.result = 'ok' then signalwerk.quality_score(p.pruef_anzahl + 1, p.created_at)
      else greatest(0, coalesce(p.qualitaet_score, 0) - 50)::smallint end,
    pruef_hinweis = case when r.result = 'ok' then null else left(r.hinweis, 300) end
  from jsonb_to_recordset(coalesce(p_rows, '[]')) as r(id uuid, result text, hinweis text)
  where p.id = r.id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function signalwerk.quality_score(integer, timestamptz) from public, anon, authenticated;
revoke all on function signalwerk.lead_quality_apply(jsonb, integer[]) from public, anon, authenticated;
revoke all on function signalwerk.prospect_quality_apply(jsonb, integer[], integer) from public, anon, authenticated;
grant execute on function signalwerk.quality_score(integer, timestamptz) to service_role;
grant execute on function signalwerk.lead_quality_apply(jsonb, integer[]) to service_role;
grant execute on function signalwerk.prospect_quality_apply(jsonb, integer[], integer) to service_role;

-- Tageszahlen (deutsche Zeit): art lead|kaeufer; Käufer: bestanden = ok, markiert = Hinweis, gehalten = abgelehnt
create or replace view signalwerk.pruef_stats_daily with (security_invoker = true) as
select (r.finished_at at time zone 'Europe/Berlin')::date as tag,
       coalesce(r.extra->>'art', 'lead') as art,
       r.segment_id, r.country,
       count(distinct coalesce(r.run_id, r.id::text))::int as laeufe,
       sum(r.candidates)::int as geprueft,
       sum(r.green)::int as bestanden,
       sum(case when r.extra->>'art' = 'kaeufer' then r.yellow else 0 end)::int as markiert,
       sum(r.red)::int as gehalten,
       round(sum(r.candidates - r.green)::numeric / nullif(sum(r.candidates), 0), 4) as fehlerquote,
       max(r.finished_at) as letzter_lauf
  from signalwerk.run_stats r
 where r.werk = 'dauerpruefung'
 group by 1, 2, 3, 4;
revoke all on signalwerk.pruef_stats_daily from public, anon, authenticated;
grant select on signalwerk.pruef_stats_daily to service_role;

-- KPI für JARVIS-Karten (Fach-Agenten) und Tagescheck: kurz, ohne einzelne Leads
create or replace function signalwerk.pruef_kpi(p_days integer default 7)
returns jsonb language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '20s' as $$
select jsonb_build_object(
  'now', now(),
  'tage', (select coalesce(jsonb_agg(x order by x.tag desc, x.art, x.segment_id, x.country), '[]') from (
      select * from signalwerk.pruef_stats_daily
       where tag >= ((now() at time zone 'Europe/Berlin')::date - greatest(p_days, 1) + 1)) x),
  'letzter_lauf', (select max(finished_at) from signalwerk.run_stats where werk = 'dauerpruefung'),
  'leads', (select coalesce(jsonb_agg(x), '[]') from (
      select segment_id, country, count(*)::int as geprueft, round(avg(qualitaet_score), 1) as score_avg,
             count(*) filter (where qualitaet_score >= 70)::int as score_70,
             count(*) filter (where naechste_pruefung <= now())::int as faellig
        from signalwerk.leads where qualitaet_score is not null and status = 'new'
       group by 1, 2) x),
  'kaeufer', (select coalesce(jsonb_agg(x), '[]') from (
      select segment_id, country, count(*)::int as geprueft, round(avg(qualitaet_score), 1) as score_avg,
             count(*) filter (where qualitaet_score >= 70)::int as score_70,
             count(*) filter (where pruef_hinweis is not null)::int as mit_hinweis
        from signalwerk.prospects where qualitaet_score is not null and check_status = 'ok'
       group by 1, 2) x),
  -- Ausreißer der letzten 24 h: Fehlerquote über 5 % bei mindestens 20 Prüfungen
  'ausreisser', (select coalesce(jsonb_agg(x), '[]') from (
      select coalesce(extra->>'art', 'lead') as art, segment_id, country, sum(candidates)::int as geprueft,
             round(sum(candidates - green)::numeric / nullif(sum(candidates), 0), 4) as fehlerquote
        from signalwerk.run_stats
       where werk = 'dauerpruefung' and finished_at >= now() - interval '24 hours'
       group by 1, 2, 3
      having sum(candidates) >= 20 and sum(candidates - green)::numeric / nullif(sum(candidates), 0) > 0.05) x)
);
$$;
revoke all on function signalwerk.pruef_kpi(integer) from public, anon, authenticated;
grant execute on function signalwerk.pruef_kpi(integer) to service_role;
