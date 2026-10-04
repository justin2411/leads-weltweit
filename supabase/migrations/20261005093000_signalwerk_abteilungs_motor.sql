-- Abteilungs-Motor (Inhaber 04.10.2026: „Lass JARVIS sich selber bauen für viele verschiedene Bereiche … er soll alles
-- nutzen und dafür Agenten haben, damit er Umsatz vergrößert“). Nicht destruktiv: zwei neue Tabellen, eine Sicht, fünf
-- neue Fach-Agenten nur, wenn es sie noch nicht gibt (on conflict do nothing), nichts gelöscht, keine Löschrechte.
--   department_gaps   je Abteilung: Ziel vs. Ist, Lücke 0–1, Gewicht (Umsatznähe), Rang und der nächste Motor-Auftrag
--                     (scripts/abteilungen_motor.py schreibt, Büro /dashboard/firma/[bereich] liest)
--   agent_roles       Kundenservice-, Finanz-, Recht-, Strategie- und Premium-Agent: jede Abteilung hat einen Agenten
--   dashboard_bereiche  jede Dashboard-Seite → Abteilung
--   abteilung_luecken   Sicht fürs Dashboard: bereich, ziel, ist, soll, luecke_pct, naechster_auftrag, agenten, seiten

create table if not exists signalwerk.department_gaps (
  slug        text primary key references signalwerk.departments(slug),
  ziel_key    text not null default '',
  ist         numeric,
  soll        numeric,
  richtung    text not null default 'hoch' check (richtung in ('hoch', 'runter')),
  luecke      numeric check (luecke is null or (luecke >= 0 and luecke <= 1)),
  gewicht     numeric not null default 0.5 check (gewicht >= 0 and gewicht <= 1),
  rang        smallint,
  titel       text check (titel is null or char_length(titel) <= 60),
  grund       text check (grund is null or char_length(grund) <= 160),
  task_id     uuid references signalwerk.agent_tasks(id),
  modus       text not null default 'anzeigen' check (modus in ('anzeigen', 'auftrag')),
  updated_at  timestamptz not null default now()
);
alter table signalwerk.department_gaps enable row level security;
revoke all on signalwerk.department_gaps from anon, authenticated;
revoke delete, truncate on signalwerk.department_gaps from service_role;
grant select, insert, update on signalwerk.department_gaps to service_role;

insert into signalwerk.agent_roles (slug, name, gruppe, typ, rolle, kennzahl, richtung, einheit, gut, knapp, min_n, takt,
                                    werkzeuge, grenzen, auftrag, sort, department)
values
  ('kundenservice', 'Kundenservice-Agent', 'testing', 'llm',
   'Bereitet Antworten auf Kaufinteresse und Fragen vor, Probe aus dem Vorrat',
   'offene Kaufinteressen', 'tief', 'zahl', 0, 1, 1, 'bei Motor-Auftrag',
   array['inbound_replies', 'sample_stock', 'antworten-Cockpit'],
   array['nie selbst senden, nie Preise oder Zusagen', 'Abmeldungen immer sperren', 'nur S2 × US/UK/FR'],
   'Kundenservice-Agent: offene Antworten mit Kaufinteresse oder Frage (inbound_replies) lesen, je Antwort passende Probe aus dem Vorrat und einen kurzen Antwort-Entwurf (draft_text) vorbereiten. Der Inhaber sendet. Ergebnis kurz mit Zahl.',
   80, 'kundenservice'),
  ('finanzen', 'Finanz-Agent', 'testing', 'llm',
   'Misst den Weg Probe → Buchung → Abo und nennt den größten Umsatz-Hebel',
   'Umsatz pro Monat', 'hoch', 'zahl', 1290, 249, 1, 'bei Motor-Auftrag',
   array['firma_lage', 'subscriptions', 'web_funnel (dashboard_cache)', 'brain_knowledge.py add'],
   array['nie Preise, Rechnungen oder Zahlungen ändern', 'keine Kosten', 'nur messen und vorschlagen'],
   'Finanz-Agent: Weg Probe → Tarifseite → Stripe → Abo für Webagenturen US/UK/FR messen (7/30 Tage), den Schritt mit dem größten Verlust benennen und genau einen Vorschlag als Wissensnotiz anlegen. Preise ändert nur das Gehirn nach seinen Regeln.',
   90, 'finanzen'),
  ('recht', 'Recht-Agent', 'qualitaet', 'llm',
   'Prüft Spam-Signale, Abmeldelink und Pflichtangaben – meldet, ändert keine Regeln',
   'Spam-Beschwerden 30 T', 'tief', 'zahl', 0, 1, 1, 'bei Motor-Auftrag',
   array['email_events', 'suppression (nur lesen)', 'docs/KALTMAIL-RECHT.md'],
   array['Länder, Sperrliste, Abmeldung, Notbremse und Freigabe nie ändern', 'nur lesen und melden'],
   'Recht-Agent: Spam-Beschwerden und Abmeldungen der letzten 30 Tage je Postfach und Text lesen, Pflichtfußzeile und Abmeldelink in den Vorlagen prüfen. Ursache in 1 Satz, Fund als Wissensnotiz; Regeln ändert nur der Inhaber.',
   100, 'recht'),
  ('strategie', 'Strategie-Agent', 'testing', 'llm',
   'Wählt aus allen Abteilungen den stärksten Hebel Richtung zahlende Kunden',
   'zahlende Kunden', 'hoch', 'zahl', 10, 1, 1, 'bei Motor-Auftrag',
   array['firma_lage', 'company_goals', 'department_gaps', 'decisions'],
   array['nur S2 × US/UK/FR', 'eine Sache je Test', 'nie Versand, Länder, Sperrliste, Notbremse, Freigabe, Kosten'],
   'Strategie-Agent: Lücken aller Abteilungen (department_gaps) und Ziele lesen, den einen Hebel mit der größten Wirkung auf zahlende Kunden wählen und als Entscheidung (decisions, kurz) festhalten oder an die passende Abteilung als Auftrag geben.',
   110, 'strategie')
on conflict (slug) do nothing;

-- Premium-Labor bekommt einen eigenen Fach-Agenten, falls es die Abteilung gibt (sonst nichts)
insert into signalwerk.agent_roles (slug, name, gruppe, typ, rolle, kennzahl, richtung, einheit, gut, knapp, min_n, takt,
                                    werkzeuge, grenzen, auftrag, sort, department)
select 'premium', 'Premium-Agent', 'qualitaet', 'llm',
       'Findet und bewertet Premium-Leads für Webagenturen und belegt ihren Wert',
       'Premium-Leads 7 T', 'hoch', 'zahl', 50, 10, 1, 'bei Motor-Auftrag',
       array['leads', 'lead_checks', 'release_gate'],
       array['nur S2 × US/UK/FR', 'Drei-Stufen-Freigabe nie umgehen', 'keine Kosten, nichts löschen'],
       'Premium-Agent: unter den freigegebenen S2-Leads US/UK/FR die mit dem stärksten Anlass finden, ihren Wert mit Quelle und Datum belegen und als Wissensnotiz festhalten. Freigabe und Prüfregeln bleiben unverändert.',
       120, 'premium_labor'
 where exists (select 1 from signalwerk.departments where slug = 'premium_labor')
on conflict (slug) do nothing;

-- Jede Dashboard-Bereichsseite gehört zu genau einer Abteilung (die Oberfläche liest das für „Wer kümmert sich?“).
create table if not exists signalwerk.dashboard_bereiche (
  seite       text primary key check (seite ~ '^[a-z][a-z0-9-]{1,40}$'),
  department  text not null references signalwerk.departments(slug),
  updated_at  timestamptz not null default now()
);
alter table signalwerk.dashboard_bereiche enable row level security;
revoke all on signalwerk.dashboard_bereiche from anon, authenticated;
revoke delete, truncate on signalwerk.dashboard_bereiche from service_role;
grant select, insert, update on signalwerk.dashboard_bereiche to service_role;

insert into signalwerk.dashboard_bereiche (seite, department) values
  ('versand', 'vertrieb'), ('vertrieb', 'vertrieb'), ('kontakte', 'vertrieb'),
  ('website', 'marketing'), ('proben', 'marketing'),
  ('werke', 'produktion'), ('bestand', 'produktion'), ('speicher', 'produktion'), ('baukasten', 'produktion'),
  ('liste', 'produktion'),
  ('betrieb', 'qualitaet'), ('protokoll', 'qualitaet'),
  ('antworten', 'kundenservice'), ('kunden', 'kundenservice'), ('kunden-agenten', 'kundenservice'),
  ('finanzen', 'finanzen'),
  ('recht', 'recht'),
  ('jarvis', 'strategie'), ('firma', 'strategie'), ('gehirn', 'strategie'), ('ziele', 'strategie'),
  ('regler', 'strategie'), ('hilfe', 'strategie'), ('zentrale', 'strategie')
on conflict (seite) do nothing;

-- Live-Sicht für das Dashboard: Abteilung, Ziel, Ist, Lücke in %, nächster Auftrag, zuständige Agenten und Seiten
create or replace view signalwerk.abteilung_luecken with (security_invoker = true) as
select d.slug                                   as bereich,
       d.name                                   as name,
       d.ziel_titel                             as ziel,
       g.soll,
       g.ist,
       g.richtung,
       case when g.luecke is null then null else round(g.luecke * 100) end as luecke_pct,
       g.rang,
       g.titel                                  as naechster_auftrag,
       g.grund,
       t.status                                 as auftrag_status,
       case when t.agent is null then null else 'A' || t.agent end as auftrag_agent,
       g.modus,
       coalesce((select array_agg(r.slug order by r.sort) from signalwerk.agent_roles r
                  where r.department = d.slug and r.aktiv), '{}')                   as agenten,
       coalesce((select array_agg(b.seite order by b.seite) from signalwerk.dashboard_bereiche b
                  where b.department = d.slug), '{}')                               as seiten,
       g.updated_at
  from signalwerk.departments d
  left join signalwerk.department_gaps g on g.slug = d.slug
  left join signalwerk.agent_tasks t on t.id = g.task_id
 where d.aktiv;
revoke all on signalwerk.abteilung_luecken from anon, authenticated;
grant select on signalwerk.abteilung_luecken to service_role;
