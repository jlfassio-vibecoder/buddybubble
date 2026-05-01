-- Snapshot active workout block at AMRAP attach; extend amrap_create_for_session.

alter table public.amrap_sessions
  add column if not exists block_snapshot jsonb null;

comment on column public.amrap_sessions.block_snapshot is
  'Snapshot of the active workout block at AMRAP-attach time; defines what one round means.';

drop function if exists public.amrap_create_for_session(uuid, integer);

create or replace function public.amrap_create_for_session(
  p_live_session_id uuid,
  p_duration_seconds integer default 600,
  p_block_snapshot jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_display_name text;
  v_amrap_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_duration_seconds is null or p_duration_seconds < 1 then
    raise exception 'invalid duration';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = p_live_session_id;

  if not found then
    raise exception 'live session not found';
  end if;

  if v_host <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select lsp.display_name
  into v_display_name
  from public.live_session_participants lsp
  where lsp.session_id = p_live_session_id
    and lsp.user_id = auth.uid()
  limit 1;

  if v_display_name is null then
    v_display_name := 'Host';
  end if;

  insert into public.amrap_sessions (live_session_id, duration_seconds, block_snapshot)
  values (p_live_session_id, p_duration_seconds, p_block_snapshot)
  on conflict (live_session_id) do nothing;

  select s.id
  into v_amrap_id
  from public.amrap_sessions s
  where s.live_session_id = p_live_session_id;

  insert into public.amrap_participants (amrap_session_id, user_id, display_name, is_host)
  values (v_amrap_id, auth.uid(), v_display_name, true)
  on conflict (amrap_session_id, user_id) do update
    set display_name = excluded.display_name,
        is_host      = true;

  update public.live_sessions ls
  set interval_wrapper_kind = 'amrap',
      interval_wrapper_config = jsonb_build_object('amrap_session_id', v_amrap_id::text)
  where ls.id = p_live_session_id;

  return v_amrap_id;
end;
$$;

comment on function public.amrap_create_for_session(uuid, integer, jsonb) is
  'Host-only: ensures one amrap_sessions row per live session, upserts host participant, sets live_sessions AMRAP wrapper config; optional block_snapshot on first insert.';

revoke all on function public.amrap_create_for_session(uuid, integer, jsonb) from public;
grant execute on function public.amrap_create_for_session(uuid, integer, jsonb) to authenticated;
grant execute on function public.amrap_create_for_session(uuid, integer, jsonb) to service_role;
