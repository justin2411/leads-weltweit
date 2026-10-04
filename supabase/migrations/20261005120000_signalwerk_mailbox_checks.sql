-- Versand über viele Domains und Postfächer vorbereiten (Inhaber 05.10.2026: „wie können wir es schaffen, möglichst
-- viele zu schicken, wenn das Produkt läuft“). scripts/mailbox_test.py (Workflow postfach-test) trägt je Postfach
-- ein, ob DNS der Domain, Anmeldung + Testmail und DKIM grün sind. outreach.py send nutzt ein Postfach auf einer
-- anderen Domain als der Hauptdomain erst, wenn die neueste Prüfung dieser Adresse ok = true ist
-- (lib/mailboxes.active_boxes). Keine Passwörter. Nicht destruktiv: neue Tabelle.
create table if not exists signalwerk.mailbox_checks (
  id          uuid primary key default gen_random_uuid(),
  checked_at  timestamptz not null default now(),
  address     text not null check (char_length(address) between 3 and 320),
  domain      text not null default '',
  box_n       int,
  dns_ok      boolean not null default false,
  smtp_ok     boolean not null default false,
  dkim_ok     boolean not null default false,
  ok          boolean not null default false,
  detail      text
);
create index if not exists mailbox_checks_addr_idx on signalwerk.mailbox_checks (address, checked_at desc);
alter table signalwerk.mailbox_checks enable row level security;
revoke all on signalwerk.mailbox_checks from anon, authenticated;
grant select, insert on signalwerk.mailbox_checks to service_role;
