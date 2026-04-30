-- Trainer Hub multi-tenant infrastructure.
-- Legacy user FKs are adapted to BuddyBubble's public.users identity model.

create table if not exists public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users (id) on delete cascade,
  client_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (trainer_id, client_id)
);

-- Copilot suggestion ignored: this migration intentionally supports clean database bootstrap while replacing Trainer Hub policies.
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workout_id text,
  workout_name text,
  date date,
  effort integer,
  rating integer,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.user_workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  program_id text,
  week_id text,
  workout_id text,
  date date,
  duration_seconds integer,
  exercises jsonb,
  created_at timestamptz default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users (id) on delete cascade,
  title text,
  description text,
  difficulty text,
  duration_weeks integer,
  tags text[],
  status text,
  is_public boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  week_number integer,
  content jsonb,
  created_at timestamptz default now(),
  unique (program_id, week_number)
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete cascade,
  trainer_id uuid not null references public.users (id) on delete cascade,
  title text,
  description text,
  duration_minutes integer,
  difficulty_level text,
  blocks jsonb,
  status text,
  scheduled_week integer,
  scheduled_day integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_trainer_clients_trainer_client_status
  on public.trainer_clients (trainer_id, client_id, status);

create index if not exists idx_trainer_clients_client_trainer_status
  on public.trainer_clients (client_id, trainer_id, status);

create index if not exists idx_workout_logs_user_date
  on public.workout_logs (user_id, date desc);

create index if not exists idx_user_workout_logs_user_date
  on public.user_workout_logs (user_id, date desc);

create index if not exists idx_programs_trainer_status
  on public.programs (trainer_id, status);

create index if not exists idx_programs_is_public_status
  on public.programs (is_public, status);

create index if not exists idx_program_weeks_program_week
  on public.program_weeks (program_id, week_number);

create index if not exists idx_workouts_trainer_status
  on public.workouts (trainer_id, status);

create index if not exists idx_workouts_program_scheduled
  on public.workouts (program_id, scheduled_week, scheduled_day);

alter table public.trainer_clients enable row level security;
alter table public.workout_logs enable row level security;
alter table public.user_workout_logs enable row level security;
alter table public.programs enable row level security;
alter table public.program_weeks enable row level security;
alter table public.workouts enable row level security;

grant select, insert, update, delete on table public.trainer_clients to authenticated;
grant select, insert, update, delete on table public.workout_logs to authenticated;
grant select, insert, update, delete on table public.user_workout_logs to authenticated;
grant select, insert, update, delete on table public.programs to authenticated;
grant select, insert, update, delete on table public.program_weeks to authenticated;
grant select, insert, update, delete on table public.workouts to authenticated;
grant select on table public.programs to anon;

grant all on table public.trainer_clients to service_role;
grant all on table public.workout_logs to service_role;
grant all on table public.user_workout_logs to service_role;
grant all on table public.programs to service_role;
grant all on table public.program_weeks to service_role;
grant all on table public.workouts to service_role;

-- Replace earlier Trainer Hub policies with the multi-tenant trainer_clients model.
drop policy if exists "Users can manage own workout_logs" on public.workout_logs;
drop policy if exists "Users can manage own user_workout_logs" on public.user_workout_logs;
drop policy if exists "Trainers can manage own programs" on public.programs;
drop policy if exists "Anyone can read public programs" on public.programs;
drop policy if exists "Trainers can manage program_weeks" on public.program_weeks;
drop policy if exists "Trainers can manage own workouts" on public.workouts;

drop policy if exists trainer_clients_select_trainer_or_client on public.trainer_clients;
drop policy if exists trainer_clients_insert_trainer on public.trainer_clients;
drop policy if exists trainer_clients_update_trainer on public.trainer_clients;
drop policy if exists trainer_clients_delete_trainer on public.trainer_clients;

-- Copilot suggestion ignored: wrapping auth.uid() in a scalar subquery is a documented Supabase RLS planner optimization.
create policy trainer_clients_select_trainer_or_client
  on public.trainer_clients
  for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or client_id = (select auth.uid())
  );

create policy trainer_clients_insert_trainer
  on public.trainer_clients
  for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

create policy trainer_clients_update_trainer
  on public.trainer_clients
  for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

create policy trainer_clients_delete_trainer
  on public.trainer_clients
  for delete
  to authenticated
  using (trainer_id = (select auth.uid()));

drop policy if exists workout_logs_select_own_or_active_trainer on public.workout_logs;
drop policy if exists workout_logs_insert_own on public.workout_logs;
drop policy if exists workout_logs_update_own on public.workout_logs;
drop policy if exists workout_logs_delete_own on public.workout_logs;

create policy workout_logs_select_own_or_active_trainer
  on public.workout_logs
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.trainer_clients tc
      where tc.trainer_id = (select auth.uid())
        and tc.client_id = workout_logs.user_id
        and tc.status = 'active'
    )
  );

create policy workout_logs_insert_own
  on public.workout_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy workout_logs_update_own
  on public.workout_logs
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy workout_logs_delete_own
  on public.workout_logs
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_workout_logs_select_own_or_active_trainer on public.user_workout_logs;
drop policy if exists user_workout_logs_insert_own on public.user_workout_logs;
drop policy if exists user_workout_logs_update_own on public.user_workout_logs;
drop policy if exists user_workout_logs_delete_own on public.user_workout_logs;

create policy user_workout_logs_select_own_or_active_trainer
  on public.user_workout_logs
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.trainer_clients tc
      where tc.trainer_id = (select auth.uid())
        and tc.client_id = user_workout_logs.user_id
        and tc.status = 'active'
    )
  );

create policy user_workout_logs_insert_own
  on public.user_workout_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy user_workout_logs_update_own
  on public.user_workout_logs
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_workout_logs_delete_own
  on public.user_workout_logs
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists programs_select_own_or_active_client on public.programs;
drop policy if exists programs_select_public on public.programs;
drop policy if exists programs_insert_own on public.programs;
drop policy if exists programs_update_own on public.programs;
drop policy if exists programs_delete_own on public.programs;

create policy programs_select_public
  on public.programs
  for select
  to anon, authenticated
  using (is_public = true);

create policy programs_select_own_or_active_client
  on public.programs
  for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or exists (
      select 1
      from public.trainer_clients tc
      where tc.trainer_id = programs.trainer_id
        and tc.client_id = (select auth.uid())
        and tc.status = 'active'
    )
  );

create policy programs_insert_own
  on public.programs
  for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

create policy programs_update_own
  on public.programs
  for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

create policy programs_delete_own
  on public.programs
  for delete
  to authenticated
  using (trainer_id = (select auth.uid()));

drop policy if exists program_weeks_select_own_or_active_client on public.program_weeks;
drop policy if exists program_weeks_insert_own_trainer on public.program_weeks;
drop policy if exists program_weeks_update_own_trainer on public.program_weeks;
drop policy if exists program_weeks_delete_own_trainer on public.program_weeks;

create policy program_weeks_select_own_or_active_client
  on public.program_weeks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.programs p
      where p.id = program_weeks.program_id
        and (
          p.trainer_id = (select auth.uid())
          or exists (
            select 1
            from public.trainer_clients tc
            where tc.trainer_id = p.trainer_id
              and tc.client_id = (select auth.uid())
              and tc.status = 'active'
          )
        )
    )
  );

create policy program_weeks_insert_own_trainer
  on public.program_weeks
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.programs p
      where p.id = program_weeks.program_id
        and p.trainer_id = (select auth.uid())
    )
  );

create policy program_weeks_update_own_trainer
  on public.program_weeks
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.programs p
      where p.id = program_weeks.program_id
        and p.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.programs p
      where p.id = program_weeks.program_id
        and p.trainer_id = (select auth.uid())
    )
  );

create policy program_weeks_delete_own_trainer
  on public.program_weeks
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.programs p
      where p.id = program_weeks.program_id
        and p.trainer_id = (select auth.uid())
    )
  );

drop policy if exists workouts_select_own_or_active_client on public.workouts;
drop policy if exists workouts_insert_own on public.workouts;
drop policy if exists workouts_update_own on public.workouts;
drop policy if exists workouts_delete_own on public.workouts;

create policy workouts_select_own_or_active_client
  on public.workouts
  for select
  to authenticated
  using (
    trainer_id = (select auth.uid())
    or exists (
      select 1
      from public.trainer_clients tc
      where tc.trainer_id = workouts.trainer_id
        and tc.client_id = (select auth.uid())
        and tc.status = 'active'
    )
  );

create policy workouts_insert_own
  on public.workouts
  for insert
  to authenticated
  with check (trainer_id = (select auth.uid()));

create policy workouts_update_own
  on public.workouts
  for update
  to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

create policy workouts_delete_own
  on public.workouts
  for delete
  to authenticated
  using (trainer_id = (select auth.uid()));
