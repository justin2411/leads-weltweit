-- Mischung im Lead-Werk (Inhaber 05.10.2026: „möchte auch beim lead werk einstellen wv normale leads und premium leads
-- gemacht werden“; Standard „nur Premium“): owner_settings.lead_mix = {"premium_pct": 100} – Premium-Anteil 0–100 %
-- (Regler, Karte Lead-Werk; gelesen von scripts/extraktor/run.py und scripts/werk_plan.py). Schlüsselliste = Stand DB
-- 05.10.2026 (inkl. sample_premium_targets, seed_inboxes) + lead_mix – nicht destruktiv (keine Zeile geändert oder gelöscht).
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days', 'sample_targets',
  'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot',
  'dismissed_tips', 'llm_budget_eur', 'website_flow', 'website_autofix', 'website_ignored', 'lane_reset',
  'sample_premium_targets', 'seed_inboxes', 'lead_mix'));
