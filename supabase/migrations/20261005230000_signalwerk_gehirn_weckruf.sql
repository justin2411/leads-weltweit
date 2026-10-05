-- Gehirn-Weckruf (Inhaber 05.10.2026: „ja bitte“): Warteschlange wichtiger Ereignisse (antwort, probe, checkout,
-- kunde, notbremse), die die JARVIS-Runden lesen und das Gehirn sofort wecken. Nicht destruktiv.
create table if not exists signalwerk.gehirn_weckruf (
  id bigserial primary key,
  kind text not null check (kind in ('antwort','probe','checkout','kunde','notbremse')),
  ref text not null,
  kurz text not null check (char_length(kurz) <= 120),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  unique (kind, ref)
);
create index if not exists gehirn_weckruf_offen on signalwerk.gehirn_weckruf (created_at) where handled_at is null;
alter table signalwerk.gehirn_weckruf enable row level security;
grant select, insert, update on signalwerk.gehirn_weckruf to service_role;
grant usage, select on sequence signalwerk.gehirn_weckruf_id_seq to service_role;
