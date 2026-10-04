-- Seiten-Flow im Themenfeld „Website“ (Inhaber 04.10.2026: „flows … wo ich die branche auswählen kann … seiten selber
-- einfügen und ersetzen können und verschieben und vertauschen (nur für meine anzeige …)“): neuer Einstellungs-Schlüssel
-- website_flow (jsonb {Branche: {nodes: [...]}}, app/lib/website-flow.ts). Speichert nur die Anzeige-Anordnung.
-- Liste nur um website_flow erweitert, alle bestehenden Schlüssel bleiben (auch llm_budget_eur sowie website_autofix und
-- website_ignored aus parallelen Website-Änderungen, damit keine Reihenfolge einen Schlüssel verliert) – nicht destruktiv.
alter table signalwerk.owner_settings drop constraint if exists owner_settings_key_check;
alter table signalwerk.owner_settings add constraint owner_settings_key_check check (key in (
  'send_paused', 'send_countries_off', 'send_country_limits', 'followup_enabled', 'followup_days',
  'sample_targets', 'sample_max_age_hours', 'buyer_countries_off', 'werke_paused', 'slot_plan', 'slot_autopilot',
  'dismissed_tips', 'llm_budget_eur', 'website_flow', 'website_autofix', 'website_ignored'));
