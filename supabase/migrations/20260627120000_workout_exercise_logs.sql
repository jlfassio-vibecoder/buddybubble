-- Per-set workout telemetry for live sessions.
-- Relational model so we can run analytics across users/sessions/tasks without
-- parsing JSON. Ties each set to (user, session, task, exercise, set_number).

-- ---------------------------------------------------------------------------
-- 1) Table + constraints
-- ---------------------------------------------------------------------------

create table if not exists public.workout_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  session_id text not null,
  task_id uuid not null references public.tasks (id) on delete cascade,
  exercise_name text not null,
  set_number integer not null check (set_number >= 1),
  weight_lbs numeric,
  reps integer,
  rpe integer,
  created_at timestamptz not null default now(),
  constraint workout_exercise_logs_unique_set
    unique (user_id, session_id, task_id, exercise_name, set_number)
);

comment on table public.workout_exercise_logs is
  'Per-set workout telemetry logged by participants during live sessions; one row per (user, session, task, exercise, set).';

-- ---------------------------------------------------------------------------
-- 2) Analytical indexes
-- ---------------------------------------------------------------------------
-- The UNIQUE constraint already provides a leading-`user_id` composite index;
-- these single-column indexes cover the other common scan shapes.

create index if not exists workout_exercise_logs_user_id_idx
  on public.workout_exercise_logs (user_id);

create index if not exists workout_exercise_logs_session_id_idx
  on public.workout_exercise_logs (session_id);

create index if not exists workout_exercise_logs_task_id_idx
  on public.workout_exercise_logs (task_id);

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
-- Reuses public.get_task_bubble_id(task_id) (SECURITY DEFINER) from
-- 20260624120000_live_session_deck_and_task_assignees.sql so policies never
-- subquery public.tasks directly (avoids recursion with tasks RLS).

alter table public.workout_exercise_logs enable row level security;

drop policy if exists workout_exercise_logs_select on public.workout_exercise_logs;
drop policy if exists workout_exercise_logs_insert on public.workout_exercise_logs;
drop policy if exists workout_exercise_logs_update on public.workout_exercise_logs;
drop policy if exists workout_exercise_logs_delete on public.workout_exercise_logs;

create policy workout_exercise_logs_select on public.workout_exercise_logs
  for select using (
    user_id = auth.uid()
    or public.can_view_bubble(
      public.get_task_bubble_id(workout_exercise_logs.task_id)
    )
  );

create policy workout_exercise_logs_insert on public.workout_exercise_logs
  for insert with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

create policy workout_exercise_logs_update on public.workout_exercise_logs
  for update
  using (
    auth.uid() is not null
    and user_id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

create policy workout_exercise_logs_delete on public.workout_exercise_logs
  for delete using (
    auth.uid() is not null
    and user_id = auth.uid()
  );
