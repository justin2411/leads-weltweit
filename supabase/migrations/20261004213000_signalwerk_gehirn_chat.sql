-- JARVIS mit Gehirn (Inhaber 04.10.2026: „einmal mit jarvis zu sprechen der das gehirn hat … KPIs optimieren, umsatz
-- maximieren und qualität steigern … beim gehirn mit ihm auch einzelne workflows bauen … jeden tag um 14 uhr sollst du
-- 15min recherchieren … alles was er dort lernt soll in mds gepackt werden“ und „einen chat den man nicht löschen kann wo
-- mir das gehirn immer updates gibt … immer der goldene chat ganz oben … aber nicht löschbar“).
-- Nicht destruktiv: neue Spalte (mit Standard), neue Tabellen, zwei Prüfungen um einen Wert erweitert (alle bisherigen
-- Werte bleiben erlaubt), ein Schutz-Trigger. Nichts gelöscht, keine Löschrechte („ausschalten statt löschen“).
--   jarvis_sessions.mode     'assistent' | 'gehirn' – Schalter im Chat, je Sitzung gespeichert
--   jarvis_sessions 'gehirn' feste Sitzung „Gehirn“ (genau eine): Updates des Gehirns, Tagesbericht, Chat im Gehirn-Modus;
--                            nicht archivierbar, nicht umbenennbar, Modus fest (Trigger unten)
--   agent_tasks 'gehirn'     Aufträge aus Gehirn-Routinen (scripts/brain_routines.py faellig, Wachhund)
--   agent_tasks.grund        Grund eines Auftrags vom Gehirn (≤ 160 Zeichen), gelernt_at = Ergebnis vom Gehirn gelesen
--   brain_routines           Gehirn-Routinen des Inhabers (Uhrzeit deutsche Zeit, Tage, Dauer)
--   brain_knowledge          Wissen des Gehirns als Markdown (nicht im öffentlichen Repo), Versionen in
--                            brain_knowledge_versions (alte Fassung bei jeder Änderung)

-- 1) Modus je Sitzung
alter table signalwerk.jarvis_sessions add column if not exists mode text not null default 'assistent';
alter table signalwerk.jarvis_sessions drop constraint if exists jarvis_sessions_mode_check;
alter table signalwerk.jarvis_sessions add constraint jarvis_sessions_mode_check check (mode in ('assistent', 'gehirn'));

-- 2) Feste Sitzung „Gehirn“
alter table signalwerk.jarvis_sessions drop constraint if exists jarvis_sessions_kind_check;
alter table signalwerk.jarvis_sessions add constraint jarvis_sessions_kind_check
  check (kind in ('chat', 'bericht', 'baukasten', 'website', 'gehirn'));
create unique index if not exists jarvis_sessions_one_gehirn on signalwerk.jarvis_sessions ((true)) where kind = 'gehirn';
-- Die Sitzung selbst legen Dashboard (lib/jarvis-chat-data.ts loadSessions) bzw. scripts/jarvis_chat.py beim ersten
-- Bedarf an – keine Startzeile hier, damit ältere Migrationen beim erneuten Anwenden (CI: zweimal) ihre Prüfung der
-- Sitzungsarten ohne 'gehirn' wieder setzen können.

-- Schutz: die Gehirn-Sitzung bleibt immer (nicht archivieren, nicht umbenennen, Art und Modus fest)
create or replace function signalwerk.jarvis_gehirn_guard() returns trigger
language plpgsql set search_path = signalwerk, public as $fn$
begin
  if old.kind = 'gehirn' and (new.archived or new.title is distinct from old.title or new.kind is distinct from old.kind
                              or new.mode is distinct from 'gehirn') then
    raise exception 'Die Gehirn-Sitzung bleibt immer (nicht archivieren, umbenennen oder umstellen)' using errcode = 'P0001';
  end if;
  if new.kind = 'gehirn' and new.mode is distinct from 'gehirn' then
    new.mode := 'gehirn';
  end if;
  return new;
end $fn$;
create or replace trigger jarvis_sessions_gehirn_guard before update on signalwerk.jarvis_sessions
  for each row execute function signalwerk.jarvis_gehirn_guard();
revoke all on function signalwerk.jarvis_gehirn_guard() from public, anon, authenticated;

-- 3) Aufträge aus Gehirn-Routinen
alter table signalwerk.agent_tasks drop constraint if exists agent_tasks_kind_check;
alter table signalwerk.agent_tasks add constraint agent_tasks_kind_check
  check (kind in ('leads', 'kaeufer', 'quelle', 'pruefen', 'frage', 'kunde', 'website', 'gehirn'));

-- Aufträge vom Gehirn (Inhaber 04.10.2026: „ich will auch das das gehirn die agents selber nutzt und beauftragt für seine
-- ziele“): kurzer Grund mit Ziel-Bezug, und wann das Gehirn das Ergebnis gelesen und daraus gelernt hat
alter table signalwerk.agent_tasks add column if not exists grund text;
alter table signalwerk.agent_tasks drop constraint if exists agent_tasks_grund_check;
alter table signalwerk.agent_tasks add constraint agent_tasks_grund_check check (grund is null or char_length(grund) <= 160);
alter table signalwerk.agent_tasks add column if not exists gelernt_at timestamptz;

-- 4) Gehirn-Routinen
create table if not exists signalwerk.brain_routines (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 2 and 60),
  aufgabe       text not null check (char_length(btrim(aufgabe)) between 5 and 1000),
  uhrzeit       text not null check (uhrzeit ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),   -- deutsche Zeit
  tage          text not null default 'taeglich' check (tage in ('taeglich', 'werktags', 'wochentage')),
  wochentage    smallint[] not null default '{}'::smallint[]                           -- 1 = Mo … 7 = So (nur bei 'wochentage')
                check (wochentage <@ array[1,2,3,4,5,6,7]::smallint[]),
  dauer_min     integer not null default 15 check (dauer_min between 5 and 60),
  aktiv         boolean not null default true,
  last_run_at   timestamptz,          -- zuletzt beauftragt (Auftrag in agent_tasks angelegt)
  last_task_id  uuid references signalwerk.agent_tasks(id),
  last_result   text check (last_result is null or char_length(last_result) <= 300),
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint brain_routines_days check (tage <> 'wochentage' or cardinality(wochentage) between 1 and 7)
);
create index if not exists brain_routines_active on signalwerk.brain_routines (aktiv, uhrzeit);
create or replace trigger brain_routines_touch before update on signalwerk.brain_routines
  for each row execute function signalwerk.touch_updated_at();

-- 5) Wissen als Markdown (+ Versionen)
create table if not exists signalwerk.brain_knowledge (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  titel       text not null check (char_length(btrim(titel)) between 2 and 120),
  markdown    text not null check (char_length(btrim(markdown)) between 1 and 60000),
  quelle      text not null default 'agent' check (quelle in ('routine', 'chat', 'agent', 'inhaber')),
  routine_id  uuid references signalwerk.brain_routines(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists brain_knowledge_recent on signalwerk.brain_knowledge (updated_at desc);
create or replace trigger brain_knowledge_touch before update on signalwerk.brain_knowledge
  for each row execute function signalwerk.touch_updated_at();

create table if not exists signalwerk.brain_knowledge_versions (
  id            uuid primary key default gen_random_uuid(),
  knowledge_id  uuid not null references signalwerk.brain_knowledge(id),
  titel         text not null,
  markdown      text not null,
  quelle        text,
  saved_at      timestamptz not null default now()
);
create index if not exists brain_knowledge_versions_doc on signalwerk.brain_knowledge_versions (knowledge_id, saved_at desc);

create or replace function signalwerk.brain_knowledge_version() returns trigger
language plpgsql set search_path = signalwerk, public as $fn$
begin
  if new.markdown is distinct from old.markdown or new.titel is distinct from old.titel then
    insert into signalwerk.brain_knowledge_versions (knowledge_id, titel, markdown, quelle)
    values (old.id, old.titel, old.markdown, old.quelle);
  end if;
  return new;
end $fn$;
create or replace trigger brain_knowledge_keep_version before update on signalwerk.brain_knowledge
  for each row execute function signalwerk.brain_knowledge_version();
revoke all on function signalwerk.brain_knowledge_version() from public, anon, authenticated;

-- 6) Rechte: nur serverseitig (Service-Schlüssel), keine Löschrechte
alter table signalwerk.brain_routines enable row level security;
alter table signalwerk.brain_knowledge enable row level security;
alter table signalwerk.brain_knowledge_versions enable row level security;
revoke all on signalwerk.brain_routines, signalwerk.brain_knowledge, signalwerk.brain_knowledge_versions from anon, authenticated;
revoke delete, truncate on signalwerk.brain_routines, signalwerk.brain_knowledge, signalwerk.brain_knowledge_versions from service_role;
grant select, insert, update on signalwerk.brain_routines, signalwerk.brain_knowledge to service_role;
grant select, insert on signalwerk.brain_knowledge_versions to service_role;
