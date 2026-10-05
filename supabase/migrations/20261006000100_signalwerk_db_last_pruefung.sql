-- Datenbank-Last 05.10.2026, Teil 2 (nicht destruktiv): Dauerprüfung/Freigabe holt ungeprüfte Leads je Land
-- (status = 'new', zuletzt_geprueft is null, nach id). Ohne passenden Index las sie den Primärschlüssel oder alle
-- Leads eines Landes (bis 0,9 s, unter Last ~130 Timeouts seit 07:00 UTC). Live mit CREATE INDEX CONCURRENTLY angelegt.
create index if not exists leads_ungeprueft on signalwerk.leads (segment_id, country, id)
  where status = 'new' and zuletzt_geprueft is null;
