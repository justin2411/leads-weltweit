-- Direktstart (Inhaber 03.10.2026: „ich will Werke direkt starten statt erst beim nächsten Zeitplan“). Das Dashboard
-- legt hier Startwünsche ab; ist GH_DISPATCH_TOKEN in Vercel gesetzt, startet es sofort (Status 'gestartet'), sonst
-- nimmt der Wachhund (alle 15 min, scripts/wachhund.py) offene Wünsche mit seinem GITHUB_TOKEN auf. Nur erlaubte
-- Abläufe (kein Versand), Pausen des Inhabers gelten immer. Nicht destruktiv: neue Tabelle.
create table if not exists signalwerk.start_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  workflow    text not null check (workflow in ('lead-werk', 'kunden-werk', 'proben-vorrat', 'freigabe-stichprobe')),
  inputs      jsonb not null default '{}',
  status      text not null default 'offen' check (status in ('offen', 'gestartet', 'fehler', 'verworfen')),
  started_at  timestamptz,
  note        text,
  created_by  text
);
create index if not exists start_requests_open on signalwerk.start_requests (status, created_at);
alter table signalwerk.start_requests enable row level security;
revoke all on signalwerk.start_requests from anon, authenticated;
grant select, insert, update on signalwerk.start_requests to service_role;
