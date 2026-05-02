-- Frozen leaderboard snapshot + host-only finalize RPC (idempotent).

alter table public.amrap_sessions
  add column if not exists leaderboard_snapshot jsonb null,
  add column if not exists results_finalized_at timestamptz null;

comment on column public.amrap_sessions.leaderboard_snapshot is
  'Dense-rank leaderboard JSON written once by amrap_finalize_session.';

comment on column public.amrap_sessions.results_finalized_at is
  'When the host locked official results; idempotency anchor for finalize.';

-- ---------------------------------------------------------------------------
-- RPC: amrap_finalize_session (host-only, idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.amrap_finalize_session(
  p_amrap_session_id uuid,
  p_snapshot jsonb
)
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

  if not found or v_host is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.amrap_sessions s
  set timer_phase = 'finished',
      leaderboard_snapshot = p_snapshot,
      results_finalized_at = now()
  where s.id = p_amrap_session_id
    and s.results_finalized_at is null;
end;
$$;

comment on function public.amrap_finalize_session(uuid, jsonb) is
  'Host-only: locks official leaderboard JSON and finished phase; no-op if already finalized.';

revoke all on function public.amrap_finalize_session(uuid, jsonb) from public;
grant execute on function public.amrap_finalize_session(uuid, jsonb) to authenticated;
grant execute on function public.amrap_finalize_session(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Patch amrap_reset_timer: clear frozen snapshot when host resets rounds
-- (otherwise leaderboard_snapshot / results_finalized_at survive reset).
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
