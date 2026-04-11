-- Class domain tables for fitness workspaces.
-- class_offerings: the "template" for a recurring class (e.g. "Monday Spin").
-- class_instances: a concrete scheduled occurrence of an offering.
-- class_enrollments: user registration for a specific instance.

-- ── class_offerings ──────────────────────────────────────────────────────────

create table if not exists public.class_offerings (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  name         text        not null,
  description  text,
  duration_min integer     not null default 60 check (duration_min > 0),
  location     text,
  metadata     jsonb       not null default '{}',
  created_by   uuid        references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.class_offerings enable row level security;

-- Workspace members can view all offerings.
create policy "workspace members can read class offerings"
  on public.class_offerings for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_offerings.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Only workspace admins / owners may create, update, or delete offerings.
create policy "workspace admins can insert class offerings"
  on public.class_offerings for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_offerings.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace admins can update class offerings"
  on public.class_offerings for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_offerings.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace admins can delete class offerings"
  on public.class_offerings for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_offerings.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ── class_instances ──────────────────────────────────────────────────────────

create table if not exists public.class_instances (
  id               uuid        primary key default gen_random_uuid(),
  offering_id      uuid        not null references public.class_offerings(id) on delete cascade,
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  scheduled_at     timestamptz not null,
  capacity         integer     check (capacity > 0),
  status           text        not null default 'available'
                               check (status in ('available', 'cancelled', 'completed')),
  instructor_notes text,
  metadata         jsonb       not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists class_instances_workspace_scheduled
  on public.class_instances (workspace_id, scheduled_at);

alter table public.class_instances enable row level security;

create policy "workspace members can read class instances"
  on public.class_instances for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_instances.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace admins can insert class instances"
  on public.class_instances for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_instances.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace admins can update class instances"
  on public.class_instances for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_instances.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace admins can delete class instances"
  on public.class_instances for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_instances.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ── class_enrollments ────────────────────────────────────────────────────────

create table if not exists public.class_enrollments (
  id           uuid        primary key default gen_random_uuid(),
  instance_id  uuid        not null references public.class_instances(id) on delete cascade,
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  user_id      uuid        not null references public.users(id) on delete cascade,
  status       text        not null default 'enrolled'
               check (status in ('enrolled', 'waitlisted', 'cancelled', 'completed')),
  enrolled_at  timestamptz not null default now(),
  unique (instance_id, user_id)
);

create index if not exists class_enrollments_workspace_user
  on public.class_enrollments (workspace_id, user_id);

alter table public.class_enrollments enable row level security;

-- Workspace members can see all enrollments (for capacity display).
create policy "workspace members can read class enrollments"
  on public.class_enrollments for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = class_enrollments.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Users can enroll themselves.
create policy "users can enroll in classes"
  on public.class_enrollments for insert
  with check (user_id = auth.uid());

-- Users can update their own enrollment (e.g. cancel).
create policy "users can update own enrollment"
  on public.class_enrollments for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete their own enrollment.
create policy "users can delete own enrollment"
  on public.class_enrollments for delete
  using (user_id = auth.uid());
