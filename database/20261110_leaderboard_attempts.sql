-- Expose the existing server-side attempt count without exposing player IDs.
-- Safe to re-run; no scores, participants or private configuration are changed.
begin;
select pg_catalog.pg_advisory_xact_lock(7719420261110::bigint);

-- A TABLE return type cannot be extended with CREATE OR REPLACE FUNCTION.
drop function if exists public.get_leaderboard();
create function public.get_leaderboard()
returns table (first_name text, best_score integer, updated_at timestamptz, attempts integer)
language sql stable security definer set search_path = '' as $$
  select p.first_name, s.best_score, s.updated_at, s.attempts
  from public.scores s join public.players p on p.id = s.player_id
  order by s.best_score desc, s.updated_at asc, p.first_name asc;
$$;

revoke execute on function public.get_leaderboard() from public, anon, authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
