-- Tier C live video: bind sessions to workspaces for subscription checks, and add
-- can_join_live_session for token issuance (host always; participants need premium).

-- ---------------------------------------------------------------------------
-- 1) live_sessions.workspace_id (nullable for legacy rows)
-- ---------------------------------------------------------------------------

alter table public.live_sessions
  add column if not exists workspace_id uuid
    references public.workspaces (id) on delete set null;

create index if not exists live_sessions_workspace_id_idx
  on public.live_sessions (workspace_id);

comment on column public.live_sessions.workspace_id is
  'FK to workspaces; populated by live_session_create from the dashboard dock so '
  'can_join_live_session can evaluate workspace_subscriptions. Nullable for legacy '
  'rows that pre-date this migration.';

-- ---------------------------------------------------------------------------
-- 2) live_session_create: add p_workspace_id (drop old 3-arg overload)
-- ---------------------------------------------------------------------------

drop function if exists public.live_session_create(uuid, text, text);

create or replace function public.live_session_create(
  p_session_id   uuid,
  p_display_name text,
  p_agora_uid    text,
  p_workspace_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.live_sessions (id, host_user_id, workspace_id)
  values (p_session_id, auth.uid(), p_workspace_id)
  on conflict (id) do update
    set workspace_id = coalesce(public.live_sessions.workspace_id, excluded.workspace_id);

  insert into public.live_session_participants (session_id, user_id, display_name, role, agora_uid)
  values (p_session_id, auth.uid(), p_display_name, 'host', p_agora_uid)
  on conflict (session_id, user_id) do update
    set display_name = excluded.display_name,
        agora_uid    = excluded.agora_uid;
end;
$$;

comment on function public.live_session_create(uuid, text, text, uuid) is
  'Host-only idempotent create: ensures live_sessions row exists (with optional workspace_id), '
  'and upserts host live_session_participants with agora_uid.';

revoke all on function public.live_session_create(uuid, text, text, uuid) from public;
grant execute on function public.live_session_create(uuid, text, text, uuid) to authenticated;
grant execute on function public.live_session_create(uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3) can_join_live_session: host OR participant with subscription / free category
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
  )
  select
    auth.uid() is not null
    and exists (select 1 from sess)
    and (
      (select host_user_id from sess) = auth.uid()
      or (
        public.is_live_session_participant(p_session_id)
        and (
          (select workspace_id from sess) is null
          or not public.workspace_requires_subscription((select workspace_id from sess))
          or public.get_workspace_subscription_status((select workspace_id from sess))
               in ('trialing', 'active')
        )
      )
    );
$$;

comment on function public.can_join_live_session(uuid) is
  'Tier C gate for live-video token issuance: host always allowed; otherwise must be '
  'live_session_participants AND workspace must be free-category OR have trialing/active '
  'subscription. Legacy live_sessions rows (workspace_id null) fall back to participant-only.';

revoke all on function public.can_join_live_session(uuid) from public;
grant execute on function public.can_join_live_session(uuid) to authenticated;
grant execute on function public.can_join_live_session(uuid) to service_role;
