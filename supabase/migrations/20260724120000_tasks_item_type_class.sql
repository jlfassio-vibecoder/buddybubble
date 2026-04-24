-- Allow `class` as a tasks.item_type value (Bubble Card shell / TaskModal app switcher).
-- Class content is stored in class_offerings / class_instances; task rows may still carry
-- item_type = 'class' for shell routing when needed.

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
      'program',
      'class'
    )
  );

comment on column public.tasks.item_type is
  'Semantic kind: task | event | experience | idea | memory | workout | workout_log | program | class.';
