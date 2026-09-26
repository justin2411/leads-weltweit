-- Nachfassmails: eine Firma bekommt pro Experiment eine Erstmail und höchstens eine Nachfassmail.
alter table signalwerk.messages add column if not exists kind text not null default 'initial';
alter table signalwerk.messages drop constraint if exists messages_kind_check;
alter table signalwerk.messages add constraint messages_kind_check check (kind in ('initial','followup','sample_followup'));
alter table signalwerk.messages add column if not exists parent_id uuid references signalwerk.messages(id);
alter table signalwerk.messages drop constraint if exists messages_prospect_id_experiment_id_key;
create unique index if not exists messages_prospect_experiment_kind_uq on signalwerk.messages (prospect_id, experiment_id, kind);
-- Website-Befund für Neugründungen (nur Firmendaten)
alter table signalwerk.watch_companies add column if not exists website_checked_at timestamptz;
