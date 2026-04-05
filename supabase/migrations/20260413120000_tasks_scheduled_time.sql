-- Optional local wall time for tasks (interpreted with workspace calendar_timezone), alongside scheduled_on date.

alter table public.tasks
  add column if not exists scheduled_time time;

comment on column public.tasks.scheduled_time is 'Local time on scheduled_on in workspaces.calendar_timezone; null means all-day.';
