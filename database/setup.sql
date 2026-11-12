-- Independent Supabase backend. Run in the SQL Editor of a dedicated project.
-- No real answers, private message or access code are installed by this file.
-- Re-running preserves application data and configuration.
begin;
select pg_catalog.pg_advisory_xact_lock(7719420261110::bigint);

create schema if not exists birthday_private;
revoke all on schema birthday_private from public, anon, authenticated;

create table if not exists public.players (
  id uuid primary key,
  first_name text not null check (pg_catalog.char_length(first_name) between 2 and 30),
  created_at timestamptz not null default pg_catalog.now()
);
create table if not exists public.scores (
  player_id uuid primary key references public.players(id) on delete cascade,
  best_score integer not null check (best_score between 0 and 100),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default pg_catalog.now()
);
create table if not exists public.messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  first_name text not null check (pg_catalog.char_length(first_name) between 2 and 30),
  body text not null check (pg_catalog.char_length(body) between 1 and 280),
  created_at timestamptz not null default pg_catalog.now(),
  notified_owner boolean not null default false,
  notified_manuella boolean not null default false,
  hidden boolean not null default false
);
create index if not exists birthday_messages_player_date
  on public.messages (player_id, created_at desc);
create index if not exists birthday_messages_visible_date
  on public.messages (created_at desc) where hidden = false;
create table if not exists public.quiz_answers (
  question_id text primary key check (question_id in ('q1', 'q2', 'q3', 'q4', 'q5')),
  correct_option text not null check (pg_catalog.char_length(correct_option) between 1 and 200)
);
create table if not exists public.private_content (
  key text primary key,
  value text not null
);
create table if not exists public.secret_access (
  id integer primary key check (id = 1),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  player_id uuid not null unique references public.players(id)
);

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

alter table public.players enable row level security;
alter table public.scores enable row level security;
alter table public.messages enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.private_content enable row level security;
alter table public.secret_access enable row level security;
revoke all on table public.players, public.scores, public.messages,
  public.quiz_answers, public.private_content, public.secret_access
  from public, anon, authenticated;
grant select, insert, update, delete on table public.players, public.scores,
  public.messages, public.quiz_answers, public.private_content, public.secret_access
  to service_role;

-- Helpers are not exposed through PostgREST and are not executable by clients.
create or replace function birthday_private.normalized_name(p_name text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_name text;
begin
  v_name := pg_catalog.regexp_replace(pg_catalog.btrim(p_name), '[[:space:]]+', ' ', 'g');
  if v_name is null or pg_catalog.char_length(v_name) not between 2 and 30 then
    raise exception using errcode = '22023', message = 'Le prénom doit contenir entre 2 et 30 caractères.';
  end if;
  return v_name;
end;
$$;

create or replace function birthday_private.score_answers(p_answers jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_total integer; v_correct integer;
begin
  select pg_catalog.count(*)::integer into v_total from public.quiz_answers;
  if v_total <> 5 then
    raise exception using errcode = 'P0001', message = 'Le quiz n’est pas encore configuré. Réessaie un peu plus tard.';
  end if;
  if p_answers is null or pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    raise exception using errcode = '22023', message = 'Les réponses du quiz sont invalides.';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_answers)) <> v_total
    or exists (
      select 1 from pg_catalog.jsonb_each(p_answers) a
      where pg_catalog.jsonb_typeof(a.value) <> 'string'
        or pg_catalog.char_length(a.value #>> '{}') not between 1 and 200
        or not exists (select 1 from public.quiz_answers q where q.question_id = a.key)
    ) then
    raise exception using errcode = '22023', message = 'Réponds aux cinq questions avant de continuer.';
  end if;
  select pg_catalog.count(*)::integer into v_correct
    from public.quiz_answers q where p_answers ->> q.question_id = q.correct_option;
  return pg_catalog.round(100.0 * v_correct / v_total)::integer;
end;
$$;

create or replace function birthday_private.manuella_player(p_code text)
returns uuid language plpgsql stable security invoker set search_path = '' as $$
declare v_player_id uuid;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{43,128}$' then
    return null;
  end if;
  select s.player_id into v_player_id from public.secret_access s
    where s.id = 1 and s.code_hash = pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_code, 'UTF8')), 'hex');
  return v_player_id;
end;
$$;

create or replace function birthday_private.save_quiz(
  p_player_id uuid, p_first_name text, p_answers jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_name text; v_score integer; v_best integer;
begin
  if p_player_id is null then
    raise exception using errcode = '22023', message = 'Identifiant de joueuse invalide.';
  end if;
  v_name := birthday_private.normalized_name(p_first_name);
  v_score := birthday_private.score_answers(p_answers);
  -- The player row also serializes message quota checks for this browser.
  insert into public.players (id, first_name) values (p_player_id, v_name)
    on conflict (id) do update set first_name = excluded.first_name;
  insert into public.scores (player_id, best_score, attempts, updated_at)
    values (p_player_id, v_score, 1, pg_catalog.clock_timestamp())
    on conflict (player_id) do update
      set best_score = greatest(public.scores.best_score, excluded.best_score),
          attempts = public.scores.attempts + 1,
          updated_at = excluded.updated_at
    returning best_score into v_best;
  return pg_catalog.jsonb_build_object('score', v_score, 'best', v_best);
end;
$$;

create or replace function birthday_private.save_message(p_player_id uuid, p_body text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_name text; v_body text; v_count bigint; v_last timestamptz;
begin
  v_body := pg_catalog.regexp_replace(pg_catalog.btrim(p_body), '[[:space:]]+', ' ', 'g');
  if v_body is null or pg_catalog.char_length(v_body) not between 1 and 280 then
    raise exception using errcode = '22023', message = 'Ton mot doit contenir entre 1 et 280 caractères.';
  end if;
  -- Deliberately small, editable filter. This is not comprehensive moderation.
  if v_body ~* '(^|[^[:alpha:]])(connasse|salope|encul[ée]e?)([^[:alpha:]]|$)' then
    raise exception using errcode = '22023', message = 'Reformule ton mot avec un peu plus de douceur.';
  end if;
  select p.first_name into v_name from public.players p
    where p.id = p_player_id for update;
  if v_name is null then
    raise exception using errcode = '22023', message = 'Termine d’abord le quiz avant de laisser un mot.';
  end if;
  -- Hidden messages still count. The player lock prevents concurrent bypasses.
  select pg_catalog.count(*), pg_catalog.max(m.created_at) into v_count, v_last
    from public.messages m where m.player_id = p_player_id;
  if v_count >= 3 then
    raise exception using errcode = 'P0001', message = 'Tu as déjà laissé trois mots. Merci pour tout cet amour !';
  end if;
  if v_last > pg_catalog.clock_timestamp() - interval '30 seconds' then
    raise exception using errcode = 'P0001', message = 'Attends 30 secondes avant de laisser un autre mot.';
  end if;
  insert into public.messages (player_id, first_name, body, created_at)
    values (p_player_id, v_name, v_body, pg_catalog.clock_timestamp());
end;
$$;

create or replace function public.submit_quiz(p_player_id uuid, p_first_name text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.lower(birthday_private.normalized_name(p_first_name)) = pg_catalog.lower('Manuella l''Anniversaireuse') then
    raise exception using errcode = '22023', message = 'Ce prénom est réservé à la reine du jour.';
  end if;
  if exists (select 1 from public.secret_access s where s.player_id = p_player_id) then
    raise exception using errcode = '22023', message = 'Identifiant de joueuse invalide.';
  end if;
  return birthday_private.save_quiz(p_player_id, p_first_name, p_answers);
end;
$$;

create or replace function public.get_my_best(p_player_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('first_name', p.first_name, 'best_score', s.best_score)
  from public.players p join public.scores s on s.player_id = p.id
  where p.id = p_player_id
    and not exists (select 1 from public.secret_access a where a.player_id = p.id);
$$;

-- PostgreSQL requires recreation when a table-returning RPC gains a column.
-- The surrounding transaction keeps this change and its grants atomic.
drop function if exists public.get_leaderboard();
create function public.get_leaderboard()
returns table (first_name text, best_score integer, updated_at timestamptz, attempts integer)
language sql stable security definer set search_path = '' as $$
  select p.first_name, s.best_score, s.updated_at, s.attempts
  from public.scores s join public.players p on p.id = s.player_id
  order by s.best_score desc, s.updated_at asc, p.first_name asc;
$$;

create or replace function public.get_messages()
returns table (first_name text, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.first_name, m.body, m.created_at from public.messages m
  where not m.hidden order by m.created_at desc, m.id desc;
$$;

create or replace function public.post_message(p_player_id uuid, p_first_name text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- The supplied name is validated, but the stored canonical name is displayed.
  perform birthday_private.normalized_name(p_first_name);
  if exists (select 1 from public.secret_access s where s.player_id = p_player_id) then
    raise exception using errcode = '22023', message = 'Identifiant de joueuse invalide.';
  end if;
  perform birthday_private.save_message(p_player_id, p_body);
end;
$$;

create or replace function public.get_manuella_content(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid; v_text text; v_photo text; v_best integer;
begin
  v_id := birthday_private.manuella_player(p_code);
  if v_id is null then return null; end if;
  select c.value into v_text from public.private_content c where c.key = 'manuella_message';
  if v_text is null then return null; end if;
  select c.value into v_photo from public.private_content c where c.key = 'manuella_photo';
  select s.best_score into v_best from public.scores s where s.player_id = v_id;
  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('text', v_text, 'photoUrl', v_photo))
    || pg_catalog.jsonb_build_object('bestScorePercent', v_best);
end;
$$;

create or replace function public.submit_manuella_quiz(p_code text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  v_id := birthday_private.manuella_player(p_code);
  if v_id is null then
    raise exception using errcode = '22023', message = 'Accès indisponible.';
  end if;
  return birthday_private.save_quiz(v_id, 'Manuella l''Anniversaireuse', p_answers);
end;
$$;

create or replace function public.post_manuella_message(p_code text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  v_id := birthday_private.manuella_player(p_code);
  if v_id is null then
    raise exception using errcode = '22023', message = 'Accès indisponible.';
  end if;
  perform birthday_private.save_message(v_id, p_body);
end;
$$;

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

-- ADMIN ONLY. The caller generates a 32-byte random code and submits its hash.
-- Reconfiguration/rotation preserves Manuella's unique server-owned identity.
create or replace function public.configure_birthday(
  p_correct_answers jsonb, p_code_hash text, p_manuella_text text,
  p_manuella_photo_url text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_correct_answers is null or pg_catalog.jsonb_typeof(p_correct_answers) <> 'object' then
    raise exception using errcode = '22023', message = 'Il faut exactement cinq bonnes réponses.';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_correct_answers)) <> 5
    or exists (
      select 1 from pg_catalog.jsonb_each(p_correct_answers) a
      where a.key not in ('q1', 'q2', 'q3', 'q4', 'q5')
        or pg_catalog.jsonb_typeof(a.value) <> 'string'
        or pg_catalog.char_length(a.value #>> '{}') not between 1 and 200
        or pg_catalog.btrim(a.value #>> '{}') = ''
    ) then
    raise exception using errcode = '22023', message = 'Les clés q1 à q5 et les textes exacts des options sont requis.';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Le hash SHA-256 du code secret est invalide.';
  end if;
  if p_manuella_text is null or pg_catalog.char_length(pg_catalog.btrim(p_manuella_text)) not between 1 and 20000 then
    raise exception using errcode = '22023', message = 'Le message privé doit contenir entre 1 et 20000 caractères.';
  end if;
  if p_manuella_photo_url is not null and (
    pg_catalog.char_length(p_manuella_photo_url) > 4096 or p_manuella_photo_url !~ '^https://[^[:space:]]+$'
  ) then
    raise exception using errcode = '22023', message = 'L’URL de photo doit utiliser HTTPS.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7719420261111::bigint);
  select s.player_id into v_id from public.secret_access s where s.id = 1;
  if v_id is null then v_id := pg_catalog.gen_random_uuid(); end if;
  insert into public.players (id, first_name) values (v_id, 'Manuella l''Anniversaireuse')
    on conflict (id) do update set first_name = excluded.first_name;
  insert into public.secret_access (id, code_hash, player_id) values (1, p_code_hash, v_id)
    on conflict (id) do update set code_hash = excluded.code_hash;
  insert into public.quiz_answers (question_id, correct_option)
    select a.key, a.value #>> '{}' from pg_catalog.jsonb_each(p_correct_answers) a
    on conflict (question_id) do update set correct_option = excluded.correct_option;
  insert into public.private_content (key, value) values ('manuella_message', p_manuella_text)
    on conflict (key) do update set value = excluded.value;
  if p_manuella_photo_url is null then
    delete from public.private_content where key = 'manuella_photo';
  else
    insert into public.private_content (key, value) values ('manuella_photo', p_manuella_photo_url)
      on conflict (key) do update set value = excluded.value;
  end if;
end;
$$;

-- Do not add scores/messages to supabase_realtime: their IDs are credentials.
-- No record, player ID, access code or private content is broadcast.
create or replace function birthday_private.broadcast_wall_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'birthday-wall', false);
  return null;
end;
$$;
drop trigger if exists birthday_scores_changed on public.scores;
create trigger birthday_scores_changed after insert or update or delete on public.scores
  for each statement execute function birthday_private.broadcast_wall_change();
drop trigger if exists birthday_messages_changed on public.messages;
create trigger birthday_messages_changed after insert or update or delete on public.messages
  for each statement execute function birthday_private.broadcast_wall_change();

revoke all on all functions in schema birthday_private from public, anon, authenticated;
revoke execute on function public.submit_quiz_once(uuid, text, jsonb, uuid),
  public.submit_manuella_quiz_once(text, jsonb, uuid),
  public.submit_quiz(uuid, text, jsonb),
  public.get_my_best(uuid), public.get_leaderboard(), public.get_messages(),
  public.post_message(uuid, text, text), public.get_manuella_content(text),
  public.submit_manuella_quiz(text, jsonb), public.post_manuella_message(text, text),
  public.configure_birthday(jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_quiz_once(uuid, text, jsonb, uuid),
  public.submit_manuella_quiz_once(text, jsonb, uuid),
  public.submit_quiz(uuid, text, jsonb),
  public.get_my_best(uuid), public.get_leaderboard(), public.get_messages(),
  public.post_message(uuid, text, text), public.get_manuella_content(text),
  public.submit_manuella_quiz(text, jsonb), public.post_manuella_message(text, text)
  to anon, authenticated;
grant execute on function public.configure_birthday(jsonb, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
