-- Security fixes for RBAC review comments.
--
-- Fix 1: bubble_members_insert_admin — ensure the user being granted access
--         is actually a member of the bubble's workspace (defence-in-depth).
-- Fix 2: tasks_update — assigned_to override must not allow moving a task to a
--         different bubble (prevents cross-bubble exfiltration).

-- ---------------------------------------------------------------------------
-- Fix 1: bubble_members_insert_admin — add workspace-membership guard
-- ---------------------------------------------------------------------------

drop policy bubble_members_insert_admin on public.bubble_members;

create policy bubble_members_insert_admin on public.bubble_members
  for insert with check (
    -- Caller must be a workspace admin/owner
    public.is_workspace_admin(
      (select b.workspace_id from public.bubbles b where b.id = bubble_id)
    )
    -- The user being added must already be a member of that workspace
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = (select b.workspace_id from public.bubbles b where b.id = bubble_id)
        and wm.user_id = bubble_members.user_id
    )
  );

-- ---------------------------------------------------------------------------
-- Fix 2: tasks_update — prevent assigned_to path from changing bubble_id
-- ---------------------------------------------------------------------------

-- Helper: return a task's current bubble_id without RLS (SECURITY DEFINER).
-- Used in the WITH CHECK clause below to lock bubble_id for the assigned-to path.
create or replace function public.task_bubble_id(_task_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select t.bubble_id from public.tasks t where t.id = _task_id;
$$;

drop policy tasks_update on public.tasks;

create policy tasks_update on public.tasks
  for update
  using (
    -- Who can target this task for an update
    public.can_write_bubble(bubble_id)
    or assigned_to = auth.uid()
  )
  with check (
    -- Full write path: destination bubble must be writable (allows moving tasks)
    public.can_write_bubble(bubble_id)
    -- Assigned-to path: can edit task content, but bubble_id must remain unchanged
    or (
      assigned_to = auth.uid()
      and bubble_id = public.task_bubble_id(tasks.id)
    )
  );
