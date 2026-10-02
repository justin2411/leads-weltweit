-- Kunden-Werk lädt bekannte Käufer-Domains inkrementell nach created_at (02.10.2026, nicht destruktiv).
-- Bereits angewendet mit CREATE INDEX CONCURRENTLY; hier zur Nachvollziehbarkeit.
create index if not exists prospects_created_at_idx on signalwerk.prospects (created_at);
