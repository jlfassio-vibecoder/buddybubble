-- Manual rollback for `supabase/migrations/20260723120000_swap_coach_organizer_avatars.sql`
-- (not executed by Supabase CLI).
--
-- Reverts Coach and Organizer avatars back to the Phase 3 placeholder mark, but only when the
-- current `avatar_url` still matches the Phase 4 canonical value. If a later migration has
-- overwritten the avatar to something else (e.g. a redesigned Coach mark), this is a no-op for
-- that slug — intentional: the rollback must not clobber an out-of-band fix.
--
-- Idempotent.

update public.agent_definitions
set avatar_url = '/brand/BuddyBubble-mark.svg'
where slug = 'coach'
  and avatar_url = '/brand/BuddyBubble-Coach-mark.svg';

update public.agent_definitions
set avatar_url = '/brand/BuddyBubble-mark.svg'
where slug = 'organizer'
  and avatar_url = '/brand/BuddyBubble-Organizer-mark.svg';
