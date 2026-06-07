-- Storefront public social: anonymous (authenticated) visitors may read public feed,
-- Bubble Up public tasks, and post task-scoped comments on public storefront cards.

-- ---------------------------------------------------------------------------
-- Helper: public task in a published workspace
-- ---------------------------------------------------------------------------

create or replace function public.is_public_storefront_task(_task_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tasks t
    inner join public.bubbles b on b.id = t.bubble_id
    inner join public.workspaces w on w.id = b.workspace_id
    where t.id = _task_id
      and t.visibility = 'public'
      and w.is_public = true
  );
$$;

comment on function public.is_public_storefront_task(uuid) is
  'True when task is public and its workspace is a published storefront portal.';

-- ---------------------------------------------------------------------------
-- SELECT: authenticated JWTs (incl. signInAnonymously) mirror anon storefront read
-- ---------------------------------------------------------------------------

create policy tasks_select_public_authenticated on public.tasks
  for select
  to authenticated
  using (
    visibility = 'public'
    and exists (
      select 1
      from public.bubbles b
      inner join public.workspaces w on w.id = b.workspace_id
      where b.id = tasks.bubble_id
        and w.is_public = true
    )
  );

create policy class_instances_select_public_authenticated on public.class_instances
  for select
  to authenticated
  using (
    visibility = 'public'
    and exists (
      select 1
      from public.workspaces w
      where w.id = class_instances.workspace_id
        and w.is_public = true
    )
  );

create policy class_offerings_select_public_authenticated on public.class_offerings
  for select
  to authenticated
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

-- ---------------------------------------------------------------------------
-- task_bubble_ups: storefront visitors on public tasks
-- ---------------------------------------------------------------------------

drop policy if exists task_bubble_ups_select on public.task_bubble_ups;
drop policy if exists task_bubble_ups_insert on public.task_bubble_ups;

create policy task_bubble_ups_select on public.task_bubble_ups
  for select using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_bubble_ups.task_id
        and (
          public.can_view_bubble(t.bubble_id)
          or exists (
            select 1
            from public.task_assignees ta
            where ta.task_id = t.id
              and ta.user_id = auth.uid()
          )
          or public.is_public_storefront_task(t.id)
        )
    )
  );

create policy task_bubble_ups_insert on public.task_bubble_ups
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and (
          public.can_view_bubble(t.bubble_id)
          or exists (
            select 1
            from public.task_assignees ta
            where ta.task_id = t.id
              and ta.user_id = auth.uid()
          )
          or public.is_public_storefront_task(t.id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- messages: task-scoped comments on public storefront cards
-- ---------------------------------------------------------------------------

create policy messages_select_public_storefront_task_comments on public.messages
  for select using (
    target_task_id is not null
    and public.is_public_storefront_task(target_task_id)
  );

create policy messages_insert_public_storefront_task_comments on public.messages
  for insert with check (
    user_id = (select auth.uid())
    and target_task_id is not null
    and public.is_public_storefront_task(target_task_id)
    and bubble_id = (
      select t.bubble_id
      from public.tasks t
      where t.id = target_task_id
    )
  );

create policy messages_update_public_storefront_task_comments on public.messages
  for update
  using (
    user_id = (select auth.uid())
    and target_task_id is not null
    and public.is_public_storefront_task(target_task_id)
  )
  with check (
    user_id = (select auth.uid())
    and target_task_id is not null
    and public.is_public_storefront_task(target_task_id)
  );

create policy messages_delete_public_storefront_task_comments on public.messages
  for delete using (
    user_id = (select auth.uid())
    and target_task_id is not null
    and public.is_public_storefront_task(target_task_id)
  );

-- ---------------------------------------------------------------------------
-- users: read authors of public storefront task comments
-- ---------------------------------------------------------------------------

create policy users_select_public_storefront_comment_authors on public.users
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.user_id = users.id
        and m.target_task_id is not null
        and public.is_public_storefront_task(m.target_task_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: cross-visitor Bubble Up counts on storefront
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_bubble_ups'
  ) then
    alter publication supabase_realtime add table public.task_bubble_ups;
  end if;
end $$;
