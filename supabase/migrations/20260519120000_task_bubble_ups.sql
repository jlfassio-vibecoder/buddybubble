-- Per-user "Bubble Up" (Bubbly) reactions on Kanban cards (`tasks`), synced across board, calendar, and chat embeds.

create table public.task_bubble_ups (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create index task_bubble_ups_task_id_idx on public.task_bubble_ups (task_id);

comment on table public.task_bubble_ups is
  'One row per user who "Bubble Up"''d a task; delete row to remove.';

alter table public.task_bubble_ups enable row level security;

-- SELECT: same visibility as tasks (bubble member / viewer path or assignee)
create policy task_bubble_ups_select on public.task_bubble_ups
  for select using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_bubble_ups.task_id
        and (
          public.can_view_bubble(t.bubble_id)
          or t.assigned_to = auth.uid()
        )
    )
  );

create policy task_bubble_ups_insert on public.task_bubble_ups
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and (
          public.can_view_bubble(t.bubble_id)
          or t.assigned_to = auth.uid()
        )
    )
  );

create policy task_bubble_ups_delete on public.task_bubble_ups
  for delete using (user_id = auth.uid());
