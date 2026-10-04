-- Wenig Text überall (Inhaber 04.10.2026): Entscheidungen, die ohne Kurzfassung geschrieben werden (z. B. direkt per SQL
-- aus Gehirn- oder JARVIS-Sitzungen), bekommen beim Schreiben eine einfache Kurzfassung: Titel ≤ 60, Grund ≤ 160 Zeichen,
-- an der Wortgrenze gekürzt. Gesetzte Werte bleiben unverändert. Nicht destruktiv.
create or replace function signalwerk.decisions_kurz_default() returns trigger
language plpgsql set search_path = signalwerk, public as $fn$
declare t text; g text;
begin
  if new.kurz_titel is null and new.subject is not null then
    t := btrim(regexp_replace(regexp_replace(new.subject, '^(Sitzung|Vorschlag|umgesetzt)[^:]{0,40}:\s*', '', 'i'), '\s+', ' ', 'g'));
    if char_length(t) > 60 then t := btrim(regexp_replace(left(t, 59), '\s+\S*$', '')) || '…'; end if;
    new.kurz_titel := nullif(left(t, 60), '');
  end if;
  if new.kurz_grund is null and new.reasoning is not null then
    g := btrim(regexp_replace(new.reasoning, '\s+', ' ', 'g'));
    g := coalesce(substring(g from '^(.{20,160}?[.!?])(\s|$)'), g);
    if char_length(g) > 160 then g := btrim(regexp_replace(left(g, 159), '\s+\S*$', '')) || '…'; end if;
    new.kurz_grund := nullif(left(g, 160), '');
  end if;
  return new;
end $fn$;
revoke all on function signalwerk.decisions_kurz_default() from public, anon, authenticated;
drop trigger if exists decisions_kurz_default on signalwerk.decisions;
create trigger decisions_kurz_default before insert or update of subject, reasoning on signalwerk.decisions
  for each row execute function signalwerk.decisions_kurz_default();
