-- Kontrolladressen des Inhabers für den Posteingangstest (Inhaber 05.10.2026: „mach es selber“).
-- Ergänzt nur den erlaubten Schlüssel 'seed_inboxes' in owner_settings (nicht destruktiv).
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key = any (array[
  'send_paused','send_countries_off','send_country_limits','followup_enabled','followup_days','sample_targets',
  'sample_max_age_hours','buyer_countries_off','werke_paused','slot_plan','slot_autopilot','dismissed_tips',
  'llm_budget_eur','website_flow','website_autofix','website_ignored','lane_reset','sample_premium_targets',
  'seed_inboxes']::text[]));
