-- Trainer-hub schema + RLS (programs, challenges, workouts, equipment, warmup_config,
-- generated_wods, workout_sets, etc.) adapted for BuddyBubble:
-- - No public.profiles: app-level coach/client/admin role lives on public.users.role.
-- - No get_my_role() reading profiles; admin RLS uses public.users.role.
-- - Hub user FKs reference public.users(id) (aligned with auth.users via existing users PK).

-- -----------------------------------------------------------------------------
-- App role on existing public.users (replaces Fitcopilot profiles.role)
-- -----------------------------------------------------------------------------
alter table public.users
  add column if not exists role text default 'client';

comment on column public.users.role is
  'Fitcopilot / trainer-hub role: client | trainer | admin (separate from workspace_members.role).';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'users'
      and c.conname = 'users_role_hub_check'
  ) then
    alter table public.users
      add constraint users_role_hub_check
      check (role is null or role in ('client', 'trainer', 'admin'));
  end if;
end $$;

-- Legacy helper from Fitcopilot dumps (read profiles) — not used in BuddyBubble policies.
drop function if exists public.get_my_role ();

-- -----------------------------------------------------------------------------
-- programs & program_weeks
-- -----------------------------------------------------------------------------
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text,
  difficulty text default 'intermediate',
  duration_weeks integer default 4,
  tags text[] default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_public boolean default false,
  config jsonb,
  chain_metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  week_number integer not null,
  content jsonb,
  created_at timestamptz default now(),
  unique (program_id, week_number)
);

-- -----------------------------------------------------------------------------
-- workouts
-- -----------------------------------------------------------------------------
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete cascade,
  trainer_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text,
  duration_minutes integer,
  difficulty_level text,
  blocks jsonb default '[]',
  status text default 'active',
  scheduled_week integer,
  scheduled_day integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- challenges & challenge_weeks
-- -----------------------------------------------------------------------------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  author_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'draft',
  config jsonb,
  chain_metadata jsonb,
  hero_image_url text,
  section_images jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.challenge_weeks (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  week_number integer not null,
  content jsonb,
  created_at timestamptz default now(),
  unique (challenge_id, week_number)
);

-- -----------------------------------------------------------------------------
-- workout_logs & user_workout_logs
-- -----------------------------------------------------------------------------
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workout_id text,
  workout_name text not null,
  date date not null,
  effort integer not null check (effort >= 1 and effort <= 10),
  rating integer not null check (rating >= 1 and rating <= 5),
  notes text default '',
  created_at timestamptz default now(),
  readiness_score smallint check (readiness_score is null or (readiness_score between 1 and 5))
);

create index if not exists idx_workout_logs_user_date on public.workout_logs (user_id, date desc);

create table if not exists public.user_workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  program_id text not null,
  week_id text not null,
  workout_id text not null,
  date date not null,
  duration_seconds integer not null default 0,
  exercises jsonb not null default '[]',
  created_at timestamptz default now()
);

create index if not exists idx_user_workout_logs_user_date on public.user_workout_logs (user_id, date desc);

-- -----------------------------------------------------------------------------
-- user_programs & user_challenges
-- -----------------------------------------------------------------------------
create table if not exists public.user_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  start_date date,
  purchased_at timestamptz default now(),
  status text default 'active' check (status in ('active', 'completed')),
  source text not null default 'self' check (source in ('self', 'trainer_assigned', 'cohort')),
  created_at timestamptz default now(),
  unique (user_id, program_id)
);

create table if not exists public.user_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  start_date date,
  created_at timestamptz default now(),
  unique (user_id, challenge_id)
);

-- -----------------------------------------------------------------------------
-- equipment_inventory & equipment_zones
-- -----------------------------------------------------------------------------
create table if not exists public.equipment_inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('resistance', 'cardio', 'utility')),
  created_at timestamptz default now()
);

create table if not exists public.equipment_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('domestic', 'commercial', 'amenity', 'outdoor')),
  description text default '',
  biomechanical_constraints text[] default '{}',
  equipment_ids text[] default '{}',
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- warmup_config
-- -----------------------------------------------------------------------------
create table if not exists public.warmup_config (
  id text primary key default 'default',
  slots jsonb not null default '[]',
  duration_per_exercise integer not null default 30,
  updated_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- generated_wods
-- -----------------------------------------------------------------------------
create table if not exists public.generated_wods (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  level text,
  workout_detail jsonb,
  author_id uuid references public.users (id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  name text default '',
  genre text default '',
  image text default '',
  day text default 'WOD',
  description text default '',
  intensity integer not null default 3,
  exercise_overrides jsonb,
  iteration jsonb,
  parameters jsonb,
  resolved_format jsonb,
  target_volume_minutes integer,
  window_minutes integer,
  rest_load text
);

create index if not exists idx_generated_wods_status_created
  on public.generated_wods (status, created_at desc);

-- -----------------------------------------------------------------------------
-- workout_sets
-- -----------------------------------------------------------------------------
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  author_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published')),
  config jsonb,
  chain_metadata jsonb,
  workouts jsonb not null default '[]',
  workout_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_workout_sets_created on public.workout_sets (created_at desc);
create index if not exists idx_workout_sets_status_created on public.workout_sets (status, created_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.workout_logs enable row level security;
alter table public.user_workout_logs enable row level security;
alter table public.programs enable row level security;
alter table public.program_weeks enable row level security;
alter table public.workouts enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_weeks enable row level security;
alter table public.equipment_inventory enable row level security;
alter table public.equipment_zones enable row level security;
alter table public.warmup_config enable row level security;
alter table public.generated_wods enable row level security;
alter table public.user_programs enable row level security;
alter table public.user_challenges enable row level security;
alter table public.workout_sets enable row level security;

-- -----------------------------------------------------------------------------
-- workout_logs & user_workout_logs
-- -----------------------------------------------------------------------------
drop policy if exists "Users can manage own workout_logs" on public.workout_logs;
create policy "Users can manage own workout_logs" on public.workout_logs
  for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own user_workout_logs" on public.user_workout_logs;
create policy "Users can manage own user_workout_logs" on public.user_workout_logs
  for all using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- programs & program_weeks
-- -----------------------------------------------------------------------------
drop policy if exists "Trainers can manage own programs" on public.programs;
create policy "Trainers can manage own programs" on public.programs
  for all using (auth.uid() = trainer_id);

drop policy if exists "Anyone can read public programs" on public.programs;
create policy "Anyone can read public programs" on public.programs
  for select using (is_public = true);

drop policy if exists "Trainers can manage program_weeks" on public.program_weeks;
create policy "Trainers can manage program_weeks" on public.program_weeks
  for all using (
    exists (
      select 1
      from public.programs p
      where p.id = program_id and p.trainer_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- workouts
-- -----------------------------------------------------------------------------
drop policy if exists "Trainers can manage own workouts" on public.workouts;
create policy "Trainers can manage own workouts" on public.workouts
  for all using (auth.uid() = trainer_id);

-- -----------------------------------------------------------------------------
-- challenges & challenge_weeks
-- -----------------------------------------------------------------------------
drop policy if exists "Authors can manage own challenges" on public.challenges;
create policy "Authors can manage own challenges" on public.challenges
  for all using (auth.uid() = author_id);

drop policy if exists "Authors can manage challenge_weeks" on public.challenge_weeks;
create policy "Authors can manage challenge_weeks" on public.challenge_weeks
  for all using (
    exists (
      select 1
      from public.challenges c
      where c.id = challenge_id and c.author_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- equipment (hub admin via public.users.role)
-- -----------------------------------------------------------------------------
drop policy if exists "Authenticated can read equipment_inventory" on public.equipment_inventory;
create policy "Authenticated can read equipment_inventory" on public.equipment_inventory
  for select using (auth.uid() is not null);

drop policy if exists "Admin can manage equipment_inventory" on public.equipment_inventory;
create policy "Admin can manage equipment_inventory" on public.equipment_inventory
  for all using (
    (select u.role from public.users u where u.id = auth.uid()) = 'admin'
  );

drop policy if exists "Authenticated can read equipment_zones" on public.equipment_zones;
create policy "Authenticated can read equipment_zones" on public.equipment_zones
  for select using (auth.uid() is not null);

drop policy if exists "Admin can manage equipment_zones" on public.equipment_zones;
create policy "Admin can manage equipment_zones" on public.equipment_zones
  for all using (
    (select u.role from public.users u where u.id = auth.uid()) = 'admin'
  );

-- -----------------------------------------------------------------------------
-- warmup_config
-- -----------------------------------------------------------------------------
drop policy if exists "Authenticated can read warmup_config" on public.warmup_config;
create policy "Authenticated can read warmup_config" on public.warmup_config
  for select using (auth.uid() is not null);

drop policy if exists "Admin can update warmup_config" on public.warmup_config;
create policy "Admin can update warmup_config" on public.warmup_config
  for update using (
    (select u.role from public.users u where u.id = auth.uid()) = 'admin'
  );

drop policy if exists "Admin can insert warmup_config" on public.warmup_config;
create policy "Admin can insert warmup_config" on public.warmup_config
  for insert with check (
    (select u.role from public.users u where u.id = auth.uid()) = 'admin'
  );

-- -----------------------------------------------------------------------------
-- generated_wods
-- -----------------------------------------------------------------------------
drop policy if exists "Authenticated can read generated_wods" on public.generated_wods;
create policy "Authenticated can read generated_wods" on public.generated_wods
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated can manage own generated_wods" on public.generated_wods;
create policy "Authenticated can manage own generated_wods" on public.generated_wods
  for all using (author_id is not null and auth.uid() = author_id);

-- -----------------------------------------------------------------------------
-- user_programs & user_challenges
-- -----------------------------------------------------------------------------
drop policy if exists "Users can manage own user_programs" on public.user_programs;
create policy "Users can manage own user_programs" on public.user_programs
  for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own user_challenges" on public.user_challenges;
create policy "Users can manage own user_challenges" on public.user_challenges
  for all using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- workout_sets
-- -----------------------------------------------------------------------------
drop policy if exists "Authors can manage own workout_sets" on public.workout_sets;
create policy "Authors can manage own workout_sets" on public.workout_sets
  for all using (auth.uid() = author_id);

drop policy if exists "Anyone can read published workout_sets" on public.workout_sets;
create policy "Anyone can read published workout_sets" on public.workout_sets
  for select using (status = 'published');
