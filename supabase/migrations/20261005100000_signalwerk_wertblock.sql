-- Wertrechnung „Lohnt sich das?“ als Seiten-Variante (Inhaber 04.10.2026, Auftrag „Wertrechnung einbauen“).
-- Nicht destruktiv: neue Spalte mit Standard 'aus' (alle bestehenden Varianten unverändert) und eine weitere
-- erlaubte Angabe für changed_element (Obermenge der bisherigen Liste; auch die A/B-Elemente subheadline und
-- cta_label aus app/lib/ab-schritte.json, die bisher am Constraint gescheitert wären).

alter table signalwerk.page_variants
  add column if not exists value_block text not null default 'aus';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'page_variants_value_block_check'
                   and conrelid = 'signalwerk.page_variants'::regclass) then
    alter table signalwerk.page_variants
      add constraint page_variants_value_block_check check (value_block in ('aus', 'an'));
  end if;
end $$;

alter table signalwerk.page_variants drop constraint if exists page_variants_changed_element_check;
alter table signalwerk.page_variants
  add constraint page_variants_changed_element_check
  check (changed_element in ('headline', 'signals', 'cta', 'subheadline', 'cta_label', 'value_block'));

comment on column signalwerk.page_variants.value_block is
  'Wertrechnung „Lohnt sich das?“ auf der Landingpage: an/aus (A/B-Element value_block, nur S2 US/UK/FR)';
