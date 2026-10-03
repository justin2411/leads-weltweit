-- JARVIS schneller (Nachtschicht 04.10.2026): dashboard_activity las für „zuletzt geprüft“ und „mail-fähig in 60 min“
-- alle 525.000 Käufer (2 × ~0,2 s bei jedem Aufruf, alle 20 s). Index auf checked_at: beides in ~1 ms.
-- Nur ein zusätzlicher Index, nichts wird geändert oder gelöscht.
create index if not exists prospects_checked_at_idx on signalwerk.prospects (checked_at);
