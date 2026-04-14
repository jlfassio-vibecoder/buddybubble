-- Phase 2: storefront trial isolation — tighten tasks visibility for workspace guests.
-- See docs/tdd-lead-onboarding.md §5.
--
-- Non-guests: same effective rules as before (can_view_bubble OR assigned_to = auth.uid()).
-- Guests: additionally restrict SELECT to assigned-to-self OR (can_view AND (unassigned OR self));
--          UPDATE USING mirrors SELECT write paths; WITH CHECK unchanged from rbac_security_fixes.

create or replace function public.is_workspace_guest(_workspace_id uuid)
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
      and wm.role = 'guest'
  );
$$;

comment on function public.is_workspace_guest(uuid) is
  'True when auth.uid() has role guest in this workspace; used by tasks RLS (storefront trial isolation).';

drop policy tasks_select on public.tasks;

create policy tasks_select on public.tasks
  for select using (
    (
      not public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and (
        public.can_view_bubble(bubble_id)
        or assigned_to = auth.uid()
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and assigned_to = auth.uid()
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and public.can_view_bubble(bubble_id)
      and (assigned_to is null or assigned_to = auth.uid())
    )
  );

drop policy tasks_update on public.tasks;

create policy tasks_update on public.tasks
  for update
  using (
    (
      not public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and (
        public.can_write_bubble(bubble_id)
        or assigned_to = auth.uid()
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and assigned_to = auth.uid()
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and public.can_write_bubble(bubble_id)
      and (assigned_to is null or assigned_to = auth.uid())
    )
  )
  with check (
    public.can_write_bubble(bubble_id)
    or (
      assigned_to = auth.uid()
      and bubble_id = public.task_bubble_id(tasks.id)
    )
  );
