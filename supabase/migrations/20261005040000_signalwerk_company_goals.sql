-- Unternehmensziele (Inhaber 04.10.2026: JARVIS als Kommandozentrale, „wie in einem unternehmen alles steuern und
-- regeln“). Soll-Werte je Ziel; der Ist-Wert wird beim Anzeigen aus den echten Zahlen gerechnet (app/lib/zentrale/ziele.ts).
-- Nicht destruktiv: eine neue Tabelle mit Startwerten als Vorschlag (quelle = 'vorschlag'). Nur der Inhaber ändert
-- Soll-Werte im Dashboard (/dashboard/ziele, „Übernehmen“ → quelle = 'inhaber'); das Gehirn und JARVIS lesen nur.
-- Keine Löschrechte, nichts gelöscht. RLS an, Zugriff nur serverseitig mit dem Service-Schlüssel.

create table if not exists signalwerk.company_goals (
  key         text primary key check (key ~ '^[a-z_]{2,40}$'),
  titel       text not null check (char_length(titel) <= 60),
  einheit     text not null default '' check (char_length(einheit) <= 12),
  soll        numeric not null check (soll >= 0 and soll <= 1000000000),
  richtung    text not null default 'hoch' check (richtung in ('hoch', 'runter')),
  sort        int not null default 0,
  quelle      text not null default 'vorschlag' check (quelle in ('vorschlag', 'inhaber')),
  updated_at  timestamptz not null default now(),
  updated_by  text not null default 'Startwert'
);
comment on table signalwerk.company_goals is
  'Unternehmensziele (Soll); Ist rechnet app/lib/zentrale/ziele.ts. Ändern nur Inhaber über /dashboard/ziele.';

alter table signalwerk.company_goals enable row level security;

insert into signalwerk.company_goals (key, titel, einheit, soll, richtung, sort) values
  ('mrr',           'Umsatz pro Monat (MRR)',  '£/$/€', 1290, 'hoch',   10),
  ('kunden',        'Zahlende Kunden',         '',        10, 'hoch',   20),
  ('antwortquote',  'Antwortquote',            '%',        3, 'hoch',   30),
  ('lead_fehler',   'Lead-Fehlerquote',        '%',        2, 'runter', 40),
  ('gruen_uk',      'Grüne Leads/Woche UK',    '',      1000, 'hoch',   50),
  ('gruen_fr',      'Grüne Leads/Woche FR',    '',      1000, 'hoch',   60)
on conflict (key) do nothing;
