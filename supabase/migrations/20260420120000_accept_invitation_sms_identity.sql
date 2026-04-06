-- Phase 6: SMS-targeted invites — match target_identity to auth.users.phone (verified).
-- Email-targeted and other invite_types keep public.users.email comparison.

create or replace function public.accept_invitation(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := nullif(trim(p_token), '');
  inv public.invitations%rowtype;
  v_email text;
  v_phone text;
  v_phone_confirmed timestamptz;
  existing_pending_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_token is null then
    raise exception 'Invalid invite token';
  end if;

  begin
    select * into strict inv
    from public.invitations
    where token = v_token
    for update;
  exception
    when no_data_found then
      raise exception 'Invite not found';
  end;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = inv.workspace_id
      and wm.user_id = v_uid
  ) then
    return json_build_object(
      'outcome', 'already_member',
      'workspace_id', inv.workspace_id,
      'invitation_id', inv.id
    );
  end if;

  if inv.revoked_at is not null then
    raise exception 'Invite revoked';
  end if;

  if inv.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if inv.target_identity is not null and length(trim(inv.target_identity)) > 0 then
    if inv.invite_type = 'sms' then
      select au.phone, au.phone_confirmed_at into v_phone, v_phone_confirmed
      from auth.users au
      where au.id = v_uid;

      if v_phone is null or v_phone_confirmed is null then
        raise exception 'Verify your phone number in your account to use this invite';
      end if;

      if regexp_replace(trim(v_phone), '\s', '', 'g')
        is distinct from regexp_replace(trim(inv.target_identity), '\s', '', 'g') then
        raise exception 'This invite is for a different phone number';
      end if;
    else
      select u.email into v_email
      from public.users u
      where u.id = v_uid;

      if v_email is null
        or lower(trim(v_email)) <> lower(trim(inv.target_identity)) then
        raise exception 'This invite is for a different email address';
      end if;
    end if;
  end if;

  if inv.max_uses > 1 then
    if inv.uses_count >= inv.max_uses then
      raise exception 'Invite fully consumed';
    end if;

    select j.id into existing_pending_id
    from public.invitation_join_requests j
    where j.invitation_id = inv.id
      and j.user_id = v_uid
      and j.status = 'pending'
    limit 1;

    if existing_pending_id is not null then
      return json_build_object(
        'outcome', 'pending',
        'workspace_id', inv.workspace_id,
        'invitation_id', inv.id,
        'join_request_id', existing_pending_id
      );
    end if;

    insert into public.invitation_join_requests (
      invitation_id,
      workspace_id,
      user_id,
      status
    ) values (
      inv.id,
      inv.workspace_id,
      v_uid,
      'pending'
    )
    returning id into existing_pending_id;

    return json_build_object(
      'outcome', 'pending',
      'workspace_id', inv.workspace_id,
      'invitation_id', inv.id,
      'join_request_id', existing_pending_id
    );
  end if;

  if inv.uses_count >= inv.max_uses then
    raise exception 'Invite already used';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, v_uid, 'member');

  update public.invitations i
  set uses_count = i.uses_count + 1
  where i.id = inv.id
    and i.uses_count < i.max_uses;

  if not found then
    delete from public.workspace_members wm
    where wm.workspace_id = inv.workspace_id
      and wm.user_id = v_uid;
    raise exception 'Invite already used';
  end if;

  return json_build_object(
    'outcome', 'joined',
    'workspace_id', inv.workspace_id,
    'invitation_id', inv.id
  );
end;
$$;
