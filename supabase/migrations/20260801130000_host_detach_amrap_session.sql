-- Host clears AMRAP wrapper hint on live_sessions (idempotent). Leaves amrap_sessions / rounds intact.

create or replace function public.host_detach_amrap_session(p_session_id uuid)
returns public.live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
  into v_session
  from public.live_sessions ls
  where ls.id = p_session_id;

  if not found then
    raise exception 'live session not found';
  end if;

  if v_session.host_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.live_sessions ls
  set interval_wrapper_kind = 'none',
      interval_wrapper_config = null
  where ls.id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

comment on function public.host_detach_amrap_session(uuid) is
  'Host-only: sets interval wrapper to none/null; does not delete amrap_sessions.';

revoke all on function public.host_detach_amrap_session(uuid) from public;
grant execute on function public.host_detach_amrap_session(uuid) to authenticated;
grant execute on function public.host_detach_amrap_session(uuid) to service_role;
