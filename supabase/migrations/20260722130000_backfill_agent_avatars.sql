-- Phase 3: backfill `agent_definitions.avatar_url` so the NOT NULL constraint (applied by
-- the next migration in this pair) can land without orphaning existing agent rows.
--
-- Canonical asset choice (2026-04 discussion): Coach and Organizer do NOT have dedicated
-- branded marks in `public/brand/` yet. Justin signed off on temporarily reusing
-- `/brand/BuddyBubble-mark.svg` as a single-brand fallback for all three agents so that
-- Phase 3 can enforce NOT NULL on the column without shipping placeholder letter avatars.
-- When Coach / Organizer get dedicated artwork, a follow-up migration can UPDATE their
-- rows individually.
--
-- Idempotency: guarded by `avatar_url IS NULL` so re-running is a no-op. Does NOT touch
-- rows that already have an avatar_url set.

update public.agent_definitions
set avatar_url = '/brand/BuddyBubble-mark.svg'
where slug = 'buddy' and avatar_url is null;

update public.agent_definitions
set avatar_url = '/brand/BuddyBubble-mark.svg'
where slug = 'coach' and avatar_url is null;

update public.agent_definitions
set avatar_url = '/brand/BuddyBubble-mark.svg'
where slug = 'organizer' and avatar_url is null;

-- Down (manual, for ops rollback — NOT auto-applied):
--   update public.agent_definitions
--   set avatar_url = null
--   where slug in ('buddy', 'coach', 'organizer')
--     and avatar_url = '/brand/BuddyBubble-mark.svg';
--
-- Only reverts rows whose avatar_url still matches the backfilled value; rows that were
-- hand-edited to a different path are left untouched. Must be run BEFORE reverting the
-- companion NOT NULL migration, since setting NULL on a NOT NULL column will fail.
