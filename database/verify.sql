-- Read-only audit. Expected: every `ok` value is true.
-- Run as the SQL Editor administrator, after setup.sql.
select t.tablename,
  t.rowsecurity as rls_enabled,
  t.rowsecurity and not pg_catalog.has_table_privilege('anon', 'public.' || t.tablename, 'SELECT,INSERT,UPDATE,DELETE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || t.tablename, 'SELECT,INSERT,UPDATE,DELETE') as ok
from pg_catalog.pg_tables t
where t.schemaname = 'public' and t.tablename in
  ('players', 'scores', 'messages', 'quiz_answers', 'private_content', 'secret_access')
order by t.tablename;

select p.proname,
  p.prosecdef and p.proconfig @> array['search_path=""']::text[]
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as ok
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'submit_quiz', 'get_my_best', 'get_leaderboard', 'get_messages',
  'post_message', 'get_manuella_content', 'submit_manuella_quiz', 'post_manuella_message',
  'submit_quiz_once', 'submit_manuella_quiz_once'
)
order by p.proname;

-- The leaderboard exposes counts, never the UUID used as a browser credential.
select pg_catalog.pg_get_function_result('public.get_leaderboard()'::regprocedure)
    = 'TABLE(first_name text, best_score integer, updated_at timestamp with time zone, attempts integer)'
  and not exists (
    select 1 from pg_catalog.pg_proc p,
      lateral pg_catalog.aclexplode(p.proacl) a
    where p.oid = 'public.get_leaderboard()'::regprocedure
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) as leaderboard_contract_ok;

select
  not pg_catalog.has_function_privilege('anon', 'public.configure_birthday(jsonb,text,text,text)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.configure_birthday(jsonb,text,text,text)', 'EXECUTE')
  and pg_catalog.has_function_privilege('service_role', 'public.configure_birthday(jsonb,text,text,text)', 'EXECUTE') as admin_rpc_ok,
  not pg_catalog.has_schema_privilege('anon', 'birthday_private', 'USAGE')
  and not pg_catalog.has_schema_privilege('authenticated', 'birthday_private', 'USAGE') as private_helpers_ok;

-- Empty initial configuration is normal. Never prints answer values or hashes.
select
  (select pg_catalog.count(*) from public.quiz_answers) as configured_question_count,
  exists (select 1 from public.secret_access where id = 1) as private_access_configured,
  exists (select 1 from public.private_content where key = 'manuella_message') as private_message_configured;

-- Sensitive source tables must not be directly published as Postgres Changes.
select not exists (
  select 1 from pg_catalog.pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename in ('players', 'scores', 'messages', 'quiz_answers', 'private_content', 'secret_access')
) as realtime_sources_private_ok;

-- Receipts allow recovery through the RPC only, never through a public table.
select c.relrowsecurity
  and not pg_catalog.has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  and not pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  and not pg_catalog.has_function_privilege('anon',
    'birthday_private.save_quiz_once(uuid,text,jsonb,uuid)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated',
    'birthday_private.save_quiz_once(uuid,text,jsonb,uuid)', 'EXECUTE')
  and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where schemaname = 'birthday_private' and tablename = 'quiz_submissions'
  ) as submission_receipts_private_ok
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'birthday_private' and c.relname = 'quiz_submissions';

select not exists (
  select 1 from pg_catalog.pg_proc p, lateral pg_catalog.aclexplode(p.proacl) a
  where p.oid in ('public.submit_quiz_once(uuid,text,jsonb,uuid)'::regprocedure,
    'public.submit_manuella_quiz_once(text,jsonb,uuid)'::regprocedure)
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
) as submission_rpc_no_public_execute_ok;
