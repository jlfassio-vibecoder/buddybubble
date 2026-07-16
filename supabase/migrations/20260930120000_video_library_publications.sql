-- Phase 1: Video Library publications + fitness Video Library hub bubble.
-- See docs/fitness/video-library-bubble-blueprint.md

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.video_library_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  class_instance_id uuid not null references public.class_instances (id) on delete cascade,
  bubble_id uuid not null references public.bubbles (id) on delete cascade,
  access_scope text not null,
  title text,
  published_by uuid not null references public.users (id) on delete restrict,
  published_at timestamptz not null default now(),
  unpublished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint video_library_publications_access_scope_check
    check (access_scope in ('public_storefront', 'workspace', 'bubble_members')),
  constraint video_library_publications_instance_bubble_scope_unique
    unique (class_instance_id, bubble_id, access_scope)
);

comment on table public.video_library_publications is
  'Distribution join: class_instance recording → destination bubble + access_scope.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index video_library_publications_workspace_id_idx
  on public.video_library_publications (workspace_id);

create index video_library_publications_bubble_id_idx
  on public.video_library_publications (bubble_id);

create index video_library_publications_access_scope_idx
  on public.video_library_publications (access_scope);

create index video_library_publications_unpublished_at_idx
  on public.video_library_publications (unpublished_at);

create index video_library_publications_workspace_active_idx
  on public.video_library_publications (workspace_id, unpublished_at)
  where unpublished_at is null;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------

alter table public.video_library_publications enable row level security;

grant select on table public.video_library_publications to anon, authenticated;
grant insert, update on table public.video_library_publications to authenticated;
grant all on table public.video_library_publications to service_role;

create policy video_library_publications_select on public.video_library_publications
  for select
  to anon, authenticated
  using (
    unpublished_at is null
    and (
      (
        access_scope = 'workspace'
        and public.is_workspace_member(workspace_id)
      )
      or (
        access_scope = 'bubble_members'
        and public.can_view_bubble(bubble_id)
      )
      or (
        access_scope = 'public_storefront'
        and exists (
          select 1
          from public.workspaces w
          where w.id = video_library_publications.workspace_id
            and w.is_public = true
        )
      )
    )
  );

create policy video_library_publications_insert on public.video_library_publications
  for insert
  to authenticated
  with check (
    public.is_workspace_admin(workspace_id)
    and published_by = (select auth.uid())
    and exists (
      select 1 from public.class_instances ci
      where ci.id = class_instance_id
        and ci.workspace_id = video_library_publications.workspace_id
    )
    and exists (
      select 1 from public.bubbles b
      where b.id = bubble_id
        and b.workspace_id = video_library_publications.workspace_id
    )
  );

create policy video_library_publications_update on public.video_library_publications
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (
    public.is_workspace_admin(workspace_id)
    and exists (
      select 1 from public.class_instances ci
      where ci.id = class_instance_id
        and ci.workspace_id = video_library_publications.workspace_id
    )
    and exists (
      select 1 from public.bubbles b
      where b.id = bubble_id
        and b.workspace_id = video_library_publications.workspace_id
    )
  );

-- ---------------------------------------------------------------------------
-- seed_workspace_template: accept optional bubble metadata from seed JSON
-- ---------------------------------------------------------------------------

create or replace function public.seed_workspace_template(
  _workspace_id uuid,
  _bubbles jsonb,
  _columns jsonb,
  _category_type text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[] := array[]::uuid[];
  el jsonb;
  col jsonb;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'member', 'trialing')
  ) then
    raise exception 'not authorized to seed workspace template';
  end if;

  for el in
    select * from jsonb_array_elements(coalesce(_bubbles, '[]'::jsonb))
  loop
    insert into public.bubbles (workspace_id, name, icon, metadata)
    values (
      _workspace_id,
      trim(coalesce(el->>'name', '')),
      nullif(trim(coalesce(el->>'icon', '')), ''),
      coalesce(el->'metadata', '{}'::jsonb)
    )
    returning id into new_id;
    ids := array_append(ids, new_id);
  end loop;

  if _category_type is not null and lower(trim(_category_type)) = 'fitness' then
    update public.bubbles b
    set message_visibility = 'subject_threads'
    where b.workspace_id = _workspace_id
      and lower(trim(b.name)) = 'workouts';
  end if;

  for col in
    select * from jsonb_array_elements(coalesce(_columns, '[]'::jsonb))
  loop
    insert into public.board_columns (workspace_id, name, slug, position)
    values (
      _workspace_id,
      trim(coalesce(col->>'name', '')),
      trim(coalesce(col->>'slug', '')),
      coalesce((col->>'position')::int, 0)
    );
  end loop;

  return ids;
end;
$$;

comment on function public.seed_workspace_template(uuid, jsonb, jsonb, text) is
  'Seeds default bubbles + Kanban columns for a new workspace. Optional bubble metadata from JSON. Caller must be workspace member with role owner/admin/member/trialing.';

revoke all on function public.seed_workspace_template(uuid, jsonb, jsonb, text) from public;
grant execute on function public.seed_workspace_template(uuid, jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: Video Library hub bubble for existing fitness workspaces
-- ---------------------------------------------------------------------------

insert into public.bubbles (workspace_id, name, icon, metadata)
select w.id, 'Video Library', 'Hash', '{"kind":"video_library"}'::jsonb
from public.workspaces w
where w.category_type = 'fitness'
  and not exists (
    select 1
    from public.bubbles b
    where b.workspace_id = w.id
      and (
        b.name = 'Video Library'
        or b.metadata->>'kind' = 'video_library'
      )
  );

update public.bubbles b
set metadata = coalesce(b.metadata, '{}'::jsonb) || '{"kind":"video_library"}'::jsonb
from public.workspaces w
where w.id = b.workspace_id
  and w.category_type = 'fitness'
  and b.name = 'Video Library'
  and coalesce(b.metadata->>'kind', '') is distinct from 'video_library';
