-- Soft-archive tasks without deleting rows (hidden from Kanban / calendar active lists).
alter table public.tasks
  add column if not exists archived_at timestamptz null;

comment on column public.tasks.archived_at is 'When set, task is archived and excluded from active board/calendar lists.';
