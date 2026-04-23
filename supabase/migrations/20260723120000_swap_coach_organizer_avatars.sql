-- Phase 4: replace the Phase 3 placeholder avatars for `coach` and `organizer`.
--
-- Phase 3 backfill (`20260722130000_backfill_agent_avatars.sql`) seeded all three agent rows
-- with `/brand/BuddyBubble-mark.svg` so the NOT NULL migration could land without orphaned
-- rows. That was intentionally temporary: @Coach and @Organizer each have their own brand
-- mark, and sharing Buddy's asset made every agent look identical in the chat feed and the
-- typing indicator.
--
-- Canonical asset URLs (confirmed by Justin, 2026-04):
--   * coach     -> `/brand/BuddyBubble-Coach-mark.svg`
--   * organizer -> `/brand/BuddyBubble-Organizer-mark.svg`
--   * buddy     -> `/brand/BuddyBubble-mark.svg` (unchanged; see Phase 3 backfill)
--
-- Conditional UPDATEs: only swap rows whose current `avatar_url` matches the Phase 3 placeholder.
-- This keeps the migration idempotent and prevents silently overwriting a deliberate value set
-- in a later migration / out-of-band fix.
--
-- Manual DOWN (not applied by CLI):
--   `docs/refactor/migrations-phase4-manual-down/swap_coach_organizer_avatars.down.sql`

update public.agent_definitions
set avatar_url = '/brand/BuddyBubble-Coach-mark.svg'
where slug = 'coach'
  and avatar_url = '/brand/BuddyBubble-mark.svg';

update public.agent_definitions
set avatar_url = '/brand/BuddyBubble-Organizer-mark.svg'
where slug = 'organizer'
  and avatar_url = '/brand/BuddyBubble-mark.svg';
