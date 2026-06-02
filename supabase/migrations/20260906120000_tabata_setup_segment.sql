-- Tabata: mandatory 10s setup segment before round 1 work.

begin;

-- ---------------------------------------------------------------------------
-- interval_advance_segment: allow setup segment
-- ---------------------------------------------------------------------------

create or replace function public.interval_advance_segment(
  p_interval_session_id uuid,
  p_mechanics_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_host uuid;
  v_interval_type public.interval_type;
  v_segment text;
  v_segment_started_at timestamptz;
  v_has_segment_start boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_mechanics_state is null then
    raise exception 'mechanics_state required';
  end if;

  v_segment := nullif(trim(p_mechanics_state->>'segment'), '');

  if v_segment is null
    or p_mechanics_state->>'total_rounds' is null
    or p_mechanics_state->>'work_seconds' is null
    or p_mechanics_state->>'rest_seconds' is null
    or p_mechanics_state->>'round_index' is null
  then
    raise exception 'invalid mechanics_state shape';
  end if;

  if v_segment not in ('idle', 'setup', 'work', 'rest', 'done') then
    raise exception 'invalid segment';
  end if;

  v_has_segment_start := nullif(trim(p_mechanics_state->>'segment_started_at'), '') is not null;

  if v_segment in ('work', 'rest')
    and not v_has_segment_start
  then
    raise exception 'segment_started_at required for active segments';
  end if;

  if v_segment = 'setup'
    and (p_mechanics_state->>'is_paused')::boolean is true
    and not v_has_segment_start
  then
    raise exception 'segment_started_at required for paused setup';
  end if;

  select s.live_session_id, s.interval_type
  into v_live_session_id, v_interval_type
  from public.live_interval_sessions s
  where s.id = p_interval_session_id;

  if not found then
    raise exception 'interval session not found';
  end if;

  if v_interval_type not in ('tabata', 'emom') then
    raise exception 'interval type does not support segment advance';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = v_live_session_id;

  if not found or v_host <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if v_has_segment_start then
    begin
      v_segment_started_at := (p_mechanics_state->>'segment_started_at')::timestamptz;
    exception
      when others then
        raise exception 'invalid segment_started_at';
    end;
  end if;

  update public.live_interval_sessions s
  set mechanics_state = p_mechanics_state,
      work_started_at = case
        when v_segment = 'work' and s.work_started_at is null then coalesce(v_segment_started_at, now())
        else s.work_started_at
      end,
      timer_phase = case
        when v_segment = 'done' then 'finished'
        when v_segment in ('work', 'rest') then 'work'
        when v_segment = 'setup' and v_has_segment_start then 'work'
        else 'idle'
      end
  where s.id = p_interval_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- tabata_create_for_session: include setup_seconds in block duration
-- ---------------------------------------------------------------------------

create or replace function public.tabata_create_for_session(
  p_live_session_id uuid,
  p_block_snapshot jsonb default null,
  p_mechanics_state jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_display_name text;
  v_interval_id uuid;
  v_total_rounds integer;
  v_work_seconds integer;
  v_rest_seconds integer;
  v_setup_seconds integer;
  v_duration_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_mechanics_state is null then
    raise exception 'mechanics_state required';
  end if;

  v_total_rounds := (p_mechanics_state->>'total_rounds')::integer;
  v_work_seconds := (p_mechanics_state->>'work_seconds')::integer;
  v_rest_seconds := coalesce((p_mechanics_state->>'rest_seconds')::integer, 0);
  v_setup_seconds := coalesce((p_mechanics_state->>'setup_seconds')::integer, 10);

  if v_total_rounds is null or v_total_rounds < 1 then
    raise exception 'invalid total_rounds';
  end if;

  if v_work_seconds is null or v_work_seconds < 1 then
    raise exception 'invalid work_seconds';
  end if;

  v_duration_seconds :=
    v_setup_seconds
    + v_total_rounds * v_work_seconds
    + greatest(0, v_total_rounds - 1) * greatest(0, v_rest_seconds);

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

  insert into public.live_interval_sessions (
    live_session_id,
    duration_seconds,
    block_snapshot,
    interval_type,
    mechanics_state,
    timer_phase,
    work_started_at
  )
  values (
    p_live_session_id,
    v_duration_seconds,
    p_block_snapshot,
    'tabata',
    p_mechanics_state,
    'idle',
    null
  )
  on conflict (live_session_id) do update
    set duration_seconds = excluded.duration_seconds,
        block_snapshot = excluded.block_snapshot,
        interval_type = excluded.interval_type,
        mechanics_state = excluded.mechanics_state,
        timer_phase = 'idle',
        work_started_at = null,
        leaderboard_snapshot = null,
        results_finalized_at = null;

  select s.id
  into v_interval_id
  from public.live_interval_sessions s
  where s.live_session_id = p_live_session_id;

  insert into public.live_interval_participants (interval_session_id, user_id, display_name, is_host)
  values (v_interval_id, auth.uid(), v_display_name, true)
  on conflict (interval_session_id, user_id) do update
    set display_name = excluded.display_name,
        is_host = true;

  update public.live_sessions ls
  set interval_wrapper_kind = 'tabata',
      interval_wrapper_config = jsonb_build_object('interval_session_id', v_interval_id::text)
  where ls.id = p_live_session_id;

  return v_interval_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- amrap_reset_timer: tabata resets to setup (not idle)
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
  v_interval_type public.interval_type;
  v_mechanics_state jsonb;
  v_setup_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id, s.interval_type, s.mechanics_state
  into v_live_session_id, v_interval_type, v_mechanics_state
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

commit;
