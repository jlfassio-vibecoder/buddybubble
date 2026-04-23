-- Manual rollback for
-- `supabase/migrations/20260723130000_agent_definitions_mention_handle_unique.sql`
-- (not executed by Supabase CLI).

drop index if exists public.agent_definitions_mention_handle_lower_idx;
