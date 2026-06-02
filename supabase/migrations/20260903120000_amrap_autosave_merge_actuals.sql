-- AMRAP auto-save: merge participant workout_exercise_logs into workout_log set_logs on finalize.

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
  v_duration_seconds integer;
  v_block_snapshot jsonb;
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
  v_amrap_work_started_at timestamptz;
  v_amrap_created_at timestamptz;
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
    and s.results_finalized_at is null
  returning s.duration_seconds, s.block_snapshot, s.live_session_id, s.work_started_at, s.created_at
  into v_duration_seconds, v_block_snapshot, v_live_session_id, v_amrap_work_started_at, v_amrap_created_at;

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

  v_title := coalesce(nullif(trim(v_block_snapshot->>'title'), ''), 'AMRAP Workout');
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

  for v_participant in
    select
      p.id,
      p.user_id,
      (
        select count(*)::integer
        from public.amrap_session_rounds r
        where r.participant_id = p.id
      ) as round_count
    from public.amrap_participants p
    where p.amrap_session_id = p_amrap_session_id
      and p.user_id is not null
      and p.workout_log_task_id is null
      and exists (
        select 1
        from public.users u
        where u.id = p.user_id
      )
  loop
    v_rounds := v_participant.round_count;
    if v_rounds <= 0 then
      continue;
    end if;

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
                  true as found
                from public.workout_exercise_logs wel
                where wel.user_id = v_participant.user_id
                  and wel.session_id = v_live_session_id::text
                  and wel.exercise_name = ex.elem->>'name'
                  and wel.set_number = gs.set_num
                  and wel.created_at >= coalesce(v_amrap_work_started_at, v_amrap_created_at)
                order by wel.created_at desc
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
      'amrap_session_id', p_amrap_session_id,
      'session_telemetry', jsonb_build_object(
        'schema_version', 1,
        'captured_at', now(),
        'session_id', v_live_session_id::text,
        'interval_performance', jsonb_build_array(
          jsonb_build_object(
            'block_id', coalesce(v_block_id, 'amrap'),
            'format', 'amrap',
            'rounds_completed', v_rounds,
            'rounds_target', null,
            'last_phase', 'finished',
            'elapsed_in_block_sec', v_duration_seconds
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

    update public.amrap_participants
    set workout_log_task_id = v_task_id
    where id = v_participant.id;
  end loop;
end;
$$;

comment on function public.amrap_finalize_session(uuid, jsonb) is
  'Host-only: locks official leaderboard, auto-creates per-participant workout_log tasks merging workout_exercise_logs actuals (session + exercise + set + block time window; task_id agnostic for deck card switches). Idempotent.';

revoke all on function public.amrap_finalize_session(uuid, jsonb) from public;
grant execute on function public.amrap_finalize_session(uuid, jsonb) to authenticated;
grant execute on function public.amrap_finalize_session(uuid, jsonb) to service_role;
