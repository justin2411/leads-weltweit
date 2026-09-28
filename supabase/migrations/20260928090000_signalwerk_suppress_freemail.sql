-- Freemail-Domains nie als Domain sperren (Gmail-Abmeldung darf nicht ganz Gmail sperren).
-- NUR NACH FREIGABE DES INHABERS ANWENDEN (CLAUDE.md Abschnitt 10). Idempotent (create or replace).
-- Bestehende Sperren bleiben unverändert (Sperrliste ist dauerhaft); die Python-Aufrufer (lib.rules.suppress)
-- sperren Freemail-Adressen schon ohne diese Migration nur als Adresse.

create or replace function signalwerk.is_freemail_domain(p_domain text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(coalesce(p_domain, '')) in (
           'gmail.com','googlemail.com','outlook.com','outlook.fr','hotmail.com','hotmail.co.uk','hotmail.fr',
           'live.com','live.co.uk','msn.com','icloud.com','me.com','aol.com','web.de','t-online.de','orange.fr',
           'wanadoo.fr','free.fr','sfr.fr','laposte.net','btinternet.com','sky.com','virginmedia.com','proton.me',
           'protonmail.com','mail.com','yandex.com','zoho.com','comcast.net','verizon.net','att.net','eircom.net',
           'ziggo.nl','kpnmail.nl')
      or lower(coalesce(p_domain, '')) like 'yahoo.%'
      or lower(coalesce(p_domain, '')) like 'ymail.%'
      or lower(coalesce(p_domain, '')) like 'gmx.%';
$$;

-- Sperrt die Adresse und – außer bei Freemail-Anbietern – die Domain (Firma dauerhaft gesperrt)
create or replace function signalwerk.suppress_email(p_email text, p_reason text, p_source text)
returns void language plpgsql set search_path = '' as $$
begin
  insert into signalwerk.suppression (kind, value, reason, source)
  values ('email', lower(p_email), p_reason, p_source)
  on conflict (kind, value) do nothing;
  if not signalwerk.is_freemail_domain(split_part(p_email, '@', 2)) then
    insert into signalwerk.suppression (kind, value, reason, source)
    values ('domain', lower(split_part(p_email, '@', 2)), p_reason, p_source)
    on conflict (kind, value) do nothing;
  end if;
end $$;

grant execute on function signalwerk.is_freemail_domain(text) to service_role;
grant execute on function signalwerk.suppress_email(text, text, text) to service_role;
revoke execute on function signalwerk.is_freemail_domain(text) from public, anon, authenticated;
revoke execute on function signalwerk.suppress_email(text, text, text) from public, anon, authenticated;
