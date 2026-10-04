-- Selbstoptimierung des ganzen Systems (Inhaber 04.10.2026: „bekommen wir es hin das sich das system also gehirn etc
-- selbst optimiert“). scripts/selbstopt.py führt Stellschrauben nach gemessener Wirkung nach, bewertet jede Änderung
-- nach N Tagen und nimmt sie zurück, wenn sie nicht wirkt.
-- Nicht destruktiv: zwei neue Tabellen, eine lesende Funktion. Nichts gelöscht, keine Löschrechte.
--   selbstopt_state    aktueller Wert je Stellschraube (fehlt = Standard aus config/*)
--   selbstopt_changes  jede automatische Änderung mit Messgröße vorher/nachher, Bewertung und Rücknahme
--   selbstopt_kategorien()  ok-Quote je Käufer-Kategorie (Kunden-Werk) seit p_since

create table if not exists signalwerk.selbstopt_state (
  schraube   text primary key check (schraube ~ '^[a-z0-9_]{2,40}$'),
  wert       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists signalwerk.selbstopt_changes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  schraube     text not null check (schraube ~ '^[a-z0-9_]{2,40}$'),
  ziel         text not null default 'ALL' check (char_length(ziel) between 1 and 120),
  art          text not null default 'lockern' check (art in ('lockern', 'schutz', 'test')),
  vorher       jsonb not null default '{}'::jsonb,
  nachher      jsonb not null default '{}'::jsonb,
  messgroesse  text not null check (char_length(messgroesse) between 2 and 60),
  basis        numeric,
  basis_n      integer,
  bewerten_ab  timestamptz not null,
  status       text not null default 'offen' check (status in ('offen', 'wirkt', 'neutral', 'zurueck')),
  wert_nachher numeric,
  n_nachher    integer,
  bewertet_at  timestamptz,
  kurz_titel   text not null check (char_length(btrim(kurz_titel)) between 2 and 60),
  kurz_grund   text check (kurz_grund is null or char_length(kurz_grund) <= 160),
  decision_id  uuid
);
create index if not exists selbstopt_changes_recent on signalwerk.selbstopt_changes (created_at desc);
create index if not exists selbstopt_changes_open on signalwerk.selbstopt_changes (schraube, status) where status = 'offen';

-- ok-Quote je Käufer-Kategorie (prospects.specialization) seit p_since, nur Segment/Länder der Tests
create or replace function signalwerk.selbstopt_kategorien(p_since timestamptz, p_segment text, p_countries text[])
returns table (kategorie text, n bigint, ok bigint)
language sql stable set search_path = signalwerk, public set statement_timeout = '20s' as $$
  select p.specialization, count(*), count(*) filter (where p.check_status = 'ok')
    from signalwerk.prospects p
   where p.checked_at >= p_since and p.segment_id = p_segment and p.country = any(p_countries)
     and p.specialization is not null and p.check_status in ('ok', 'call_only', 'rejected')
   group by 1;
$$;
revoke all on function signalwerk.selbstopt_kategorien(timestamptz, text, text[]) from public, anon, authenticated;
grant execute on function signalwerk.selbstopt_kategorien(timestamptz, text, text[]) to service_role;

alter table signalwerk.selbstopt_state enable row level security;
alter table signalwerk.selbstopt_changes enable row level security;
revoke all on signalwerk.selbstopt_state, signalwerk.selbstopt_changes from anon, authenticated;
revoke delete, truncate on signalwerk.selbstopt_state, signalwerk.selbstopt_changes from service_role;
grant select, insert, update on signalwerk.selbstopt_state, signalwerk.selbstopt_changes to service_role;
