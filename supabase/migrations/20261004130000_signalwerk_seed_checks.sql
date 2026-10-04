-- Posteingangstest mit Kontrolladressen (Inhaber 04.10.2026: „übernimm alle 3 punkte“).
-- scripts/outreach.py send schickt je Versandlauf und Land genau eine echte Erstmail zusätzlich als Kopie an jede
-- Kontrolladresse des Inhabers (GitHub-Secret SEED_INBOXES). Das ist keine Kaltmail: sie steht nicht in messages,
-- zählt für keine Grenze und nicht für die Notbremse. Hier steht nur der Nachweis; placement (inbox, spam,
-- promotions, fehlt) trägt später der Inhaber oder eine IMAP-Auswertung ein. Nicht destruktiv: neue Tabelle.
create table if not exists signalwerk.seed_checks (
  id               uuid primary key default gen_random_uuid(),
  at               timestamptz not null default now(),
  country          text not null check (char_length(country) between 2 and 3),
  seed             text not null check (char_length(seed) between 3 and 320),
  message_id       uuid references signalwerk.messages(id) on delete set null,   -- die echte Erstmail, deren Kopie das ist
  sent_from        text,
  smtp_message_id  text,
  subject          text,
  placement        text check (placement in ('inbox', 'spam', 'promotions', 'other', 'missing')),
  checked_at       timestamptz,
  note             text
);
create index if not exists seed_checks_at_idx on signalwerk.seed_checks (at desc);
alter table signalwerk.seed_checks enable row level security;
revoke all on signalwerk.seed_checks from anon, authenticated;
grant select, insert, update on signalwerk.seed_checks to service_role;
