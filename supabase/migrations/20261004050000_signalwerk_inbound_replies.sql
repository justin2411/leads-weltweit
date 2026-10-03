-- Antworten-Cockpit und Sofort-Alarm (Nachtschicht 03./04.10.2026). Seit dem Versandstart kommen Antworten rund um
-- die Uhr; bisher wurden Antworttext und Eingangszeit nicht gespeichert und der Inhaber hatte keinen Ort zum
-- Antworten. scripts/responder.py schreibt je menschlicher Mail eine Zeile (auch unbekannte Absender, keine
-- Autoresponder), das Dashboard (/dashboard/antworten) zeigt und bearbeitet sie. push_subscriptions hält die
-- Web-Push-Empfänger (Handy des Inhabers). Nicht destruktiv: zwei neue Tabellen. Zugriff nur service_role.
create table if not exists signalwerk.inbound_replies (
  id               uuid primary key default gen_random_uuid(),
  imap_message_id  text unique,                       -- Message-ID der eingegangenen Mail (Dedupe)
  received_at      timestamptz,                       -- Date-Kopfzeile der Mail
  processed_at     timestamptz not null default now(),
  message_id       uuid references signalwerk.messages(id) on delete set null,  -- unsere gesendete Mail
  prospect_id      uuid references signalwerk.prospects(id) on delete set null,
  from_email       text,
  subject          text,
  body_text        text check (body_text is null or char_length(body_text) <= 8000),  -- ohne zitierten Verlauf
  intent           text,                              -- buy, sample, question, not_interested, unsubscribe, other …
  summary_de       text,
  auto_action      text,                              -- owner, sample, faq, suppress, unknown …
  status           text not null default 'offen' check (status in ('offen', 'erledigt', 'spaeter')),
  draft_text       text,                              -- Vorschlag nur aus festen Textbausteinen
  draft_kind       text,
  alert_sent_at    timestamptz,
  owner_action     text,
  owner_action_at  timestamptz
);
create index if not exists inbound_replies_status_received on signalwerk.inbound_replies (status, received_at desc);
create index if not exists inbound_replies_prospect on signalwerk.inbound_replies (prospect_id);
alter table signalwerk.inbound_replies enable row level security;
revoke all on signalwerk.inbound_replies from anon, authenticated;
grant select, insert, update on signalwerk.inbound_replies to service_role;

create table if not exists signalwerk.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text,
  auth        text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  failures    int not null default 0,
  label       text
);
alter table signalwerk.push_subscriptions enable row level security;
revoke all on signalwerk.push_subscriptions from anon, authenticated;
grant select, insert, update on signalwerk.push_subscriptions to service_role;
