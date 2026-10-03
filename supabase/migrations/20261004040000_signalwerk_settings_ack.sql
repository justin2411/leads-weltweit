-- „Angewandt“-Quittung (Inhaber 03.10.2026: „immer mit einem button, dass die änderungen auch übernommen werden“).
-- Jedes Werk schreibt hier, wann es eine Einstellung aus owner_settings zuletzt gelesen und angewandt hat
-- (scripts/lib/owner_settings.py ack). Das Dashboard vergleicht seen_at mit owner_settings.updated_at und zeigt
-- „angewandt ✓ HH:MM“. Eine Zeile je (Werk, Schlüssel), wird überschrieben. Nicht destruktiv: neue Tabelle.
create table if not exists signalwerk.settings_ack (
  werk     text not null,                       -- z. B. lead-werk, kunden-werk, proben-vorrat, versand, nachfass
  key      text not null,                       -- Schlüssel aus owner_settings, z. B. slot_plan, sample_targets
  seen_at  timestamptz not null default now(),
  value    jsonb,                               -- der Wert, den das Werk gelesen hat
  run_id   text,                                -- GITHUB_RUN_ID des Laufs (leer bei lokalen Läufen)
  primary key (werk, key)
);
alter table signalwerk.settings_ack enable row level security;
revoke all on signalwerk.settings_ack from anon, authenticated;
grant select, insert, update on signalwerk.settings_ack to service_role;
