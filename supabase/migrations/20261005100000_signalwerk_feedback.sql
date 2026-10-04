-- Feedback-Werk (Inhaber 05.10.2026): Kunden bewerten gelieferte Leads (gut/schlecht, optional „Auftrag gewonnen“),
-- die Premium-Bewertung lernt daraus (Gewicht je Anlass, nur Reihenfolge – scripts/lib/feedback.py).
-- Nicht destruktiv: nur neue Tabellen und eine View. RLS an, kein Zugriff für anon/authenticated (App und Skripte
-- nutzen serverseitig den Service-Schlüssel). Kein Tracking: gespeichert wird nur, was der Kunde selbst anklickt.
--
--   lead_feedback_links  ein Link je Lieferung/Probe (Token in der Mail, Lead-IDs)
--   lead_feedback        je Link und Lead die letzte Bewertung des Kunden
--   lead_feedback_stats  (View) je Anlass und Land: Bewertungen, gut, schlecht, gewonnen, Quote

create table if not exists signalwerk.lead_feedback_links (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique check (length(token) >= 20),
  kind        text not null check (kind in ('lieferung', 'probe')),
  lead_ids    uuid[] not null check (cardinality(lead_ids) between 1 and 500),
  country     text,
  segment_id  text,
  customer_id uuid,
  delivery_id uuid,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
alter table signalwerk.lead_feedback_links enable row level security;
revoke all on signalwerk.lead_feedback_links from anon, authenticated;
create index if not exists lead_feedback_links_delivery on signalwerk.lead_feedback_links (delivery_id)
  where delivery_id is not null;

create table if not exists signalwerk.lead_feedback (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid not null references signalwerk.lead_feedback_links (id),
  lead_id     uuid not null,
  customer_id uuid,
  kind        text not null check (kind in ('lieferung', 'probe')),
  country     text,
  signal_type text,
  rating      text check (rating in ('gut', 'schlecht')),
  won         boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (link_id, lead_id)
);
alter table signalwerk.lead_feedback enable row level security;
revoke all on signalwerk.lead_feedback from anon, authenticated;
create index if not exists lead_feedback_signal on signalwerk.lead_feedback (signal_type, country);

-- Auswertung je Anlass und Land (Büro Qualität, Gewichte in scripts/lib/feedback.py)
create or replace view signalwerk.lead_feedback_stats
with (security_invoker = true) as
select coalesce(f.signal_type, '?') as signal_type,
       coalesce(f.country, '?') as country,
       count(*) filter (where f.rating is not null or f.won)::int as bewertungen,
       count(*) filter (where f.rating = 'gut')::int as gut,
       count(*) filter (where f.rating = 'schlecht')::int as schlecht,
       count(*) filter (where f.won)::int as gewonnen,
       case when count(*) filter (where f.rating is not null) > 0
            then round(100.0 * count(*) filter (where f.rating = 'gut')
                       / count(*) filter (where f.rating is not null), 1) end as gut_pct,
       max(f.updated_at) as letzte
from signalwerk.lead_feedback f
group by 1, 2;
revoke all on signalwerk.lead_feedback_stats from anon, authenticated;
