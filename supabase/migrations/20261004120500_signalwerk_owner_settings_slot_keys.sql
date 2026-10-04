-- Fix (Inhaber 04.10.2026, Screenshot Regler: „violates check constraint owner_settings_key_check“): Belegungsplan
-- (slot_plan) und Autopilot (slot_autopilot) liest/schreibt die App seit 03.10., die Schlüsselliste kannte sie aber
-- nicht – Speichern im Regler schlug fehl. Liste nur erweitert, nicht destruktiv.
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days',
  'sample_targets', 'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot'));
