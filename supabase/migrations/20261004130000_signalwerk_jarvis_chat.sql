-- JARVIS-Chat mit Sitzungen und Baukasten-Chat (Inhaber 04.10.2026: „ich will mit jarvis direkt einen eigenen chat mit
-- unterschiedlichen sitzungen haben … wie mit claude … er soll auch selber jeden tag über einen speziellen chat sagen was
-- er angepasst hat“; Baukasten: „auch text reinschreiben … es soll dann mit meinen worten selber gebaut werden …
-- eigener chat unter dem baukasten … sobald ein punkt fertig ist kann ich den chat wieder löschen … die anpassungen
-- bleiben aber immer bestehen außer ich lösche das element“).
-- Nicht destruktiv: neue Tabellen, neue Spalten (null erlaubt), nichts gelöscht oder geändert. Keine Löschrechte –
-- „Chat leeren“ archiviert die Sitzung (archived = true) und legt eine neue an.
--   jarvis_sessions   Sitzungen: chat (beliebig viele) | bericht (genau eine: „Tagesbericht“) | baukasten (je Flow eine
--                     offene Sitzung, flow_id = signalwerk.flows.id – Test-Flow, Agenten-Flow oder Master-Pipeline)
--   jarvis_messages   Nachrichten: inhaber (Status offen → in_arbeit → fertig) | jarvis (ohne Status, mit Links)
--   flows.pending_def Vorschlag aus dem Chat für Flows, die schon für neue Leads gelten (Master-Pipeline, angeschlossene
--                     Test-Flows): erst aktiv, wenn der Inhaber im Baukasten „Übernehmen“/„Speichern“ klickt.
-- Bearbeitet von der JARVIS-Routine (viermal pro Stunde, docs/AGENTEN.md) über scripts/jarvis_chat.py und
-- scripts/flow_edit.py; geschrieben vom Dashboard nur serverseitig mit dem Service-Schlüssel.

-- 1) Sitzungen
create table if not exists signalwerk.jarvis_sessions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  kind        text not null default 'chat' check (kind in ('chat', 'bericht', 'baukasten')),
  flow_id     uuid references signalwerk.flows(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  read_at     timestamptz,                   -- zuletzt vom Inhaber gelesen (Punkt bei Neuem)
  archived    boolean not null default false,
  constraint jarvis_sessions_flow_check check ((kind = 'baukasten') = (flow_id is not null))
);
create index if not exists jarvis_sessions_recent on signalwerk.jarvis_sessions (archived, updated_at desc);
create unique index if not exists jarvis_sessions_one_bericht on signalwerk.jarvis_sessions ((true)) where kind = 'bericht';
create unique index if not exists jarvis_sessions_one_per_flow on signalwerk.jarvis_sessions (flow_id)
  where kind = 'baukasten' and not archived;
create or replace trigger jarvis_sessions_touch before update on signalwerk.jarvis_sessions
  for each row execute function signalwerk.touch_updated_at();

-- 2) Nachrichten
create table if not exists signalwerk.jarvis_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references signalwerk.jarvis_sessions(id),
  created_at  timestamptz not null default now(),
  role        text not null check (role in ('inhaber', 'jarvis')),
  body        text not null check (char_length(btrim(body)) between 1 and 8000),
  status      text default 'offen' check (status in ('offen', 'in_arbeit', 'fertig')),
  started_at  timestamptz,
  done_at     timestamptz,
  links       jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  -- JARVIS-Antworten tragen keinen Status (ausdrücklich null setzen), Inhaber-Nachrichten immer einen
  constraint jarvis_messages_status_role check ((role = 'inhaber') = (status is not null))
);
create index if not exists jarvis_messages_session on signalwerk.jarvis_messages (session_id, created_at);
create index if not exists jarvis_messages_open on signalwerk.jarvis_messages (status, created_at)
  where status in ('offen', 'in_arbeit');

-- Neue Nachricht hebt die Sitzung in der Liste nach oben
create or replace function signalwerk.jarvis_message_touch() returns trigger
language plpgsql set search_path = signalwerk, public as $fn$
begin
  update signalwerk.jarvis_sessions set updated_at = now() where id = new.session_id;
  return new;
end $fn$;
create or replace trigger jarvis_messages_touch after insert on signalwerk.jarvis_messages
  for each row execute function signalwerk.jarvis_message_touch();
revoke all on function signalwerk.jarvis_message_touch() from public, anon, authenticated;

-- 3) Feste Sitzung „Tagesbericht“
insert into signalwerk.jarvis_sessions (title, kind) values ('Tagesbericht', 'bericht') on conflict do nothing;

-- 4) Vorschlag aus dem Chat für Flows, die schon gelten (nie automatisch aktiv)
alter table signalwerk.flows add column if not exists pending_def jsonb
  check (pending_def is null or jsonb_typeof(pending_def) = 'object');
alter table signalwerk.flows add column if not exists pending_at timestamptz;
alter table signalwerk.flows add column if not exists pending_note text check (pending_note is null or char_length(pending_note) <= 500);

-- 5) Rechte: nur serverseitig (Service-Schlüssel), keine Löschrechte
alter table signalwerk.jarvis_sessions enable row level security;
alter table signalwerk.jarvis_messages enable row level security;
revoke all on signalwerk.jarvis_sessions, signalwerk.jarvis_messages from anon, authenticated;
revoke delete, truncate on signalwerk.jarvis_sessions, signalwerk.jarvis_messages from service_role;
grant select, insert, update on signalwerk.jarvis_sessions, signalwerk.jarvis_messages to service_role;
