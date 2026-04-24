-- Author of a Kanban task (for Workouts personalization and future analytics).
-- public.users already references auth.users; align with workspaces.created_by / messages.user_id.

alter table public.tasks
  add column if not exists created_by uuid references public.users (id) on delete set null
    default (auth.uid());

comment on column public.tasks.created_by is
  'User who created the task. Defaults to auth.uid() on insert; used for Workouts bubble visibility.';

create index if not exists tasks_bubble_id_created_by_idx
  on public.tasks (bubble_id, created_by);
