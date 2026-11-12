-- Idempotent quiz regression checks, using only synthetic answers and identities.
-- Run as the SQL Editor administrator after setup.sql or the recovery migration.
-- Existing answer configuration and every test write are restored by ROLLBACK.
-- Private letters and access codes are never changed or returned.
begin;
select pg_catalog.pg_advisory_xact_lock(7719420261110::bigint);

do $$
begin
  if exists (select 1 from public.players where id in (
    '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'
  ) or first_name in ('Reprise RPC test', 'Ancienne RPC test'))
    or exists (select 1 from birthday_private.quiz_submissions where attempt_id in (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
    )) then
    raise exception 'A synthetic recovery-test identity already exists; no tests were run.';
  end if;
end;
$$;

delete from public.quiz_answers;
insert into public.quiz_answers (question_id, correct_option)
  select q, 'OPTION_RECOVERY_TEST'
  from pg_catalog.unnest(array['q1', 'q2', 'q3', 'q4', 'q5']) q;

set local role anon;
do $$
declare
  v_player constant uuid := '33333333-3333-4333-8333-333333333333';
  v_other constant uuid := '44444444-4444-4444-8444-444444444444';
  v_first constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_second constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_third constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_partial constant jsonb := '{"q1":"OPTION_RECOVERY_TEST","q2":"FAUX","q3":"FAUX","q4":"FAUX","q5":"FAUX"}';
  v_perfect constant jsonb := '{"q1":"OPTION_RECOVERY_TEST","q2":"OPTION_RECOVERY_TEST","q3":"OPTION_RECOVERY_TEST","q4":"OPTION_RECOVERY_TEST","q5":"OPTION_RECOVERY_TEST"}';
  v_wrong constant jsonb := '{"q1":"FAUX","q2":"FAUX","q3":"FAUX","q4":"FAUX","q5":"FAUX"}';
  v_result jsonb;
  v_updated timestamptz;
begin
  begin
    perform 1 from birthday_private.quiz_submissions;
    raise exception 'Anonymous direct receipt read was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform birthday_private.save_quiz_once(v_player, 'Reprise RPC test', v_partial, v_first);
    raise exception 'Anonymous direct helper call was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_quiz_once(v_player, 'Reprise RPC test', v_partial, null);
    raise exception 'A null attempt UUID was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_quiz_once(null, 'Reprise RPC test', v_partial, v_first);
    raise exception 'A null player UUID was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_quiz_once(v_player, 'X', v_partial, v_first);
    raise exception 'An invalid name was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_quiz_once(v_player, 'Reprise RPC test', '{}'::jsonb, v_first);
    raise exception 'Incomplete answers were accepted';
  exception when invalid_parameter_value then null; end;

  v_result := public.submit_quiz_once(v_player, 'Reprise RPC test', v_partial, v_first);
  if v_result <> '{"score":20,"best":20}'::jsonb then raise exception 'Initial low score is incorrect'; end if;
  v_result := public.submit_quiz_once(v_player, '  Reprise   RPC test  ',
    '{"q5":"FAUX","q4":"FAUX","q3":"FAUX","q2":"FAUX","q1":"OPTION_RECOVERY_TEST"}'::jsonb, v_first);
  if v_result <> '{"score":20,"best":20}'::jsonb then raise exception 'Retry did not return the original result'; end if;
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Reprise RPC test' and best_score = 20 and attempts = 1) then
    raise exception 'A retry counted as another play';
  end if;
  begin
    perform public.submit_quiz_once(v_player, 'Autre nom', v_partial, v_first);
    raise exception 'The same receipt UUID accepted a different name';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_quiz_once(v_player, 'Reprise RPC test', v_perfect, v_first);
    raise exception 'The same receipt UUID accepted different answers';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_quiz_once(v_other, 'Reprise RPC test', v_partial, v_first);
    raise exception 'The same receipt UUID accepted another player';
  exception when invalid_parameter_value then null; end;

  v_result := public.submit_quiz_once(v_player, 'Reprise RPC test', v_perfect, v_second);
  if v_result <> '{"score":100,"best":100}'::jsonb then raise exception 'A new improved play was not scored'; end if;
  select updated_at into strict v_updated from public.get_leaderboard() where first_name = 'Reprise RPC test';
  v_result := public.submit_quiz_once(v_player, 'Reprise RPC test', v_partial, v_first);
  if v_result <> '{"score":20,"best":20}'::jsonb then raise exception 'Old receipt changed after an improved score'; end if;
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Reprise RPC test' and best_score = 100 and attempts = 2 and updated_at = v_updated) then
    raise exception 'Recovering an old receipt changed the score, attempts or ranking date';
  end if;
  v_result := public.submit_quiz_once(v_player, 'Reprise RPC test', v_wrong, v_third);
  if v_result <> '{"score":0,"best":100}'::jsonb then raise exception 'A lower new play lost the best score'; end if;
  v_result := public.submit_quiz_once(v_player, 'Reprise RPC test', v_perfect, v_second);
  if v_result <> '{"score":100,"best":100}'::jsonb then raise exception 'Improved receipt was not recoverable'; end if;
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Reprise RPC test' and best_score = 100 and attempts = 3) then
    raise exception 'New plays and retries were counted incorrectly';
  end if;

  -- The previous app bundle must continue to work with its three-argument RPC.
  v_result := public.submit_quiz(v_other, 'Ancienne RPC test', v_wrong);
  if v_result <> '{"score":0,"best":0}'::jsonb then raise exception 'Legacy quiz RPC is incompatible'; end if;
end;
$$;
reset role;

do $$
declare
  v_id uuid;
  v_before integer;
  v_result jsonb;
  v_perfect constant jsonb := '{"q1":"OPTION_RECOVERY_TEST","q2":"OPTION_RECOVERY_TEST","q3":"OPTION_RECOVERY_TEST","q4":"OPTION_RECOVERY_TEST","q5":"OPTION_RECOVERY_TEST"}';
  v_wrong constant jsonb := '{"q1":"FAUX","q2":"FAUX","q3":"FAUX","q4":"FAUX","q5":"FAUX"}';
begin
  if (select count(*) from birthday_private.quiz_submissions
    where player_id = '33333333-3333-4333-8333-333333333333') <> 3 then
    raise exception 'Receipt count does not match the three distinct plays';
  end if;
  select player_id into v_id from public.secret_access where id = 1;
  if v_id is not null then
    select coalesce((select attempts from public.scores where player_id = v_id), 0) into v_before;
    -- Test Manuella's shared scoring/cache helper without changing her real code.
    v_result := birthday_private.save_quiz_once(v_id, 'Manuella l''Anniversaireuse', v_perfect,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
    if v_result <> '{"score":100,"best":100}'::jsonb then raise exception 'Manuella initial result is incorrect'; end if;
    v_result := birthday_private.save_quiz_once(v_id, 'Manuella l''Anniversaireuse', v_perfect,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
    if v_result <> '{"score":100,"best":100}'::jsonb then raise exception 'Manuella retry result is incorrect'; end if;
    if (select attempts from public.scores where player_id = v_id) <> v_before + 1 then
      raise exception 'Manuella retry increased her attempt count';
    end if;
    begin
      perform public.submit_quiz_once(v_id, 'Une amie', v_perfect,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
      raise exception 'A friend bypassed the reserved identity through a receipt';
    exception when invalid_parameter_value then null; end;
    begin
      perform public.submit_manuella_quiz_once('invalid', v_perfect,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
      raise exception 'An invalid secret retrieved a cached Manuella result';
    exception when invalid_parameter_value then null; end;
    v_result := birthday_private.save_quiz_once(v_id, 'Manuella l''Anniversaireuse', v_wrong,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5');
    if v_result <> '{"score":0,"best":100}'::jsonb then raise exception 'Manuella new lower play lost her best score'; end if;
    if (select attempts from public.scores where player_id = v_id) <> v_before + 2 then
      raise exception 'Manuella distinct plays were counted incorrectly';
    end if;
  end if;
end;
$$;

set local role authenticated;
do $$
begin
  begin
    perform 1 from birthday_private.quiz_submissions;
    raise exception 'Authenticated direct receipt read was allowed';
  exception when insufficient_privilege then null; end;
  perform public.submit_quiz_once('33333333-3333-4333-8333-333333333333', 'Reprise RPC test',
    '{"q1":"OPTION_RECOVERY_TEST","q2":"OPTION_RECOVERY_TEST","q3":"OPTION_RECOVERY_TEST","q4":"OPTION_RECOVERY_TEST","q5":"OPTION_RECOVERY_TEST"}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  if not exists (select 1 from public.get_leaderboard()
    where first_name = 'Reprise RPC test' and attempts = 3) then
    raise exception 'An authenticated retry counted as another play';
  end if;
end;
$$;
reset role;

select 'All recovery checks passed; synthetic changes are now rolled back.' as result;
rollback;
