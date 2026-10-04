-- Firma mit Bereichen (Inhaber 04.10.2026: „gib verschiedene bereiche wie in einem unternehmen und den einzelnen agenten
-- workflows damit sie gut zusammenarbeiten, bau daraus ein unternehmen was geld verdient“).
-- Nicht destruktiv: zwei neue Tabellen, eine neue optionale Spalte, eine lesende Funktion. Nichts gelöscht, keine
-- Löschrechte, keine Regeln (Versand, Länder, Sperrliste, Notbremse, Freigabe) berührt.
--   departments          8 Bereiche: Leitung (Fach-Agent oder vorhandener Baustein), Mitglieder, Hauptziel, Wirkungszahl, Takt
--   agent_roles.department  Fach-Agent gehört zu diesem Bereich
--   handoffs             feste Übergaben zwischen Bereichen (scripts/uebergaben.py): schluessel eindeutig = kein Doppelauftrag
--   firma_lage()         alle Zahlen für Übergabe-Regeln, Wirkungszahlen und den Geschäftsbericht in einer Abfrage

create table if not exists signalwerk.departments (
  slug          text primary key check (slug ~ '^[a-z][a-z_]{1,30}$'),
  name          text not null check (char_length(btrim(name)) between 2 and 30),
  icon          text not null default 'agent',
  zweck         text not null check (char_length(btrim(zweck)) between 3 and 80),
  leitung_rolle text references signalwerk.agent_roles(slug),
  leitung_name  text not null check (char_length(btrim(leitung_name)) between 2 and 40),
  leitung_takt  text not null check (char_length(leitung_takt) <= 60),
  -- Mitglieder: [{art: rolle|routine|workflow|website|agent, ref, name, takt}] – ref = slug, Routinen-/Agenten-Name oder Workflow
  mitglieder    jsonb not null default '[]'::jsonb check (jsonb_typeof(mitglieder) = 'array'),
  -- Hauptziel: key aus company_goals (Soll dort, ändert nur der Inhaber) oder eigene Kennzahl aus firma_lage()
  ziel_key      text not null,
  ziel_titel    text not null check (char_length(btrim(ziel_titel)) between 2 and 40),
  ziel_soll     numeric,                       -- nur für eigene Kennzahlen; bei company_goals gilt deren Soll
  ziel_richtung text not null default 'hoch' check (ziel_richtung in ('hoch', 'runter')),
  wirkung_key   text not null,                 -- Wirkungszahl Richtung Umsatz (firma_lage)
  wirkung_titel text not null check (char_length(btrim(wirkung_titel)) between 2 and 40),
  sort          smallint not null default 0,
  aktiv         boolean not null default true,
  updated_at    timestamptz not null default now()
);
create or replace trigger departments_touch before update on signalwerk.departments
  for each row execute function signalwerk.touch_updated_at();
alter table signalwerk.departments enable row level security;
revoke all on signalwerk.departments from anon, authenticated;
revoke delete, truncate on signalwerk.departments from service_role;
grant select, insert, update on signalwerk.departments to service_role;

insert into signalwerk.departments (slug, name, icon, zweck, leitung_rolle, leitung_name, leitung_takt, mitglieder,
                                    ziel_key, ziel_titel, ziel_soll, ziel_richtung, wirkung_key, wirkung_titel, sort)
values
  ('vertrieb', 'Vertrieb', 'versand', 'Kaltmails → Antworten → Proben → Kunden', 'trichter', 'Trichter-Agent', 'täglich 07:40',
   '[{"art":"rolle","ref":"trichter","name":"Trichter-Agent","takt":"täglich 07:40"},
     {"art":"rolle","ref":"zustellung","name":"Zustell-Agent","takt":"täglich 06:30"},
     {"art":"routine","ref":"Antwort-Analyse Kaltmails","name":"Antwort-Analyse","takt":"täglich 17:10"},
     {"art":"workflow","ref":"send.yml","name":"Versand-Werk","takt":"stündlich :37"}]',
   'antwortquote', 'Antwortquote', null, 'hoch', 'positiv_7d', 'positive Antworten 7 T', 10),
  ('marketing', 'Marketing', 'website', 'Website, Landingpages, Conversion', 'test', 'Test-Agent', 'täglich 18:20',
   '[{"art":"rolle","ref":"test","name":"Test-Agent","takt":"täglich 18:20"},
     {"art":"website","ref":"Landingpages prüfen","name":"Landingpages prüfen","takt":"Website-Agent"},
     {"art":"website","ref":"Tempo & Handy","name":"Tempo & Handy","takt":"Website-Agent"},
     {"art":"routine","ref":"Markt-Recherche Webagenturen","name":"Markt-Recherche","takt":"werktags 08:10"},
     {"art":"workflow","ref":"website-check.yml","name":"Website-Check","takt":"täglich"}]',
   'proben_7d', 'Probe-Anfragen 7 T', 5, 'hoch', 'proben_7d', 'Probe-Anfragen 7 T', 20),
  ('produktion', 'Produktion', 'lead-werk', 'Lead-Werk und Kunden-Werk', 'quellen', 'Quellen-Agent', 'täglich 12:10',
   '[{"art":"rolle","ref":"quellen","name":"Quellen-Agent","takt":"täglich 12:10"},
     {"art":"workflow","ref":"lead-werk.yml","name":"Lead-Werk","takt":"alle 3 h"},
     {"art":"workflow","ref":"kunden-werk.yml","name":"Kunden-Werk","takt":"alle 2 h"},
     {"art":"workflow","ref":"proben-vorrat.yml","name":"Proben-Vorrat","takt":"stündlich"}]',
   'gruen_7d', 'grüne Leads 7 T', 3000, 'hoch', 'vorrat', 'fertige Proben im Vorrat', 30),
  ('qualitaet', 'Qualität', 'freigabe', 'Freigabe und Dauerprüfung', 'qualitaet', 'Qualitäts-Agent', 'täglich 07:50',
   '[{"art":"rolle","ref":"qualitaet","name":"Qualitäts-Agent","takt":"täglich 07:50"},
     {"art":"rolle","ref":"lead_pruefer","name":"Lead-Prüfer","takt":"stündlich :47"},
     {"art":"rolle","ref":"kaeufer_pruefer","name":"Käufer-Prüfer","takt":"stündlich :47"},
     {"art":"workflow","ref":"freigabe-stichprobe.yml","name":"Freigabe-Stichprobe","takt":"täglich"}]',
   'lead_fehler', 'Lead-Fehlerquote', null, 'runter', 'bestanden', 'Leads bestanden 24 h', 40),
  ('kundenservice', 'Kundenservice', 'antworten', 'Antworten und Lieferungen', null, 'Antwort-Assistent', 'alle 10 min',
   '[{"art":"workflow","ref":"antworten.yml","name":"Antwort-Assistent","takt":"alle 10 min"},
     {"art":"agent","ref":"9","name":"Kunden-Agenten (A9)","takt":"bei Kunden-Mail"},
     {"art":"workflow","ref":"kundenlieferung.yml","name":"Kundenlieferung","takt":"montags 07:00"}]',
   'heiss_offen', 'Kaufinteresse offen', 0, 'runter', 'heiss_offen', 'Kaufinteresse offen', 50),
  ('finanzen', 'Finanzen', 'trend-hoch', 'Umsatz, Preise, Kosten = 0', null, 'Finanz-Wache', 'Wachhund · alle 30 min',
   '[{"art":"workflow","ref":"uebergaben.py","name":"Finanz-Wache","takt":"alle 30 min"},
     {"art":"routine","ref":"Wochen-Lernnotiz + Wochenbericht","name":"Wochenbericht","takt":"werktags 07:20"},
     {"art":"workflow","ref":"stripe","name":"Stripe-Webhook","takt":"bei Zahlung"}]',
   'mrr', 'Umsatz pro Monat', null, 'hoch', 'mrr', 'Umsatz pro Monat', 60),
  ('recht', 'Recht', 'recht', 'Wache – ändert nie Regeln', null, 'Recht-Wache', 'Wachhund · alle 30 min',
   '[{"art":"workflow","ref":"uebergaben.py","name":"Recht-Wache","takt":"alle 30 min"},
     {"art":"website","ref":"Rechtstexte aktuell","name":"Rechtstexte aktuell","takt":"Website-Agent"},
     {"art":"workflow","ref":"notbremse","name":"Notbremse","takt":"alle 20 Mails"}]',
   'spam_30d', 'Spam-Beschwerden 30 T', 0, 'runter', 'spam_30d', 'Spam-Beschwerden 30 T', 70),
  ('strategie', 'Strategie', 'gehirn', 'Gehirn und Scout', null, 'Gehirn', 'stündlich',
   '[{"art":"workflow","ref":"gehirn.yml","name":"Gehirn","takt":"stündlich"},
     {"art":"routine","ref":"Meta-Review Gehirn","name":"Meta-Review","takt":"täglich 21:10"},
     {"art":"workflow","ref":"scout","name":"Quellen-Scout","takt":"alle 4 h"},
     {"art":"agent","ref":"1-8","name":"Agenten A1–A8","takt":":08 :23 :38 :53"}]',
   'kunden', 'Zahlende Kunden', null, 'hoch', 'kunden', 'zahlende Kunden', 80)
on conflict (slug) do nothing;

alter table signalwerk.agent_roles add column if not exists department text references signalwerk.departments(slug);
update signalwerk.agent_roles set department = case slug
    when 'trichter' then 'vertrieb' when 'zustellung' then 'vertrieb'
    when 'test' then 'marketing'
    when 'quellen' then 'produktion'
    when 'qualitaet' then 'qualitaet' when 'lead_pruefer' then 'qualitaet' when 'kaeufer_pruefer' then 'qualitaet' end
 where department is null and slug in ('trichter', 'zustellung', 'test', 'quellen', 'qualitaet', 'lead_pruefer', 'kaeufer_pruefer');

create table if not exists signalwerk.handoffs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  regel       text not null check (regel ~ '^[a-z_]{2,30}$'),
  von         text not null references signalwerk.departments(slug),
  an          text not null references signalwerk.departments(slug),
  schluessel  text not null unique check (char_length(schluessel) <= 120),
  titel       text not null check (char_length(titel) <= 60),
  grund       text not null check (char_length(grund) <= 160),
  market      text,
  status      text not null default 'wartet' check (status in ('wartet', 'beauftragt', 'gemeldet')),
  task_id     uuid references signalwerk.agent_tasks(id),
  push_at     timestamptz
);
create index if not exists handoffs_recent on signalwerk.handoffs (created_at desc);
create index if not exists handoffs_wartet on signalwerk.handoffs (created_at) where status = 'wartet';
alter table signalwerk.handoffs enable row level security;
revoke all on signalwerk.handoffs from anon, authenticated;
revoke delete, truncate on signalwerk.handoffs from service_role;
grant select, insert, update on signalwerk.handoffs to service_role;

-- Lage der Firma (nur lesend). Länder-Zahlen nur für p_segment × p_countries (Fokus-Tests), Umsatz/Kunden firmenweit
-- ohne Testkäufe (wie app/lib/zentrale/data.ts loadAbos: trial + Stripe-Kunde/Testnotiz = Test).
create or replace function signalwerk.firma_lage(p_segment text, p_countries text[])
returns jsonb
language sql stable set search_path = signalwerk, public as $$
  with abos as (
    select s.status, coalesce(nullif(s.amount_cents, 0) / 100.0, s.price_eur_month, 0) as betrag, s.customer_id
      from signalwerk.subscriptions s join signalwerk.customers c on c.id = s.customer_id
     where s.status in ('active', 'past_due') and c.status <> 'cancelled'
       and not (c.status = 'trial' and (c.stripe_customer_id is not null or coalesce(c.notes, '') like '%Stripe-Testmodus%'))
  ), erst as (
    select m.id, m.prospect_id, e.country, m.sent_at
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id
     where m.status = 'sent' and m.kind = 'initial' and e.segment_id = p_segment and e.country = any(p_countries)
       and m.sent_at between now() - interval '17 days' and now() - interval '3 days'
  ), plan as (
    select reasons from signalwerk.werk_plan_log where werk = 'lead-werk' order by at desc limit 1
  ), pruef as (
    select sum(geprueft) g, sum(bestanden) b from signalwerk.pruef_stats_daily
     where art = 'lead' and segment_id = p_segment and country = any(p_countries)
       and tag >= (now() at time zone 'Europe/Berlin')::date - 1
  )
  select jsonb_build_object(
    'at', now(),
    'mrr', (select coalesce(round(sum(betrag), 2), 0) from abos),
    'kunden', (select count(distinct customer_id) from abos),
    'mails_24h', (select count(*) from signalwerk.messages where status = 'sent' and sent_at >= now() - interval '24 hours'),
    'antworten_7d', (select count(*) from signalwerk.inbound_replies
                      where received_at >= now() - interval '7 days' and coalesce(intent, '') not in ('out_of_office')),
    'positiv_7d', (select count(*) from signalwerk.inbound_replies
                    where received_at >= now() - interval '7 days' and intent in ('buy', 'sample', 'question')),
    'proben_7d', (select count(*) from signalwerk.sample_requests where created_at >= now() - interval '7 days' and not coalesce(is_test, false))
               + (select count(*) from signalwerk.email_events where type = 'sample_requested' and occurred_at >= now() - interval '7 days'),
    'gruen_7d', (select coalesce(sum(value), 0) from signalwerk.kpi_daily
                  where metric = 'leads_neu' and segment_id = p_segment and country = any(p_countries)
                    and day >= (now() at time zone 'Europe/Berlin')::date - 6),
    'vorrat', (select count(*) from signalwerk.sample_stock where status = 'ready' and segment_id = p_segment and country = any(p_countries)),
    'vorrat_land', (select coalesce(jsonb_object_agg(c, (select count(*) from signalwerk.sample_stock
                                                          where status = 'ready' and segment_id = p_segment and country = c)), '{}'::jsonb)
                      from unnest(p_countries) c),
    'bestanden', (select case when g > 0 then round(b::numeric / g, 4) end from pruef),
    'bestanden_n', (select coalesce(g, 0) from pruef),
    'spam_30d', (select count(*) from signalwerk.email_events where type = 'complained' and occurred_at >= now() - interval '30 days'),
    'spam_neu', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', occurred_at) order by occurred_at desc), '[]'::jsonb)
                   from (select id, occurred_at from signalwerk.email_events
                          where type = 'complained' and occurred_at >= now() - interval '7 days' order by occurred_at desc limit 10) x),
    'heiss_offen', (select count(*) from signalwerk.inbound_replies
                     where intent = 'buy' and status in ('offen', 'spaeter') and owner_action is null),
    'heiss', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'firma', p.company_name, 'land', p.country,
                                                           'alarm', r.alert_sent_at is not null) order by r.received_at desc), '[]'::jsonb)
                from (select * from signalwerk.inbound_replies
                       where intent = 'buy' and status = 'offen' and owner_action is null
                         and received_at >= now() - interval '7 days' order by received_at desc limit 10) r
                left join signalwerk.prospects p on p.id = r.prospect_id),
    'laender', (select coalesce(jsonb_object_agg(c, jsonb_build_object(
                    'erstmails', (select count(*) from erst where country = c),
                    'antworten', (select count(*) from erst x where x.country = c and x.prospect_id is not null and (
                         exists (select 1 from signalwerk.inbound_replies r
                                  where r.prospect_id = x.prospect_id and coalesce(r.intent, '') <> 'out_of_office')
                      or exists (select 1 from signalwerk.messages m2 join signalwerk.email_events v on v.message_id = m2.id
                                  where m2.prospect_id = x.prospect_id
                                    and v.type in ('reply', 'reply_positive', 'reply_negative', 'sample_requested')))))), '{}'::jsonb)
                  from unnest(p_countries) c),
    'leer', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from plan, jsonb_each_text(plan.reasons) e(k, v)
              where v like 'Vorrat leer%'),
    'ausreisser', coalesce((select signalwerk.pruef_kpi(1) -> 'ausreisser'), '[]'::jsonb)
  );
$$;
revoke all on function signalwerk.firma_lage(text, text[]) from public, anon, authenticated;
grant execute on function signalwerk.firma_lage(text, text[]) to service_role;
