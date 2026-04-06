-- approve_invitation_join_request: if the requester is already a workspace member, resolve the
-- pending row before enforcing max_uses (avoids "fully consumed" when they joined elsewhere).

create or replace function public.approve_invitation_join_request(p_join_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  jr public.invitation_join_requests%rowtype;
  inv public.invitations%rowtype;
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

  begin
    select * into strict inv
    from public.invitations
    where id = jr.invitation_id
    for update;
  exception
    when no_data_found then
      raise exception 'Invite not found';
  end;

  if inv.revoked_at is not null then
    raise exception 'Invite revoked';
  end if;

  if inv.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = jr.workspace_id
      and wm.user_id = jr.user_id
  ) then
    update public.invitation_join_requests j
    set status = 'approved',
        resolved_at = now()
    where j.id = jr.id;

    return json_build_object(
      'outcome', 'approved',
      'workspace_id', jr.workspace_id,
      'user_id', jr.user_id,
      'join_request_id', jr.id,
      'already_member', true
    );
  end if;

  if inv.uses_count >= inv.max_uses then
    raise exception 'Invite fully consumed';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (jr.workspace_id, jr.user_id, 'member');

  update public.invitations i
  set uses_count = i.uses_count + 1
  where i.id = inv.id
    and i.uses_count < i.max_uses;

  if not found then
    delete from public.workspace_members wm
    where wm.workspace_id = jr.workspace_id
      and wm.user_id = jr.user_id;
    raise exception 'Invite fully consumed';
  end if;

  update public.invitation_join_requests j
  set status = 'approved',
      resolved_at = now()
  where j.id = jr.id;

  return json_build_object(
    'outcome', 'approved',
    'workspace_id', jr.workspace_id,
    'user_id', jr.user_id,
    'join_request_id', jr.id,
    'already_member', false
  );
end;
$$;
