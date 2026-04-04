-- Allow members to read basic profile fields for other users in the same workspace
-- (required for chat message author display and joins from messages.user_id).

create policy users_select_workspace_peers on public.users
  for select using (
    exists (
      select 1
      from public.workspace_members wm_self
      inner join public.workspace_members wm_peer
        on wm_self.workspace_id = wm_peer.workspace_id
      where wm_self.user_id = auth.uid()
        and wm_peer.user_id = users.id
    )
  );
