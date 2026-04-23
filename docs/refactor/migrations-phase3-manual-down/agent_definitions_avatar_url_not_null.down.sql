-- Manual rollback for `supabase/migrations/20260722140000_agent_definitions_avatar_url_not_null.sql`
-- (not executed by Supabase CLI). Run after any data-only rollback that must allow NULLs.

alter table public.agent_definitions
  alter column avatar_url drop not null;
