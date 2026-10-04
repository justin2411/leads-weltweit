-- Kunden-Agenten (Inhaber 04.10.2026: „jeder kunde [bekommt] seinen eigenen agent ab dem mittleren abo (offiziell
-- ansprechpartner) … bei jedem kauf ein agent erzeugt … mit dem kunden kommunizieren … wünsche und ziele und
-- zielgruppe des kunden aufnehmen und ihm anhand dessen spezialisiert die leads zur verfügung stellen“).
-- Bauplan: docs/KUNDEN-AGENTEN.md. Ein Agent je Abo (Pro bzw. individuell ab 50 Leads/Woche), immer als KI erkennbar.
-- Nicht destruktiv: zwei neue Tabellen, agent_tasks.kind um 'kunde' erweitert (bestehende Werte bleiben erlaubt).
-- Zugriff nur service_role (App serverseitig, Skripte); keine Löschrechte – pausieren statt löschen.

create table if not exists signalwerk.customer_agents (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references signalwerk.customers(id),
  subscription_id  uuid not null unique references signalwerk.subscriptions(id),
  status           text not null default 'onboarding' check (status in ('onboarding', 'aktiv', 'pausiert')),
  persona          jsonb not null default '{}',  -- {first_name, last_name, gender, role, lang, bio, tone} (scripts/lib/personas.json)
  profile          jsonb not null default '{}',  -- {zielgruppe, leistungen, ziele, signale, branchen, groesse, regionen, notizen}
  kpis             jsonb not null default '{}',  -- {rueckmeldungen, gute_leads, abschluesse, checkins: [2, 4]}
  mail_opt_out     boolean not null default false,  -- keine eigenen Mails des Agenten mehr; Lieferungen laufen weiter
  last_contact_at  timestamptz,
  next_checkin_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists customer_agents_customer on signalwerk.customer_agents (customer_id);
create index if not exists customer_agents_status on signalwerk.customer_agents (status);
create or replace trigger customer_agents_touch before update on signalwerk.customer_agents
  for each row execute function signalwerk.touch_updated_at();

create table if not exists signalwerk.customer_agent_messages (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references signalwerk.customer_agents(id),
  created_at   timestamptz not null default now(),
  direction    text not null check (direction in ('in', 'out', 'notiz')),
  channel      text not null default 'mail' check (channel in ('mail', 'dashboard')),
  subject      text check (subject is null or char_length(subject) <= 300),
  body         text not null check (char_length(body) <= 8000),
  status       text not null default 'entwurf' check (status in ('entwurf', 'gesendet', 'fehler', 'empfangen')),
  message_id   text,   -- eingehend: Message-ID der Kundenmail; ausgehend: Resend-ID
  in_reply_to  text    -- ausgehend als Antwort: Message-ID der Kundenmail (leer = eigene Mail des Agenten)
);
create index if not exists customer_agent_messages_agent on signalwerk.customer_agent_messages (agent_id, created_at desc);
-- dieselbe Kundenmail nie zweimal im Verlauf (customer_agents.py inbox läuft alle 10 min)
create unique index if not exists customer_agent_messages_message_id
  on signalwerk.customer_agent_messages (message_id) where message_id is not null;

alter table signalwerk.customer_agents enable row level security;
alter table signalwerk.customer_agent_messages enable row level security;
revoke all on signalwerk.customer_agents, signalwerk.customer_agent_messages from anon, authenticated;
grant select, insert, update on signalwerk.customer_agents, signalwerk.customer_agent_messages to service_role;

-- Aufträge der Kunden-Agenten (Kundenantwort bearbeiten) laufen über dieselbe Agenten-Routine (docs/AGENTEN.md)
alter table signalwerk.agent_tasks drop constraint if exists agent_tasks_kind_check;
alter table signalwerk.agent_tasks add constraint agent_tasks_kind_check
  check (kind in ('leads', 'kaeufer', 'quelle', 'pruefen', 'frage', 'kunde'));
