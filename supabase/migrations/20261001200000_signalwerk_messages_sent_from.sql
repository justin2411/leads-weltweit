-- Skalierbarer Versand (Inhaber 01.10.2026: „wir sollten die Möglichkeit haben auch hochzuskalieren, Hauptdomain passt“):
-- mehrere Versand-Postfächer, je mit eigener Tagesmenge. Nicht destruktiv: neue Spalte, ältere Mails bleiben leer (= Postfach 1).
alter table signalwerk.messages add column if not exists sent_from text;
comment on column signalwerk.messages.sent_from is 'Absenderadresse (Postfach), über das die Mail ging; leer = Hauptpostfach';
