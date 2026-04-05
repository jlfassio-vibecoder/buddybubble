-- Optional calendar date per task; workspace timezone for "today" boundaries (TDD: scheduled dates).

alter table public.tasks
  add column if not exists scheduled_on date;

create index if not exists tasks_bubble_scheduled_on_idx
  on public.tasks (bubble_id, scheduled_on)
  where scheduled_on is not null;

alter table public.workspaces
  add column if not exists calendar_timezone text;

update public.workspaces
set calendar_timezone = 'UTC'
where calendar_timezone is null or trim(calendar_timezone) = '';

alter table public.workspaces
  alter column calendar_timezone set default 'UTC';

alter table public.workspaces
  alter column calendar_timezone set not null;
