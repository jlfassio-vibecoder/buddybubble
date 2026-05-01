-- Phase P0: Join hints for live-video wrapper selection.
-- This intentionally exposes only wrapper kind/config by session id so clients
-- can choose the correct wrapper UI before full session-row access is available.

create or replace function public.get_live_session_join_hints(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hints jsonb;
begin
  select jsonb_build_object(
    'interval_wrapper_kind', ls.interval_wrapper_kind,
    'interval_wrapper_config', ls.interval_wrapper_config
  )
  into v_hints
  from public.live_sessions ls
  where ls.id = p_session_id;

  if v_hints is null then
    raise exception 'live session not found';
  end if;

  return v_hints;
end;
$$;

comment on function public.get_live_session_join_hints(uuid) is
  'Returns only interval wrapper join hints for a live session; used before full session row access is available.';

revoke all on function public.get_live_session_join_hints(uuid) from public;
grant execute on function public.get_live_session_join_hints(uuid) to anon;
grant execute on function public.get_live_session_join_hints(uuid) to authenticated;
grant execute on function public.get_live_session_join_hints(uuid) to service_role;
