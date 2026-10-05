-- Premium-Proben im Vorrat (Inhaber 05.10.2026: „bei proben vorrat möchte ich auch premium leads proben vorrat nehmen
-- können“): owner_settings.sample_premium_targets = {"S2/US": 10} – davon so viele Proben je Seite mit 10/10
-- Premium-Leads (scripts/sample_stock.py, Regler). Schlüsselliste = Stand DB 05.10.2026 + sample_premium_targets –
-- nicht destruktiv (keine Zeile geändert oder gelöscht). claim_sample_stock gibt Premium-Proben schon zuerst heraus
-- (order by premium_n desc, Migration 20261005090500).
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days', 'sample_targets',
  'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot',
  'dismissed_tips', 'llm_budget_eur', 'website_flow', 'website_autofix', 'website_ignored', 'lane_reset',
  'sample_premium_targets'));
