-- Forward-fix: amrap_reset_timer must clear frozen leaderboard columns on host reset.
-- (Previously appended to 20260804120000; split out so already-applied environments pick up the change.)

-- ---------------------------------------------------------------------------
-- RPC: amrap_reset_timer (host-only) — replace to clear snapshot + finalized
-- ---------------------------------------------------------------------------

create or replace function public.amrap_reset_timer(p_amrap_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_host uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id
  into v_live_session_id
  from public.amrap_sessions s
  where s.id = p_amrap_session_id;

  if not found then
    raise exception 'amrap session not found';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = v_live_session_id;

  if not found or v_host <> auth.uid() then
    raise exception 'forbidden';
  end if;

  delete from public.amrap_session_rounds r
  where r.amrap_session_id = p_amrap_session_id;

  update public.amrap_sessions s
  set timer_phase = 'idle',
      work_started_at = null,
      leaderboard_snapshot = null,
      results_finalized_at = null
  where s.id = p_amrap_session_id;
end;
$$;

comment on function public.amrap_reset_timer(uuid) is
  'Host-only: clears rounds, resets timer to idle, and clears finalized leaderboard snapshot.';

revoke all on function public.amrap_reset_timer(uuid) from public;
grant execute on function public.amrap_reset_timer(uuid) to authenticated;
grant execute on function public.amrap_reset_timer(uuid) to service_role;
