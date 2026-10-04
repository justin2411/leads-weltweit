-- Fach-Agenten (Inhaber 04.10.2026: „Welche agenten machen sinn bei gehirn testing und bei leadqualität. Bau die bitte
-- direkt in jarvis alle rein“ + „Bei Lead-Qualität mehrere Agenten … Massenprüfung immer token-frei“).
-- Nicht destruktiv: neue Tabelle, neue optionale Spalte, eine lesende Funktion, Routinen nur angelegt, wenn es sie
-- unter dem Namen noch nicht gibt (bestehende werden wiederverwendet, nichts gelöscht, keine Löschrechte).
--   agent_roles          feste Fach-Agenten mit Rolle, Ziel-Kennzahl (+ Ampel-Schwellen), Takt, Werkzeugen, Grenzen.
--                        typ 'llm' = Claude-Sitzung über eine Gehirn-Routine (brain_routines → agent_tasks, kind 'gehirn'),
--                        typ 'python' = token-freier Dauerlauf (Workflow), ohne Routine.
--   agent_tasks.rolle    Auftrag gehört zu diesem Fach-Agenten (Routine oder „Jetzt beauftragen“ in JARVIS)
--   agent_role_kpi()     Tageswerte k/n je Fach-Agent (deutscher Kalendertag) für Kennzahl, Ampel und 7-Tage-Trend

create table if not exists signalwerk.agent_roles (
  slug         text primary key check (slug ~ '^[a-z][a-z_]{1,30}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 40),
  gruppe       text not null check (gruppe in ('testing', 'qualitaet')),
  typ          text not null default 'llm' check (typ in ('llm', 'python')),
  rolle        text not null check (char_length(btrim(rolle)) between 5 and 120),
  kennzahl     text not null check (char_length(btrim(kennzahl)) between 2 and 40),
  richtung     text not null default 'hoch' check (richtung in ('hoch', 'tief')),   -- hoch = mehr ist besser
  einheit      text not null default 'quote' check (einheit in ('quote', 'zahl')),
  gut          numeric not null,       -- Ampel grün ab (hoch) bzw. bis (tief)
  knapp        numeric not null,       -- Ampel gelb ab/bis, sonst rot
  min_n        numeric not null default 20,   -- darunter grau („keine Basis“)
  takt         text not null check (char_length(takt) <= 60),
  werkzeuge    text[] not null default '{}',
  grenzen      text[] not null default '{}',
  auftrag      text not null check (char_length(btrim(auftrag)) between 10 and 800),
  routine_id   uuid references signalwerk.brain_routines(id),
  sort         smallint not null default 0,
  aktiv        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create or replace trigger agent_roles_touch before update on signalwerk.agent_roles
  for each row execute function signalwerk.touch_updated_at();
alter table signalwerk.agent_roles enable row level security;
revoke all on signalwerk.agent_roles from anon, authenticated;
revoke delete, truncate on signalwerk.agent_roles from service_role;
grant select, insert, update on signalwerk.agent_roles to service_role;

alter table signalwerk.agent_tasks add column if not exists rolle text references signalwerk.agent_roles(slug);
create index if not exists agent_tasks_rolle on signalwerk.agent_tasks (rolle, created_at desc) where rolle is not null;

-- Routinen der LLM-Fach-Agenten (deutsche Zeit). Bestehende gleichen Namens bleiben, wie sie sind.
insert into signalwerk.brain_routines (name, aufgabe, uhrzeit, tage, dauer_min, created_by)
select v.name, v.aufgabe, v.uhrzeit, 'taeglich', v.dauer, 'Fach-Agenten'
  from (values
    ('A/B-Prüfung Webagenturen', 'Test-Agent: A/B-Tests (ab.py) für Webagenturen US/UK/FR prüfen, Gewinner nur bei Mindestmenge und ≥ 95 % übernehmen, nächsten Test am Engpass vorschlagen.', '18:20', 20),
    ('KPI-Diagnose mit Engpass', 'Trichter-Agent: Kohorten (cohort_funnel) für Webagenturen US/UK/FR messen, schwächsten Schritt mit Zahlen nennen und dem Test-Agenten als Testgegenstand geben.', '07:40', 15),
    ('Qualität: Ausreißer des Tages', 'Qualitäts-Agent: Tageszusammenfassung der token-freien Prüfer, Freigabe-Stichprobe und harte Bounces je Quelle; nur Ausreißer auswerten, Ursache beheben.', '07:50', 15),
    ('Zustellung prüfen', 'Zustell-Agent: deliverability_daily, Bounce-Klassen je Postfach und Spam-Signale auswerten; Maßnahmen innerhalb der Limits vorschlagen.', '06:30', 10),
    ('Quellen und Vorrat', 'Quellen-Agent: Vorrat je Linie („Vorrat leer“) und grüne Leads je Platz-Stunde in US/UK/FR prüfen; neue kostenlose Quellen nach Scout-Regeln testen.', '12:10', 20)
  ) as v(name, aufgabe, uhrzeit, dauer)
 where not exists (select 1 from signalwerk.brain_routines r where r.name = v.name);

-- Test-Agent täglich (Inhaber-Auftrag 04.10.2026: „Test-Agent täglich 18:20“)
update signalwerk.brain_routines set tage = 'taeglich', wochentage = '{}'
 where name = 'A/B-Prüfung Webagenturen' and tage <> 'taeglich';

insert into signalwerk.agent_roles (slug, name, gruppe, typ, rolle, kennzahl, richtung, einheit, gut, knapp, min_n, takt,
                                    werkzeuge, grenzen, auftrag, sort)
values
  ('test', 'Test-Agent', 'testing', 'llm',
   'Führt A/B-Tests: startet, prüft Mindestmenge, übernimmt Gewinner',
   'Antwortquote', 'hoch', 'quote', 0.03, 0.01, 50, 'täglich 18:20',
   array['scripts/ab.py', 'lib/ab.py', 'brain_routines.py auftrag', 'brain_knowledge.py add'],
   array['nur S2 × US/UK/FR (fokus.yaml tests)', 'eine Sache je Test', 'Gewinner nur ab Mindestmenge und ≥ 95 %', 'nie Versand, Sperrliste, Notbremse, Freigabe'],
   'Test-Agent: ab.py liste/auswerten für Webagenturen US/UK/FR. Laufende Tests: Mindestmenge und Signifikanz prüfen, Gewinner in 1 Satz erklären und übernehmen. Ohne laufenden Test: den Testgegenstand des Trichter-Agenten als Entwurf anlegen (eine Sache je Test). Ergebnis kurz mit Zahlen.',
   10),
  ('trichter', 'Trichter-Agent', 'testing', 'llm',
   'Misst Kohorten, findet den schwächsten Schritt für den nächsten Test',
   'Engpass-Quote', 'hoch', 'quote', 0.03, 0.01, 50, 'täglich 07:40',
   array['cohort_funnel', 'ab.py trichter', 'kpi_daily', 'brain_knowledge.py add'],
   array['nur S2 × US/UK/FR', 'nur messen und benennen, nichts umstellen'],
   'Trichter-Agent: cohort_funnel (S2, US/UK/FR) auswerten, schwächsten reifen Schritt je Land mit Zahlen nennen, Ursache vermuten und genau einen Testgegenstand für den Test-Agenten formulieren (Wissensnotiz trichter-engpass).',
   20),
  ('qualitaet', 'Qualitäts-Agent', 'qualitaet', 'llm',
   'Wertet nur Ausreißer und die Tageszusammenfassung der Prüfer aus',
   'Fehlerquote Stichprobe', 'tief', 'quote', 0.02, 0.05, 50, 'täglich 07:50',
   array['lead_checks', 'freigabe.py stichprobe', 'bounce_stats', 'pruef_stats_daily'],
   array['Drei-Stufen-Freigabe nie lockern', 'Ursachen in Quelle/Feld beheben, nie Prüfregel aufweichen', 'Massenprüfung macht der Python-Prüfer'],
   'Qualitäts-Agent: Tageszusammenfassung der token-freien Lead- und Käufer-Prüfer, Freigabe-Stichprobe (Fehlerquote je Land) und harte Bounces je Quelle lesen. Nur Ausreißer untersuchen: fehlerhafte Quelle/Feld finden, Ursache beheben (PR) – die Freigabe nie lockern.',
   30),
  ('lead_pruefer', 'Lead-Prüfer', 'qualitaet', 'python',
   'Prüft Leads laufend nach (Drei-Stufen-Freigabe), ohne Tokens',
   'bestanden', 'hoch', 'quote', 0.95, 0.9, 20, 'Dauerlauf (dauerpruefung.yml)',
   array['scripts/lib/release_gate.py', 'dauerpruefung.yml'],
   array['ohne Tokens (reines Python)', 'Freigabe nie lockern', 'nichts löschen, nur held + Grund'],
   'Lead-Prüfer (token-frei): läuft über dauerpruefung.yml. Ein Auftrag bedeutet nur: Lauf und Statistik prüfen, bei Fehlern Ursache im Code beheben.',
   40),
  ('kaeufer_pruefer', 'Käufer-Prüfer', 'qualitaet', 'python',
   'Prüft Käufer laufend nach (Mail, Rechtsform, Sperrliste), ohne Tokens',
   'bestanden', 'hoch', 'quote', 0.9, 0.8, 20, 'Dauerlauf (dauerpruefung.yml)',
   array['outreach.py check', 'dauerpruefung.yml'],
   array['ohne Tokens (reines Python)', 'Prüfregeln und Sperrliste unverändert', 'nichts löschen'],
   'Käufer-Prüfer (token-frei): läuft über dauerpruefung.yml. Ein Auftrag bedeutet nur: Lauf und Statistik prüfen, bei Fehlern Ursache im Code beheben.',
   50),
  ('zustellung', 'Zustell-Agent', 'qualitaet', 'llm',
   'Beobachtet Bounces je Postfach und Spam-Signale, schlägt Maßnahmen vor',
   'Bounce-Quote', 'tief', 'quote', 0.02, 0.05, 50, 'täglich 06:30',
   array['zustellbarkeit.py', 'deliverability_daily', 'bounce_stats', 'imap_boxes'],
   array['Menge je Postfach nur innerhalb der Limits', 'Notbremse und Sperrliste unverändert', 'nie Versand einschalten'],
   'Zustell-Agent: deliverability_daily und Bounce-Klassen je Postfach (7 Tage) lesen, Spam-Signale und Blocklisten prüfen. Ursache nennen und 1 Maßnahme innerhalb der Limits vorschlagen (z. B. Menge je Postfach senken); ist die Quote > 5 %, nur melden.',
   60),
  ('quellen', 'Quellen-Agent', 'qualitaet', 'llm',
   'Hält den Vorrat je Linie voll und testet neue kostenlose Quellen',
   'grüne Leads/Platz-Std.', 'hoch', 'zahl', 20, 5, 1, 'täglich 12:10',
   array['run_stats', 'werk-linien.json', 'docs/QUELLEN-SCOUT.md', 'scripts/extraktor'],
   array['nur erlaubte Quellen, robots.txt', 'neue Länder/Quellen nur nach Scout-Regeln', 'keine Kosten'],
   'Quellen-Agent: Linien mit „Vorrat leer“ und grüne Leads je Platz-Stunde für US/UK/FR (run_stats lead-werk, 7 Tage) prüfen. Schwache Linie: Ursache finden, Quelle verbessern oder neue kostenlose Quelle nach Scout-Regeln testen und einbinden.',
   70)
on conflict (slug) do nothing;

-- Routinen verknüpfen (nur wenn noch keine gesetzt ist)
update signalwerk.agent_roles a set routine_id = r.id
  from signalwerk.brain_routines r
 where a.routine_id is null and r.name = case a.slug
   when 'test' then 'A/B-Prüfung Webagenturen'
   when 'trichter' then 'KPI-Diagnose mit Engpass'
   when 'qualitaet' then 'Qualität: Ausreißer des Tages'
   when 'zustellung' then 'Zustellung prüfen'
   when 'quellen' then 'Quellen und Vorrat' end;

-- Tageswerte je Fach-Agent: k / n je deutschem Kalendertag (Webagenturen, Fokus-Länder).
--   test        n = Erstmails, k = davon mit menschlicher Antwort (wie cohort_funnel)
--   zustellung  n = gesendete Mails (Erst + Nachfass), k = davon mit Bounce
--   qualitaet   n = geprüfte Leads der Freigabe-Stichprobe (run_stats 'stichprobe'), k = nicht freigegeben
--   quellen     n = Platz-Stunden des Lead-Werks, k = grüne Leads (Wert = k/n)
create or replace function signalwerk.agent_role_kpi(p_segment text, p_countries text[], p_days int default 14)
returns table (rolle text, day date, k numeric, n numeric)
language sql stable set search_path = signalwerk, public as $$
  with lim as (
    select ((now() at time zone 'Europe/Berlin')::date - greatest(p_days, 1) + 1) as d0
  ), sent as (
    select m.id, m.prospect_id, m.kind, (m.sent_at at time zone 'Europe/Berlin')::date as day
      from signalwerk.messages m join signalwerk.experiments e on e.id = m.experiment_id, lim
     where m.status = 'sent' and m.sent_at is not null and e.segment_id = p_segment and e.country = any(p_countries)
       and (m.sent_at at time zone 'Europe/Berlin')::date >= lim.d0
  )
  select 'test'::text, s.day,
         count(*) filter (where exists (select 1 from signalwerk.messages m2 join signalwerk.email_events x on x.message_id = m2.id
                                         where m2.prospect_id = s.prospect_id
                                           and x.type in ('reply', 'reply_positive', 'reply_negative', 'sample_requested'))
                             or exists (select 1 from signalwerk.inbound_replies r
                                         where r.prospect_id = s.prospect_id and coalesce(r.intent, '') <> 'out_of_office'))::numeric,
         count(*)::numeric
    from sent s where s.kind = 'initial' and s.prospect_id is not null group by s.day
  union all
  select 'zustellung', s.day,
         count(*) filter (where exists (select 1 from signalwerk.email_events x where x.message_id = s.id and x.type = 'bounced'))::numeric,
         count(*)::numeric
    from sent s group by s.day
  union all
  select 'qualitaet', (coalesce(r.finished_at, r.started_at) at time zone 'Europe/Berlin')::date,
         sum(greatest(coalesce(r.processed, 0) - coalesce(r.green, 0), 0))::numeric, sum(coalesce(r.processed, 0))::numeric
    from signalwerk.run_stats r, lim
   where r.werk = 'stichprobe' and r.segment_id = p_segment and r.country = any(p_countries)
     and coalesce(r.finished_at, r.started_at) is not null
     and (coalesce(r.finished_at, r.started_at) at time zone 'Europe/Berlin')::date >= lim.d0
   group by 2
  union all
  select 'quellen', (r.finished_at at time zone 'Europe/Berlin')::date,
         sum(coalesce(r.green, 0))::numeric,
         round((sum(extract(epoch from (r.finished_at - r.started_at))) / 3600.0)::numeric, 2)
    from signalwerk.run_stats r, lim
   where r.werk = 'lead-werk' and r.segment_id = p_segment and r.country = any(p_countries)
     and r.started_at is not null and r.finished_at > r.started_at
     and (r.finished_at at time zone 'Europe/Berlin')::date >= lim.d0
   group by 2;
$$;

revoke all on function signalwerk.agent_role_kpi(text, text[], int) from public, anon, authenticated;
grant execute on function signalwerk.agent_role_kpi(text, text[], int) to service_role;
