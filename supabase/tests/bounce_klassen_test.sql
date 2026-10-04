-- Bounce-Klassen (Migration 20261005010000): gleiche Fälle wie tests/test_bounce_class.py, Trigger füllt die Klasse,
-- bounce_stats zählt je Postfach und Quelle. Alles in einer Transaktion, am Ende zurückgerollt.
begin;
do $t$
declare ex uuid; p1 uuid; p2 uuid; m1 uuid; m2 uuid; m3 uuid; r jsonb; k text;
begin
  if signalwerk.bounce_klasse('5.1.1', 'smtp; 550 5.1.1 User unknown') <> 'hart' then raise exception '5.1.1'; end if;
  if signalwerk.bounce_klasse('5.4.4', 'Host or domain name not found') <> 'hart' then raise exception 'Domain'; end if;
  if signalwerk.bounce_klasse('4.4.1', '451 4.4.1 Timeout connecting to mail.x.com') <> 'weich' then raise exception 'Timeout'; end if;
  if signalwerk.bounce_klasse('5.2.2', '552 5.2.2 Mailbox full') <> 'weich' then raise exception 'voll'; end if;
  if signalwerk.bounce_klasse('5.7.1', '554 5.7.1 Service unavailable; blocked using Spamhaus') <> 'richtlinie' then raise exception 'Spamhaus'; end if;
  if signalwerk.bounce_klasse('', '550 Message rejected as spam') <> 'richtlinie' then raise exception 'Spam ohne Code'; end if;
  if signalwerk.bounce_klasse(null, '550 5.1.10 RESOLVER.ADR.RecipientNotFound') <> 'hart' then raise exception 'Outlook'; end if;
  if signalwerk.bounce_klasse('5.7.1', '554 5.7.1 Recipient address rejected: Sorry, my mailbox is over quota') <> 'weich' then raise exception '5.7.1 voll'; end if;
  if signalwerk.bounce_klasse(null, null) <> 'unbekannt' then raise exception 'leer'; end if;
  if signalwerk.bounce_klasse_aus('{"bounce":{"type":"Transient","diagnosticCode":["smtp; 550 4.4.7 Message expired"]}}') <> 'weich' then
    raise exception 'Resend'; end if;

  insert into signalwerk.segments (id, name) values ('S2', 'Webagenturen') on conflict do nothing;
  insert into signalwerk.experiments (segment_id, country, hypothesis) values ('S2', 'UK', 'Bounce-Test') returning id into ex;
  insert into signalwerk.prospects (segment_id, company_name, country, domain, source_url, size_note)
  values ('S2', 'Alpha Ltd', 'UK', 'alpha-bk.co.uk', 'https://alpha-bk.co.uk/contact', 'Company No. 1 (Website)') returning id into p1;
  insert into signalwerk.prospects (segment_id, company_name, country, domain, source_url)
  values ('S2', 'Beta Inc', 'US', 'beta-bk.com', 'https://overturemaps.org (Firmeneintrag x)') returning id into p2;
  insert into signalwerk.messages (experiment_id, prospect_id, to_email, subject, body, status, sent_at, sent_from, unsubscribe_token)
  values (ex, p1, 'info@alpha-bk.co.uk', 's', 'b', 'sent', now() - interval '1 day', 'NextGen <info@nextgen-profit.de>', 'bk-tok-1') returning id into m1;
  insert into signalwerk.messages (experiment_id, prospect_id, to_email, subject, body, status, sent_at, sent_from, unsubscribe_token)
  values (ex, p2, 'hello@beta-bk.com', 's', 'b', 'sent', now() - interval '1 day', 'webagency@nextgen-profit.de', 'bk-tok-2') returning id into m2;
  insert into signalwerk.messages (experiment_id, prospect_id, to_email, subject, body, status, sent_at, sent_from, unsubscribe_token, kind)
  values (ex, p2, 'sales@beta-bk.com', 's', 'b', 'sent', now() - interval '1 day', 'webagency@nextgen-profit.de', 'bk-tok-3', 'followup') returning id into m3;
  insert into signalwerk.email_events (message_id, type, dedupe_key, payload)
  values (m2, 'bounced', 'bk-test-1', '{"bounce":{"status":"5.1.1","diagnostic":"User unknown"}}') returning bounce_class into k;
  if k <> 'hart' then raise exception 'Trigger: %', k; end if;
  insert into signalwerk.email_events (message_id, type, dedupe_key, payload)
  values (m3, 'bounced', 'bk-test-2', '{}') returning bounce_class into k;
  if k <> 'unbekannt' then raise exception 'Trigger leer: %', k; end if;

  r := signalwerk.bounce_stats(7);
  if (r -> 'klassen' ->> 'hart')::int < 1 then raise exception 'bounce_stats Klassen: %', r -> 'klassen'; end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'quellen') q
                  where q ->> 'country' = 'US' and q ->> 'quelle' = 'Overture' and (q ->> 'gesendet')::int >= 2
                    and (q ->> 'hart')::int >= 1) then raise exception 'bounce_stats Quellen: %', r -> 'quellen'; end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'postfaecher') q where q ->> 'box' = 'webagency@') then
    raise exception 'bounce_stats Postfächer: %', r -> 'postfaecher'; end if;
  raise notice 'Bounce-Klassen ok';
end $t$;
rollback;
