-- Baukasten: Sicherheitsnetz für Stufe 4 (Inhaber-Regeln). Nicht destruktiv: ein Index und eine neue Funktion.
-- Problem: Eine Freigabe-Prüfung lädt die Regeln, prüft (bis zu Minuten mit Live-Nachprüfung) und schreibt erst dann
-- 'held'. Wird die Regel in dieser Zeit gelöst, geändert oder archiviert, läuft flow_release_held VOR dem Schreiben –
-- die danach zurückgehaltenen Leads blieben für immer 'held'. Ebenso, wenn lead_checks nicht geschrieben werden konnte.
-- flow_release_stale_held gibt jeden Lead zurück an die normale Freigabe (Status 'new'), der nur an Stufe 4 scheiterte
-- und dessen Regel-Gründe zu keiner Regel gehören, die JETZT aktiv ist UND seit der Prüfung unverändert blieb
-- (flows.updated_at <= lead_checks.checked_at). Vor jeder Probe/Lieferung prüft die Freigabe ihn wieder mit allen Stufen.
-- Aufruf: scripts/wachhund.py (alle 15 min).

create index if not exists lead_checks_stage4 on signalwerk.lead_checks (lead_id) where failed_stage = 4;

create or replace function signalwerk.flow_release_stale_held()
returns int
language sql volatile set search_path = signalwerk, public set statement_timeout = '25s' as $fn$
  with upd as (
    update signalwerk.leads l set status = 'new'
      from signalwerk.lead_checks c
     where c.lead_id = l.id and l.status = 'held' and c.failed_stage = 4
       and not exists (
         select 1
           from jsonb_array_elements_text(case when jsonb_typeof(c.reasons) = 'array' then c.reasons else '[]'::jsonb end) t(r)
           join signalwerk.flows f
             on f.status = 'aktiv' and left(lower(f.id::text), 8) = substr(t.r, 10)
          where t.r like 's4:regel:%' and f.updated_at <= c.checked_at)
    returning l.id)
  select count(*)::int from upd;
$fn$;
revoke all on function signalwerk.flow_release_stale_held() from public, anon, authenticated;
grant execute on function signalwerk.flow_release_stale_held() to service_role;
