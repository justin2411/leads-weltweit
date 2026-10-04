-- Tests nur Webagenturen US/UK/FR (Inhaber 04.10.2026: „beim gehirn bei a/b tests soll er das nur für webagencys usa,
-- fr, und uk machen nichts mehr erst wenn ich ihm das freigebe“). Experimente außerhalb der Freigabe-Liste
-- (config/fokus.yaml tests) ruhen mit Status 'paused' – nichts wird gelöscht, Grund steht in decisions.
-- Freigabe durch den Inhaber: Segment/Land in config/fokus.yaml tests aufnehmen, Experiment wieder auf 'running'.
alter table signalwerk.experiments drop constraint if exists experiments_status_check;
alter table signalwerk.experiments add constraint experiments_status_check
  check (status in ('planned', 'running', 'measuring', 'done', 'paused'));
