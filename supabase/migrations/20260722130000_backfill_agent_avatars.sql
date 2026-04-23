-- Phase 3: backfill `agent_definitions.avatar_url` so the NOT NULL constraint (applied by
-- the next migration in this pair) can land without orphaning existing agent rows.
--
-- Buddy canonical asset: `/brand/BuddyBubble-mark.svg` (see `public/brand/`).
-- Coach / Organizer: confirm dedicated canonical URLs with product (Justin) before
-- changing these UPDATEs — only `BuddyBubble-mark.svg` exists under `public/brand/` today.
-- Until then, all three slugs reuse the Buddy mark so `avatar_url` is non-null and the
-- feed + typing indicator stay in sync.
--
-- Manual DOWN (not applied by CLI): `docs/refactor/migrations-phase3-manual-down/backfill_agent_avatars.down.sql`
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
