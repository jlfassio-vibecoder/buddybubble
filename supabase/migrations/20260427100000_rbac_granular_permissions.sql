-- RBAC: Granular user permissions
--
-- Changes:
--   1. workspace_members.role gains 'owner' (top-tier; cannot be invited, only assigned on creation)
--   2. invitations.role column — carry target role through accept/approve RPCs
--   3. bubbles.is_private flag — hides bubble from non-members
--   4. bubble_members junction table — per-bubble editor/viewer grants
--   5. Updated RLS helpers: is_workspace_admin, can_write_workspace, + new can_view_bubble / can_write_bubble
--   6. Rewritten RLS policies for bubbles, tasks (incl. assigned_to horizontal flow), messages
--   7. Updated accept_invitation + approve_invitation_join_request RPCs to use inv.role

-- ---------------------------------------------------------------------------
-- 1. Extend workspace_members.role check to include 'owner'
-- ---------------------------------------------------------------------------

alter table public.workspace_members
  drop constraint workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check
    check (role in ('owner', 'admin', 'member', 'guest'));

comment on column public.workspace_members.role is
  'owner: full control + billing; admin: manage workspace/members; member: write access to public bubbles; guest: explicit-access only.';

-- ---------------------------------------------------------------------------
-- 2. Add role column to invitations (owner excluded — you invite into, not as owner)
-- ---------------------------------------------------------------------------

alter table public.invitations
  add column role text not null default 'member'
    check (role in ('admin', 'member', 'guest'));

comment on column public.invitations.role is
  'Role granted to the invitee when they join. Carried through accept_invitation and approve_invitation_join_request.';

-- ---------------------------------------------------------------------------
-- 3. Add is_private to bubbles
-- ---------------------------------------------------------------------------

alter table public.bubbles
  add column is_private boolean not null default false;

comment on column public.bubbles.is_private is
  'When true, only owners/admins and explicit bubble_members can see this bubble.';

-- ---------------------------------------------------------------------------
-- 4. bubble_members junction table
-- ---------------------------------------------------------------------------

create table public.bubble_members (
  id         uuid        primary key default gen_random_uuid(),
  bubble_id  uuid        not null references public.bubbles (id) on delete cascade,
  user_id    uuid        not null references public.users (id) on delete cascade,
  role       text        not null default 'viewer'
               check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (bubble_id, user_id)
);

create index bubble_members_bubble_id_idx on public.bubble_members (bubble_id);
create index bubble_members_user_id_idx   on public.bubble_members (user_id);

comment on table public.bubble_members is
  'Per-bubble access grants. editor: can create/edit tasks + message. viewer: read tasks + message only.';

-- ---------------------------------------------------------------------------
-- 5. RLS for bubble_members
-- ---------------------------------------------------------------------------

alter table public.bubble_members enable row level security;

-- Admins/owners see all members of their bubbles; users see their own records.
create policy bubble_members_select on public.bubble_members
  for select using (
    public.is_workspace_admin(
      (select workspace_id from public.bubbles where id = bubble_id)
    )
    or user_id = auth.uid()
  );

create policy bubble_members_insert_admin on public.bubble_members
  for insert with check (
    public.is_workspace_admin(
      (select workspace_id from public.bubbles where id = bubble_id)
    )
  );

create policy bubble_members_update_admin on public.bubble_members
  for update
  using (public.is_workspace_admin(
    (select workspace_id from public.bubbles where id = bubble_id)
  ))
  with check (public.is_workspace_admin(
    (select workspace_id from public.bubbles where id = bubble_id)
  ));

create policy bubble_members_delete_admin on public.bubble_members
  for delete using (
    public.is_workspace_admin(
      (select workspace_id from public.bubbles where id = bubble_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Update RLS helper functions
-- ---------------------------------------------------------------------------

-- is_workspace_admin: now includes 'owner'
create or replace function public.is_workspace_admin(_workspace_id uuid)
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
      and wm.role in ('owner', 'admin')
  );
$$;

-- can_write_workspace: now includes 'owner'
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
      and wm.role in ('owner', 'admin', 'member')
  );
$$;

-- can_view_bubble: owner/admin always; member if not private; any explicit bubble_member
-- NOTE: uses SECURITY DEFINER so the internal bubbles/bubble_members queries bypass RLS.
create or replace function public.can_view_bubble(_bubble_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    -- workspace owner/admin bypass
    public.is_workspace_admin(public.workspace_id_for_bubble(_bubble_id))
    -- workspace member can see non-private bubbles
    or (
      not (select coalesce(b.is_private, false) from public.bubbles b where b.id = _bubble_id)
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.workspace_id_for_bubble(_bubble_id)
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'member')
      )
    )
    -- explicit bubble_member grant (editor or viewer — any role sees the bubble)
    or exists (
      select 1 from public.bubble_members bm
      where bm.bubble_id = _bubble_id
        and bm.user_id = auth.uid()
    );
$$;

-- can_write_bubble: owner/admin always; member for non-private; bubble_member with editor role
create or replace function public.can_write_bubble(_bubble_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    -- workspace owner/admin bypass
    public.is_workspace_admin(public.workspace_id_for_bubble(_bubble_id))
    -- workspace member (non-private bubbles only)
    or (
      not (select coalesce(b.is_private, false) from public.bubbles b where b.id = _bubble_id)
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.workspace_id_for_bubble(_bubble_id)
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'member')
      )
    )
    -- explicit bubble_member with editor role
    or exists (
      select 1 from public.bubble_members bm
      where bm.bubble_id = _bubble_id
        and bm.user_id = auth.uid()
        and bm.role = 'editor'
    );
$$;

-- ---------------------------------------------------------------------------
-- 7. Rewrite bubbles RLS policies
-- ---------------------------------------------------------------------------

drop policy bubbles_select on public.bubbles;

create policy bubbles_select on public.bubbles
  for select using (public.can_view_bubble(id));

-- INSERT/UPDATE/DELETE on bubbles themselves (creating/renaming/deleting a channel)
-- stays at can_write_workspace level — you must be a workspace member to manage channels.
-- (bubble_member editors can write tasks but cannot create/delete the bubble itself.)
drop policy bubbles_insert on public.bubbles;
create policy bubbles_insert on public.bubbles
  for insert with check (public.can_write_workspace(workspace_id));

drop policy bubbles_update on public.bubbles;
create policy bubbles_update on public.bubbles
  for update
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

drop policy bubbles_delete on public.bubbles;
create policy bubbles_delete on public.bubbles
  for delete using (public.can_write_workspace(workspace_id));

-- ---------------------------------------------------------------------------
-- 8. Rewrite tasks RLS policies
-- ---------------------------------------------------------------------------

-- SELECT: can view the bubble OR directly assigned (horizontal-flow guest override)
drop policy tasks_select on public.tasks;

create policy tasks_select on public.tasks
  for select using (
    public.can_view_bubble(bubble_id)
    or assigned_to = auth.uid()
  );

-- INSERT: must be able to write to the bubble
drop policy tasks_insert on public.tasks;

create policy tasks_insert on public.tasks
  for insert with check (public.can_write_bubble(bubble_id));

-- UPDATE: write access to bubble OR directly assigned (assigned user can edit their own card)
drop policy tasks_update on public.tasks;

create policy tasks_update on public.tasks
  for update
  using (
    public.can_write_bubble(bubble_id)
    or assigned_to = auth.uid()
  )
  with check (
    public.can_write_bubble(bubble_id)
    or assigned_to = auth.uid()
  );

-- DELETE: requires bubble write access (assigned-to does not grant delete)
drop policy tasks_delete on public.tasks;

create policy tasks_delete on public.tasks
  for delete using (public.can_write_bubble(bubble_id));

-- ---------------------------------------------------------------------------
-- 9. Rewrite messages RLS policies
-- ---------------------------------------------------------------------------
-- Rule: anyone who can VIEW the bubble can send messages (not just can_write_workspace).
-- Delete still requires own message OR admin.

drop policy messages_select on public.messages;

create policy messages_select on public.messages
  for select using (public.can_view_bubble(bubble_id));

drop policy messages_insert on public.messages;

create policy messages_insert on public.messages
  for insert with check (
    user_id = auth.uid()
    and public.can_view_bubble(bubble_id)
  );

drop policy messages_update on public.messages;

create policy messages_update on public.messages
  for update
  using (
    user_id = auth.uid()
    and public.can_view_bubble(bubble_id)
  )
  with check (
    user_id = auth.uid()
    and public.can_view_bubble(bubble_id)
  );

drop policy messages_delete on public.messages;

create policy messages_delete on public.messages
  for delete using (
    public.can_view_bubble(bubble_id)
    and (
      user_id = auth.uid()
      or public.is_workspace_admin(public.workspace_id_for_bubble(bubble_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Update accept_invitation to use inv.role
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

  -- Use inv.role instead of hardcoded 'member'
  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, v_uid, inv.role);

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
-- 11. Update approve_invitation_join_request to use inv.role
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

  -- Use inv.role instead of hardcoded 'member'
  insert into public.workspace_members (workspace_id, user_id, role)
  values (jr.workspace_id, jr.user_id, inv.role);

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
