-- Polymorphic item types + type-specific JSON payload (see docs/tdd-item-polymorphism-smart-table.md).

alter table public.tasks
  add column if not exists item_type text not null default 'task';

alter table public.tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_item_type_check;

alter table public.tasks
  add constraint tasks_item_type_check
  check (item_type in ('task', 'event', 'experience', 'idea', 'memory'));

comment on column public.tasks.item_type is 'Semantic kind: task, event, experience, idea, or memory.';
comment on column public.tasks.metadata is 'Type-specific attributes (location, horizon hints, etc.).';
