-- Wenig Text überall (Inhaber 04.10.2026: „ich will einen klaren titel und dann eine kurze knappe und saubere
-- begründung haben, damit ich es direkt einordnen kann“). Kurzfassung je Entscheidung: Titel ≤ 60 Zeichen,
-- Grund 1 Satz ≤ 160 Zeichen; subject/reasoning bleiben als Details auf Klick. Zwei neue, leere Spalten:
-- nicht destruktiv. Bis die Migration angewendet ist, schreiben Skripte und App ohne die Spalten
-- (scripts/lib/kurz.py insert_decisions, app/lib/kurz-schreiben.ts insertDecision: Rückfall bei PGRST204).
alter table signalwerk.decisions add column if not exists kurz_titel text
  check (char_length(kurz_titel) <= 60);
alter table signalwerk.decisions add column if not exists kurz_grund text
  check (char_length(kurz_grund) <= 160);
comment on column signalwerk.decisions.kurz_titel is 'Klarer Titel, worum es geht (≤ 60 Zeichen)';
comment on column signalwerk.decisions.kurz_grund is 'Kurze Begründung in einem Satz (≤ 160 Zeichen)';
