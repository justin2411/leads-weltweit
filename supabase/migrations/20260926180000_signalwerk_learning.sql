-- Selbstlernender Betrieb (Entscheidung Inhaber 26.09.2026): Versandgewichte je Experiment,
-- Lernprotokoll für den Morgenbericht und neue Zielgruppen aus config/zielgruppen.yaml.

alter table signalwerk.experiments add column if not exists weight numeric not null default 1;

create table if not exists signalwerk.learning_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('decision','launch','weights','idea','note')),
  segment_id text references signalwerk.segments(id),
  experiment_id uuid references signalwerk.experiments(id),
  text       text not null
);
alter table signalwerk.learning_log enable row level security;

insert into signalwerk.segments (id, name, description, signals, email_countries, status, notes) values
  ('S10', 'Werbetechnik und Druckereien', 'Schilder, Visitenkarten, Drucksachen für neue Firmen',
   array['new_incorporation'], array['UK','US'], 'idea', 'Katalog config/zielgruppen.yaml'),
  ('S11', 'Wirtschaftskanzleien', 'Gesellschaftsrecht und Verträge für Neugründungen',
   array['new_incorporation'], array['UK','US'], 'idea', 'Katalog config/zielgruppen.yaml'),
  ('S12', 'Marketingagenturen', 'Kundengewinnung für junge Firmen',
   array['new_incorporation'], array['UK','US'], 'idea', 'Katalog config/zielgruppen.yaml')
on conflict (id) do nothing;
