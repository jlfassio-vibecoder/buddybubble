-- Phase 3: enforce NOT NULL on `public.agent_definitions.avatar_url`.
--
-- Depends on `20260722130000_backfill_agent_avatars.sql` having run first; the backfill
-- ensures every row has an avatar_url before this ALTER promotes the column to NOT NULL.
-- Split into its own file so rollback granularity is per-change:
--   - Want to keep the backfilled avatar paths but drop the NOT NULL constraint? Run only
--     the down statement of this migration.
--   - Want to keep the NOT NULL contract but change the avatar path for a specific slug?
--     Issue an UPDATE migration; do NOT touch this file.

alter table public.agent_definitions
  alter column avatar_url set not null;

comment on column public.agent_definitions.avatar_url is
  'URL for the agent''s avatar asset. NOT NULL as of 2026-07-22 — see '
  '`docs/refactor/agent-avatar-state.md` for the Phase 3 backfill that established this '
  'contract. Consumers resolve avatars via `src/lib/agents/resolveAgentAvatar.ts` which '
  'prioritizes this column over per-slug branded fallbacks.';

-- Down (manual, for ops rollback — NOT auto-applied):
--   alter table public.agent_definitions alter column avatar_url drop not null;
--   comment on column public.agent_definitions.avatar_url is null;
