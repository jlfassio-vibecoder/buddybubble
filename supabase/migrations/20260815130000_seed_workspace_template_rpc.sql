-- Seed bubbles + board_columns during workspace creation without depending on
-- public.can_write_workspace() matching app expectations (e.g. DBs missing
-- 'owner' in can_write_workspace still break createWorkspaceFromModal after
-- workspace_members inserts the creator as owner).
--
-- Security: SECURITY DEFINER bypasses RLS on bubbles/board_columns. Authorization
-- is an explicit workspace_members check (same roles that may create channels in
-- the product: owner, admin, member, trialing — not guest).

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
    insert into public.bubbles (workspace_id, name, icon)
    values (
      _workspace_id,
      trim(coalesce(el->>'name', '')),
      nullif(trim(coalesce(el->>'icon', '')), '')
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
  'Seeds default bubbles + Kanban columns for a new workspace. Caller must be workspace member with role owner/admin/member/trialing.';

revoke all on function public.seed_workspace_template(uuid, jsonb, jsonb, text) from public;
grant execute on function public.seed_workspace_template(uuid, jsonb, jsonb, text) to authenticated;
