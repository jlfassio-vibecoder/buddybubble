-- Phase 3: invitations, invitation_join_requests, RLS, accept_invitation + approve_invitation_join_request.
--
-- Consumption / uses_count (TDD §10):
--   max_uses = 1: immediate join; uses_count increments when membership is granted.
--   max_uses > 1: waiting room; accept_invitation inserts a pending join_request only; uses_count
--   increments when an admin approves via approve_invitation_join_request (not on submit).
-- RPCs set workspace_id on join_requests to match invitations.workspace_id (enforced in inserts below).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete restrict,
  token text not null,
  invite_type text not null check (invite_type in ('qr', 'link', 'email', 'sms')),
  target_identity text,
  label text,
  max_uses int not null default 1 check (max_uses >= 1),
  uses_count int not null default 0 check (uses_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_uses_lte_max check (uses_count <= max_uses)
);

create unique index invitations_token_key on public.invitations (token);

create index invitations_workspace_active_idx
  on public.invitations (workspace_id)
  where revoked_at is null;

create table public.invitation_join_requests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index invitation_join_requests_workspace_status_created_idx
  on public.invitation_join_requests (workspace_id, status, created_at desc);

create index invitation_join_requests_user_created_idx
  on public.invitation_join_requests (user_id, created_at desc);

create unique index invitation_join_requests_one_pending_per_user_invite
  on public.invitation_join_requests (invitation_id, user_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.invitations enable row level security;
alter table public.invitation_join_requests enable row level security;

create policy invitations_select_admin
  on public.invitations for select
  using (public.is_workspace_admin(workspace_id));

create policy invitations_insert_admin
  on public.invitations for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and public.is_workspace_admin(workspace_id)
  );

create policy invitations_update_admin
  on public.invitations for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy invitations_delete_admin
  on public.invitations for delete
  using (public.is_workspace_admin(workspace_id));

create policy invitation_join_requests_select
  on public.invitation_join_requests for select
  using (
    public.is_workspace_admin(workspace_id)
    or user_id = auth.uid()
  );

-- Mutations only via security definer RPCs (no broad insert/update policies).

comment on table public.invitations is 'Zero-trust invite rows (QR, link, email, SMS); consumption via accept_invitation.';
comment on table public.invitation_join_requests is 'Approval waiting room; admins approve via approve_invitation_join_request.';

-- ---------------------------------------------------------------------------
-- accept_invitation
-- ---------------------------------------------------------------------------

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
    select u.email into v_email
    from public.users u
    where u.id = v_uid;

    if v_email is null
      or lower(trim(v_email)) <> lower(trim(inv.target_identity)) then
      raise exception 'This invite is for a different email address';
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

-- ---------------------------------------------------------------------------
-- approve_invitation_join_request
-- ---------------------------------------------------------------------------

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

  if inv.uses_count >= inv.max_uses then
    raise exception 'Invite fully consumed';
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

grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.approve_invitation_join_request(uuid) to authenticated;
