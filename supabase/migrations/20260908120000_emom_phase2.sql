-- EMOM Phase 2: create RPC, segment advance (type-branched), finalize with active_seconds, wrapper kind.

begin;

-- ---------------------------------------------------------------------------
-- interval_advance_segment: tabata + emom validation branches
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

  select s.live_session_id, s.interval_type
  into v_live_session_id, v_interval_type
  from public.live_interval_sessions s
  where s.id = p_interval_session_id;

  if not found then
    raise exception 'interval session not found';
  end if;

  if v_interval_type = 'tabata' then
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
  elsif v_interval_type = 'emom' then
    if v_segment is null
      or p_mechanics_state->>'total_minutes' is null
      or p_mechanics_state->>'interval_seconds' is null
      or p_mechanics_state->>'minute_index' is null
    then
      raise exception 'invalid mechanics_state shape';
    end if;

    if v_segment not in ('idle', 'setup', 'minute', 'done') then
      raise exception 'invalid segment';
    end if;
  else
    raise exception 'interval type does not support segment advance';
  end if;

  v_has_segment_start := nullif(trim(p_mechanics_state->>'segment_started_at'), '') is not null;

  if v_interval_type = 'tabata' then
    if v_segment in ('work', 'rest') and not v_has_segment_start then
      raise exception 'segment_started_at required for active segments';
    end if;
    if v_segment = 'setup'
      and (p_mechanics_state->>'is_paused')::boolean is true
      and not v_has_segment_start
    then
      raise exception 'segment_started_at required for paused setup';
    end if;
  elsif v_interval_type = 'emom' then
    if v_segment = 'minute' and not v_has_segment_start then
      raise exception 'segment_started_at required for active minute';
    end if;
    if v_segment = 'setup'
      and (p_mechanics_state->>'is_paused')::boolean is true
      and not v_has_segment_start
    then
      raise exception 'segment_started_at required for paused setup';
    end if;
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

  if v_interval_type = 'tabata' then
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
  else
    update public.live_interval_sessions s
    set mechanics_state = p_mechanics_state,
        work_started_at = case
          when v_segment = 'minute' and s.work_started_at is null then coalesce(v_segment_started_at, now())
          else s.work_started_at
        end,
        timer_phase = case
          when v_segment = 'done' then 'finished'
          when v_segment = 'minute' and v_has_segment_start then 'work'
          when v_segment = 'setup' and v_has_segment_start then 'work'
          else 'idle'
        end
    where s.id = p_interval_session_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- emom_create_for_session
-- ---------------------------------------------------------------------------

create or replace function public.emom_create_for_session(
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
  v_total_minutes integer;
  v_interval_seconds integer;
  v_setup_seconds integer;
  v_duration_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_mechanics_state is null then
    raise exception 'mechanics_state required';
  end if;

  v_total_minutes := (p_mechanics_state->>'total_minutes')::integer;
  v_interval_seconds := (p_mechanics_state->>'interval_seconds')::integer;
  v_setup_seconds := coalesce((p_mechanics_state->>'setup_seconds')::integer, 10);

  if v_total_minutes is null or v_total_minutes < 1 then
    raise exception 'invalid total_minutes';
  end if;

  if v_interval_seconds is null or v_interval_seconds < 1 then
    raise exception 'invalid interval_seconds';
  end if;

  v_duration_seconds := v_setup_seconds + v_total_minutes * v_interval_seconds;

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
    'emom',
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
  set interval_wrapper_kind = 'emom',
      interval_wrapper_config = jsonb_build_object('interval_session_id', v_interval_id::text)
  where ls.id = p_live_session_id;

  return v_interval_id;
end;
$$;

comment on function public.emom_create_for_session(uuid, jsonb, jsonb) is
  'Host-only: upserts EMOM interval session, host participant, and live_sessions wrapper config.';

revoke all on function public.emom_create_for_session(uuid, jsonb, jsonb) from public;
grant execute on function public.emom_create_for_session(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.emom_create_for_session(uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- live_sessions: allow emom wrapper kind
-- ---------------------------------------------------------------------------

alter table public.live_sessions
  drop constraint if exists live_sessions_interval_wrapper_kind_check;

alter table public.live_sessions
  add constraint live_sessions_interval_wrapper_kind_check
  check (interval_wrapper_kind in ('none', 'amrap', 'amrap_minimal', 'tabata', 'emom'));

-- ---------------------------------------------------------------------------
-- interval_finalize_session: EMOM rounds + active_seconds merge + telemetry
-- ---------------------------------------------------------------------------

create or replace function public.interval_finalize_session(
  p_interval_session_id uuid,
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
  v_interval_type public.interval_type;
  v_duration_seconds integer;
  v_block_snapshot jsonb;
  v_mechanics_state jsonb;
  v_origin_task_id uuid;
  v_source_bubble_id uuid;
  v_logs_bubble_id uuid;
  v_workspace_id uuid;
  v_title text;
  v_program_id uuid;
  v_program_session_key text;
  v_scheduled_on date;
  v_scheduled_time time;
  v_visibility text;
  v_exercises_json jsonb;
  v_participant record;
  v_rounds integer;
  v_log_exercises jsonb;
  v_metadata jsonb;
  v_task_id uuid;
  v_duration_min integer;
  v_block_id text;
  v_work_started_at timestamptz;
  v_session_created_at timestamptz;
  v_active_seconds_total integer;
  v_active_seconds_avg numeric;
  v_rounds_target integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id, s.interval_type
  into v_live_session_id, v_interval_type
  from public.live_interval_sessions s
  where s.id = p_interval_session_id;

  if not found then
    raise exception 'interval session not found';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = v_live_session_id;

  if not found or v_host is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.live_interval_sessions s
  set timer_phase = 'finished',
      leaderboard_snapshot = p_snapshot,
      results_finalized_at = now()
  where s.id = p_interval_session_id
    and s.results_finalized_at is null
  returning
    s.duration_seconds,
    s.block_snapshot,
    s.live_session_id,
    s.work_started_at,
    s.created_at,
    s.interval_type,
    s.mechanics_state
  into
    v_duration_seconds,
    v_block_snapshot,
    v_live_session_id,
    v_work_started_at,
    v_session_created_at,
    v_interval_type,
    v_mechanics_state;

  if not found then
    return;
  end if;

  v_duration_min := greatest(1, round(v_duration_seconds / 60.0)::integer);

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

  v_title := case v_interval_type
    when 'tabata' then coalesce(nullif(trim(v_block_snapshot->>'title'), ''), 'Tabata Workout')
    when 'emom' then coalesce(nullif(trim(v_block_snapshot->>'title'), ''), 'EMOM Workout')
    else coalesce(nullif(trim(v_block_snapshot->>'title'), ''), 'AMRAP Workout')
  end;
  v_logs_bubble_id := null;

  if v_origin_task_id is not null then
    select
      t.bubble_id,
      coalesce(nullif(trim(t.title), ''), v_title),
      t.program_id,
      t.program_session_key,
      t.scheduled_on,
      t.scheduled_time,
      t.visibility
    into
      v_source_bubble_id,
      v_title,
      v_program_id,
      v_program_session_key,
      v_scheduled_on,
      v_scheduled_time,
      v_visibility
    from public.tasks t
    where t.id = v_origin_task_id;

    if found then
      v_workspace_id := public.workspace_id_for_bubble(v_source_bubble_id);

      select b.id
      into v_logs_bubble_id
      from public.bubbles b
      where b.workspace_id = v_workspace_id
        and b.name = 'Workout Logs'
      limit 1;

      if v_logs_bubble_id is null then
        v_logs_bubble_id := v_source_bubble_id;
      end if;

      v_exercises_json := coalesce(v_block_snapshot->'exercises', '[]'::jsonb);
      v_block_id := v_origin_task_id::text;
    end if;
  end if;

  if v_logs_bubble_id is null then
    return;
  end if;

  v_rounds_target := case v_interval_type
    when 'tabata' then (v_mechanics_state->>'total_rounds')::integer
    when 'emom' then (v_mechanics_state->>'total_minutes')::integer
    else null
  end;

  for v_participant in
    select
      p.id,
      p.user_id
    from public.live_interval_participants p
    where p.interval_session_id = p_interval_session_id
      and p.user_id is not null
      and p.workout_log_task_id is null
      and exists (
        select 1
        from public.users u
        where u.id = p.user_id
      )
  loop
    v_rounds := case v_interval_type
      when 'amrap' then (
        select count(*)::integer
        from public.interval_round_events r
        where r.participant_id = v_participant.id
      )
      when 'tabata' then coalesce(
        nullif((v_mechanics_state->>'round_index')::integer, 0),
        (v_mechanics_state->>'total_rounds')::integer,
        0
      )
      when 'emom' then coalesce(
        nullif((v_mechanics_state->>'minute_index')::integer, 0),
        (v_mechanics_state->>'total_minutes')::integer,
        0
      )
      else 0
    end;

    if v_rounds <= 0 then
      continue;
    end if;

    select
      coalesce(sum(wel.active_seconds), 0)::integer,
      coalesce(avg(wel.active_seconds), 0)
    into v_active_seconds_total, v_active_seconds_avg
    from public.workout_exercise_logs wel
    where wel.user_id = v_participant.user_id
      and wel.session_id = v_live_session_id::text
      and wel.task_id = v_origin_task_id::text
      and wel.active_seconds is not null;

    select coalesce(jsonb_agg(ex_row order by ex_ord), '[]'::jsonb)
    into v_log_exercises
    from (
      select
        ex.ord as ex_ord,
        jsonb_strip_nulls(
          jsonb_build_object(
            'name', ex.elem->>'name',
            'reps', ex.elem->'reps',
            'weight', ex.elem->'weight',
            'duration_min', ex.elem->'duration_min',
            'sets', v_rounds,
            'set_logs', (
              select coalesce(
                jsonb_agg(
                  jsonb_strip_nulls(
                    jsonb_build_object(
                      'set', gs.set_num,
                      'reps',
                      case
                        when actual.found then actual.reps
                        when ex.elem->>'reps' ~ '^\d+$' then (ex.elem->>'reps')::int
                        else null
                      end,
                      'weight',
                      case
                        when actual.found then actual.weight_lbs
                        when ex.elem->>'weight' ~ '^-?\d' then (ex.elem->>'weight')::numeric
                        else null
                      end,
                      'rpe',
                      case
                        when actual.found then actual.rpe
                        when ex.elem->>'rpe' ~ '^\d+$' then (ex.elem->>'rpe')::int
                        else null
                      end,
                      'active_seconds',
                      case
                        when actual.found and actual.active_seconds is not null then actual.active_seconds
                        else null
                      end,
                      'done', true
                    )
                  )
                  order by gs.set_num
                ),
                '[]'::jsonb
              )
              from generate_series(1, v_rounds) as gs(set_num)
              left join lateral (
                select
                  wel.weight_lbs,
                  wel.reps,
                  wel.rpe,
                  wel.active_seconds,
                  true as found
                from public.workout_exercise_logs wel
                where wel.user_id = v_participant.user_id
                  and wel.session_id = v_live_session_id::text
                  and wel.task_id = v_origin_task_id::text
                  and wel.exercise_name = ex.elem->>'name'
                  and wel.set_number = gs.set_num
                limit 1
              ) actual on true
            )
          )
        ) as ex_row
      from jsonb_array_elements(v_exercises_json) with ordinality as ex(elem, ord)
    ) sub;

    v_metadata := jsonb_build_object(
      'workout_log_schema_version', 1,
      'source_task_id', v_origin_task_id,
      'duration_min', v_duration_min,
      'exercises', v_log_exercises,
      'interval_session_id', p_interval_session_id,
      'session_telemetry', jsonb_build_object(
        'schema_version', 1,
        'captured_at', now(),
        'session_id', v_live_session_id::text,
        'interval_performance', jsonb_build_array(
          jsonb_strip_nulls(
            jsonb_build_object(
              'block_id', coalesce(v_block_id, v_interval_type::text),
              'format', v_interval_type::text,
              'rounds_completed', v_rounds,
              'rounds_target', v_rounds_target,
              'last_phase', 'finished',
              'elapsed_in_block_sec', v_duration_seconds,
              'active_seconds_total', case
                when v_interval_type = 'emom' and v_active_seconds_total > 0 then v_active_seconds_total
                else null
              end,
              'active_seconds_avg', case
                when v_interval_type = 'emom' and v_active_seconds_avg > 0 then round(v_active_seconds_avg::numeric, 1)
                else null
              end
            )
          )
        )
      )
    );

    insert into public.tasks (
      bubble_id,
      title,
      item_type,
      status,
      created_by,
      metadata,
      program_id,
      program_session_key,
      scheduled_on,
      scheduled_time,
      visibility
    )
    values (
      v_logs_bubble_id,
      v_title || ' — Log',
      'workout_log',
      'completed',
      v_participant.user_id,
      v_metadata,
      v_program_id,
      v_program_session_key,
      v_scheduled_on,
      v_scheduled_time,
      v_visibility
    )
    returning id into v_task_id;

    insert into public.task_assignees (task_id, user_id)
    values (v_task_id, v_participant.user_id)
    on conflict do nothing;

    update public.live_interval_participants
    set workout_log_task_id = v_task_id
    where id = v_participant.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- amrap_reset_timer: EMOM reset template
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
  elsif v_interval_type = 'emom' then
    v_setup_seconds := coalesce((v_mechanics_state->>'setup_seconds')::integer, 10);

    delete from public.workout_exercise_logs wel
    where wel.session_id = v_live_session_id::text
      and wel.active_seconds is not null;

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

commit;
