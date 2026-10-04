-- JARVIS-Empfehlungen ausblenden (Inhaber 04.10.2026: „ich möchte hier was jarvis empfiehlt auch sachen löschen können
-- sehr einfach“): neuer Einstellungs-Schlüssel dismissed_tips (jsonb {schlüssel: bis-Zeitpunkt}, app/lib/tips.ts).
-- Liste nur um dismissed_tips erweitert, alle bestehenden Schlüssel bleiben – nicht destruktiv.
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days',
  'sample_targets', 'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot',
  'dismissed_tips'));
