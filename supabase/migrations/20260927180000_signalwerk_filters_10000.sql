-- Kundenwünsche: bis 10.000 Leads pro Woche (Regler auf der Zahlungsseite, Inhaber 27.09.2026).
-- Nicht destruktiv: erweitert nur den erlaubten Bereich.
alter table signalwerk.customer_filters drop constraint if exists customer_filters_max_per_week_check;
alter table signalwerk.customer_filters add constraint customer_filters_max_per_week_check
  check (max_per_week between 1 and 10000);
