-- Test der Vorrats-Funktionen (Migration 20261003150000): reservieren, keine Doppelvergabe, Sperre, Verfall,
-- Nachprüfung beim Abruf. Läuft in der CI nach den Migrationen; alles in einer Transaktion, am Ende zurückgerollt.
begin;
insert into signalwerk.segments (id, name) values ('SX', 'Test') on conflict do nothing;
insert into signalwerk.watch_companies (id, name, country)
  select ('00000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'Firma ' || g, 'US'
  from generate_series(1, 12) g;
insert into signalwerk.leads (id, company_id, segment_id, country, signal_type, event_summary, event_date, source_name,
                              source_date, urgency, urgency_reason, opener, status)
  select ('10000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
         ('00000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
         'SX', 'US', 'no_website', 'x', current_date, 's', current_date, 'high', 'r', 'o', 'new'
  from generate_series(1, 12) g;
insert into signalwerk.sample_requests (id, company_name, email, segment_id, country, consent_text, consent_at, status)
  values ('20000000-0000-0000-0000-000000000001', 'A', 'a@b.com', 'SX', 'US', 'c', now(), 'new'),
         ('20000000-0000-0000-0000-000000000002', 'B', 'b@b.com', 'SX', 'US', 'c', now(), 'new');

create function pg_temp.stock(p_order text, p_path text, p_wish jsonb default '[]', p_match jsonb default '{}')
returns uuid language sql as $$
  select signalwerk.add_sample_stock(jsonb_build_object('segment_id', 'SX', 'country', 'US', 'lang', 'en',
    'wish', p_wish, 'wish_match', p_match,
    'lead_ids', (select jsonb_agg(id) from (select id from signalwerk.leads where segment_id = 'SX'
                  order by case when p_order = 'asc' then id end, id desc limit 10) x),
    'company_ids', (select jsonb_agg(company_id) from (select id, company_id from signalwerk.leads where segment_id = 'SX'
                  order by case when p_order = 'asc' then id end, id desc limit 10) x),
    'score', 5, 'storage_path', p_path, 'subject', 's', 'expires_at', (now() + interval '48 hours')::text))
$$;

-- Drei-Stufen-Freigabe (Migration 20261004000000): Probe gilt erst als abrufbar, wenn alle 10 Leads freigegeben sind
create function pg_temp.release(p_path text) returns void language sql as $$
  insert into signalwerk.lead_checks (lead_id, result, context)
    select unnest(lead_ids), 'released', 'test' from signalwerk.sample_stock where storage_path = p_path
  on conflict (lead_id) do update set result = 'released', checked_at = now();
  select signalwerk.mark_sample_stock_checked(id) from signalwerk.sample_stock where storage_path = p_path;
$$;

do $$
declare n int; ok boolean; got record;
begin
  -- 1) genau 10 reserviert
  perform pg_temp.stock('asc', 'a.json', '["no_website"]', '{"no_website": 10}');
  perform pg_temp.release('a.json');
  select count(*) into n from signalwerk.leads where segment_id = 'SX' and status = 'reserved';
  assert n = 10, format('reserviert %s statt 10', n);

  -- 2) dieselben Leads nie in einer zweiten Probe (alles oder nichts)
  begin
    perform pg_temp.stock('asc', 'b.json');
    raise exception 'doppelt erlaubt';
  exception when others then
    assert sqlerrm like 'Leads nicht mehr frei%', sqlerrm;
  end;
  select count(*) into n from signalwerk.sample_stock;
  assert n = 1, 'zweite Probe angelegt';

  -- 3) Sperre je Anfrage
  ok := signalwerk.lock_sample_request('20000000-0000-0000-0000-000000000001');
  assert ok, 'erste Sperre';
  ok := signalwerk.lock_sample_request('20000000-0000-0000-0000-000000000001');
  assert not ok, 'zweite Sperre erlaubt';

  -- 4) Vergabe: eine Probe nur einmal
  select * into got from signalwerk.claim_sample_stock('SX', 'US', '{no_website}', '20000000-0000-0000-0000-000000000001');
  assert got.storage_path = 'a.json', 'falsche Probe';
  select count(*) into n from signalwerk.claim_sample_stock('SX', 'US', '{}', '20000000-0000-0000-0000-000000000002');
  assert n = 0, 'Probe doppelt vergeben';

  -- 5) gesendet: Leads endgültig vergeben, Anfrage sent
  perform signalwerk.finish_sample_stock(got.id, true, false, 're_1', null);
  select count(*) into n from signalwerk.leads where segment_id = 'SX' and status = 'sample';
  assert n = 10, 'Leads nicht als sample markiert';
  assert (select status from signalwerk.sample_requests where id = '20000000-0000-0000-0000-000000000001') = 'sent';

  -- 6) Resend lehnt ab: Probe wieder bereit, Sperre frei
  update signalwerk.leads set status = 'new' where segment_id = 'SX';
  perform pg_temp.stock('desc', 'c.json');
  perform pg_temp.release('c.json');
  perform signalwerk.lock_sample_request('20000000-0000-0000-0000-000000000002');
  select * into got from signalwerk.claim_sample_stock('SX', 'US', '{}', '20000000-0000-0000-0000-000000000002');
  perform signalwerk.finish_sample_stock(got.id, false, true, null, 'Resend 422');
  assert (select status from signalwerk.sample_stock where id = got.id) = 'ready', 'nicht wieder bereit';
  assert (select claimed_at from signalwerk.sample_requests where id = '20000000-0000-0000-0000-000000000002') is null;

  -- 7) Verfall nach Alter: Leads frei
  update signalwerk.sample_stock set built_at = now() - interval '49 hours' where id = got.id;
  n := signalwerk.expire_sample_stock(48);
  assert n = 1, format('verfallen %s', n);
  select count(*) into n from signalwerk.leads where segment_id = 'SX' and status = 'reserved';
  assert n = 0, 'Leads nach Verfall noch reserviert';

  -- 8) Nachprüfung beim Abruf: Lead inzwischen ungültig -> Probe verworfen, nichts vergeben
  perform pg_temp.stock('asc', 'd.json');
  perform pg_temp.release('d.json');
  update signalwerk.leads set status = 'expired' where id = '10000000-0000-0000-0000-000000000001';
  select count(*) into n from signalwerk.claim_sample_stock('SX', 'US', '{}', null);
  assert n = 0, 'ungültige Probe vergeben';
  assert (select status from signalwerk.sample_stock where storage_path = 'd.json') = 'expired';

  -- 9) widersprüchliche Firma (Qualitätsprüfung blocking) -> nie vergeben
  update signalwerk.leads set status = 'new' where segment_id = 'SX' and status <> 'expired';
  perform pg_temp.stock('desc', 'e.json');
  perform pg_temp.release('e.json');
  insert into signalwerk.observations (company_id, kind, key, source_name, details)
    values ('00000000-0000-0000-0000-000000000012', 'other', 'quality', 'enrich', '{"blocking": true}');
  select count(*) into n from signalwerk.claim_sample_stock('SX', 'US', '{}', null);
  assert n = 0, 'Probe mit widersprüchlicher Firma vergeben';

  -- 10) ohne Freigabe (oder Freigabe älter als 26 h) nie vergeben, Probe verworfen, Leads frei
  delete from signalwerk.observations where company_id = '00000000-0000-0000-0000-000000000012';
  update signalwerk.leads set status = 'new' where segment_id = 'SX' and status <> 'expired';
  perform pg_temp.stock('desc', 'f.json');
  select count(*) into n from signalwerk.claim_sample_stock('SX', 'US', '{}', null);
  assert n = 0, 'Probe ohne Freigabe vergeben';
  assert (select note from signalwerk.sample_stock where storage_path = 'f.json') like '%Freigabe%';
  update signalwerk.leads set status = 'new' where segment_id = 'SX' and status <> 'expired';
  perform pg_temp.stock('desc', 'g.json');
  perform pg_temp.release('g.json');
  update signalwerk.sample_stock set gate_checked_at = now() - interval '27 hours' where storage_path = 'g.json';
  select count(*) into n from signalwerk.claim_sample_stock('SX', 'US', '{}', null);
  assert n = 0, 'Probe mit alter Freigabe vergeben';

  -- 11) Webagenturen (S2): kein Verfall nach Alter
  update signalwerk.leads set status = 'new' where segment_id = 'SX' and status <> 'expired';
  insert into signalwerk.segments (id, name) values ('S2', 'Webagenturen') on conflict do nothing;
  perform pg_temp.stock('desc', 'h.json');
  update signalwerk.sample_stock set segment_id = 'S2', built_at = now() - interval '100 hours' where storage_path = 'h.json';
  n := signalwerk.expire_sample_stock(48);
  assert (select status from signalwerk.sample_stock where storage_path = 'h.json') = 'ready', 'S2-Probe verfallen';
  raise notice 'Vorrats-Tests ok';
end $$;
rollback;
