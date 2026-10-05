-- Test Migration 20261005200000: page_stats zählt keine is_test-Ereignisse; Kontakte-Board stuft „Seite angesehen“
-- zwischen Angeschrieben und Geantwortet ein (Karte wandert nur, wenn nichts Höheres erreicht ist) und markiert viewed.
-- Läuft in der CI nach den Migrationen; alles in einer Transaktion, am Ende zurückgerollt.
begin;
insert into signalwerk.segments (id, name) values ('S2', 'Webagenturen') on conflict do nothing;

do $t$
declare lp uuid; v uuid; e uuid; p1 uuid; p2 uuid; p3 uuid; m1 uuid; m2 uuid; m3 uuid; n int; j jsonb;
begin
  insert into signalwerk.landing_pages (slug, segment_id, country) values ('se/test-seite', 'S2', 'SE') returning id into lp;
  insert into signalwerk.page_variants (page_id, variant_key, headline, cta_label) values (lp, 'A', 'H', 'C') returning id into v;
  insert into signalwerk.page_events (variant_id, type) values (v, 'checkout_started'), (v, 'checkout_started');
  insert into signalwerk.page_events (variant_id, type, is_test) values (v, 'checkout_started', true);
  select checkouts into n from signalwerk.page_stats where variant_id = v;
  if n <> 2 then raise exception 'page_stats zählt Test-Checkouts mit: %', n; end if;

  insert into signalwerk.experiments (segment_id, country, hypothesis) values ('S2', 'SE', 'Test') returning id into e;
  insert into signalwerk.prospects (segment_id, company_name, country, domain, source_url) values
    ('S2', 'Nur gesehen AB', 'SE', 'a.se', 'https://a.se') returning id into p1;
  insert into signalwerk.prospects (segment_id, company_name, country, domain, source_url) values
    ('S2', 'Gesehen und Antwort AB', 'SE', 'b.se', 'https://b.se') returning id into p2;
  insert into signalwerk.prospects (segment_id, company_name, country, domain, source_url) values
    ('S2', 'Still AB', 'SE', 'c.se', 'https://c.se') returning id into p3;
  insert into signalwerk.messages (prospect_id, experiment_id, to_email, subject, body, status, sent_at)
    values (p1, e, 'info@a.se', 's', 'b', 'sent', now() - interval '1 day') returning id into m1;
  insert into signalwerk.messages (prospect_id, experiment_id, to_email, subject, body, status, sent_at)
    values (p2, e, 'info@b.se', 's', 'b', 'sent', now() - interval '1 day') returning id into m2;
  insert into signalwerk.messages (prospect_id, experiment_id, to_email, subject, body, status, sent_at)
    values (p3, e, 'info@c.se', 's', 'b', 'sent', now() - interval '1 day') returning id into m3;
  insert into signalwerk.email_events (message_id, type, dedupe_key) values
    (m1, 'page_viewed', 'page_viewed:' || p1 || ':t'), (m2, 'page_viewed', 'page_viewed:' || p2 || ':t'), (m2, 'reply', null);
  -- höchstens 1 je Firma und Tag
  insert into signalwerk.email_events (message_id, type, dedupe_key) values (m1, 'page_viewed', 'page_viewed:' || p1 || ':t')
    on conflict (dedupe_key) do nothing;

  j := signalwerk.dashboard_contacts('S2', 50, null, null);
  if (select count(*) from jsonb_array_elements(j->'cards') c where c->>'id' = p1::text and c->>'stage' = 'viewed' and (c->>'viewed')::bool) <> 1
    then raise exception 'nur gesehen → Stufe viewed erwartet: %', j; end if;
  if (select count(*) from jsonb_array_elements(j->'cards') c where c->>'id' = p2::text and c->>'stage' = 'replied' and (c->>'viewed')::bool) <> 1
    then raise exception 'Antwort bleibt höher, mit Abzeichen: %', j; end if;
  if (select count(*) from jsonb_array_elements(j->'cards') c where c->>'id' = p3::text and c->>'stage' = 'contacted' and not (c->>'viewed')::bool) <> 1
    then raise exception 'ohne Besuch bleibt angeschrieben: %', j; end if;
  if (select sum((x->>'n')::int) from jsonb_array_elements(j->'viewed') x where x->>'country' = 'SE') <> 2
    then raise exception 'viewed-Zahl falsch: %', j->'viewed'; end if;
  raise notice 'Seite-angesehen-Tests ok';
end $t$;
rollback;
