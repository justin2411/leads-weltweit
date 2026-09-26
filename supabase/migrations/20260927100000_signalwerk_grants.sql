-- Zugriffsrechte für die mit 20260927090000 (und 20260926180000) neu angelegten Tabellen – vorher fehlten sie
-- (Gehirn-Lauf und Dashboard bekamen "permission denied"). Nur für service_role (Server), RLS bleibt aktiv.
grant select, insert, update on all tables in schema signalwerk to service_role;
grant usage, select on all sequences in schema signalwerk to service_role;
grant execute on all functions in schema signalwerk to service_role;
-- künftige Tabellen im Schema bekommen dieselben Rechte automatisch
alter default privileges in schema signalwerk grant select, insert, update on tables to service_role;
alter default privileges in schema signalwerk grant usage, select on sequences to service_role;
alter default privileges in schema signalwerk grant execute on functions to service_role;
