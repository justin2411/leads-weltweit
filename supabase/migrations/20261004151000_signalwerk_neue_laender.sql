-- Neue Mail-Länder für Webagenturen (S2): FI, SG, HK, MX, BR (Inhaber 04.10.2026: „nimm also auch andere länder mit
-- auf die passend sind“, Rechts-Tabelle docs/KALTMAIL-RECHT.md; Tests in docs/QUELLEN-SCOUT.md). Nicht destruktiv:
-- Länder an segments.email_countries anhängen, je Land ein geplantes Experiment (ohne automatische Versandfreigabe).
update signalwerk.segments
   set email_countries = (select array_agg(distinct c order by c)
                            from unnest(coalesce(email_countries, '{}') || array['FI','SG','HK','MX','BR']) as c)
 where id = 'S2';

insert into signalwerk.experiments (segment_id, country, variant, hypothesis, message_notes, planned_count, status)
select 'S2', x.country, 'v1', x.hypothesis, x.notes, 50, 'planned'
  from (values
    ('FI', 'Kleine Webagenturen (Oy/Oyj) in Finnland reagieren positiv auf eine kostenlose Probe mit Firmen ohne Website aus ganz Finnland.',
     'Englisch; nur Kapitalgesellschaften und allgemeine Adressen; neue Länder 04.10.2026'),
    ('SG', 'Kleine Webagenturen in Singapur reagieren positiv auf eine kostenlose Probe mit Firmen ohne Website aus ganz Singapur.',
     'Englisch; Betreff mit „<ADV> “ (Spam Control Act); neue Länder 04.10.2026'),
    ('HK', 'Kleine Webagenturen in Hongkong reagieren positiv auf eine kostenlose Probe mit Firmen ohne Website aus ganz Hongkong.',
     'Englisch, Abmeldehinweis auch Chinesisch (UEMO); neue Länder 04.10.2026'),
    ('MX', 'Kleine Webagenturen in Mexiko reagieren positiv auf eine kostenlose Probe mit Firmen ohne Website aus ganz Mexiko.',
     'Spanisch; neue Länder 04.10.2026'),
    ('BR', 'Kleine Webagenturen in Brasilien reagieren positiv auf eine kostenlose Probe mit Firmen ohne Website aus ganz Brasilien.',
     'Portugiesisch; berechtigtes Interesse nach LGPD dokumentiert (countries.yaml); neue Länder 04.10.2026')
  ) as x(country, hypothesis, notes)
 where not exists (select 1 from signalwerk.experiments e
                    where e.segment_id = 'S2' and e.country = x.country and e.variant = 'v1');
