-- Manual rollback for `supabase/migrations/20260722140000_agent_definitions_avatar_url_not_null.sql`
-- (not executed by Supabase CLI).
--
-- Safe order:
--   1) Run THIS file first (drops NOT NULL so NULL writes are allowed).
--   2) Then run `backfill_agent_avatars.down.sql` if you need to clear the backfilled paths.
-- Never run the data rollback that sets `avatar_url = NULL` while NOT NULL is still enforced.

alter table public.agent_definitions
  alter column avatar_url drop not null;

comment on column public.agent_definitions.avatar_url is null;
