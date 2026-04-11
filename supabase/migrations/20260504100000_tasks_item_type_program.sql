-- Add `program` to the tasks.item_type CHECK constraint.
-- Runs after 20260503100000_tasks_item_type_workout.sql which already
-- added workout / workout_log; this migration extends it with program.

alter table public.tasks
  drop constraint if exists tasks_item_type_check;

alter table public.tasks
  add constraint tasks_item_type_check
  check (
    item_type in (
      'task',
      'event',
      'experience',
      'idea',
      'memory',
      'workout',
      'workout_log',
      'program'
    )
  );

comment on column public.tasks.item_type is
  'Semantic kind: task | event | experience | idea | memory | workout | workout_log | program.';
