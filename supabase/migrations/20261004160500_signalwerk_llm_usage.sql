-- Kosten der Sofort-Antworten (Inhaber 04.10.2026: „bei einfachen antworten nimmt der haiku und bei schwierigen oder wo
-- er direkt auf das system zugreifen muss nimmt er opus“, Monatsgrenze im Dashboard). Nicht destruktiv: neue Tabelle,
-- neue Spalten (null erlaubt), nichts gelöscht oder geändert.
--   llm_usage                  ein Eintrag je API-Aufruf (Modell, Tokens, Kosten in Euro, Sitzung) – Summe des Monats
--                              wird vor jedem Aufruf gegen owner_settings.llm_budget_eur geprüft (app/lib/jarvis-llm.ts)
--   jarvis_messages.model      'haiku' | 'opus' an Sofort-Antworten (null = Antwort der Routine)
--   jarvis_messages.cost_eur   Kosten dieser Antwort (alle Aufrufe zusammen)
-- Keine Inhalte gespeichert, nur Zahlen. Geschrieben nur serverseitig mit dem Service-Schlüssel.
create table if not exists signalwerk.llm_usage (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  model          text not null check (char_length(model) between 1 and 80),
  input_tokens   integer not null default 0 check (input_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  cost_eur       numeric(12, 6) not null default 0 check (cost_eur >= 0),
  session_id     uuid references signalwerk.jarvis_sessions(id)
);
create index if not exists llm_usage_at on signalwerk.llm_usage (at desc);

alter table signalwerk.jarvis_messages add column if not exists model text check (model is null or model in ('haiku', 'opus'));
alter table signalwerk.jarvis_messages add column if not exists cost_eur numeric(12, 6) check (cost_eur is null or cost_eur >= 0);

alter table signalwerk.llm_usage enable row level security;
revoke all on signalwerk.llm_usage from anon, authenticated;
revoke delete, truncate, update on signalwerk.llm_usage from service_role;
grant select, insert on signalwerk.llm_usage to service_role;
