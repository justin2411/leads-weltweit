-- Strategie-Seite (/dashboard/strategie, Inhaber 05.10.2026: „strategie zusammenfassung … visualisierungen … auf sachen
-- aus der vergangenheit blicken … regelmäßig geupdatet“). Nicht destruktiv: zwei neue Tabellen, drei Funktionen.
-- Inhalte (Meilensteine, Rückblick, Zusammenfassung) stehen nur in der Datenbank, nie im öffentlichen Repo.
--   strategy_milestones   Plan nach vorne (Zieldatum, Status geplant/erreicht/verfehlt), Gehirn/scripts/strategie.py pflegen
--   strategy_rueckblick   erreichte Dinge als kurze Einträge (Titel ≤ 60, Grund ≤ 160), nie Lead-Inhalte
--   strategie_auto()      setzt messbare Meilensteine selbst auf „erreicht“ (erste Antwort, erste Probe aus Mail,
--                         Kunden 1/10/25/100) bzw. „verfehlt“ nach Zieldatum; erreicht schlägt verfehlt
--   strategie_refresh()   strategie_auto() + Zwischenspeicher dashboard_cache 'strategie' (Wachhund alle 15 min)

create table if not exists signalwerk.strategy_milestones (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_-]{1,59}$'),
  titel text not null check (char_length(btrim(titel)) between 2 and 60),
  grund text check (grund is null or char_length(grund) <= 160),
  ziel_datum date,
  status text not null default 'geplant' check (status in ('geplant', 'erreicht', 'verfehlt')),
  erreicht_am timestamptz,
  kennzahl text,
  sort integer not null default 100,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table signalwerk.strategy_milestones enable row level security;
revoke all on signalwerk.strategy_milestones from anon, authenticated;
revoke delete, truncate on signalwerk.strategy_milestones from service_role;
grant select, insert, update on signalwerk.strategy_milestones to service_role;

create table if not exists signalwerk.strategy_rueckblick (
  id bigserial primary key,
  tag date not null default (now() at time zone 'Europe/Berlin')::date,
  titel text not null check (char_length(btrim(titel)) between 2 and 60),
  grund text check (grund is null or char_length(grund) <= 160),
  art text not null default 'schritt' check (art in ('schritt', 'meilenstein', 'quelle', 'versand', 'premium', 'lehre')),
  zahl numeric,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists strategy_rueckblick_tag on signalwerk.strategy_rueckblick (tag desc);
alter table signalwerk.strategy_rueckblick enable row level security;
revoke all on signalwerk.strategy_rueckblick from anon, authenticated;
revoke delete, truncate on signalwerk.strategy_rueckblick from service_role;
grant select, insert, update on signalwerk.strategy_rueckblick to service_role;
grant usage, select on sequence signalwerk.strategy_rueckblick_id_seq to service_role;

-- Messbare Meilensteine (kennzahl): antwort | probe_mail | kunden:<n>. Zeitpunkt = erstes Ereignis bzw. n-tes Abo.
create or replace function signalwerk.strategie_auto()
returns integer
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '20s' as $$
declare r record; t timestamptz; n integer := 0; heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  for r in select key, kennzahl from signalwerk.strategy_milestones where status <> 'erreicht' and kennzahl is not null loop
    t := null;
    if r.kennzahl = 'antwort' then
      -- echte menschliche Antwort: keine Abwesenheitsnotiz, keine Abmeldung, kein Rückläufer
      select min(received_at) into t from signalwerk.inbound_replies where intent in ('buy', 'sample', 'question', 'other');
    elsif r.kennzahl = 'probe_mail' then
      -- Probe-Anfrage nach einer Kaltmail: gemeldetes Ereignis oder Anfrage von einer angeschriebenen Adresse/Firmendomain
      select min(x) into t from (
        select min(occurred_at) x from signalwerk.email_events where type = 'sample_requested'
        union all
        select min(s.created_at) from signalwerk.sample_requests s
         where not coalesce(s.is_test, false) and exists (
           select 1 from signalwerk.messages m where m.status = 'sent' and m.sent_at < s.created_at
              and (lower(m.to_email) = lower(s.email)
                   or (split_part(lower(m.to_email), '@', 2) = split_part(lower(s.email), '@', 2)
                       and split_part(lower(s.email), '@', 2) not in ('gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com',
                         'yahoo.com', 'icloud.com', 'aol.com', 'live.com', 'gmx.de', 'web.de', 'orange.fr', 'free.fr', 'laposte.net',
                         'hotmail.fr', 'yahoo.fr', 'hotmail.co.uk', 'yahoo.co.uk', 'btinternet.com', 'proton.me', 'protonmail.com'))))
      ) q;
    elsif r.kennzahl ~ '^kunden:[0-9]+$' then
      -- n-tes echtes Abo (ohne Testkäufe, wie firma_lage)
      select a.created_at into t from (
        select s.created_at from signalwerk.subscriptions s join signalwerk.customers c on c.id = s.customer_id
         where s.status in ('active', 'past_due') and c.status <> 'cancelled'
           and not (c.status = 'trial' and (c.stripe_customer_id is not null or coalesce(c.notes, '') like '%Stripe-Testmodus%'))
         order by s.created_at offset greatest(split_part(r.kennzahl, ':', 2)::int - 1, 0) limit 1) a;
    end if;
    if t is not null then
      update signalwerk.strategy_milestones set status = 'erreicht', erreicht_am = t, updated_at = now(), updated_by = 'auto'
       where key = r.key;
      n := n + 1;
    end if;
  end loop;
  update signalwerk.strategy_milestones set status = 'verfehlt', updated_at = now(), updated_by = 'auto'
   where status = 'geplant' and ziel_datum is not null and ziel_datum < heute;
  return n;
end $$;
revoke all on function signalwerk.strategie_auto() from public, anon, authenticated;
grant execute on function signalwerk.strategie_auto() to service_role;

-- Nur Zahlen und Titel: Kontrollpostfächer (7 T), Versand 30 T, Meilensteine, Rückblick (90 T), Zähler.
create or replace function signalwerk.strategie_daten()
returns jsonb
language sql stable security definer set search_path = signalwerk, public
set statement_timeout = '20s' as $$
  with seeds as (
    select coalesce(placement, 'offen') p, count(*) n from signalwerk.seed_checks where at > now() - interval '7 days' group by 1
  ), dec as (
    select (created_at at time zone 'Europe/Berlin')::date tag, coalesce(kurz_titel, left(subject, 60)) titel, kurz_grund grund, type,
           row_number() over (partition by (created_at at time zone 'Europe/Berlin')::date order by created_at desc) rn
      from signalwerk.decisions
     where created_at > now() - interval '90 days'
       and type in ('note', 'page_new', 'page_variant', 'safety')
       and coalesce(kurz_titel, subject) !~* '(probe-anfrage|kunde|engpass: kaltmail|sitzung|tagesnotiz|überschrift gekürzt)'
       and coalesce(kurz_titel, subject) ~* '(gestartet|live|jetzt|freigegeben|behoben|neue|neu |umgesetzt|bekommt|angelegt|an$|holen|zuerst|vorbereitet|gesetzt)'
  ), rb as (
    select tag, titel, grund, art, zahl from signalwerk.strategy_rueckblick where tag > (now() at time zone 'Europe/Berlin')::date - 90
    union all
    select (erreicht_am at time zone 'Europe/Berlin')::date, titel, grund, 'meilenstein', null
      from signalwerk.strategy_milestones where status = 'erreicht' and erreicht_am is not null
    union all
    select (created_at at time zone 'Europe/Berlin')::date, left(titel, 60), null, 'lehre', null
      from signalwerk.brain_knowledge where typ = 'gelernt' and status = 'aktiv' and created_at > now() - interval '90 days'
    union all
    select tag, titel, grund, case when type = 'safety' then 'versand' else 'schritt' end, null from dec where rn <= 5
  )
  select jsonb_build_object(
    'at', now(),
    'seeds', (select coalesce(jsonb_object_agg(p, n), '{}'::jsonb) from seeds),
    'sent_total', (select count(*) from signalwerk.messages where status = 'sent'),
    'sent_erst', (select min(sent_at) from signalwerk.messages where status = 'sent'),
    'sent_24h', (select count(*) from signalwerk.messages where status = 'sent' and sent_at > now() - interval '24 hours'),
    'p30', jsonb_build_object(
      'sent', (select count(*) from signalwerk.messages where status = 'sent' and sent_at > now() - interval '30 days'),
      'bounced', (select count(*) from signalwerk.email_events where type = 'bounced' and created_at > now() - interval '30 days'),
      'complained', (select count(*) from signalwerk.email_events where type = 'complained' and created_at > now() - interval '30 days'),
      'antworten', (select count(*) from signalwerk.inbound_replies
                     where received_at > now() - interval '30 days' and intent in ('buy', 'sample', 'question', 'other')),
      'proben', (select count(*) from signalwerk.sample_requests where created_at > now() - interval '30 days' and not coalesce(is_test, false))
              + (select count(*) from signalwerk.email_events where type = 'sample_requested' and occurred_at > now() - interval '30 days')),
    'meilensteine', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'titel', titel, 'grund', grund, 'ziel_datum', ziel_datum,
        'status', status, 'erreicht_am', erreicht_am, 'kennzahl', kennzahl, 'updated_by', updated_by) order by sort, ziel_datum nulls last), '[]'::jsonb)
        from signalwerk.strategy_milestones),
    'rueckblick', (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'titel', titel, 'grund', grund, 'art', art, 'zahl', zahl)
        order by tag desc, art), '[]'::jsonb) from (select * from rb order by tag desc limit 160) x),
    'zaehler', jsonb_build_object(
      'lehren', (select count(*) from signalwerk.brain_knowledge where typ = 'gelernt' and status = 'aktiv'),
      'entscheidungen', (select count(*) from signalwerk.decisions),
      'tage', (select count(distinct (created_at at time zone 'Europe/Berlin')::date) from signalwerk.decisions))
  );
$$;
revoke all on function signalwerk.strategie_daten() from public, anon, authenticated;
grant execute on function signalwerk.strategie_daten() to service_role;

create or replace function signalwerk.strategie_refresh()
returns jsonb
language plpgsql volatile security definer set search_path = signalwerk, public
set statement_timeout = '40s' as $$
declare v jsonb;
begin
  perform signalwerk.strategie_auto();
  v := signalwerk.strategie_daten();
  insert into signalwerk.dashboard_cache (name, value, updated_at) values ('strategie', v, now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return v;
end $$;
revoke all on function signalwerk.strategie_refresh() from public, anon, authenticated;
grant execute on function signalwerk.strategie_refresh() to service_role;

-- Abteilung der neuen Seite (wie 20261005130100_signalwerk_buero_bereiche.sql)
insert into signalwerk.dashboard_bereiche (seite, department) values
  ('strategie', 'strategie')
on conflict (seite) do nothing;
