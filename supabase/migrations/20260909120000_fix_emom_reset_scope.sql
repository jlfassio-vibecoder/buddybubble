-- Forward-fix: scope EMOM amrap_reset_timer slap-log cleanup to block_snapshot origin_task_id.
-- (20260908120000_emom_phase2.sql may already be applied without task-scoped DELETE.)

begin;

create or replace function public.amrap_reset_timer(p_amrap_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_host uuid;
  v_interval_type public.interval_type;
  v_mechanics_state jsonb;
  v_block_snapshot jsonb;
  v_origin_task_id uuid;
  v_setup_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id, s.interval_type, s.mechanics_state, s.block_snapshot
  into v_live_session_id, v_interval_type, v_mechanics_state, v_block_snapshot
  from public.live_interval_sessions s
  where s.id = p_amrap_session_id;

  if not found then
    raise exception 'interval session not found';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = v_live_session_id;

  if not found or v_host <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if v_interval_type = 'amrap' then
    delete from public.interval_round_events r
    where r.interval_session_id = p_amrap_session_id;

    update public.live_interval_sessions s
    set timer_phase = 'idle',
        work_started_at = null,
        leaderboard_snapshot = null,
        results_finalized_at = null
    where s.id = p_amrap_session_id;
  elsif v_interval_type = 'emom' then
    v_setup_seconds := coalesce((v_mechanics_state->>'setup_seconds')::integer, 10);

    v_origin_task_id := null;
    if v_block_snapshot is not null
      and nullif(trim(v_block_snapshot->>'origin_task_id'), '') is not null
    then
      begin
        v_origin_task_id := (v_block_snapshot->>'origin_task_id')::uuid;
      exception
        when others then
          v_origin_task_id := null;
      end;
    end if;

    if v_origin_task_id is not null then
      delete from public.workout_exercise_logs wel
      where wel.session_id = v_live_session_id::text
        and wel.task_id = v_origin_task_id
        and wel.active_seconds is not null;
    end if;

    update public.live_interval_sessions s
    set timer_phase = 'idle',
        work_started_at = null,
        leaderboard_snapshot = null,
        results_finalized_at = null,
        mechanics_state = jsonb_build_object(
          'segment', 'setup',
          'minute_index', 0,
          'total_minutes', coalesce((v_mechanics_state->>'total_minutes')::integer, 1),
          'interval_seconds', coalesce((v_mechanics_state->>'interval_seconds')::integer, 60),
          'setup_seconds', v_setup_seconds,
          'segment_started_at', null,
          'is_alternating', coalesce((v_mechanics_state->>'is_alternating')::boolean, false),
          'alternating_stations', coalesce(v_mechanics_state->'alternating_stations', '[]'::jsonb)
        )
    where s.id = p_amrap_session_id;
  else
    v_setup_seconds := coalesce((v_mechanics_state->>'setup_seconds')::integer, 10);

    update public.live_interval_sessions s
    set timer_phase = 'idle',
        work_started_at = null,
        leaderboard_snapshot = null,
        results_finalized_at = null,
        mechanics_state = jsonb_build_object(
          'segment', 'setup',
          'round_index', 0,
          'total_rounds', coalesce((v_mechanics_state->>'total_rounds')::integer, 1),
          'work_seconds', coalesce((v_mechanics_state->>'work_seconds')::integer, 20),
          'rest_seconds', coalesce((v_mechanics_state->>'rest_seconds')::integer, 10),
          'setup_seconds', v_setup_seconds,
          'segment_started_at', null
        )
    where s.id = p_amrap_session_id;
  end if;
end;
$$;

comment on function public.amrap_reset_timer(uuid) is
  'Host-only: resets timer to idle; AMRAP clears round events; EMOM/tabata reset mechanics_state; EMOM clears slap logs for block origin_task_id only.';

commit;
