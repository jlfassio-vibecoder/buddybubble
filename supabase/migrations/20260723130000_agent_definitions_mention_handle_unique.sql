-- Phase 4: enforce global case-insensitive uniqueness on `agent_definitions.mention_handle`.
--
-- Rationale: the client resolver (`src/lib/agents/resolveTargetAgent.ts`) and every
-- `*-agent-dispatch` edge function parse `@<handle>` case-insensitively and match against
-- `mention_handle`. If two rows shared a handle (even differing only in case), the resolver
-- would pick by list order — silently routing a user's `@Coach` message to whichever row
-- happened to sort first. Make that impossible at the DB level.
--
-- Pre-flight guard: abort loudly if any collisions exist today so ops sees the problem before
-- the unique index would do it for them with a confusing generic error.
--
-- Manual DOWN (not applied by CLI):
--   `docs/refactor/migrations-phase4-manual-down/agent_definitions_mention_handle_unique.down.sql`

do $$
begin
  if exists (
    select lower(mention_handle)
    from public.agent_definitions
    group by lower(mention_handle)
    having count(*) > 1
  ) then
    raise exception
      'Duplicate mention_handle (case-insensitive) exists in agent_definitions. Resolve before applying.';
  end if;
end $$;

create unique index agent_definitions_mention_handle_lower_idx
  on public.agent_definitions (lower(mention_handle));

comment on index public.agent_definitions_mention_handle_lower_idx is
  'Global case-insensitive uniqueness on mention_handle. Phase 4 — see '
  '`docs/refactor/migrations-phase4-manual-down/agent_definitions_mention_handle_unique.down.sql` '
  'for rollback.';
