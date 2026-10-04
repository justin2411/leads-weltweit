-- Abteilungs-Motor (Inhaber 04.10.2026: „Lass JARVIS sich selber bauen für viele verschiedene Bereiche … er soll alles
-- nutzen und dafür Agenten haben, damit er Umsatz vergrößert“). Nicht destruktiv: eine neue Tabelle, vier neue
-- Fach-Agenten nur, wenn es sie noch nicht gibt (on conflict do nothing), nichts gelöscht, keine Löschrechte.
--   department_gaps   je Abteilung: Ziel vs. Ist, Lücke 0–1, Gewicht (Umsatznähe), Rang und der nächste Motor-Auftrag
--                     (scripts/abteilungen_motor.py schreibt, Büro /dashboard/firma/[bereich] liest)
--   agent_roles       Kundenservice-, Finanz-, Recht- und Strategie-Agent: jede Abteilung hat mindestens einen Agenten

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
