-- Manual rollback for `supabase/migrations/20260722130000_backfill_agent_avatars.sql`
-- (not executed by Supabase CLI). Run ONLY rows that still match the exact backfilled URL.
--
-- Idempotent: clears avatar_url only where it equals the Phase 3 backfill value.

update public.agent_definitions
set avatar_url = null
where slug in ('buddy', 'coach', 'organizer')
  and avatar_url = '/brand/BuddyBubble-mark.svg';
