-- Buddy is a WORKSPACE-GLOBAL agent: it appears in every bubble's @ mention list for every
-- authenticated user WITHOUT needing a `bubble_agent_bindings` row. The existing
-- `agent_definitions_select` policy (migration 20260527100000_bubble_agents_phase1_identity.sql)
-- only grants SELECT when the viewer can see a bubble that binds the agent — which means Buddy
-- (who has no bindings by design) is invisible to every browser client today. Same story for
-- `users_select_agent_identity_for_workspace_member` and Buddy's `public.users` row.
--
-- Fix: add dedicated permissive policies (OR'd with the existing ones) that allow any
-- authenticated user to read the Buddy agent's definition row and Buddy's auth/public.users row.
-- Scope the new policies by `slug = 'buddy'` so @Coach / @Organizer semantics remain unchanged.
-- If we later introduce more workspace-global agents, extend the `slug IN (...)` list.

-- ---------------------------------------------------------------------------
-- 1. agent_definitions: add a Buddy-specific SELECT policy
-- ---------------------------------------------------------------------------
drop policy if exists agent_definitions_select_workspace_global on public.agent_definitions;
create policy agent_definitions_select_workspace_global on public.agent_definitions
  for select using (
    auth.uid() is not null
    and is_active
    and slug = 'buddy'
  );

comment on policy agent_definitions_select_workspace_global on public.agent_definitions is
  'Workspace-global agents (currently only ''buddy'') must be visible to every authenticated user '
  'regardless of bubble_agent_bindings. Additive to the bindings-scoped policy in '
  'migration 20260527100000_bubble_agents_phase1_identity.sql.';

-- ---------------------------------------------------------------------------
-- 2. public.users: allow reading Buddy's identity row so his avatar / display name resolve
--    in chat even though he has no workspace_members row or bubble binding.
-- ---------------------------------------------------------------------------
drop policy if exists users_select_workspace_global_agent on public.users;
create policy users_select_workspace_global_agent on public.users
  for select using (
    auth.uid() is not null
    and exists (
      select 1
      from public.agent_definitions ad
      where ad.auth_user_id = users.id
        and ad.is_active
        and ad.slug = 'buddy'
    )
  );

comment on policy users_select_workspace_global_agent on public.users is
  'Allow any authenticated user to read the Buddy bot''s public.users row. Buddy has no '
  'workspace_members row and no bubble_agent_bindings, so the workspace-scoped policies '
  'would otherwise hide his avatar / display name from chat renderings.';
