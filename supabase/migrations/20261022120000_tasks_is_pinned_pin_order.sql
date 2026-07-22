-- Shared Kanban pin tier: pinned cards sit above date-sorted unpinned cards.
alter table public.tasks
  add column if not exists is_pinned boolean not null default false;

alter table public.tasks
  add column if not exists pin_order double precision;

comment on column public.tasks.is_pinned is
  'When true, card sits in the column pinned tier (manual order via pin_order).';

comment on column public.tasks.pin_order is
  'Sort key within pinned tier for a given status; null when not pinned.';

create index if not exists tasks_bubble_pinned_idx
  on public.tasks (bubble_id, status, is_pinned, pin_order)
  where archived_at is null and is_pinned = true;
