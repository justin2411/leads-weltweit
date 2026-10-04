-- Test Gehirn-Chat und Gehirn-Wissen (Migration 20261004224500): die feste Sitzung „Gehirn“ gibt es nur einmal, sie
-- lässt sich nicht archivieren, umbenennen oder umstellen; Wissen behält alte Fassungen. Läuft in der CI nach den
-- Migrationen; alles in einer Transaktion, am Ende zurückgerollt.
begin;
insert into signalwerk.jarvis_sessions (title, kind, mode) values ('Gehirn', 'gehirn', 'gehirn') on conflict do nothing;

do $t$
declare n int;
begin
  begin
    update signalwerk.jarvis_sessions set archived = true where kind = 'gehirn';
    raise exception 'Archivieren hätte scheitern müssen';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'Die Gehirn-Sitzung bleibt immer%' then raise; end if;
  end;
  begin
    update signalwerk.jarvis_sessions set title = 'Anders' where kind = 'gehirn';
    raise exception 'Umbenennen hätte scheitern müssen';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'Die Gehirn-Sitzung bleibt immer%' then raise; end if;
  end;
  begin
    update signalwerk.jarvis_sessions set mode = 'assistent' where kind = 'gehirn';
    raise exception 'Umstellen hätte scheitern müssen';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'Die Gehirn-Sitzung bleibt immer%' then raise; end if;
  end;
  begin
    insert into signalwerk.jarvis_sessions (title, kind, mode) values ('Gehirn 2', 'gehirn', 'gehirn');
    raise exception 'Zweite Gehirn-Sitzung hätte scheitern müssen';
  exception when unique_violation then null;
  end;
  -- Gelesen markieren und neue Nachricht (hebt die Sitzung an) bleiben erlaubt
  update signalwerk.jarvis_sessions set read_at = now() where kind = 'gehirn';
  insert into signalwerk.jarvis_messages (session_id, role, body, status)
    select id, 'jarvis', 'Aufgefallen: Test', null from signalwerk.jarvis_sessions where kind = 'gehirn';
  -- Wissen: alte Fassung bleibt als Version
  insert into signalwerk.brain_knowledge (slug, titel, markdown, quelle) values ('test-notiz', 'Test', '# alt', 'inhaber');
  update signalwerk.brain_knowledge set markdown = '# neu' where slug = 'test-notiz';
  select count(*) into n from signalwerk.brain_knowledge_versions v join signalwerk.brain_knowledge k on k.id = v.knowledge_id
    where k.slug = 'test-notiz' and v.markdown = '# alt';
  if n <> 1 then raise exception 'Version fehlt (%)', n; end if;
  -- Routinen: Uhrzeit und Tage geprüft
  begin
    insert into signalwerk.brain_routines (name, aufgabe, uhrzeit) values ('Test', 'Aufgabe x', '24:00');
    raise exception 'Uhrzeit 24:00 hätte scheitern müssen';
  exception when check_violation then null;
  end;
  insert into signalwerk.brain_routines (name, aufgabe, uhrzeit, tage, wochentage) values ('Test', 'Aufgabe x', '14:00', 'wochentage', '{2,4}');
  insert into signalwerk.agent_tasks (agent, kind, brief) values (1, 'gehirn', 'Gehirn-Routine Test (15 min): x');
  raise notice 'Gehirn-Tests ok';
end $t$;
rollback;
