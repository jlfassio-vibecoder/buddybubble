-- Task priority for Kanban filtering and display (low / medium / high).

alter table public.tasks
  add column if not exists priority text;

update public.tasks
set priority = 'medium'
where priority is null;

alter table public.tasks
  alter column priority set default 'medium';

alter table public.tasks
  alter column priority set not null;

alter table public.tasks
  drop constraint if exists tasks_priority_check;

alter table public.tasks
  add constraint tasks_priority_check
  check (priority in ('low', 'medium', 'high'));

create index if not exists tasks_bubble_priority_idx on public.tasks (bubble_id, priority);
