-- Kunden-Werk (Inhaber 01.10.2026: „Ja wir sollten so viele leads besorgen können wie es geht“):
-- Käufer, die wir nicht per E-Mail anschreiben dürfen (z. B. UK-Einzelunternehmer, PECR) oder ohne Firmen-E-Mail,
-- bleiben als „nur Anruf/Brief“ erhalten. Nicht destruktiv: neue Spalte, erweiterter Status.
alter table signalwerk.prospects add column if not exists phone text;
alter table signalwerk.prospects drop constraint if exists prospects_check_status_check;
alter table signalwerk.prospects add constraint prospects_check_status_check
  check (check_status in ('unchecked', 'ok', 'rejected', 'call_only'));
comment on column signalwerk.prospects.phone is 'Veröffentlichte Firmennummer (Website oder Firmeneintrag)';
comment on constraint prospects_check_status_check on signalwerk.prospects is
  'ok = E-Mail erlaubt; call_only = nur Anruf/Brief (vor Anrufen in UK gegen TPS/CTPS prüfen); rejected = weder noch';
