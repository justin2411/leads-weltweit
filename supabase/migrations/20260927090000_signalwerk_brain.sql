-- BRAIN.md Abschnitt 4: Landingpages, Ereignisse ohne personenbezogene Daten, Probe-Anfragen, Stripe-Abos,
-- Kundenfilter, Lead-Tags und Entscheidungsprotokoll. Nur Schema `signalwerk`, nur Ergänzungen (nicht destruktiv).

-- ---------------------------------------------------------------------------
-- Einstellungen (genau eine Zeile). Schalter setzt nur der Inhaber (Dashboard).
create table if not exists signalwerk.settings (
  id                      int primary key default 1 check (id = 1),
  brain_enabled           boolean not null default true,   -- Not-Aus: false = nur beobachten und berichten
  auto_publish_pages      boolean not null default false,  -- Stufe 2: Gehirn darf Seiten selbst live schalten
  auto_merge_content      boolean not null default false,  -- Stufe 3: reine Inhalts-PRs automatisch mergen
  max_new_pages_per_week  int     not null default 3 check (max_new_pages_per_week between 0 and 20),
  legal_ready             boolean not null default false,  -- Impressum, Datenschutz, AGB veröffentlicht (Inhaber)
  pricing                 jsonb,                           -- Pakete mit Stripe-Preis-IDs, nur vom Inhaber gesetzt
  updated_at              timestamptz not null default now(),
  updated_by              text
);
insert into signalwerk.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Landingpages: Inhalte statt Code. Eine feste Vorlage rendert diese Zeilen.
create table if not exists signalwerk.landing_pages (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z]{2}/[a-z0-9-]+$'),   -- z. B. uk/recruitment
  segment_id  text not null references signalwerk.segments(id),
  country     text not null,
  language    text not null default 'en' check (language in ('en','fr','de')),
  status      text not null default 'draft' check (status in ('draft','review','live','retired')),
  created_by  text not null default 'brain' check (created_by in ('brain','owner')),
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (segment_id, country)
);

create table if not exists signalwerk.page_variants (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references signalwerk.landing_pages(id),
  variant_key   text not null check (variant_key ~ '^[A-Z]$'),
  headline      text not null,
  subheadline   text,
  signals       jsonb not null default '[]',   -- [{title, text}]
  sample_leads  jsonb not null default '[]',   -- nur aus echten Proben (leads.status = 'sample'), als Beispiel markiert
  pricing       jsonb,                         -- Anzeige-Überschreibung; Preise setzt nur der Inhaber
  cta_label     text not null,
  faq           jsonb not null default '[]',   -- [{q, a}]
  status        text not null default 'review' check (status in ('draft','review','live','retired')),
  traffic_share int  not null default 100 check (traffic_share between 0 and 100),
  changed_element text check (changed_element in ('headline','signals','cta')),  -- bei Varianten: das eine geänderte Element
  created_by    text not null default 'brain' check (created_by in ('brain','owner')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (page_id, variant_key)
);

-- Live nur mit veröffentlichten Rechtstexten (Impressum, Datenschutz, AGB) – auch wenn jemand direkt in die DB schreibt.
create or replace function signalwerk.guard_live_pages() returns trigger
language plpgsql set search_path = signalwerk, pg_temp as $$
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    if not coalesce((select legal_ready from signalwerk.settings where id = 1), false) then
      raise exception 'Live-Schalten gesperrt: Impressum, Datenschutz und AGB fehlen noch (settings.legal_ready = false)';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists landing_pages_guard on signalwerk.landing_pages;
create trigger landing_pages_guard before insert or update on signalwerk.landing_pages
  for each row execute function signalwerk.guard_live_pages();
drop trigger if exists page_variants_guard on signalwerk.page_variants;
create trigger page_variants_guard before insert or update on signalwerk.page_variants
  for each row execute function signalwerk.guard_live_pages();

-- Ereignisse: KEINE IP, KEINE Cookies, KEINE personenbezogenen Daten.
create table if not exists signalwerk.page_events (
  id          bigint generated always as identity primary key,
  variant_id  uuid not null references signalwerk.page_variants(id),
  type        text not null check (type in ('view','cta_click','sample_request','checkout_started','purchase')),
  created_at  timestamptz not null default now()
);
create index if not exists page_events_variant_type on signalwerk.page_events (variant_id, type, created_at);

-- Probe-Anfragen über das Formular (Einwilligung mit Zeitstempel und Wortlaut).
create table if not exists signalwerk.sample_requests (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid references signalwerk.page_variants(id),
  company_name    text not null,
  email           text not null,          -- geschäftliche Adresse des Anfragenden
  segment_id      text references signalwerk.segments(id),
  country         text,
  region          text,
  consent_text    text not null,
  consent_at      timestamptz not null,
  status          text not null default 'new' check (status in ('new','sent','rejected')),
  sent_at         timestamptz,
  note            text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Kunden und Abos aus Stripe (bestehende Tabellen ergänzen).
alter table signalwerk.customers add column if not exists stripe_customer_id text unique;
alter table signalwerk.customers add column if not exists filter_token_issued_at timestamptz;
alter table signalwerk.subscriptions add column if not exists stripe_subscription_id text unique;
alter table signalwerk.subscriptions add column if not exists stripe_price_id text;
alter table signalwerk.subscriptions add column if not exists amount_cents int;
alter table signalwerk.subscriptions add column if not exists currency text;
alter table signalwerk.subscriptions add column if not exists current_period_end timestamptz;
alter table signalwerk.subscriptions add column if not exists package text;
alter table signalwerk.subscriptions add column if not exists page_variant_id uuid references signalwerk.page_variants(id);
alter table signalwerk.subscriptions alter column price_eur_month drop not null;   -- Stripe liefert Betrag + Währung
alter table signalwerk.subscriptions drop constraint if exists subscriptions_status_check;
alter table signalwerk.subscriptions add constraint subscriptions_status_check
  check (status in ('active','past_due','paused','cancelled','incomplete'));

create table if not exists signalwerk.customer_filters (
  customer_id  uuid primary key references signalwerk.customers(id),
  segment_id   text references signalwerk.segments(id),
  regions      text[] not null default '{}',
  signals      text[] not null default '{}',
  industries   text[] not null default '{}',   -- Berufe/Branchen
  exclusions   text[] not null default '{}',   -- Firmennamen oder Stichwörter, die nicht geliefert werden
  max_per_week int not null default 30 check (max_per_week between 1 and 500),
  exclusive    boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- Pro Lead: Segmente, Region, Branche, Qualitätswert (unter 60 wird nicht geliefert).
create table if not exists signalwerk.lead_tags (
  lead_id     uuid primary key references signalwerk.leads(id),
  segments    text[] not null default '{}',
  region      text,
  industry    text,
  quality     int not null check (quality between 0 and 100),
  reasons     jsonb not null default '{}',
  tagged_at   timestamptz not null default now()
);
create index if not exists lead_tags_quality on signalwerk.lead_tags (quality);

-- Entscheidungsprotokoll des Gehirns.
create table if not exists signalwerk.decisions (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('page_new','page_variant','page_winner','page_retire','segment',
                                             'safety','daily_note','weekly_report','webhook','delivery','note')),
  subject     text not null,
  reasoning   text not null,
  metrics     jsonb not null default '{}',
  action      text,
  status      text not null default 'proposed' check (status in ('proposed','done','rejected')),
  created_at  timestamptz not null default now()
);
create index if not exists decisions_created on signalwerk.decisions (created_at desc);

-- Kennzahlen je Seitenvariante.
create or replace view signalwerk.page_stats with (security_invoker = true) as
select v.id as variant_id, p.id as page_id, p.slug, p.segment_id, p.country, p.status as page_status,
       v.variant_key, v.status as variant_status, v.traffic_share,
       count(*) filter (where e.type = 'view')             as views,
       count(*) filter (where e.type = 'cta_click')        as cta_clicks,
       count(*) filter (where e.type = 'sample_request')   as sample_requests,
       count(*) filter (where e.type = 'checkout_started') as checkouts,
       count(*) filter (where e.type = 'purchase')         as purchases
from signalwerk.page_variants v
join signalwerk.landing_pages p on p.id = v.page_id
left join signalwerk.page_events e on e.variant_id = v.id
group by v.id, p.id;

-- Row Level Security: nur der Service-Schlüssel (serverseitig) hat Zugriff.
alter table signalwerk.settings          enable row level security;
alter table signalwerk.landing_pages     enable row level security;
alter table signalwerk.page_variants     enable row level security;
alter table signalwerk.page_events       enable row level security;
alter table signalwerk.sample_requests   enable row level security;
alter table signalwerk.customer_filters  enable row level security;
alter table signalwerk.lead_tags         enable row level security;
alter table signalwerk.decisions         enable row level security;
