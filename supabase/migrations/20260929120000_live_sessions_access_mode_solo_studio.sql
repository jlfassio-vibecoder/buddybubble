-- Solo Recording Studio Phase 1: host-only room lock via live_sessions.access_mode.

-- ---------------------------------------------------------------------------
-- 1) Column + check constraint
-- ---------------------------------------------------------------------------

alter table public.live_sessions
  add column if not exists access_mode text not null default 'open';

alter table public.live_sessions
  drop constraint if exists live_sessions_access_mode_check;

alter table public.live_sessions
  add constraint live_sessions_access_mode_check
  check (access_mode in ('open', 'solo_studio'));

comment on column public.live_sessions.access_mode is
  'open = normal multi-participant; solo_studio = host-only (Solo Recording Studio).';

-- ---------------------------------------------------------------------------
-- 2) live_session_create: optional p_access_mode (default open)
-- ---------------------------------------------------------------------------

drop function if exists public.live_session_create(uuid, text, text, uuid);

create or replace function public.live_session_create(
  p_session_id   uuid,
  p_display_name text,
  p_agora_uid    text,
  p_workspace_id uuid default null,
  p_access_mode  text default 'open'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'p_workspace_id required';
  end if;

  if p_access_mode is null or p_access_mode not in ('open', 'solo_studio') then
    raise exception 'invalid access_mode';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'member', 'guest', 'trialing')
  ) then
    raise exception 'not a member of workspace';
  end if;

  if exists (
    select 1
    from public.live_sessions ls
    where ls.id = p_session_id
      and ls.workspace_id is not null
      and ls.workspace_id is distinct from p_workspace_id
  ) then
    raise exception 'session workspace may not be changed';
  end if;

  insert into public.live_sessions (id, host_user_id, workspace_id, access_mode)
  values (p_session_id, auth.uid(), p_workspace_id, p_access_mode)
  on conflict (id) do update
    set workspace_id = coalesce(public.live_sessions.workspace_id, excluded.workspace_id);

  insert into public.live_session_participants (session_id, user_id, display_name, role, agora_uid)
  values (p_session_id, auth.uid(), p_display_name, 'host', p_agora_uid)
  on conflict (session_id, user_id) do update
    set display_name = excluded.display_name,
        agora_uid    = excluded.agora_uid;
end;
$$;

comment on function public.live_session_create(uuid, text, text, uuid, text) is
  'Host-only idempotent create: requires p_workspace_id and workspace membership; '
  'optional p_access_mode (open|solo_studio, default open); refuses to change an '
  'existing non-null workspace_id; does not overwrite access_mode on conflict; '
  'upserts host live_session_participants.';

revoke all on function public.live_session_create(uuid, text, text, uuid, text) from public;
grant execute on function public.live_session_create(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.live_session_create(uuid, text, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) live_session_participant_join: reject non-host for solo_studio
-- ---------------------------------------------------------------------------

create or replace function public.live_session_participant_join(
  p_session_id   uuid,
  p_display_name text,
  p_agora_uid    text,
  p_role         text default 'participant'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_instance_id uuid;
  v_is_host     boolean;
  v_access_mode text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_role not in ('host', 'participant') then
    raise exception 'invalid role';
  end if;

  select exists (
    select 1
    from public.live_sessions ls
    where ls.id = p_session_id
      and ls.host_user_id = auth.uid()
  )
  into v_is_host;

  if p_role = 'host' and not v_is_host then
    raise exception 'cannot claim host role';
  end if;

  select ls.access_mode
  into v_access_mode
  from public.live_sessions ls
  where ls.id = p_session_id;

  if v_access_mode is null then
    raise exception 'session not found';
  end if;

  if v_access_mode = 'solo_studio' and not v_is_host then
    raise exception 'room_host_only';
  end if;

  if not v_is_host then
    v_instance_id := public.live_session_class_instance_id(p_session_id);
    if v_instance_id is not null then
      if not exists (
        select 1
        from public.class_enrollments e
        where e.instance_id = v_instance_id
          and e.user_id = auth.uid()
          and e.status = 'enrolled'
      ) then
        raise exception 'User is not enrolled in this class';
      end if;
    end if;
  end if;

  insert into public.live_session_participants (session_id, user_id, display_name, role, agora_uid)
  values (p_session_id, auth.uid(), p_display_name, p_role, p_agora_uid)
  on conflict (session_id, user_id) do update
    set display_name = excluded.display_name,
        role         = excluded.role,
        agora_uid    = excluded.agora_uid
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.live_session_participant_join(uuid, text, text, text) is
  'Authenticated participant upsert. solo_studio sessions allow host only (room_host_only). '
  'Class-backed open sessions require class_enrollments.status = enrolled for non-host callers.';

revoke all on function public.live_session_participant_join(uuid, text, text, text) from public;
grant execute on function public.live_session_participant_join(uuid, text, text, text) to authenticated;
grant execute on function public.live_session_participant_join(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) can_join_live_session: participant path only when access_mode = open
-- ---------------------------------------------------------------------------

create or replace function public.can_join_live_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select host_user_id, workspace_id, access_mode
    from public.live_sessions
    where id = p_session_id
  ),
  inst as (
    select public.live_session_class_instance_id(p_session_id) as id
  )
  select
    auth.uid() is not null
    and exists (select 1 from sess)
    and (
      (select host_user_id from sess) = auth.uid()
      or (
        (select access_mode from sess) = 'open'
        and public.is_live_session_participant(p_session_id)
        and (select workspace_id from sess) is not null
        and (
          not public.workspace_requires_subscription((select workspace_id from sess))
          or public.get_workspace_subscription_status((select workspace_id from sess))
               in ('trialing', 'active')
        )
        and (
          (select id from inst) is null
          or exists (
            select 1
            from public.class_enrollments e
            where e.instance_id = (select id from inst)
              and e.user_id = auth.uid()
              and e.status = 'enrolled'
          )
        )
      )
    );
$$;

comment on function public.can_join_live_session(uuid) is
  'Token gate: host always allowed. Participants require access_mode = open, non-null '
  'workspace_id, free or trialing/active subscription, AND (when class-backed) enrolled.';

revoke all on function public.can_join_live_session(uuid) from public;
grant execute on function public.can_join_live_session(uuid) to authenticated;
grant execute on function public.can_join_live_session(uuid) to service_role;
