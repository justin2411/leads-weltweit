-- Signalwerk: eigenes Schema, berührt keine anderen Schemas.
-- Nicht destruktiv: legt nur an (IF NOT EXISTS), löscht nichts.

create schema if not exists signalwerk;

-- Nur der Service-Schlüssel (serverseitig) darf zugreifen.
revoke all on schema signalwerk from public, anon, authenticated;
grant usage on schema signalwerk to service_role;

create extension if not exists pgcrypto with schema extensions;

-- Hilfsfunktion: updated_at pflegen
create or replace function signalwerk.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Käuferzielgruppen
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.segments (
  id              text primary key,                       -- 'S1' ... 'S8', neue Ideen 'S9' ...
  name            text not null,
  description     text,
  signals         text[] not null default '{}',           -- passende Signaltypen
  email_countries text[] not null default '{}',           -- Länder, in denen per Mail getestet werden darf
  status          text not null default 'idea'
                  check (status in ('idea','testing','winner','killed')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Experimente: ein Test pro Segment, Land und Botschaft
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.experiments (
  id                   uuid primary key default gen_random_uuid(),
  segment_id           text not null references signalwerk.segments(id),
  country              text not null,
  variant              text not null default 'v1',        -- Botschaft
  hypothesis           text not null,
  message_notes        text,                              -- Betreff/Einstieg dieser Botschaft
  planned_count        int  not null default 50,
  status               text not null default 'planned'
                       check (status in ('planned','running','measuring','done')),
  started_on           date,
  last_sent_on         date,
  decision             text check (decision in ('killed','new_message','winner')),
  decision_reason      text,
  decided_on           date,
  -- Dauerfreigabe (CLAUDE.md Abschnitt 6): nur der Inhaber setzt diese Felder
  auto_send_approved      boolean not null default false,
  auto_send_approved_at   timestamptz,
  auto_send_approval_note text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (segment_id, country, variant)
);

-- ---------------------------------------------------------------------------
-- Beobachtete Firmen (Lead-Inhalte). Nur Firmendaten, keine Personen.
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.watch_companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  legal_form      text,
  country         text not null,
  region          text,
  city            text,
  address         text,
  website         text,
  domain          text,
  phone_main      text,                                   -- nur zentrale Nummer
  registry_source text,                                   -- z. B. 'companies_house', 'ny_dos'
  registry_id     text,
  careers_url     text,
  careers_fetched_at timestamptz,                         -- höchstens einmal täglich abrufen
  website_fetched_at timestamptz,
  industry        text,
  active          boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists watch_companies_registry_uq
  on signalwerk.watch_companies (registry_source, registry_id) where registry_id is not null;
create unique index if not exists watch_companies_domain_uq
  on signalwerk.watch_companies (domain) where domain is not null;

-- ---------------------------------------------------------------------------
-- Rohbeobachtungen
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.observations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references signalwerk.watch_companies(id),
  kind         text not null
               check (kind in ('job_posting','incorporation','new_location','website_audit','filing','other')),
  key          text not null,                             -- stabiler Schlüssel, z. B. Stellen-URL
  title        text,
  details      jsonb not null default '{}',
  source_name  text not null,
  source_url   text,
  posted_on    date,                                      -- Datum laut Quelle, falls angegeben
  first_seen   date not null default current_date,
  last_seen    date not null default current_date,
  times_seen   int  not null default 1,
  gone_since   date,                                      -- nicht mehr gefunden seit
  created_at   timestamptz not null default now(),
  unique (company_id, kind, key)
);

-- ---------------------------------------------------------------------------
-- Erkannte Signale (Leads)
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.leads (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references signalwerk.watch_companies(id),
  segment_id      text references signalwerk.segments(id),
  country         text not null,
  signal_type     text not null,                          -- z. B. 'job_open_30d', 'new_incorporation', 'outdated_website'
  event_summary   text not null,
  event_date      date,
  source_name     text not null,
  source_url      text,
  source_date     date not null,                          -- wann wir die Quelle geprüft haben
  urgency         text not null check (urgency in ('high','medium','low')),
  urgency_reason  text not null,
  opener          text not null,                          -- Einstiegssatz für den Käufer
  observation_ids uuid[] not null default '{}',
  status          text not null default 'new'
                  check (status in ('new','sample','delivered','expired')),
  created_at      timestamptz not null default now(),
  unique (company_id, segment_id, signal_type, event_date)
);

-- ---------------------------------------------------------------------------
-- Potenzielle Käufer
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.prospects (
  id                uuid primary key default gen_random_uuid(),
  segment_id        text not null references signalwerk.segments(id),
  company_name      text not null,
  legal_form        text,
  country           text not null,
  region            text,
  website           text,
  domain            text not null,
  email             text,                                 -- veröffentlichte Firmenadresse
  email_is_generic  boolean,
  published_address text,
  specialization    text,                                 -- für den ersten Satz der Mail
  size_note         text,                                 -- warum KMU und kein Konzern
  source_url        text not null,                        -- wo die Adresse veröffentlicht ist
  check_status      text not null default 'unchecked'
                    check (check_status in ('unchecked','ok','rejected')),
  check_reason      text,
  checked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (domain)
);

-- ---------------------------------------------------------------------------
-- Mails
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.messages (
  id                uuid primary key default gen_random_uuid(),
  prospect_id       uuid not null references signalwerk.prospects(id),
  experiment_id     uuid not null references signalwerk.experiments(id),
  to_email          text not null,
  subject           text not null,
  body              text not null,                        -- ohne Fußzeile, die hängt das System an
  language          text not null default 'en',
  status            text not null default 'draft'
                    check (status in ('draft','approved','sent','blocked')),
  check_errors      text[] not null default '{}',
  unsubscribe_token text not null unique
                    default encode(extensions.gen_random_bytes(24), 'hex'),
  approved_at       timestamptz,
  approved_by       text,
  sent_at           timestamptz,
  resend_id         text unique,                          -- bei Versand über Resend
  smtp_message_id   text unique,                          -- bei Versand über SMTP (Message-ID-Header)
  blocked_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- eine Firma bekommt pro Experiment höchstens eine Mail
  unique (prospect_id, experiment_id)
);

-- ---------------------------------------------------------------------------
-- Ereignisse (Resend-Webhooks und manuell erfasste Antworten)
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.email_events (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid references signalwerk.messages(id),
  resend_id    text,
  type         text not null check (type in (
                 'sent','delivered','delivery_delayed','bounced','complained','failed',
                 'reply','reply_positive','reply_negative','sample_requested','unsubscribed')),
  dedupe_key   text unique,                               -- svix-id (Webhook) bzw. Message-ID (IMAP)
  payload      jsonb not null default '{}',
  note         text,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists email_events_message_idx on signalwerk.email_events (message_id);
create index if not exists email_events_resend_idx  on signalwerk.email_events (resend_id);

-- ---------------------------------------------------------------------------
-- Sperrliste. Einträge sind dauerhaft: kein UPDATE, kein DELETE.
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.suppression (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('email','domain')),
  value       text not null check (value = lower(value)),
  reason      text not null check (reason in ('unsubscribe','bounce','complaint','reply_optout','manual')),
  source      text,
  created_at  timestamptz not null default now(),
  unique (kind, value)
);

create or replace function signalwerk.suppression_is_permanent() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'signalwerk.suppression ist dauerhaft: % ist nicht erlaubt', tg_op;
end $$;

drop trigger if exists suppression_no_update_delete on signalwerk.suppression;
create trigger suppression_no_update_delete
  before update or delete on signalwerk.suppression
  for each row execute function signalwerk.suppression_is_permanent();

-- true, wenn Adresse oder Domain gesperrt ist
create or replace function signalwerk.is_suppressed(p_email text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from signalwerk.suppression s
    where (s.kind = 'email'  and s.value = lower(p_email))
       or (s.kind = 'domain' and s.value = lower(split_part(p_email, '@', 2)))
  );
$$;

-- Sperrt Adresse und Domain in einem Schritt (Firma dauerhaft gesperrt)
create or replace function signalwerk.suppress_email(p_email text, p_reason text, p_source text)
returns void language plpgsql set search_path = '' as $$
begin
  insert into signalwerk.suppression (kind, value, reason, source)
  values ('email', lower(p_email), p_reason, p_source)
  on conflict (kind, value) do nothing;
  insert into signalwerk.suppression (kind, value, reason, source)
  values ('domain', lower(split_part(p_email, '@', 2)), p_reason, p_source)
  on conflict (kind, value) do nothing;
end $$;

-- Eine Spam-Beschwerde beendet die Dauerfreigabe des Experiments sofort
create or replace function signalwerk.revoke_auto_send_on_complaint() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type = 'complained' and new.message_id is not null then
    update signalwerk.experiments e
       set auto_send_approved = false,
           auto_send_approval_note = coalesce(e.auto_send_approval_note, '')
             || ' | automatisch beendet wegen Spam-Beschwerde am ' || now()::date
     where e.id = (select m.experiment_id from signalwerk.messages m where m.id = new.message_id)
       and e.auto_send_approved;
  end if;
  return new;
end $$;

drop trigger if exists email_events_revoke_auto_send on signalwerk.email_events;
create trigger email_events_revoke_auto_send
  after insert on signalwerk.email_events
  for each row execute function signalwerk.revoke_auto_send_on_complaint();

-- ---------------------------------------------------------------------------
-- Kunden, Abos, Lieferungen
-- ---------------------------------------------------------------------------
create table if not exists signalwerk.customers (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid references signalwerk.prospects(id),
  company_name  text not null,
  country       text not null,
  billing_email text not null,
  status        text not null default 'trial' check (status in ('trial','active','cancelled')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists signalwerk.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references signalwerk.customers(id),
  segment_id              text not null references signalwerk.segments(id),
  filters                 jsonb not null default '{}',     -- Länder, Regionen, Signaltypen
  price_eur_month         numeric(10,2) not null,
  status                  text not null default 'active' check (status in ('active','paused','cancelled')),
  started_on              date not null default current_date,
  cancelled_on            date,
  first_delivery_approved boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists signalwerk.deliveries (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references signalwerk.subscriptions(id),
  period_start    date not null,
  lead_ids        uuid[] not null default '{}',
  status          text not null default 'prepared' check (status in ('prepared','approved','sent')),
  approved_at     timestamptz,
  sent_at         timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  unique (subscription_id, period_start)
);

-- ---------------------------------------------------------------------------
-- updated_at-Trigger
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['segments','experiments','watch_companies','prospects','messages','customers','subscriptions']
  loop
    execute format('drop trigger if exists %I_touch on signalwerk.%I', t, t);
    execute format('create trigger %I_touch before update on signalwerk.%I
                    for each row execute function signalwerk.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Kennzahlen pro Experiment (für Dashboard und Wochenbericht)
-- ---------------------------------------------------------------------------
create or replace view signalwerk.experiment_stats
with (security_invoker = true) as
select
  e.id as experiment_id, e.segment_id, e.country, e.variant, e.status, e.decision,
  count(distinct m.id) filter (where m.status = 'sent')                          as sent,
  count(distinct ev.message_id) filter (where ev.type = 'delivered')             as delivered,
  count(distinct ev.message_id) filter (where ev.type = 'bounced')               as bounced,
  count(distinct ev.message_id) filter (where ev.type = 'complained')            as complained,
  count(distinct ev.message_id) filter (where ev.type in ('reply','reply_positive','reply_negative')) as replies,
  count(distinct ev.message_id) filter (where ev.type = 'reply_positive')        as positive,
  count(distinct ev.message_id) filter (where ev.type = 'sample_requested')      as samples,
  count(distinct c.id)                                                          as customers,
  max(m.sent_at)                                                                as last_sent_at
from signalwerk.experiments e
left join signalwerk.messages m      on m.experiment_id = e.id
left join signalwerk.email_events ev on ev.message_id = m.id
left join signalwerk.customers c     on c.prospect_id = m.prospect_id and m.status = 'sent'
group by e.id;

-- ---------------------------------------------------------------------------
-- Row Level Security: überall an, keine Policies => nur service_role (umgeht RLS)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['segments','experiments','watch_companies','observations','leads','prospects',
                           'messages','email_events','suppression','customers','subscriptions','deliveries']
  loop
    execute format('alter table signalwerk.%I enable row level security', t);
  end loop;
end $$;

grant select, insert, update on all tables in schema signalwerk to service_role;
grant execute on all functions in schema signalwerk to service_role;
revoke execute on all functions in schema signalwerk from public, anon, authenticated;
