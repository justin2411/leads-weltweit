-- Gehirn lernt aus eigenen Entscheidungen (Inhaber 04.10.2026: „Gehirn bestmöglich aufbauen, damit es wie Claude
-- Sachen optimiert und immer schlauer wird; Umsatz vergrößern“). Nicht destruktiv: neue Spalten mit Standardwerten,
-- zwei neue Tabellen. Nichts gelöscht, keine Löschrechte.
--   decisions.erwartung        {kennzahl, richtung, zielwert?, land, segment, thema?, lehre?, basis?} (optional)
--   decisions.pruefen_am       wann die Lernschleife nachmisst (scripts/brain_learn.py pruefen)
--   decisions.ergebnis         bestaetigt | widerlegt | unklar, dazu messwert/gemessen_at/ergebnis_notiz
--   brain_knowledge.vertrauen  0–1; belege (Entscheidungs-IDs), zuletzt_bestaetigt, status aktiv|archiviert,
--                              thema + richtung (wirkt | wirkt_nicht) für die Widerspruchssuche
--   brain_rueckschau           eine Zeile je Woche (Montag): 3 Lehren, archivierte Einträge, Widersprüche
--   brain_evals                Prüffälle des Gehirns (scripts/brain_eval.py): Punkte je Lauf

alter table signalwerk.decisions add column if not exists erwartung jsonb;
alter table signalwerk.decisions add column if not exists pruefen_am timestamptz;
alter table signalwerk.decisions add column if not exists ergebnis text;
alter table signalwerk.decisions add column if not exists messwert numeric;
alter table signalwerk.decisions add column if not exists gemessen_at timestamptz;
alter table signalwerk.decisions add column if not exists ergebnis_notiz text;
alter table signalwerk.decisions drop constraint if exists decisions_ergebnis_check;
alter table signalwerk.decisions add constraint decisions_ergebnis_check
  check (ergebnis is null or ergebnis in ('bestaetigt', 'widerlegt', 'unklar'));
alter table signalwerk.decisions drop constraint if exists decisions_ergebnis_notiz_check;
alter table signalwerk.decisions add constraint decisions_ergebnis_notiz_check
  check (ergebnis_notiz is null or char_length(ergebnis_notiz) <= 300);
create index if not exists decisions_lernschleife on signalwerk.decisions (pruefen_am)
  where erwartung is not null and ergebnis is null;
comment on column signalwerk.decisions.erwartung is
  'Erwartung der Entscheidung: {kennzahl, richtung steigt|faellt|mindestens|hoechstens, zielwert, land, segment, thema, lehre, basis} (scripts/brain_learn.py)';

alter table signalwerk.brain_knowledge add column if not exists vertrauen numeric not null default 0.5;
alter table signalwerk.brain_knowledge add column if not exists belege jsonb not null default '[]'::jsonb;
alter table signalwerk.brain_knowledge add column if not exists zuletzt_bestaetigt timestamptz;
alter table signalwerk.brain_knowledge add column if not exists status text not null default 'aktiv';
alter table signalwerk.brain_knowledge add column if not exists thema text;
alter table signalwerk.brain_knowledge add column if not exists richtung text;
alter table signalwerk.brain_knowledge drop constraint if exists brain_knowledge_vertrauen_check;
alter table signalwerk.brain_knowledge add constraint brain_knowledge_vertrauen_check check (vertrauen between 0 and 1);
alter table signalwerk.brain_knowledge drop constraint if exists brain_knowledge_status_check;
alter table signalwerk.brain_knowledge add constraint brain_knowledge_status_check check (status in ('aktiv', 'archiviert'));
alter table signalwerk.brain_knowledge drop constraint if exists brain_knowledge_richtung_check;
alter table signalwerk.brain_knowledge add constraint brain_knowledge_richtung_check
  check (richtung is null or richtung in ('wirkt', 'wirkt_nicht'));
create index if not exists brain_knowledge_thema on signalwerk.brain_knowledge (thema) where thema is not null;

create table if not exists signalwerk.brain_rueckschau (
  woche        date primary key,                 -- Montag (deutscher Kalender) der Woche, für die zurückgeschaut wird
  at           timestamptz not null default now(),
  lehren       jsonb not null default '[]'::jsonb,   -- höchstens 3: {titel, grund, slug, vertrauen}
  archiviert   jsonb not null default '[]'::jsonb,   -- slugs, die auf status archiviert gesetzt wurden
  widersprueche jsonb not null default '[]'::jsonb,  -- {thema, wirkt: [slugs], wirkt_nicht: [slugs]}
  entscheidungen jsonb not null default '{}'::jsonb, -- {bestaetigt, widerlegt, unklar, offen}
  decision_id  bigint
);

create table if not exists signalwerk.brain_evals (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quelle     text not null default 'sitzung' check (char_length(btrim(quelle)) between 2 and 60),
  anlass     text check (anlass is null or char_length(anlass) <= 160),
  faelle     integer not null check (faelle >= 0),
  richtig    integer not null check (richtig >= 0),
  verboten   integer not null default 0 check (verboten >= 0),
  score      numeric not null check (score between 0 and 100),
  details    jsonb not null default '[]'::jsonb
);
create index if not exists brain_evals_recent on signalwerk.brain_evals (created_at desc);

alter table signalwerk.brain_rueckschau enable row level security;
alter table signalwerk.brain_evals enable row level security;
revoke all on signalwerk.brain_rueckschau, signalwerk.brain_evals from anon, authenticated;
revoke delete, truncate on signalwerk.brain_rueckschau, signalwerk.brain_evals from service_role;
grant select, insert, update on signalwerk.brain_rueckschau, signalwerk.brain_evals to service_role;
