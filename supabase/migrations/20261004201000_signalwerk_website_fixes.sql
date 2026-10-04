-- Website-Funde direkt beheben (Inhaber 04.10.2026: „hier möchte ich direkt anpassungen machen können um die fehler zu
-- beheben direkt mit lösungsvorschlägen, jarvis soll das aber eigentlich alles selber machen und entscheiden“).
-- Nicht destruktiv: eine neue Tabelle, Schlüsselliste owner_settings um zwei Schlüssel erweitert (alle bisherigen
-- bleiben erlaubt). Nichts gelöscht, keine Löschrechte.
--   website_fixes    je Auftrag (agent_tasks kind 'website') die behobenen Fund-Schlüssel (website_checks.funde[].key):
--                    Knopf „Beheben“ im Dashboard (quelle 'inhaber') oder Auto-Fix (quelle 'auto',
--                    scripts/website_agents.py autofix). behoben_at setzt der nächste Website-Check, wenn die Funde weg sind.
--   owner_settings   website_autofix (Standard an), website_ignored ({fund_key: bis}, „Ignorieren“ 30 Tage).
-- Die Funde in website_checks.funde (jsonb) tragen ab jetzt zusätzlich `key` und `vorschlag` – keine Schemaänderung.

create table if not exists signalwerk.website_fixes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  task_id     uuid references signalwerk.agent_tasks(id),
  pfad        text check (pfad is null or char_length(pfad) <= 200),
  keys        text[] not null check (cardinality(keys) between 1 and 40),
  funde       jsonb not null default '[]'::jsonb check (jsonb_typeof(funde) = 'array'),
  quelle      text not null check (quelle in ('inhaber', 'auto')),
  created_by  text not null default 'Inhaber Dashboard',
  behoben_at  timestamptz
);
create index if not exists website_fixes_created on signalwerk.website_fixes (created_at desc);
create index if not exists website_fixes_task on signalwerk.website_fixes (task_id);

alter table signalwerk.website_fixes enable row level security;
revoke all on signalwerk.website_fixes from anon, authenticated;
revoke delete, truncate on signalwerk.website_fixes from service_role;
grant select, insert, update on signalwerk.website_fixes to service_role;

-- Schlüsselliste: alle bisherigen (Stand DB 04.10.2026, inkl. website_flow aus paralleler Arbeit, llm_budget_eur aus main) + website_autofix, website_ignored
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days',
  'sample_targets', 'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot',
  'dismissed_tips', 'llm_budget_eur', 'website_flow', 'website_autofix', 'website_ignored'));
