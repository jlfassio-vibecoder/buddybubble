-- Optional assigned instructor for a class instance (trainers/admins in workspace).

alter table public.class_instances
  add column if not exists instructor_id uuid references public.users (id) on delete set null;

comment on column public.class_instances.instructor_id is
  'Optional assigned instructor; references public.users(id). Selectable from workspace trainers/admins. RLS for owner/admin writes is inherited from class_instances UPDATE policy.';

create index if not exists class_instances_instructor_id_idx on public.class_instances (instructor_id);
