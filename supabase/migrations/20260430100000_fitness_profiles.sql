-- Fitness profiles: per-user-per-workspace fitness preferences (goals, equipment, biometrics).
create table if not exists public.fitness_profiles (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  user_id       uuid        not null references public.users(id) on delete cascade,
  goals         text[]      not null default '{}',
  equipment     text[]      not null default '{}',
  unit_system   text        not null default 'metric'
                            check (unit_system in ('metric', 'imperial')),
  biometrics    jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.fitness_profiles enable row level security;

-- Workspace members can view all profiles in their workspace.
create policy "workspace members can read fitness profiles"
  on public.fitness_profiles for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = fitness_profiles.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Users may only insert / update / delete their own row.
create policy "users insert own fitness profile"
  on public.fitness_profiles for insert
  with check (user_id = auth.uid());

create policy "users update own fitness profile"
  on public.fitness_profiles for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own fitness profile"
  on public.fitness_profiles for delete
  using (user_id = auth.uid());
