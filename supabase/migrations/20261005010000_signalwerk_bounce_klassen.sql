-- Bounce-Gründe (04.10.2026): Klasse je Rückläufer (hart = Adresse/Domain fehlt, weich = Postfach voll/Timeout,
-- richtlinie = Spam/Blockliste, unbekannt) und Auswertung je Postfach und je Käufer-Quelle/Land (7 Tage).
-- Nur Messwerte: ändert nichts an Versand, Notbremse, Sperrliste oder Prüfregeln. Nicht destruktiv: neue Spalte,
-- neue Funktionen, Nachtragen der Klasse in der neuen Spalte.

alter table signalwerk.email_events add column if not exists bounce_class text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'email_events_bounce_class_check') then
    alter table signalwerk.email_events add constraint email_events_bounce_class_check
      check (bounce_class is null or bounce_class in ('hart', 'weich', 'richtlinie', 'unbekannt'));
  end if;
end $$;
create index if not exists email_events_bounced_at_idx on signalwerk.email_events (occurred_at desc) where type = 'bounced';

-- Gleiche Regeln wie scripts/lib/bounce_class.py (klasse)
create or replace function signalwerk.bounce_klasse(p_status text, p_diag text) returns text
language sql immutable set search_path = '' as $$
  with x as (
    select coalesce(p_diag, '') d,
           coalesce(nullif(trim(p_status), ''), substring(coalesce(p_diag, '') from '(?:^|[^0-9.])([245]\.[0-9]{1,3}\.[0-9]{1,3})(?:[^0-9.]|$)'), '') s
  )
  select case
    when s = '' and trim(d) = '' then 'unbekannt'
    when d ~* '(host or domain name not found|name service error|domain (name )?not found|nxdomain|no mx (record|host)|unrouteable (mail )?domain|domain does not exist)' then 'hart'
    when s ~ '^5\.(1\.[0-9]+|4\.1|4\.4|4\.310|2\.1)$' then 'hart'
    when s ~ '^[45]\.7\.' then 'richtlinie'
    when s ~ '^(4\.[0-9]+\.[0-9]+|5\.2\.2|5\.4\.7|5\.3\.[0-9]+)$' then
      case when d ~* '(spam|block ?list|black ?list|blocked|spamhaus|barracuda|spamcop|reputation|policy|dnsbl|\mrbl\M|not authori[sz]ed|sender (address )?rejected|dmarc|\mspf\M|dkim|message rejected|content rejected|denied by)' then 'richtlinie' else 'weich' end
    when d ~* '(spam|block ?list|black ?list|blocked|spamhaus|barracuda|spamcop|reputation|policy|dnsbl|\mrbl\M|not authori[sz]ed|sender (address )?rejected|dmarc|\mspf\M|dkim|message rejected|content rejected|denied by)' then 'richtlinie'
    when d ~* '(user unknown|unknown user|no such (user|recipient|mailbox)|does not exist|doesn''?t exist|address (couldn''?t be |could not be |not )found|recipient not found|recipientnotfound|unknown recipient|invalid (recipient|mailbox|address)|mailbox unavailable|mailbox not found|no mailbox|account (has been )?disabled|recipient address rejected|address rejected|not our customer|unrouteable)' then 'hart'
    when d ~* '(mailbox (is )?full|quota|insufficient (system )?storage|timeout|timed out|try again|temporar|expired|deferred|connection (refused|reset|lost)|failed to establish|unable to deliver in|too many (connections|messages)|rate limit|greylist)' then 'weich'
    else 'unbekannt' end
  from x
$$;

-- Klasse aus dem gespeicherten Grund (IMAP: payload.bounce.status/diagnostic; Resend: diagnosticCode/message)
create or replace function signalwerk.bounce_klasse_aus(p_payload jsonb) returns text
language sql immutable set search_path = '' as $$
  select signalwerk.bounce_klasse(p_payload -> 'bounce' ->> 'status',
    coalesce(nullif(p_payload -> 'bounce' ->> 'diagnostic', ''), p_payload -> 'bounce' ->> 'diagnosticCode', '')
      || ' ' || coalesce(p_payload -> 'bounce' ->> 'message', ''))
$$;

-- Neue Rückläufer ohne Klasse (z. B. Resend-Webhook) bekommen sie beim Speichern
create or replace function signalwerk.email_events_bounce_class() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type = 'bounced' and new.bounce_class is null then
    new.bounce_class := signalwerk.bounce_klasse_aus(coalesce(new.payload, '{}'::jsonb));
  end if;
  return new;
end $$;
drop trigger if exists email_events_bounce_class on signalwerk.email_events;
create trigger email_events_bounce_class before insert on signalwerk.email_events
  for each row execute function signalwerk.email_events_bounce_class();

-- Bestehende Rückläufer nachtragen (nur die neue Spalte)
update signalwerk.email_events set bounce_class = signalwerk.bounce_klasse_aus(coalesce(payload, '{}'::jsonb))
 where type = 'bounced' and bounce_class is null;

-- Herkunft der Käufer-Adresse: OSM, Recherche (manuell), Overture-Eintrag, Website (Impressum/Kontaktseite)
create or replace function signalwerk.kaeufer_quelle(p_size_note text, p_source_url text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_size_note ilike 'OSM:%' then 'OSM'
    when p_size_note = 'unverified' then 'Recherche'
    when p_source_url ilike '%overturemaps%' then 'Overture'
    when coalesce(p_source_url, '') = '' then '?'
    else 'Website' end
$$;

-- Auswertung: Kaltmails der letzten p_days Tage (messages.status = sent), je Mail die schwerste Bounce-Klasse
create or replace function signalwerk.bounce_stats(p_days int default 7) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (
    select m.id,
           case when x.a is null or x.a like 'info@%' then 'info@' else split_part(x.a, '@', 1) || '@' end as box,
           coalesce(p.country, '?') as country,
           signalwerk.kaeufer_quelle(p.size_note, p.source_url) as quelle
      from signalwerk.messages m
      left join signalwerk.prospects p on p.id = m.prospect_id
      cross join lateral (select lower(substring(m.sent_from from '([^<>[:space:]]+@[^<>[:space:]]+)')) as a) x
     where m.status = 'sent' and m.sent_at >= now() - make_interval(days => greatest(p_days, 1))
  ), b as (
    select distinct on (e.message_id) e.message_id, coalesce(e.bounce_class, 'unbekannt') as k
      from signalwerk.email_events e join m on m.id = e.message_id
     where e.type = 'bounced'
     order by e.message_id, case coalesce(e.bounce_class, 'unbekannt') when 'hart' then 0 when 'richtlinie' then 1
                                                                       when 'weich' then 2 else 3 end
  ), j as (select m.*, b.k from m left join b on b.message_id = m.id)
  select jsonb_build_object(
    'tage', p_days,
    'gesendet', (select count(*) from j),
    'bounces', (select count(k) from j),
    'klassen', jsonb_build_object(
      'hart', (select count(*) from j where k = 'hart'), 'weich', (select count(*) from j where k = 'weich'),
      'richtlinie', (select count(*) from j where k = 'richtlinie'), 'unbekannt', (select count(*) from j where k = 'unbekannt')),
    'postfaecher', coalesce((select jsonb_agg(to_jsonb(s) order by s.gesendet desc) from (
      select box, count(*) as gesendet, count(k) as bounces, count(*) filter (where k = 'hart') as hart,
             count(*) filter (where k = 'weich') as weich, count(*) filter (where k = 'richtlinie') as richtlinie,
             count(*) filter (where k = 'unbekannt') as unbekannt
        from j group by box) s), '[]'::jsonb),
    'quellen', coalesce((select jsonb_agg(to_jsonb(s) order by s.gesendet desc) from (
      select country, quelle, count(*) as gesendet, count(k) as bounces, count(*) filter (where k = 'hart') as hart,
             count(*) filter (where k = 'weich') as weich, count(*) filter (where k = 'richtlinie') as richtlinie,
             count(*) filter (where k = 'unbekannt') as unbekannt
        from j group by country, quelle) s), '[]'::jsonb))
$$;
revoke all on function signalwerk.bounce_stats(int) from public, anon, authenticated;
grant execute on function signalwerk.bounce_stats(int) to service_role;
grant execute on function signalwerk.bounce_klasse(text, text) to service_role;
grant execute on function signalwerk.kaeufer_quelle(text, text) to service_role;
