-- Phase 5: waiting room — reject RPC + admins can read pending requester profiles.
--
-- Reject does NOT increment invitations.uses_count (contrast: approve_invitation_join_request).

-- ---------------------------------------------------------------------------
-- RLS: workspace admins may read users who have a pending join request to that workspace
-- (pending users are not workspace_members yet, so users_select_workspace_peers does not apply).
-- ---------------------------------------------------------------------------

create policy users_select_pending_invite_requester_for_workspace_admin
  on public.users
  for select
  using (
    exists (
      select 1
      from public.invitation_join_requests j
      where j.user_id = users.id
        and j.status = 'pending'
        and public.is_workspace_admin(j.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- reject_invitation_join_request
-- ---------------------------------------------------------------------------

create or replace function public.reject_invitation_join_request(p_join_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  jr public.invitation_join_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  begin
    select * into strict jr
    from public.invitation_join_requests
    where id = p_join_request_id
    for update;
  exception
    when no_data_found then
      raise exception 'Join request not found';
  end;

  if not public.is_workspace_admin(jr.workspace_id) then
    raise exception 'Not allowed';
  end if;

  if jr.status <> 'pending' then
    raise exception 'Request is not pending';
  end if;

  update public.invitation_join_requests j
  set status = 'rejected',
      resolved_at = now()
  where j.id = jr.id;

  return json_build_object(
    'outcome', 'rejected',
    'join_request_id', jr.id,
    'workspace_id', jr.workspace_id
  );
end;
$$;

grant execute on function public.reject_invitation_join_request(uuid) to authenticated;
