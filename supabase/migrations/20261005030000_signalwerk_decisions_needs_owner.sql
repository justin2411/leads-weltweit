-- „Braucht dich“ auf JARVIS (nicht destruktiv): Entscheidungen, die nur der Inhaber erledigen kann.
-- JARVIS, Gehirn und Agenten setzen needs_owner = true bei status 'proposed'; die Karte zeigt sie, bis der
-- Inhaber „Erledigt“ klickt (status → done). Bestehende Zeilen bleiben unverändert (Standard false).
alter table signalwerk.decisions add column if not exists needs_owner boolean not null default false;
create index if not exists decisions_needs_owner_idx on signalwerk.decisions (created_at desc)
  where needs_owner and status = 'proposed';
-- Signatur-Entscheidung des Inhabers (metrics.braucht_dich = 'signatur') schnell finden
create index if not exists decisions_braucht_dich_idx on signalwerk.decisions ((metrics->>'braucht_dich'))
  where metrics ? 'braucht_dich';
comment on column signalwerk.decisions.needs_owner is 'Nur der Inhaber kann es erledigen – Karte „Braucht dich“ auf /dashboard/jarvis';
