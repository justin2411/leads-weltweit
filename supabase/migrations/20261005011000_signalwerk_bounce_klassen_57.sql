-- Bounce-Klassen Nachtrag (04.10.2026): x.7.x mit Grund beim Empfänger. Manche Server melden „Postfach voll“ oder
-- „Adresse unbekannt“ als 5.7.1 – dann weich bzw. hart statt Richtlinie (gleich wie scripts/lib/bounce_class.py).
-- Nicht destruktiv: Funktion ersetzen, abgeleitete Spalte für x.7.x-Rückläufer neu berechnen.
create or replace function signalwerk.bounce_klasse(p_status text, p_diag text) returns text
language sql immutable set search_path = '' as $$
  with x as (
    select coalesce(p_diag, '') d,
           coalesce(nullif(trim(p_status), ''), substring(coalesce(p_diag, '') from '(?:^|[^0-9.])([245]\.[0-9]{1,3}\.[0-9]{1,3})(?:[^0-9.]|$)'), '') s
  )
  select case
    when s = '' and trim(d) = '' then 'unbekannt'
    when d ~* '(host or domain name not found|name service error|domain (name )?not found|nxdomain|no mx (record|host)|unrouteable (mail )?domain|domain does not exist)' then 'hart'
    when s ~ '^5\.(1\.[0-9]+|4\.1|4\.4|4\.310|2\.1)$' then 'hart'
    when s ~ '^[45]\.7\.' then case
      when d ~* '(spam|block ?list|black ?list|blocked|spamhaus|barracuda|spamcop|reputation|policy|dnsbl|\mrbl\M|not authori[sz]ed|sender (address )?rejected|dmarc|\mspf\M|dkim|message rejected|content rejected|denied by)' then 'richtlinie'
      when d ~* '(mailbox (is )?full|over ?quota|quota exceeded|insufficient (system )?storage)' then 'weich'
      when d ~* '(user unknown|unknown user|no such (user|recipient|mailbox)|does not exist|doesn''?t exist|recipient not found|recipientnotfound|unknown recipient)' then 'hart'
      else 'richtlinie' end
    when s ~ '^(4\.[0-9]+\.[0-9]+|5\.2\.2|5\.4\.7|5\.3\.[0-9]+)$' then
      case when d ~* '(spam|block ?list|black ?list|blocked|spamhaus|barracuda|spamcop|reputation|policy|dnsbl|\mrbl\M|not authori[sz]ed|sender (address )?rejected|dmarc|\mspf\M|dkim|message rejected|content rejected|denied by)' then 'richtlinie' else 'weich' end
    when d ~* '(spam|block ?list|black ?list|blocked|spamhaus|barracuda|spamcop|reputation|policy|dnsbl|\mrbl\M|not authori[sz]ed|sender (address )?rejected|dmarc|\mspf\M|dkim|message rejected|content rejected|denied by)' then 'richtlinie'
    when d ~* '(user unknown|unknown user|no such (user|recipient|mailbox)|does not exist|doesn''?t exist|address (couldn''?t be |could not be |not )found|recipient not found|recipientnotfound|unknown recipient|invalid (recipient|mailbox|address)|mailbox unavailable|mailbox not found|no mailbox|account (has been )?disabled|recipient address rejected|address rejected|not our customer|unrouteable)' then 'hart'
    when d ~* '(mailbox (is )?full|quota|insufficient (system )?storage|timeout|timed out|try again|temporar|expired|deferred|connection (refused|reset|lost)|failed to establish|unable to deliver in|too many (connections|messages)|rate limit|greylist)' then 'weich'
    else 'unbekannt' end
  from x
$$;

update signalwerk.email_events set bounce_class = signalwerk.bounce_klasse_aus(payload)
 where type = 'bounced' and payload -> 'bounce' ->> 'status' ~ '^[45]\.7\.'
   and bounce_class is distinct from signalwerk.bounce_klasse_aus(payload);
