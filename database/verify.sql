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
  'post_message', 'get_manuella_content', 'submit_manuella_quiz', 'post_manuella_message'
)
order by p.proname;

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
