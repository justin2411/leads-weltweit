-- Täglicher Zustellbarkeits-Check (JARVIS-Plan Gruppe E): scripts/zustellbarkeit.py schreibt je Tag (deutsche Zeit)
-- eine Zeile: DNS (SPF/DKIM/DMARC/MX), kostenlose DNS-Blocklisten für Absender-IPs und Domain, Bounce-Quote und
-- Gründe (7 Tage), Kontrolladressen (seed_checks), Zustell-Lücke „gesendet vs. delivered“. Nur Messwerte – ändert
-- nichts am Versand, an der Notbremse oder der Sperrliste. Nicht destruktiv: neue Tabelle.
create table if not exists signalwerk.deliverability_daily (
  day         date primary key,
  at          timestamptz not null default now(),
  status      text not null check (status in ('gruen', 'gelb', 'rot')),
  gruende     text[] not null default '{}',
  dns         jsonb not null default '{}',
  blocklists  jsonb not null default '{}',
  bounces     jsonb not null default '{}',
  seeds       jsonb not null default '{}',
  luecke      jsonb not null default '{}'
);
create index if not exists deliverability_daily_at_idx on signalwerk.deliverability_daily (at desc);
alter table signalwerk.deliverability_daily enable row level security;
revoke all on signalwerk.deliverability_daily from anon, authenticated;
grant select, insert, update on signalwerk.deliverability_daily to service_role;
