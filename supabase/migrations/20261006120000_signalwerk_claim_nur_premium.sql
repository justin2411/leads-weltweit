-- Nur Premium auch beim Abruf (Inhaber 05.10.2026: „ab sofort brauchen wir nur noch premium leads“; Proben nur aus
-- Premium, genau 10, sonst keine). Gemessen 05.10.2026: 19 fertige S2/FR-Wunsch-Proben im Vorrat haben heute 0/10
-- Premium (premium_n neu gezählt). claim_sample_stock gab Premium-Proben nur zuerst heraus – waren die aufgebraucht,
-- wäre eine Standard-Probe rausgegangen. Neu: Bei lead_mix 100 % (Standard, auch ohne Eintrag) gibt der Abruf nur
-- Proben mit premium_n >= 10 heraus; sonst Warteschlange wie bisher. Nur strenger; nichts gelöscht oder verworfen
-- (Standard-Proben bleiben 'ready' und werden übersprungen).
create or replace function signalwerk.claim_sample_stock(p_segment text, p_country text, p_wish text[], p_request uuid)
returns table(id uuid, storage_path text, subject text, lang text)
language plpgsql
security definer
set search_path to 'signalwerk', 'public'
as $function$
#variable_conflict use_column
declare r record; why text; v_mix int;
begin
  select case when o.value->>'premium_pct' ~ '^\d{1,3}$' then (o.value->>'premium_pct')::int else 100 end
    into v_mix from signalwerk.owner_settings o where o.key = 'lead_mix';
  v_mix := coalesce(v_mix, 100);
  for r in
    select s.id, s.storage_path, s.subject, s.lang, s.lead_ids, s.company_ids, s.gate_checked_at
      from signalwerk.sample_stock s
     where s.segment_id = p_segment and s.country = p_country and s.status = 'ready' and s.expires_at > now()
       and (v_mix < 100 or coalesce(s.premium_n, 0) >= 10)
     order by coalesce(s.premium_n, 0) desc,
              (select coalesce(sum(coalesce((s.wish_match->>k)::int, 0)), 0)
                 from unnest(coalesce(p_wish, '{}'::text[])) k) desc,
              s.score desc, s.built_at desc
     for update of s skip locked
  loop
    why := null;
    if (select count(*) from signalwerk.leads l where l.id = any(r.lead_ids) and l.status = 'reserved') <> 10 then
      why := 'Leads nicht mehr reserviert';
    elsif exists (select 1 from signalwerk.observations o
                   where o.company_id = any(r.company_ids) and o.kind = 'other' and o.key = 'quality'
                     and o.details->>'blocking' = 'true') then
      why := 'Qualitätsprüfung blocking';
    elsif r.gate_checked_at is null or r.gate_checked_at < now() - interval '26 hours'
       or (select count(*) from signalwerk.lead_checks c
            where c.lead_id = any(r.lead_ids) and c.result = 'released' and c.checked_at >= r.gate_checked_at - interval '2 hours') <> 10 then
      why := 'Freigabe fehlt oder älter als 26 h';
    elsif exists (select 1 from signalwerk.deliveries d where d.lead_ids && r.lead_ids) then
      why := 'Lead schon geliefert';
    elsif exists (select 1 from signalwerk.observations o
                   where o.company_id = any(r.company_ids) and o.kind = 'other' and o.key = 'contact'
                     and o.details->>'email' is not null
                     and signalwerk.is_suppressed(o.details->>'email')) then
      why := 'Sperrliste';
    end if;
    if why is not null then
      update signalwerk.sample_stock set status = 'expired', released_at = now(), note = 'beim Abruf ungültig: ' || why
       where sample_stock.id = r.id;
      update signalwerk.leads set status = 'new' where leads.id = any(r.lead_ids) and leads.status = 'reserved';
      continue;
    end if;
    update signalwerk.sample_stock set status = 'claimed', claimed_at = now(), request_id = p_request
     where sample_stock.id = r.id;
    id := r.id; storage_path := r.storage_path; subject := r.subject; lang := r.lang;
    return next;
    return;
  end loop;
end $function$;
-- Rechte bleiben (create or replace behält sie): nur service_role.
