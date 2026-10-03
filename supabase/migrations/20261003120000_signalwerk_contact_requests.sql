-- Kontaktseite (Inhaber 03.10.2026: „kontaktseite … wo sich interessenten auch direkt melden können mit
-- kontaktformular und welche leads sie brauchen“). Nur neue Tabelle, nichts wird geändert oder gelöscht.
create table if not exists signalwerk.contact_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  company_name  text not null,
  email         text not null,
  phone         text,
  country       text,                -- Markt, für den Leads gebraucht werden (UK, US, FR, other)
  industry      text,                -- was der Interessent verkauft (z. B. web-agencies)
  wishes        text[] not null default '{}',  -- gewünschte Signale
  message       text,
  lang          text,
  consent_text  text not null,
  consent_at    timestamptz not null,
  status        text not null default 'new' check (status in ('new','answered','rejected')),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists contact_requests_created_idx on signalwerk.contact_requests (created_at desc);
create index if not exists contact_requests_email_idx on signalwerk.contact_requests (lower(email));

-- Row Level Security an, keine Policies => nur service_role (Vercel-App serverseitig)
alter table signalwerk.contact_requests enable row level security;
grant select, insert, update on signalwerk.contact_requests to service_role;
