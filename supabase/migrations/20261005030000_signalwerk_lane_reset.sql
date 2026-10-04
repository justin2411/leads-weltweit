-- Linien zurücksetzen (Inhaber 04.10.2026: „Wenn wir genug us leads haben dann schau das wir noch uk und fr holen“):
-- owner_settings.lane_reset = {Linie: Zeitpunkt}; scripts/werk_plan.py zählt Läufe davor nicht mehr (z. B. web-uk/web-fr
-- nach neuer Quelle). Schlüsselliste = Stand DB 04.10.2026 + lane_reset – nicht destruktiv.
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days', 'sample_targets',
  'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot',
  'dismissed_tips', 'llm_budget_eur', 'website_flow', 'website_autofix', 'website_ignored', 'lane_reset'));
