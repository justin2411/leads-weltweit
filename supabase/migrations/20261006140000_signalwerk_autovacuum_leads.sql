-- KPI-Tagesabschluss 05.10.2026 scheiterte an „statement timeout“ (57014, Grenze der Schnittstelle 8 s): signalwerk.leads
-- hatte ~100.000 tote Zeilen, die Sichtbarkeitskarte war veraltet (379.000 Heap-Zugriffe statt Index-only, 13 s statt
-- 0,3 s). Ein manuelles VACUUM behob es. Damit es nicht wiederkommt: Autovacuum für die stark geänderten Tabellen früher
-- auslösen (2 % statt 20 % geänderter Zeilen). Nur Speicher-Einstellungen, nichts gelöscht, keine Daten geändert.
alter table signalwerk.leads set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table signalwerk.lead_checks set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table signalwerk.prospects set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
