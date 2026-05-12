-- Class-backed live sessions: require class_enrollments.status = 'enrolled' for non-host
-- participants (join RPC + token gate). Non-class sessions unchanged.

-- ---------------------------------------------------------------------------
-- 1) Resolve class instance from live session id (metadata link)
-- ---------------------------------------------------------------------------

create or replace function public.live_session_class_instance_id(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ci.id
  from public.class_instances ci
  join public.live_sessions ls on ls.id = p_session_id
  where (ci.metadata -> 'live_session' ->> 'sessionId') = p_session_id::text
    and (ls.workspace_id is null or ci.workspace_id = ls.workspace_id)
  limit 1;
$$;

comment on function public.live_session_class_instance_id(uuid) is
  'Returns the class_instances.id linked to a live_session via metadata.live_session.sessionId, when present and in the same workspace. Used to detect class-backed sessions for enrollment gating.';

revoke all on function public.live_session_class_instance_id(uuid) from public;
grant execute on function public.live_session_class_instance_id(uuid) to authenticated;
grant execute on function public.live_session_class_instance_id(uuid) to service_role;

create index if not exists class_instances_live_session_id_idx
  on public.class_instances ((metadata -> 'live_session' ->> 'sessionId'))
  where metadata ? 'live_session';

-- ---------------------------------------------------------------------------
-- 2) live_session_participant_join: enrollment gate for class-backed sessions
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

  if p_role <> 'host' and not v_is_host then
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
  'Authenticated participant upsert. Class-backed sessions (linked via class_instances.metadata.live_session.sessionId) require class_enrollments.status = enrolled for non-host callers. Non-class sessions retain prior behavior.';

revoke all on function public.live_session_participant_join(uuid, text, text, text) from public;
grant execute on function public.live_session_participant_join(uuid, text, text, text) to authenticated;
grant execute on function public.live_session_participant_join(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) can_join_live_session: same enrollment rule for token issuance
-- ---------------------------------------------------------------------------

create or replace function public.can_join_live_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select host_user_id, workspace_id
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
        public.is_live_session_participant(p_session_id)
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
  'Tier C gate for live-video token issuance: host always allowed; participants require non-null workspace_id, free or trialing/active subscription, AND (when session is class-backed) class_enrollments.status = enrolled.';

revoke all on function public.can_join_live_session(uuid) from public;
grant execute on function public.can_join_live_session(uuid) to authenticated;
grant execute on function public.can_join_live_session(uuid) to service_role;
