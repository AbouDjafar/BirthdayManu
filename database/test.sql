-- Behavioral regression checks, using SYNTHETIC content only.
-- Everything, including configuration changes, is rolled back at the end.
-- Run after setup.sql, as the SQL Editor administrator, never edit COMMIT in.
begin;

do $$
begin
  if exists (select 1 from public.players where id in (
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
  ) or first_name = 'Essai RPC 20261110') then
    raise exception 'A synthetic test identity already exists; aborting without changes.';
  end if;
  -- Empty configuration must refuse scoring (temporarily remove it in this txn).
  delete from public.quiz_answers;
  begin
    perform public.submit_quiz('11111111-1111-4111-8111-111111111111', 'Essai', '{}'::jsonb);
    raise exception 'Empty quiz configuration was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Le quiz n’est pas encore configuré. Réessaie un peu plus tard.' then raise; end if;
  end;
end;
$$;

-- Make Manuella's test state independent of existing plays. ROLLBACK restores it.
delete from public.scores where player_id in (select player_id from public.secret_access);

select public.configure_birthday(
  '{"q1":"OPTION_TEST","q2":"OPTION_TEST","q3":"OPTION_TEST","q4":"OPTION_TEST","q5":"OPTION_TEST"}'::jsonb,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.repeat('A', 43), 'UTF8')), 'hex'),
  'MESSAGE_SYNTHETIQUE_DE_TEST', null
);

set local role anon;
do $$
declare v_result jsonb; v_count bigint;
begin
  begin
    perform 1 from public.quiz_answers;
    raise exception 'Anonymous direct table read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.players (id, first_name)
      values ('11111111-1111-4111-8111-111111111111', 'Essai');
    raise exception 'Anonymous direct write was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.configure_birthday('{}'::jsonb, 'invalid', 'invalid', null);
    raise exception 'Anonymous configuration was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_quiz('11111111-1111-4111-8111-111111111111', 'Essai', '[]'::jsonb);
    raise exception 'Invalid answer array was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_quiz('11111111-1111-4111-8111-111111111111', 'Essai', '{"q1":"OPTION_TEST"}'::jsonb);
    raise exception 'Incomplete answers were accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_quiz('11111111-1111-4111-8111-111111111111', 'Essai',
      '{"q1":null,"q2":"OPTION_TEST","q3":"OPTION_TEST","q4":"OPTION_TEST","q5":"OPTION_TEST"}'::jsonb);
    raise exception 'Non-string answer was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_quiz('11111111-1111-4111-8111-111111111111', 'Manuella l''Anniversaireuse',
      '{"q1":"OPTION_TEST","q2":"OPTION_TEST","q3":"OPTION_TEST","q4":"OPTION_TEST","q5":"OPTION_TEST"}'::jsonb);
    raise exception 'Reserved Manuella name was accepted';
  exception when invalid_parameter_value then null;
  end;
  v_result := public.submit_quiz('11111111-1111-4111-8111-111111111111', '  Essai RPC 20261110  ',
    '{"q1":"OPTION_TEST","q2":"OPTION_TEST","q3":"OPTION_TEST","q4":"OPTION_TEST","q5":"OPTION_TEST"}'::jsonb);
  if v_result <> '{"score":100,"best":100}'::jsonb then raise exception 'Incorrect perfect score'; end if;
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Essai RPC 20261110' and best_score = 100 and attempts = 1) then
    raise exception 'First play did not expose exactly one attempt';
  end if;
  v_result := public.submit_quiz('11111111-1111-4111-8111-111111111111', 'Essai RPC 20261110',
    '{"q1":"FAUX","q2":"FAUX","q3":"FAUX","q4":"FAUX","q5":"FAUX"}'::jsonb);
  if v_result <> '{"score":0,"best":100}'::jsonb then raise exception 'Best score decreased'; end if;
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Essai RPC 20261110' and best_score = 100 and attempts = 2) then
    raise exception 'A lower replay score did not increase the public attempt count';
  end if;
  select pg_catalog.count(*) into v_count from public.get_leaderboard() where first_name = 'Essai RPC 20261110';
  if v_count <> 1 then raise exception 'A replay created duplicate leaderboard entries'; end if;
  v_result := public.get_my_best('11111111-1111-4111-8111-111111111111');
  if v_result <> '{"first_name":"Essai RPC 20261110","best_score":100}'::jsonb then raise exception 'Bad returning-player response'; end if;
  if public.get_my_best('22222222-2222-4222-8222-222222222222') is not null then raise exception 'Unknown player was returned'; end if;
  perform public.submit_quiz('22222222-2222-4222-8222-222222222222', 'Essai RPC 20261110',
    '{"q1":"OPTION_TEST","q2":"FAUX","q3":"FAUX","q4":"FAUX","q5":"FAUX"}'::jsonb);
  select pg_catalog.count(*) into v_count from public.get_leaderboard() where first_name = 'Essai RPC 20261110';
  if v_count <> 2 or not exists (select 1 from public.get_leaderboard()
    where first_name = 'Essai RPC 20261110' and best_score = 20 and attempts = 1) then
    raise exception 'Homonyms share scores or attempt counts';
  end if;
  if public.get_manuella_content('incorrect') is not null then raise exception 'Wrong secret accepted'; end if;
  v_result := public.get_manuella_content(pg_catalog.repeat('A', 43));
  if v_result ->> 'text' <> 'MESSAGE_SYNTHETIQUE_DE_TEST' or v_result -> 'bestScorePercent' <> 'null'::jsonb then
    raise exception 'Private content response incorrect';
  end if;
  perform public.submit_manuella_quiz(pg_catalog.repeat('A', 43),
    '{"q1":"OPTION_TEST","q2":"OPTION_TEST","q3":"OPTION_TEST","q4":"OPTION_TEST","q5":"OPTION_TEST"}'::jsonb);
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Manuella l''Anniversaireuse' and best_score = 100 and attempts = 1) then
    raise exception 'Manuella first play attempt count is incorrect';
  end if;
  perform public.submit_manuella_quiz(pg_catalog.repeat('A', 43),
    '{"q1":"FAUX","q2":"FAUX","q3":"FAUX","q4":"FAUX","q5":"FAUX"}'::jsonb);
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Manuella l''Anniversaireuse' and best_score = 100 and attempts = 2) then
    raise exception 'Manuella replay lost her best score or attempt count';
  end if;
  select pg_catalog.count(*) into v_count from public.get_leaderboard() where first_name = 'Manuella l''Anniversaireuse';
  if v_count <> 1 then raise exception 'Manuella has duplicate leaderboard entries'; end if;
  perform public.post_message('11111111-1111-4111-8111-111111111111', 'Autre nom', '  Un   joli mot  ');
  if not exists (select 1 from public.get_messages() where first_name = 'Essai RPC 20261110' and body = 'Un joli mot') then
    raise exception 'Message canonical name / whitespace normalization failed';
  end if;
  begin
    perform public.post_message('11111111-1111-4111-8111-111111111111', 'Essai', 'Trop vite');
    raise exception 'Message cooldown bypassed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Attends 30 secondes avant de laisser un autre mot.' then raise; end if;
  end;
  begin
    perform public.post_message('11111111-1111-4111-8111-111111111111', 'Essai', pg_catalog.repeat('x', 281));
    raise exception 'Oversized message accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

-- Rotating the secret must keep the server-owned identity and its best score.
select public.configure_birthday(
  '{"q1":"OPTION_TEST","q2":"OPTION_TEST","q3":"OPTION_TEST","q4":"OPTION_TEST","q5":"OPTION_TEST"}'::jsonb,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.repeat('B', 43), 'UTF8')), 'hex'),
  'MESSAGE_SYNTHETIQUE_DE_TEST_APRES_ROTATION', null
);
set local role anon;
do $$
declare v_result jsonb;
begin
  if public.get_manuella_content(pg_catalog.repeat('A', 43)) is not null then
    raise exception 'Old access code survived rotation';
  end if;
  v_result := public.get_manuella_content(pg_catalog.repeat('B', 43));
  if (v_result ->> 'bestScorePercent')::integer <> 100 then
    raise exception 'Manuella best score lost during secret rotation';
  end if;
end;
$$;
reset role;

-- Simulate the passage of time without sleeps, then check the lifetime quota.
update public.messages set created_at = pg_catalog.clock_timestamp() - interval '2 minutes'
  where player_id = '11111111-1111-4111-8111-111111111111';
select public.post_message('11111111-1111-4111-8111-111111111111', 'Essai', 'Deuxième mot de test');
update public.messages set created_at = pg_catalog.clock_timestamp() - interval '1 minute'
  where player_id = '11111111-1111-4111-8111-111111111111';
select public.post_message('11111111-1111-4111-8111-111111111111', 'Essai', 'Troisième mot de test');
update public.messages set hidden = true
  where player_id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;
do $$
begin
  if exists (select 1 from public.get_messages() where body = 'Troisième mot de test') then
    raise exception 'Hidden message remains public';
  end if;
  begin
    perform public.post_message('11111111-1111-4111-8111-111111111111', 'Essai', 'Quatrième mot interdit');
    raise exception 'Message quota bypassed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Tu as déjà laissé trois mots. Merci pour tout cet amour !' then raise; end if;
  end;
  begin
    perform 1 from public.private_content;
    raise exception 'Authenticated direct private read was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select 'All birthday backend checks passed; changes are now rolled back.' as result;
rollback;
