-- Phase 0: Unified interval engine — rename AMRAP tables in-place, add interval_type + mechanics_state,
-- replace amrap_finalize_session / amrap_log_round with polymorphic interval_* RPCs.

begin;

-- ---------------------------------------------------------------------------
-- 1) Enum + table renames
-- ---------------------------------------------------------------------------

create type public.interval_type as enum ('amrap', 'tabata', 'emom');

alter table public.amrap_sessions rename to live_interval_sessions;
alter table public.amrap_participants rename to live_interval_participants;
alter table public.amrap_session_rounds rename to interval_round_events;

comment on table public.live_interval_sessions is
  'One live interval block per live session; timer_phase and work_started_at are the server clock source.';

comment on table public.live_interval_participants is
  'Interval roster; host row created with session; guests may have null user_id.';

comment on table public.interval_round_events is
  'Append-only round events (AMRAP manual logs); optional per interval type.';

-- ---------------------------------------------------------------------------
-- 2) New columns on live_interval_sessions
-- ---------------------------------------------------------------------------

alter table public.live_interval_sessions
  add column if not exists interval_type public.interval_type not null default 'amrap',
  add column if not exists mechanics_state jsonb not null default '{}'::jsonb;

comment on column public.live_interval_sessions.interval_type is
  'Polymorphic interval kind: amrap, tabata, emom.';

comment on column public.live_interval_sessions.mechanics_state is
  'Type-specific position state (segment, round_index, etc.); empty for AMRAP.';

update public.live_interval_sessions
set interval_type = 'amrap'
where interval_type is null;

-- ---------------------------------------------------------------------------
-- 3) FK column renames on child tables
-- ---------------------------------------------------------------------------

alter table public.live_interval_participants
  rename column amrap_session_id to interval_session_id;

alter table public.interval_round_events
  rename column amrap_session_id to interval_session_id;

alter index if exists amrap_participants_amrap_session_id_idx
  rename to live_interval_participants_interval_session_id_idx;

alter index if exists amrap_session_rounds_amrap_session_id_idx
  rename to interval_round_events_interval_session_id_idx;

alter index if exists amrap_session_rounds_participant_id_idx
  rename to interval_round_events_participant_id_idx;

alter index if exists amrap_participants_one_host_per_session_idx
  rename to live_interval_participants_one_host_per_session_idx;

-- ---------------------------------------------------------------------------
-- 4) RLS policies (drop AMRAP-named, recreate on unified tables)
-- ---------------------------------------------------------------------------

drop policy if exists amrap_sessions_select on public.live_interval_sessions;
drop policy if exists amrap_participants_select on public.live_interval_participants;
drop policy if exists amrap_session_rounds_select on public.interval_round_events;

create policy live_interval_sessions_select on public.live_interval_sessions
  for select using (
    auth.uid() is not null
    and public.is_live_session_participant(live_interval_sessions.live_session_id)
  );

create policy live_interval_participants_select on public.live_interval_participants
  for select using (
    auth.uid() is not null
    and exists (
      select 1
      from public.live_interval_sessions s
      where s.id = live_interval_participants.interval_session_id
        and public.is_live_session_participant(s.live_session_id)
    )
  );

create policy interval_round_events_select on public.interval_round_events
  for select using (
    auth.uid() is not null
    and exists (
      select 1
      from public.live_interval_sessions s
      where s.id = interval_round_events.interval_session_id
        and public.is_live_session_participant(s.live_session_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Wrapper config backfill (amrap_session_id -> interval_session_id)
-- ---------------------------------------------------------------------------

update public.live_sessions ls
set interval_wrapper_config =
  (ls.interval_wrapper_config - 'amrap_session_id')
  || jsonb_build_object('interval_session_id', ls.interval_wrapper_config->>'amrap_session_id')
where ls.interval_wrapper_config ? 'amrap_session_id';

-- ---------------------------------------------------------------------------
-- 6) RPC: amrap_create_for_session (updated table/column names + interval_session_id config)
-- ---------------------------------------------------------------------------

create or replace function public.amrap_create_for_session(
  p_live_session_id uuid,
  p_duration_seconds integer default 600,
  p_block_snapshot jsonb default null,
  p_wrapper_kind text default 'amrap'
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
  v_kind text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_duration_seconds is null or p_duration_seconds < 1 then
    raise exception 'invalid duration';
  end if;

  v_kind := coalesce(nullif(trim(p_wrapper_kind), ''), 'amrap');
  if v_kind not in ('amrap', 'amrap_minimal') then
    raise exception 'invalid wrapper kind';
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

  insert into public.live_interval_sessions (
    live_session_id,
    duration_seconds,
    block_snapshot,
    interval_type
  )
  values (p_live_session_id, p_duration_seconds, p_block_snapshot, 'amrap')
  on conflict (live_session_id) do nothing;

  select s.id
  into v_interval_id
  from public.live_interval_sessions s
  where s.live_session_id = p_live_session_id;

  insert into public.live_interval_participants (interval_session_id, user_id, display_name, is_host)
  values (v_interval_id, auth.uid(), v_display_name, true)
  on conflict (interval_session_id, user_id) do update
    set display_name = excluded.display_name,
        is_host      = true;

  update public.live_sessions ls
  set interval_wrapper_kind = v_kind,
      interval_wrapper_config = jsonb_build_object('interval_session_id', v_interval_id::text)
  where ls.id = p_live_session_id;

  return v_interval_id;
end;
$$;

comment on function public.amrap_create_for_session(uuid, integer, jsonb, text) is
  'Host-only: ensures one live_interval_sessions row per live session (interval_type=amrap), upserts host participant, sets wrapper config with interval_session_id.';

-- ---------------------------------------------------------------------------
-- 7) RPC: amrap_join_session
-- ---------------------------------------------------------------------------

create or replace function public.amrap_join_session(
  p_amrap_session_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id
  into v_live_session_id
  from public.live_interval_sessions s
  where s.id = p_amrap_session_id;

  if not found then
    raise exception 'interval session not found';
  end if;

  if not public.is_live_session_participant(v_live_session_id) then
    raise exception 'forbidden';
  end if;

  insert into public.live_interval_participants (interval_session_id, user_id, display_name, is_host)
  values (p_amrap_session_id, auth.uid(), p_display_name, false)
  on conflict (interval_session_id, user_id) do update
    set display_name = excluded.display_name
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.amrap_join_session(uuid, text) is
  'Authenticated participant upsert into live_interval_participants; requires live session membership.';

-- ---------------------------------------------------------------------------
-- 8) RPC: amrap_start_timer
-- ---------------------------------------------------------------------------

create or replace function public.amrap_start_timer(p_amrap_session_id uuid)
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

  update public.live_interval_sessions s
  set timer_phase = 'work',
      work_started_at = now()
  where s.id = p_amrap_session_id;
end;
$$;

comment on function public.amrap_start_timer(uuid) is
  'Host-only: starts work timer (server clock source at work_started_at).';

-- ---------------------------------------------------------------------------
-- 9) RPC: amrap_reset_timer
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

  delete from public.interval_round_events r
  where r.interval_session_id = p_amrap_session_id;

  update public.live_interval_sessions s
  set timer_phase = 'idle',
      work_started_at = null,
      leaderboard_snapshot = null,
      results_finalized_at = null
  where s.id = p_amrap_session_id;
end;
$$;

comment on function public.amrap_reset_timer(uuid) is
  'Host-only: clears round events, resets timer to idle, and clears finalized leaderboard snapshot.';

-- ---------------------------------------------------------------------------
-- 10) Drop legacy finalize / log_round RPCs
-- ---------------------------------------------------------------------------

drop function if exists public.amrap_finalize_session(uuid, jsonb);
drop function if exists public.amrap_log_round(uuid, uuid);

-- ---------------------------------------------------------------------------
-- 11) RPC: interval_log_round (AMRAP-only in Phase 0)
-- ---------------------------------------------------------------------------

create or replace function public.interval_log_round(
  p_interval_session_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_interval_type public.interval_type;
  v_uid uuid;
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

  if v_interval_type <> 'amrap' then
    raise exception 'manual round logging is only supported for amrap intervals';
  end if;

  if not public.is_live_session_participant(v_live_session_id) then
    raise exception 'forbidden';
  end if;

  select lip.user_id
  into v_uid
  from public.live_interval_participants lip
  where lip.id = p_participant_id
    and lip.interval_session_id = p_interval_session_id;

  if not found then
    raise exception 'participant not found';
  end if;

  if v_uid is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  insert into public.interval_round_events (interval_session_id, participant_id)
  values (p_interval_session_id, p_participant_id);
end;
$$;

comment on function public.interval_log_round(uuid, uuid) is
  'Logs one round event for the caller''s own participant row (AMRAP only in Phase 0).';

revoke all on function public.interval_log_round(uuid, uuid) from public;
grant execute on function public.interval_log_round(uuid, uuid) to authenticated;
grant execute on function public.interval_log_round(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 12) RPC: interval_finalize_session (polymorphic effective_rounds seam)
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
    s.interval_type
  into
    v_duration_seconds,
    v_block_snapshot,
    v_live_session_id,
    v_work_started_at,
    v_session_created_at,
    v_interval_type;

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
      when 'tabata' then 0
      when 'emom' then 0
      else 0
    end;

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
                  and wel.created_at >= coalesce(v_work_started_at, v_session_created_at)
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
      'interval_session_id', p_interval_session_id,
      'session_telemetry', jsonb_build_object(
        'schema_version', 1,
        'captured_at', now(),
        'session_id', v_live_session_id::text,
        'interval_performance', jsonb_build_array(
          jsonb_build_object(
            'block_id', coalesce(v_block_id, v_interval_type::text),
            'format', v_interval_type::text,
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

    update public.live_interval_participants
    set workout_log_task_id = v_task_id
    where id = v_participant.id;
  end loop;
end;
$$;

comment on function public.interval_finalize_session(uuid, jsonb) is
  'Host-only: locks official results, auto-creates per-participant workout_log tasks with effective_rounds by interval_type; idempotent.';

revoke all on function public.interval_finalize_session(uuid, jsonb) from public;
grant execute on function public.interval_finalize_session(uuid, jsonb) to authenticated;
grant execute on function public.interval_finalize_session(uuid, jsonb) to service_role;

commit;
