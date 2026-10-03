-- Proben-Vorrat (Inhaber 03.10.2026: „es sollen proben in der hinterhand sein ca. 50 proben immer die bereits fertig
-- und geprüft sind … damit wir sie problemlos rausschicken können“ und „es soll direkt nach dem button klick die probe
-- rausgehen auch immer mit den aktuell besten leads“).
--
-- scripts/sample_stock.py baut laufend fertige Proben (genau 10 verschiedene Firmen, alle Prüfungen von
-- responder.regional_sample) und legt die fertige Mail (Text, HTML, PDF + CSV) als JSON in den privaten
-- Storage-Bucket „sample-stock“. Die Leads einer vorbereiteten Probe sind reserviert (leads.status = 'reserved'),
-- gehen also weder in eine andere Probe noch in eine Lieferung. Nach dem Klick nimmt die App (api/sample-request)
-- atomar eine passende Probe (claim_sample_stock, FOR UPDATE SKIP LOCKED) und schickt sie per Resend.
-- Nicht destruktiv: neue Tabelle, neue Spalte, neue Funktionen; der Status-Check von leads wird nur erweitert.

-- 1) Lead-Status „reserved“ (bisher new, sample, delivered, expired)
alter table signalwerk.leads drop constraint if exists leads_status_check;
alter table signalwerk.leads add constraint leads_status_check
  check (status in ('new', 'sample', 'delivered', 'expired', 'reserved')) not valid;
alter table signalwerk.leads validate constraint leads_status_check;

-- 2) Sperre je Probe-Anfrage: wer gerade sendet (App direkt nach dem Klick oder web_samples.py), damit eine Anfrage
--    nie doppelt bedient wird. Nach 15 Minuten gilt eine Sperre als verwaist.
alter table signalwerk.sample_requests add column if not exists claimed_at timestamptz;

-- 3) Vorrat
create table if not exists signalwerk.sample_stock (
  id            uuid primary key default gen_random_uuid(),
  segment_id    text not null references signalwerk.segments(id),
  country       text not null,
  lang          text not null,
  wish          text[] not null default '{}',       -- Wunsch, mit dem gebaut wurde (leer = beste Leads allgemein)
  wish_match    jsonb not null default '{}',        -- je Wunsch-Schlüssel: wie viele der 10 Leads passen
  signal_types  text[] not null default '{}',
  lead_ids      uuid[] not null,
  company_ids   uuid[] not null,
  score         numeric not null default 0,         -- Dringlichkeit + Frische (höher = besser)
  newest_event  date,
  oldest_event  date,
  storage_path  text not null,                      -- Bucket sample-stock: fertige Mail als JSON
  subject       text not null,
  status        text not null default 'ready' check (status in ('ready', 'claimed', 'sent', 'expired', 'failed')),
  request_id    uuid references signalwerk.sample_requests(id),
  built_at      timestamptz not null default now(),
  expires_at    timestamptz not null,
  claimed_at    timestamptz,
  sent_at       timestamptz,
  released_at   timestamptz,
  files_removed_at timestamptz,
  resend_id     text,
  note          text,
  constraint sample_stock_exactly_10 check (cardinality(lead_ids) = 10 and cardinality(company_ids) = 10)
);
create index if not exists sample_stock_pick_idx on signalwerk.sample_stock (segment_id, country, status, built_at desc);
create index if not exists sample_stock_request_idx on signalwerk.sample_stock (request_id);

alter table signalwerk.sample_stock enable row level security;  -- keine Policies: nur service_role
revoke all on signalwerk.sample_stock from anon, authenticated;
grant select, insert, update on signalwerk.sample_stock to service_role;

-- 4) Neue Probe in den Vorrat: Zeile anlegen und die 10 Leads atomar reservieren. Sind nicht mehr alle 10 frei
--    (gleichzeitig vergeben), bricht alles ab – nichts wird halb reserviert.
create or replace function signalwerk.add_sample_stock(p jsonb) returns uuid
language plpgsql security definer set search_path = signalwerk, public as $$
declare
  v_id uuid;
  v_leads uuid[] := array(select jsonb_array_elements_text(p->'lead_ids')::uuid);
  v_cos uuid[] := array(select jsonb_array_elements_text(p->'company_ids')::uuid);
  n int;
begin
  if (select count(distinct x) from unnest(v_leads) x) <> 10 or (select count(distinct x) from unnest(v_cos) x) <> 10 then
    raise exception 'Probe braucht genau 10 verschiedene Leads und Firmen';
  end if;
  update signalwerk.leads set status = 'reserved' where id = any(v_leads) and status = 'new';
  get diagnostics n = row_count;
  if n <> 10 then
    raise exception 'Leads nicht mehr frei (% von 10)', n;
  end if;
  insert into signalwerk.sample_stock (segment_id, country, lang, wish, wish_match, signal_types, lead_ids, company_ids,
                                       score, newest_event, oldest_event, storage_path, subject, expires_at)
  values (p->>'segment_id', p->>'country', p->>'lang',
          coalesce(array(select jsonb_array_elements_text(p->'wish')), '{}'),
          coalesce(p->'wish_match', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(p->'signal_types')), '{}'),
          v_leads, v_cos, coalesce((p->>'score')::numeric, 0),
          (p->>'newest_event')::date, (p->>'oldest_event')::date,
          p->>'storage_path', p->>'subject', (p->>'expires_at')::timestamptz)
  returning id into v_id;
  return v_id;
end $$;

-- 5) Probe-Anfrage sperren (true = dieser Aufrufer bedient sie jetzt)
create or replace function signalwerk.lock_sample_request(p_request uuid) returns boolean
language plpgsql security definer set search_path = signalwerk, public as $$
declare n int;
begin
  update signalwerk.sample_requests set claimed_at = now()
   where id = p_request and status = 'new' and (claimed_at is null or claimed_at < now() - interval '15 minutes');
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- 6) Passende fertige Probe nehmen (atomar, keine Doppelvergabe bei gleichzeitigen Klicks).
--    Reihenfolge: passt am besten zum Wunsch, dann höchster Score, dann zuletzt gebaut. Vor der Vergabe wird
--    nachgeprüft, dass alle 10 Leads noch reserviert sind und keine Firma inzwischen als widersprüchlich
--    (Qualitätsprüfung blocking) markiert wurde – sonst wird die Probe verworfen und die nächste genommen.
create or replace function signalwerk.claim_sample_stock(p_segment text, p_country text, p_wish text[], p_request uuid)
returns table (id uuid, storage_path text, subject text, lang text)
language plpgsql security definer set search_path = signalwerk, public as $$
#variable_conflict use_column
declare r record;
begin
  for r in
    select s.id, s.storage_path, s.subject, s.lang, s.lead_ids, s.company_ids
      from signalwerk.sample_stock s
     where s.segment_id = p_segment and s.country = p_country and s.status = 'ready' and s.expires_at > now()
     order by (select coalesce(sum(coalesce((s.wish_match->>k)::int, 0)), 0)
                 from unnest(coalesce(p_wish, '{}'::text[])) k) desc,
              s.score desc, s.built_at desc
     for update of s skip locked
  loop
    if (select count(*) from signalwerk.leads l where l.id = any(r.lead_ids) and l.status = 'reserved') <> 10
       or exists (select 1 from signalwerk.observations o
                   where o.company_id = any(r.company_ids) and o.kind = 'other' and o.key = 'quality'
                     and o.details->>'blocking' = 'true') then
      update signalwerk.sample_stock set status = 'expired', released_at = now(), note = 'beim Abruf ungültig'
       where sample_stock.id = r.id;
      update signalwerk.leads set status = 'new' where leads.id = any(r.lead_ids) and leads.status = 'reserved';
      continue;
    end if;
    update signalwerk.sample_stock set status = 'claimed', claimed_at = now(), request_id = p_request
     where sample_stock.id = r.id;
    id := r.id; storage_path := r.storage_path; subject := r.subject; lang := r.lang;
    return next;
    return;
  end loop;
end $$;

-- 7) Ergebnis des Versands:
--    ok            -> Probe gesendet: Leads endgültig vergeben (status sample, nie wieder ausgegeben), Anfrage sent
--    nicht ok, p_release -> sicher nicht gesendet (Resend lehnte ab): Probe wieder bereit, Anfrage-Sperre frei
--    nicht ok, sonst     -> unklar, ob gesendet: Probe failed, Leads vorsichtshalber als vergeben markiert
create or replace function signalwerk.finish_sample_stock(p_stock uuid, p_ok boolean, p_release boolean default false,
                                                          p_resend_id text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = signalwerk, public as $$
declare r record;
begin
  select * into r from signalwerk.sample_stock where id = p_stock for update;
  if not found or r.status <> 'claimed' then
    return;
  end if;
  if p_ok then
    update signalwerk.sample_stock set status = 'sent', sent_at = now(), resend_id = p_resend_id, note = p_note
     where id = p_stock;
    update signalwerk.leads set status = 'sample' where id = any(r.lead_ids) and status = 'reserved';
    update signalwerk.sample_requests set status = 'sent', sent_at = now() where id = r.request_id;
  elsif p_release then
    update signalwerk.sample_stock set status = 'ready', claimed_at = null, request_id = null, note = p_note
     where id = p_stock;
    update signalwerk.sample_requests set claimed_at = null where id = r.request_id and status = 'new';
  else
    update signalwerk.sample_stock set status = 'failed', released_at = now(), note = p_note where id = p_stock;
    update signalwerk.leads set status = 'sample' where id = any(r.lead_ids) and status = 'reserved';
  end if;
end $$;

-- 8) Verfall: Proben älter als p_hours verwerfen (Signale altern) und ihre Leads wieder freigeben;
--    hängende Vergaben (> 30 min „claimed“) gelten als unklar gesendet -> failed, Leads bleiben vergeben.
create or replace function signalwerk.expire_sample_stock(p_hours int default 48) returns int
language plpgsql security definer set search_path = signalwerk, public as $$
declare r record; n int := 0;
begin
  for r in select * from signalwerk.sample_stock
            where (status = 'ready' and (expires_at <= now() or built_at < now() - make_interval(hours => p_hours)))
               or (status = 'claimed' and claimed_at < now() - interval '30 minutes')
            for update skip locked
  loop
    if r.status = 'ready' then
      update signalwerk.sample_stock set status = 'expired', released_at = now(), note = 'Verfall (Alter)' where id = r.id;
      update signalwerk.leads set status = 'new' where id = any(r.lead_ids) and status = 'reserved';
    else
      update signalwerk.sample_stock set status = 'failed', released_at = now(), note = 'Vergabe hing > 30 min'
       where id = r.id;
      update signalwerk.leads set status = 'sample' where id = any(r.lead_ids) and status = 'reserved';
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function signalwerk.add_sample_stock(jsonb) from public, anon, authenticated;
revoke all on function signalwerk.lock_sample_request(uuid) from public, anon, authenticated;
revoke all on function signalwerk.claim_sample_stock(text, text, text[], uuid) from public, anon, authenticated;
revoke all on function signalwerk.finish_sample_stock(uuid, boolean, boolean, text, text) from public, anon, authenticated;
revoke all on function signalwerk.expire_sample_stock(int) from public, anon, authenticated;
grant execute on function signalwerk.add_sample_stock(jsonb) to service_role;
grant execute on function signalwerk.lock_sample_request(uuid) to service_role;
grant execute on function signalwerk.claim_sample_stock(text, text, text[], uuid) to service_role;
grant execute on function signalwerk.finish_sample_stock(uuid, boolean, boolean, text, text) to service_role;
grant execute on function signalwerk.expire_sample_stock(int) to service_role;

-- 9) Privater Storage-Bucket (kostenlos im Supabase-Kontingent). In der CI-Datenbank gibt es kein storage-Schema.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('sample-stock', 'sample-stock', false)
    on conflict (id) do nothing;
  end if;
end $$;
