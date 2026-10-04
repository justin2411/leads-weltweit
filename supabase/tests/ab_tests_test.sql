-- Test A/B je Schritt (Migration 20261004233000): höchstens ein laufender Test je Schritt und Land, Ereignisse doppelt
-- ignoriert, ab_results zählt Antworten nach dem Kontakt (nicht davor, keine Abmeldungen) und Ereignisse, ab_funnel
-- liefert alle Stationen. Läuft in der CI nach den Migrationen; alles in einer Transaktion, am Ende zurückgerollt.
begin;
insert into signalwerk.segments (id, name) values ('S2', 'Webagenturen') on conflict do nothing;

do $t$
declare t1 uuid; t2 uuid; p1 uuid; p2 uuid; r record; cnt int;
begin
  -- laufende Starttests der Migration (Betreff-A/B US/UK/FR) nicht stören: eigenes Land
  insert into signalwerk.ab_tests (step, segment_id, country, element, hypothese, messung, varianten, status, gestartet)
  values ('mail_einstieg', 'S2', 'SE', 'frage', 'Kürzere Frage bringt mehr Antworten', 'antwort',
          '[{"key":"A"},{"key":"B","frage":"Shall I send it?"}]', 'laeuft', now() - interval '2 days') returning id into t1;
  begin
    insert into signalwerk.ab_tests (step, segment_id, country, element, hypothese, messung, varianten, status)
    values ('mail_einstieg', 'S2', 'SE', 'einstieg', 'Zweiter Test zur selben Zeit', 'antwort',
            '[{"key":"A"},{"key":"B","einstieg":"x"}]', 'laeuft');
    raise exception 'zweiter laufender Test hätte scheitern müssen';
  exception when unique_violation then null;
  end;

  insert into signalwerk.prospects (segment_id, company_name, country, domain, source_url)
  values ('S2', 'Alpha AB', 'SE', 'alpha.se', 'https://alpha.se') returning id into p1;
  insert into signalwerk.prospects (segment_id, company_name, country, domain, source_url)
  values ('S2', 'Beta AB', 'SE', 'beta.se', 'https://beta.se') returning id into p2;
  insert into signalwerk.ab_events (test_id, variant, unit, kind, created_at) values
    (t1, 'A', p1::text, 'exposure', now() - interval '1 day'),
    (t1, 'B', p2::text, 'exposure', now() - interval '1 day');
  -- doppelt: ignoriert über on conflict
  insert into signalwerk.ab_events (test_id, variant, unit, kind) values (t1, 'A', p1::text, 'exposure')
    on conflict (test_id, unit, kind) do nothing;
  -- Antwort vor dem Kontakt zählt nicht, Abmeldung zählt nicht, echte Antwort danach zählt
  insert into signalwerk.inbound_replies (imap_message_id, received_at, prospect_id, from_email, intent)
  values ('<a1@x>', now() - interval '3 days', p1, 'a@alpha.se', 'question'),
         ('<b1@x>', now() - interval '2 hours', p2, 'b@beta.se', 'sample'),
         ('<a2@x>', now() - interval '1 hour', p1, 'a@alpha.se', 'unsubscribe');
  select x.n, x.k, x.k_positiv into r from signalwerk.ab_results x where x.test_id = t1 and x.variant = 'A';
  if r.n <> 1 or r.k <> 0 then raise exception 'A: n=% k=% (erwartet 1/0)', r.n, r.k; end if;
  select x.n, x.k, x.k_positiv into r from signalwerk.ab_results x where x.test_id = t1 and x.variant = 'B';
  if r.n <> 1 or r.k <> 1 or r.k_positiv <> 1 then raise exception 'B: n=% k=% p=% (erwartet 1/1/1)', r.n, r.k, r.k_positiv; end if;

  -- Ereignis-Messung (Tarifseite): conversion je Variante
  insert into signalwerk.ab_tests (step, segment_id, country, element, hypothese, messung, varianten, status, gestartet)
  values ('tarif', 'S2', 'SE', 'titel', 'Klarer Titel bringt mehr Stripe-Starts', 'ereignis',
          '[{"key":"A"},{"key":"B","titel":"Start today"}]', 'laeuft', now()) returning id into t2;
  insert into signalwerk.ab_events (test_id, variant, unit, kind) values
    (t2, 'A', 'v1', 'exposure'), (t2, 'A', 'v2', 'exposure'), (t2, 'B', 'v3', 'exposure'), (t2, 'B', 'v3', 'conversion');
  select x.n, x.k into r from signalwerk.ab_results x where x.test_id = t2 and x.variant = 'B';
  if r.n <> 1 or r.k <> 1 then raise exception 'Tarif B: n=% k=%', r.n, r.k; end if;
  select x.n, x.k into r from signalwerk.ab_results x where x.test_id = t2 and x.variant = 'A';
  if r.n <> 2 or r.k <> 0 then raise exception 'Tarif A: n=% k=%', r.n, r.k; end if;

  -- Starttests der Migration: Betreff-A/B für US, UK, FR läuft
  select count(*) into cnt from signalwerk.ab_tests where step = 'mail_betreff' and status = 'laeuft' and country in ('US', 'UK', 'FR');
  if cnt <> 3 then raise exception 'Betreff-A/B: % statt 3 laufende Tests', cnt; end if;

  -- Trichter: alle 8 Stationen
  select count(distinct station) into cnt from signalwerk.ab_funnel(array['S2'], array['SE', 'US'], 30);
  if cnt <> 8 then raise exception 'ab_funnel: % statt 8 Stationen', cnt; end if;
  raise notice 'A/B-Tests ok';
end $t$;
rollback;
