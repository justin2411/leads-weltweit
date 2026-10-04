-- Sofort-Antworten über die Claude-API (Inhaber 04.10.2026: „alle chats sollen direkt antworten“; Monatsgrenze „vorerst
-- 30 € – im Dashboard änderbar“): neuer Einstellungs-Schlüssel llm_budget_eur (Zahl in Euro, Standard 30 in
-- app/lib/owner-settings.ts). Liste nur um llm_budget_eur erweitert, alle bestehenden Schlüssel bleiben – nicht destruktiv.
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days',
  'sample_targets', 'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot',
  'dismissed_tips', 'llm_budget_eur'));
