-- Restore bubbles INSERT for authenticated clients: only active workspace writers
-- (owner/admin/member via public.can_write_workspace). No created_by bypass — users
-- removed from workspace_members must not insert channels.

drop policy if exists bubbles_insert on public.bubbles;

create policy bubbles_insert on public.bubbles
  for insert
  to authenticated
  with check (public.can_write_workspace(workspace_id));
