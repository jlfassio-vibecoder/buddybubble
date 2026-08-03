-- program_enrollments: enrollment ledger for Program cards (tasks.item_type = 'program').
-- Capacity stays on tasks.metadata.capacity; enrolled count/people come from this table.

create table if not exists public.program_enrollments (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  task_id      uuid        not null references public.tasks(id) on delete cascade,
  user_id      uuid        not null references public.users(id) on delete cascade,
  status       text        not null default 'enrolled'
               check (status in ('enrolled')),
  created_at   timestamptz not null default now(),
  unique (task_id, user_id)
);

create index if not exists program_enrollments_workspace_user
  on public.program_enrollments (workspace_id, user_id);

create index if not exists program_enrollments_task_id
  on public.program_enrollments (task_id);

alter table public.program_enrollments enable row level security;

create policy "workspace members can read program enrollments"
  on public.program_enrollments for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = program_enrollments.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "users can enroll own program enrollment"
  on public.program_enrollments for insert
  with check (user_id = auth.uid());

create policy "users can delete own program enrollment"
  on public.program_enrollments for delete
  using (user_id = auth.uid());

create policy "workspace owners and admins can delete program enrollments"
  on public.program_enrollments for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = program_enrollments.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "trainers and admins can delete program enrollments"
  on public.program_enrollments for delete
  using (
    exists (
      select 1
      from public.users u
      join public.workspace_members wm on wm.user_id = u.id
      where u.id = auth.uid()
        and wm.workspace_id = program_enrollments.workspace_id
        and u.role in ('trainer', 'admin')
    )
  );

comment on table public.program_enrollments is
  'Program card enrollment ledger. v1 toggle = insert/delete with status enrolled; capacity remains tasks.metadata.capacity.';
