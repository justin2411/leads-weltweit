-- Speicher-Bremse Stufe „stopp“ (Prüfung 04.10.2026): ab 7,5 GB bekommt das Lead-Werk 0 Plätze (scripts/werk_plan.py),
-- bis der Inhaber über das Aufräumen entscheidet. Die Prüfregel der Spalte wird nur um den neuen Wert erweitert;
-- keine Zeile wird geändert oder gelöscht. Ohne diese Erweiterung würde das Protokoll die Stufe ablehnen.
alter table signalwerk.werk_plan_log drop constraint if exists werk_plan_log_bremse_check;
alter table signalwerk.werk_plan_log add constraint werk_plan_log_bremse_check
  check (bremse in ('aus', 'hinweis', 'drossel', 'ohne-rohbestand', 'stopp'));
