-- Restore / harden bubbles INSERT for authenticated clients.
-- Bubbles rows tie to the user via workspace_id → public.workspaces (created_by),
-- and via public.workspace_members for admin/member/owner write access.
-- There is no owner_id column on public.bubbles.

drop policy if exists bubbles_insert on public.bubbles;

create policy bubbles_insert on public.bubbles
  for insert
  to authenticated
  with check (
    public.can_write_workspace(workspace_id)
    or auth.uid() = (
      select w.created_by
      from public.workspaces w
      where w.id = workspace_id
    )
  );
