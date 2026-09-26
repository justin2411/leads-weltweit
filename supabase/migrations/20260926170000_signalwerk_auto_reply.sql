-- Automatische Antworten (Abwesenheitsnotizen) getrennt erfassen: zählen nicht als echte Antwort.
alter table signalwerk.email_events drop constraint if exists email_events_type_check;
alter table signalwerk.email_events add constraint email_events_type_check check (type in (
  'sent','delivered','delivery_delayed','bounced','complained','failed',
  'reply','reply_positive','reply_negative','sample_requested','unsubscribed','auto_reply'));
