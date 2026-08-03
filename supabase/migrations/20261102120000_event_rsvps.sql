-- event_rsvps: real enrollment ledger for Event cards (tasks.item_type = 'event').
-- Capacity stays on tasks.metadata.capacity; going count/people come from this table.

create table if not exists public.event_rsvps (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  task_id      uuid        not null references public.tasks(id) on delete cascade,
  user_id      uuid        not null references public.users(id) on delete cascade,
  status       text        not null default 'going'
               check (status in ('going')),
  created_at   timestamptz not null default now(),
  unique (task_id, user_id)
);

create index if not exists event_rsvps_workspace_user
  on public.event_rsvps (workspace_id, user_id);

create index if not exists event_rsvps_task_id
  on public.event_rsvps (task_id);

alter table public.event_rsvps enable row level security;

-- Workspace members can see all RSVPs (for count + avatar stack).
create policy "workspace members can read event rsvps"
  on public.event_rsvps for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = event_rsvps.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Users can RSVP themselves.
create policy "users can enroll own event rsvp"
  on public.event_rsvps for insert
  with check (user_id = auth.uid());

-- Users can remove their own RSVP.
create policy "users can delete own event rsvp"
  on public.event_rsvps for delete
  using (user_id = auth.uid());

-- Workspace owners/admins may remove any RSVP in the workspace.
create policy "workspace owners and admins can delete event rsvps"
  on public.event_rsvps for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = event_rsvps.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- Platform trainers/admins who belong to the workspace may remove any RSVP
-- (mirrors class_enrollments trainer delete shape).
create policy "trainers and admins can delete event rsvps"
  on public.event_rsvps for delete
  using (
    exists (
      select 1
      from public.users u
      join public.workspace_members wm on wm.user_id = u.id
      where u.id = auth.uid()
        and wm.workspace_id = event_rsvps.workspace_id
        and u.role in ('trainer', 'admin')
    )
  );

comment on table public.event_rsvps is
  'Event card enrollment ledger. v1 toggle = insert/delete with status going; capacity remains tasks.metadata.capacity.';
