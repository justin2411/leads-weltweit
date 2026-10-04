-- Betreff-A/B-Test der Kaltmails (Auftrag 04.10.2026, JARVIS: „Kaltmails individueller + Betreff-A/B“).
-- Jede Kaltmail bekommt fest je Käufer Betreff A oder B (scripts/drafts.py subject_variant), damit Antworten je
-- Variante gemessen werden können. Nur eine neue, leere Spalte: nicht destruktiv. Bis die Migration angewendet ist,
-- schreiben die Skripte die Variante nicht mit (drafts.has_variant_column); sie bleibt dann über den Betreff ablesbar.
alter table signalwerk.messages add column if not exists subject_variant text
  check (subject_variant in ('A', 'B'));
comment on column signalwerk.messages.subject_variant is
  'Betreff-Variante A/B der Kaltmail (fest je Käufer, drafts.subject_variant); Nachfassmails übernehmen sie';
create index if not exists messages_experiment_subject_variant_idx
  on signalwerk.messages (experiment_id, subject_variant) where subject_variant is not null;
