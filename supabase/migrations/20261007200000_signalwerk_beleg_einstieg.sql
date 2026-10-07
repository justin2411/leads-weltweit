-- Beleg-Einstieg (Agenten-Auftrag c5da4536, Inhaber 05.10.2026: „entscheide du“): Variante B der Kaltmail nennt 2 echte,
-- über die Drei-Stufen-Freigabe freigegebene Premium-Anlässe aus dem Land des Käufers (nur Firmenname + Anlass + Datum).
-- Diese Leads sind danach für genau diesen Käufer reserviert und gehen nie an andere Käufer.
-- Nicht destruktiv: eine neue Tabelle, drei Funktionen. Nichts gelöscht, keine Löschrechte.
--   beleg_reservierungen   je Lead höchstens eine aktive Reservierung (reserviert | gesendet); 'frei' = zurückgegeben,
--                          weil die Mail nicht rausging (Zeile bleibt als Nachweis)
--   beleg_reservieren()    atomar: alle Leads 'new' -> 'reserved' oder keiner (Fehler 'beleg_vergeben')
--   beleg_gesendet()       Mail ist raus: Reservierung bleibt dauerhaft für diesen Käufer
--   beleg_freigeben()      Mail ging nicht raus: Leads zurück auf 'new' (nur unsere, nur solange 'reserved')

create table if not exists signalwerk.beleg_reservierungen (
  id           bigint generated always as identity primary key,
  lead_id      uuid not null references signalwerk.leads(id),
  prospect_id  uuid not null references signalwerk.prospects(id),
  message_id   uuid not null references signalwerk.messages(id),
  test_id      uuid references signalwerk.ab_tests(id),
  status       text not null default 'reserviert' check (status in ('reserviert', 'gesendet', 'frei')),
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  freed_at     timestamptz
);
-- nie an zwei Käufer: je Lead höchstens eine aktive Reservierung
create unique index if not exists beleg_reservierungen_aktiv on signalwerk.beleg_reservierungen (lead_id)
  where status in ('reserviert', 'gesendet');
create index if not exists beleg_reservierungen_message on signalwerk.beleg_reservierungen (message_id, status);
create index if not exists beleg_reservierungen_prospect on signalwerk.beleg_reservierungen (prospect_id);
alter table signalwerk.beleg_reservierungen enable row level security;
revoke all on signalwerk.beleg_reservierungen from anon, authenticated;
grant select, insert, update on signalwerk.beleg_reservierungen to service_role;

create or replace function signalwerk.beleg_reservieren(p_prospect uuid, p_message uuid, p_test uuid, p_lead_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path to 'signalwerk', 'public'
as $fn$
declare got uuid[];
begin
  if coalesce(array_length(p_lead_ids, 1), 0) = 0 then
    raise exception 'beleg_leer';
  end if;
  with u as (
    update signalwerk.leads l set status = 'reserved'
     where l.id = any(p_lead_ids) and l.status = 'new'
    returning l.id)
  select array_agg(id) into got from u;
  if coalesce(array_length(got, 1), 0) <> array_length(p_lead_ids, 1) then
    raise exception 'beleg_vergeben';  -- alles zurück (Transaktion), Mail bleibt unverändert
  end if;
  insert into signalwerk.beleg_reservierungen (lead_id, prospect_id, message_id, test_id)
  select x, p_prospect, p_message, p_test from unnest(got) x;
  return got;
end
$fn$;

create or replace function signalwerk.beleg_gesendet(p_message uuid)
returns integer
language sql
security definer
set search_path to 'signalwerk', 'public'
as $fn$
  with u as (
    update signalwerk.beleg_reservierungen set status = 'gesendet', sent_at = now()
     where message_id = p_message and status = 'reserviert'
    returning 1)
  select count(*)::int from u
$fn$;

-- p_message gesetzt: genau diese Mail ging nicht raus. Sonst: alle nicht gesendeten Reservierungen älter als p_stunden
-- (abgebrochener Lauf). Gesendete Reservierungen bleiben immer.
create or replace function signalwerk.beleg_freigeben(p_message uuid default null, p_stunden integer default 2)
returns integer
language plpgsql
security definer
set search_path to 'signalwerk', 'public'
as $fn$
declare ids uuid[];
begin
  with u as (
    update signalwerk.beleg_reservierungen set status = 'frei', freed_at = now()
     where status = 'reserviert'
       and ((p_message is not null and message_id = p_message)
         or (p_message is null and created_at < now() - make_interval(hours => greatest(p_stunden, 1))))
    returning lead_id)
  select array_agg(lead_id) into ids from u;
  if ids is null then
    return 0;
  end if;
  update signalwerk.leads set status = 'new' where id = any(ids) and status = 'reserved';
  return array_length(ids, 1);
end
$fn$;

revoke all on function signalwerk.beleg_reservieren(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function signalwerk.beleg_gesendet(uuid) from public, anon, authenticated;
revoke all on function signalwerk.beleg_freigeben(uuid, integer) from public, anon, authenticated;
grant execute on function signalwerk.beleg_reservieren(uuid, uuid, uuid, uuid[]) to service_role;
grant execute on function signalwerk.beleg_gesendet(uuid) to service_role;
grant execute on function signalwerk.beleg_freigeben(uuid, integer) to service_role;
