-- JARVIS-Zentrale, Teil 2 (nur additiv): neue Seite „Büro“ gehört zur Strategie; der Bereich Premium-Labor steht
-- jetzt auch in den Repo-Migrationen (bisher nur in der Datenbank, siehe PR #382). Nichts wird überschrieben.
insert into signalwerk.departments (slug, name, icon, zweck, leitung_name, leitung_takt, aktiv, mitglieder,
                                    ziel_key, ziel_titel, ziel_richtung, wirkung_key, wirkung_titel, sort)
values ('premium_labor', 'Premium-Labor', 'gehirn', 'Premium-Leads finden, bewerten, ihren Wert belegen – lernt ständig',
        'Premium-Labor', 'alle 2 h :10', true,
        '[{"art": "routine", "ref": "Premium-Labor", "name": "Premium-Labor", "takt": "alle 2 h :10"},
          {"art": "routine", "ref": "Quellen-Scout Premium-Jagd", "name": "Scout Premium-Jagd", "takt": "stündlich :40"},
          {"art": "workflow", "ref": "lead-werk.yml", "name": "Lead-Werk", "takt": "alle 3 h"}]'::jsonb,
        'premium_leads_7d', 'Premium-Leads 7 T', 'hoch', 'premium_anteil', 'Premium-Anteil in Proben', 15)
on conflict (slug) do nothing;

insert into signalwerk.dashboard_bereiche (seite, department) values
  ('buero', 'strategie')
on conflict (seite) do nothing;
