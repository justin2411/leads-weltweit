-- Aufräumen nach festen Regeln (Inhaber 05.10.2026: „lösche auch Daten, die wir nicht brauchen“).
-- Nur diese Kategorien, Mindestalter fest in der Funktion (nicht per Parameter lockerbar):
--   rohbestand       raw_candidates älter als 30 Tage (unvollständig/widersprüchlich, nie Lead/Probe/Lieferung)
--   rohbestand_firma alter Rohbestand als Firma (bis 03.10.2026): watch_companies älter als 30 Tage ohne Lead, mit
--                    Qualitätsprüfung complete = false, in keiner Probe – samt ihren Beobachtungen
--   run_stats / heartbeat / plan_log   Laufzahlen, Herzschläge, Belegungs-Protokoll älter als 14 Tage
--                    (Tageswerte in kpi_daily bleiben)
--   proben           sample_stock expired/failed/released älter als 14 Tage, Datei schon gelöscht
-- Nie: leads, suppression, messages, email_events, prospects, customers, subscriptions, deliveries, decisions,
-- brain_*, agent_tasks. lead_checks hat je Lead genau 1 Zeile (Primärschlüssel lead_id) – dort gibt es nichts.
-- p_dry = true zählt nur; sonst löscht ein Aufruf höchstens p_limit Zeilen (Häppchen, kurze Sperren).

create or replace function signalwerk.aufraeumen(p_kind text, p_dry boolean default true, p_limit int default 2000)
returns bigint
language plpgsql security definer set search_path = signalwerk, public set statement_timeout = '120s' as $$
declare
  n bigint := 0;
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  ids uuid[];
  bids bigint[];
begin
  if p_kind = 'rohbestand' then
    if p_dry then
      select count(*) into n from signalwerk.raw_candidates where created_at < now() - interval '30 days';
    else
      delete from signalwerk.raw_candidates where id in (
        select id from signalwerk.raw_candidates where created_at < now() - interval '30 days' limit lim);
      get diagnostics n = row_count;
    end if;
  elsif p_kind = 'rohbestand_firma' then
    select coalesce(array_agg(w.id), '{}') into ids from (
      select w.id from signalwerk.watch_companies w
      where w.created_at < now() - interval '30 days'
        and not exists (select 1 from signalwerk.leads l where l.company_id = w.id)
        and exists (select 1 from signalwerk.observations o where o.company_id = w.id and o.kind = 'other'
                    and o.key = 'quality' and o.details->>'complete' = 'false')
        and not exists (select 1 from signalwerk.sample_stock s where w.id = any(s.company_ids))
      limit case when p_dry then null else lim end) w;
    n := coalesce(array_length(ids, 1), 0);
    if not p_dry and n > 0 then
      delete from signalwerk.observations where company_id = any(ids);
      delete from signalwerk.watch_companies w where w.id = any(ids)
        and not exists (select 1 from signalwerk.leads l where l.company_id = w.id);
      get diagnostics n = row_count;
    end if;
  elsif p_kind = 'run_stats' then
    if p_dry then
      select count(*) into n from signalwerk.run_stats where finished_at < now() - interval '14 days';
    else
      select coalesce(array_agg(id), '{}') into bids from (
        select id from signalwerk.run_stats where finished_at < now() - interval '14 days' limit lim) x;
      delete from signalwerk.run_stats where id = any(bids);
      get diagnostics n = row_count;
    end if;
  elsif p_kind = 'heartbeat' then
    if p_dry then
      select count(*) into n from signalwerk.werk_heartbeat where beat_at < now() - interval '14 days';
    else
      delete from signalwerk.werk_heartbeat where (werk, part) in (
        select werk, part from signalwerk.werk_heartbeat where beat_at < now() - interval '14 days' limit lim);
      get diagnostics n = row_count;
    end if;
  elsif p_kind = 'plan_log' then
    if p_dry then
      select count(*) into n from signalwerk.werk_plan_log where at < now() - interval '14 days';
    else
      select coalesce(array_agg(id), '{}') into bids from (
        select id from signalwerk.werk_plan_log where at < now() - interval '14 days' limit lim) x;
      delete from signalwerk.werk_plan_log where id = any(bids);
      get diagnostics n = row_count;
    end if;
  elsif p_kind = 'proben' then
    if p_dry then
      select count(*) into n from signalwerk.sample_stock where status in ('expired', 'failed', 'released')
        and built_at < now() - interval '14 days';
    else
      delete from signalwerk.sample_stock where id in (
        select id from signalwerk.sample_stock where status in ('expired', 'failed', 'released')
          and built_at < now() - interval '14 days' and files_removed_at is not null limit lim);
      get diagnostics n = row_count;
    end if;
  else
    raise exception 'unbekannte Aufräum-Kategorie: %', p_kind;
  end if;
  return n;
end
$$;
revoke all on function signalwerk.aufraeumen(text, boolean, int) from public, anon, authenticated;
grant execute on function signalwerk.aufraeumen(text, boolean, int) to service_role;

-- Größen vorher/nachher: Datenbank und jede Tabelle im Schema signalwerk (Byte, mit Indizes und TOAST)
create or replace function signalwerk.aufraeumen_groessen()
returns jsonb
language sql stable security definer set search_path = signalwerk, public as $$
  select jsonb_build_object('db', pg_database_size(current_database()),
    'tables', coalesce((select jsonb_object_agg(c.relname, pg_total_relation_size(c.oid))
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'signalwerk' and c.relkind = 'r'), '{}'::jsonb))
$$;
revoke all on function signalwerk.aufraeumen_groessen() from public, anon, authenticated;
grant execute on function signalwerk.aufraeumen_groessen() to service_role;
