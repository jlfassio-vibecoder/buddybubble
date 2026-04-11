-- Allow fitness polymorphic kinds on tasks (app already uses these in TypeScript).
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
      'workout_log'
    )
  );

comment on column public.tasks.item_type is
  'Semantic kind: task, event, experience, idea, memory, workout, or workout_log.';
