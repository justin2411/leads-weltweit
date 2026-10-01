-- Proben und Lieferungen liefen nach dem Start der Werke (90.000+ Leads) in den Statement-Timeout (Test 01.10.2026:
-- Probe S4/US nach 179 s abgebrochen). Nur neue Indizes, nichts wird verändert oder gelöscht.
create index if not exists leads_seg_country_status_date_idx
  on signalwerk.leads (segment_id, country, status, event_date desc, id);
create index if not exists leads_created_at_idx on signalwerk.leads (created_at);
create index if not exists observations_kind_key_company_idx on signalwerk.observations (kind, key, company_id);
