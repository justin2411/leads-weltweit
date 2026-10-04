-- Eigene Zeit für Agenten-Auslöser (Inhaber 04.10.2026: „auslöser will ich hier auch eine eigen zeit festlegen“).
-- Nicht destruktiv: neue, optionale Spalten; der Auslöser-Check wird nur um 'alle_stunden' erweitert.
--   at_minute    Minute im 15-Minuten-Raster (deutsche Zeit, zusammen mit at_hour bei 'taeglich'; null = :00)
--   weekdays     Wochentage ISO 1 = Mo … 7 = So (null = alle)
--   every_hours  'alle_stunden': 1, 2, 3, 4, 6, 8 oder 12 (Termine ab 00:00 deutscher Zeit)
-- Bestehende Agenten bleiben gültig ('stuendlich' = alle 1 Stunde, at_hour ohne Minute = HH:00).
alter table signalwerk.custom_agents add column if not exists at_minute smallint;
alter table signalwerk.custom_agents add column if not exists weekdays smallint[];
alter table signalwerk.custom_agents add column if not exists every_hours smallint;

alter table signalwerk.custom_agents drop constraint if exists custom_agents_at_minute_check;
alter table signalwerk.custom_agents add constraint custom_agents_at_minute_check
  check (at_minute is null or at_minute in (0, 15, 30, 45));
alter table signalwerk.custom_agents drop constraint if exists custom_agents_weekdays_check;
alter table signalwerk.custom_agents add constraint custom_agents_weekdays_check
  check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]));
alter table signalwerk.custom_agents drop constraint if exists custom_agents_every_hours_check;
alter table signalwerk.custom_agents add constraint custom_agents_every_hours_check
  check (every_hours is null or every_hours in (1, 2, 3, 4, 6, 8, 12));
-- Auslöser-Check erweitern (alle bisherigen Werte bleiben erlaubt)
alter table signalwerk.custom_agents drop constraint if exists custom_agents_trigger_check;
alter table signalwerk.custom_agents add constraint custom_agents_trigger_check
  check (trigger in ('stuendlich', 'taeglich', 'neue_leads', 'alle_stunden'));
