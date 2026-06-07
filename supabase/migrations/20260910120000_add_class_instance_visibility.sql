-- Per-instance storefront visibility for fitness classes (mirrors tasks.visibility).

alter table public.class_instances
  add column if not exists visibility text not null default 'private';

alter table public.class_instances
  drop constraint if exists class_instances_visibility_check;

alter table public.class_instances
  add constraint class_instances_visibility_check
  check (visibility in ('private', 'public'));

comment on column public.class_instances.visibility is
  'private: workspace members only; public: anon-readable when workspace is_public.';

-- ---------------------------------------------------------------------------
-- RLS: anon read-only access to public classes in published workspaces
-- ---------------------------------------------------------------------------

create policy class_instances_select_public_anon on public.class_instances
  for select
  to anon
  using (
    visibility = 'public'
    and exists (
      select 1
      from public.workspaces w
      where w.id = class_instances.workspace_id
        and w.is_public = true
    )
  );

create policy class_offerings_select_public_anon on public.class_offerings
  for select
  to anon
  using (
    exists (
      select 1
      from public.class_instances ci
      inner join public.workspaces w on w.id = ci.workspace_id
      where ci.offering_id = class_offerings.id
        and ci.visibility = 'public'
        and w.is_public = true
    )
  );
