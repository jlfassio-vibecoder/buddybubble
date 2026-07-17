-- Phase 0/1 (schema): Video Workout Aggregator junction links.
-- See docs/fitness/video-workout-aggregator-blueprint.md

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.class_instance_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  parent_instance_id uuid not null references public.class_instances (id) on delete cascade,
  child_instance_id uuid references public.class_instances (id) on delete cascade,
  link_kind text not null,
  sort_order integer not null default 0,
  break_duration_sec integer,
  title_override text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint class_instance_links_link_kind_check
    check (link_kind in ('vod', 'break')),

  constraint class_instance_links_vod_child_check
    check (
      link_kind <> 'vod'
      or (
        child_instance_id is not null
        and child_instance_id <> parent_instance_id
      )
    ),

  constraint class_instance_links_break_check
    check (
      link_kind <> 'break'
      or (
        child_instance_id is null
        and break_duration_sec is not null
        and break_duration_sec > 0
      )
    ),

  constraint class_instance_links_parent_sort_unique
    unique (parent_instance_id, sort_order)
);

comment on table public.class_instance_links is
  'Ordered aggregation segments: parent class_instance → child VOD instances and timed breaks.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index class_instance_links_workspace_id_idx
  on public.class_instance_links (workspace_id);

create index class_instance_links_parent_instance_id_idx
  on public.class_instance_links (parent_instance_id);

create index class_instance_links_child_instance_id_idx
  on public.class_instance_links (child_instance_id);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------

alter table public.class_instance_links enable row level security;

grant select on table public.class_instance_links to authenticated;
grant insert, update, delete on table public.class_instance_links to authenticated;
grant all on table public.class_instance_links to service_role;

create policy class_instance_links_select on public.class_instance_links
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy class_instance_links_insert on public.class_instance_links
  for insert
  to authenticated
  with check (
    public.is_workspace_admin(workspace_id)
    and exists (
      select 1
      from public.class_instances p
      where p.id = parent_instance_id
        and p.workspace_id = class_instance_links.workspace_id
    )
    and (
      child_instance_id is null
      or exists (
        select 1
        from public.class_instances c
        where c.id = child_instance_id
          and c.workspace_id = class_instance_links.workspace_id
      )
    )
  );

create policy class_instance_links_update on public.class_instance_links
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (
    public.is_workspace_admin(workspace_id)
    and exists (
      select 1
      from public.class_instances p
      where p.id = parent_instance_id
        and p.workspace_id = class_instance_links.workspace_id
    )
    and (
      child_instance_id is null
      or exists (
        select 1
        from public.class_instances c
        where c.id = child_instance_id
          and c.workspace_id = class_instance_links.workspace_id
      )
    )
  );

create policy class_instance_links_delete on public.class_instance_links
  for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));
