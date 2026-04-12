-- Program-scoped workouts: native FK to parent program task + session key for upserts/analytics.

alter table public.tasks
  add column if not exists program_id uuid references public.tasks (id) on delete restrict;

alter table public.tasks
  add column if not exists program_session_key text;

comment on column public.tasks.program_id is
  'Parent program task (item_type = program) for workouts generated or linked to a program.';
comment on column public.tasks.program_session_key is
  'Stable session id within a program (matches metadata.program_session_key during transition).';

create index if not exists idx_tasks_program_id
  on public.tasks (program_id)
  where program_id is not null;

-- Backfill from metadata (only valid UUID strings).
update public.tasks
set program_id = (metadata->>'linked_program_task_id')::uuid
where item_type in ('workout', 'workout_log')
  and metadata->>'linked_program_task_id' is not null
  and program_id is null
  and metadata->>'linked_program_task_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

update public.tasks
set program_session_key = metadata->>'program_session_key'
where item_type in ('workout', 'workout_log')
  and program_session_key is null
  and metadata->>'program_session_key' is not null
  and length(trim(metadata->>'program_session_key')) > 0;
