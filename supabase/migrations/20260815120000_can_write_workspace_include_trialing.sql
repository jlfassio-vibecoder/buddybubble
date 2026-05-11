-- Align `can_write_workspace` with `can_view_bubble` / `can_write_bubble` after
-- `trialing` was introduced (20260628120000_trialing_role_storefront_lead.sql).
--
-- Problem: `bubbles_insert` (and other workspace-scoped INSERT policies) use
-- `with check (public.can_write_workspace(workspace_id))`, but `trialing` was
-- never added to this helper. Storefront Lead users get member-tier UI (see
-- `src/lib/permissions.ts` ROLE_RANK) and can open the create-bubble form, yet
-- client inserts fail with "new row violates row-level security policy".

create or replace function public.can_write_workspace(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'member', 'trialing')
  );
$$;
