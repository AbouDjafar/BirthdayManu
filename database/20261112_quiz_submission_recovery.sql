-- A retried request is the same play, even if the first response was lost.
-- Existing quiz RPCs remain available for clients using the previous bundle.
-- No answers, access codes, letters or client-readable identifiers are added.
begin;
select pg_catalog.pg_advisory_xact_lock(7719420261110::bigint);

create table if not exists birthday_private.quiz_submissions (
  attempt_id uuid primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (
    pg_catalog.jsonb_typeof(result) = 'object' and result ?& array['score', 'best']
  ),
  created_at timestamptz not null default pg_catalog.now()
);
create index if not exists birthday_quiz_submissions_player
  on birthday_private.quiz_submissions (player_id);
alter table birthday_private.quiz_submissions enable row level security;
revoke all on table birthday_private.quiz_submissions from public, anon, authenticated;

create or replace function birthday_private.save_quiz_once(
  p_player_id uuid, p_first_name text, p_answers jsonb, p_attempt_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_name text;
  v_hash text;
  v_previous birthday_private.quiz_submissions%rowtype;
  v_result jsonb;
begin
  if p_player_id is null or p_attempt_id is null then
    raise exception using errcode = '22023', message = 'Identifiant de partie invalide.';
  end if;
  v_name := birthday_private.normalized_name(p_first_name);
  -- jsonb canonicalizes object key order. No answer text is stored in this log.
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'player_id', p_player_id, 'first_name', v_name, 'answers', p_answers
    )::text, 'UTF8'
  )), 'hex');
  -- Serialize equal IDs before consulting the cache, including concurrent calls.
  -- Hash collisions only serialize unrelated requests; the UUID remains the key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'birthday-quiz-attempt:' || p_attempt_id::text, 0
  ));
  select q.* into v_previous from birthday_private.quiz_submissions q
    where q.attempt_id = p_attempt_id;
  if found then
    if v_previous.player_id <> p_player_id or v_previous.payload_hash <> v_hash then
      raise exception using errcode = '22023', message = 'Cette partie a déjà été envoyée avec d’autres réponses ou une autre identité.';
    end if;
    return v_previous.result;
  end if;
  -- Validation, score update and receipt insertion share the same transaction.
  v_result := birthday_private.save_quiz(p_player_id, v_name, p_answers);
  insert into birthday_private.quiz_submissions (attempt_id, player_id, payload_hash, result)
    values (p_attempt_id, p_player_id, v_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.submit_quiz_once(
  p_player_id uuid, p_first_name text, p_answers jsonb, p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.lower(birthday_private.normalized_name(p_first_name)) = pg_catalog.lower('Manuella l''Anniversaireuse') then
    raise exception using errcode = '22023', message = 'Ce prénom est réservé à la reine du jour.';
  end if;
  if exists (select 1 from public.secret_access s where s.player_id = p_player_id) then
    raise exception using errcode = '22023', message = 'Identifiant de joueuse invalide.';
  end if;
  return birthday_private.save_quiz_once(p_player_id, p_first_name, p_answers, p_attempt_id);
end;
$$;

create or replace function public.submit_manuella_quiz_once(
  p_code text, p_answers jsonb, p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  -- Authenticate every request, including retries served from the receipt log.
  v_id := birthday_private.manuella_player(p_code);
  if v_id is null then
    raise exception using errcode = '22023', message = 'Accès indisponible.';
  end if;
  return birthday_private.save_quiz_once(v_id, 'Manuella l''Anniversaireuse', p_answers, p_attempt_id);
end;
$$;

revoke all on function birthday_private.save_quiz_once(uuid, text, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.submit_quiz_once(uuid, text, jsonb, uuid),
  public.submit_manuella_quiz_once(text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_quiz_once(uuid, text, jsonb, uuid),
  public.submit_manuella_quiz_once(text, jsonb, uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
