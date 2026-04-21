-- Live session deck sync + multi-assignee support.
--
-- Notes:
-- - Drops legacy public.tasks.assigned_to (breaking change) per product direction.
-- - Rewrites dependent SECURITY INVOKER helpers + RLS policies that referenced assigned_to.
-- - Adds public.task_assignees + public.live_session_deck_items with strict bubble-derived RLS.

-- ---------------------------------------------------------------------------
-- 0) Tables
-- ---------------------------------------------------------------------------

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists task_assignees_user_id_idx
  on public.task_assignees (user_id);

comment on table public.task_assignees is
  'Many-to-many task assignments; replaces legacy tasks.assigned_to.';

create table if not exists public.live_session_deck_items (
  session_id text not null,
  task_id uuid not null references public.tasks (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, task_id)
);

create index if not exists live_session_deck_items_session_sort_idx
  on public.live_session_deck_items (session_id, sort_order);

create index if not exists live_session_deck_items_task_id_idx
  on public.live_session_deck_items (task_id);

comment on table public.live_session_deck_items is
  'Ordered workout deck for a live session; session_id matches chat invite metadata.sessionId.';

-- ---------------------------------------------------------------------------
-- 0b) RLS recursion guard: read tasks.bubble_id without re-entering tasks RLS
-- ---------------------------------------------------------------------------
-- task_assignees / live_session_deck_items policies must not subquery public.tasks
-- directly, or they recurse with tasks_select / tasks_update (which reference task_assignees).

create or replace function public.get_task_bubble_id(p_task_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select bubble_id from public.tasks where id = p_task_id;
$$;

comment on function public.get_task_bubble_id(uuid) is
  'Returns tasks.bubble_id for RLS on task_assignees and live_session_deck_items; SECURITY DEFINER avoids policy recursion.';

-- ---------------------------------------------------------------------------
-- 1) updated_at trigger for live_session_deck_items
-- ---------------------------------------------------------------------------

create or replace function public.live_session_deck_items_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists live_session_deck_items_set_updated_at on public.live_session_deck_items;
create trigger live_session_deck_items_set_updated_at
before update on public.live_session_deck_items
for each row
execute function public.live_session_deck_items_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) RLS: task_assignees + live_session_deck_items
-- ---------------------------------------------------------------------------

alter table public.task_assignees enable row level security;

drop policy if exists task_assignees_select on public.task_assignees;
drop policy if exists task_assignees_insert on public.task_assignees;
drop policy if exists task_assignees_update on public.task_assignees;
drop policy if exists task_assignees_delete on public.task_assignees;

create policy task_assignees_select on public.task_assignees
  for select using (
    user_id = auth.uid()
    or public.can_view_bubble(public.get_task_bubble_id(task_assignees.task_id))
  );

create policy task_assignees_insert on public.task_assignees
  for insert with check (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(task_id))
  );

create policy task_assignees_update on public.task_assignees
  for update
  using (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(task_assignees.task_id))
  )
  with check (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(task_id))
  );

create policy task_assignees_delete on public.task_assignees
  for delete using (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(task_assignees.task_id))
  );

alter table public.live_session_deck_items enable row level security;

drop policy if exists live_session_deck_items_select on public.live_session_deck_items;
drop policy if exists live_session_deck_items_insert on public.live_session_deck_items;
drop policy if exists live_session_deck_items_update on public.live_session_deck_items;
drop policy if exists live_session_deck_items_delete on public.live_session_deck_items;

create policy live_session_deck_items_select on public.live_session_deck_items
  for select using (
    public.can_view_bubble(public.get_task_bubble_id(live_session_deck_items.task_id))
  );

create policy live_session_deck_items_insert on public.live_session_deck_items
  for insert with check (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(task_id))
  );

create policy live_session_deck_items_update on public.live_session_deck_items
  for update
  using (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(live_session_deck_items.task_id))
  )
  with check (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(task_id))
  );

create policy live_session_deck_items_delete on public.live_session_deck_items
  for delete using (
    auth.uid() is not null
    and public.can_write_bubble(public.get_task_bubble_id(live_session_deck_items.task_id))
  );

-- ---------------------------------------------------------------------------
-- 3) Rewrite helpers/policies that referenced tasks.assigned_to (must happen BEFORE drop column)
-- ---------------------------------------------------------------------------

create or replace function public.can_mutate_task_linked_rows(_task_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = _task_id
      and (
        (
          not exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = public.workspace_id_for_bubble(t.bubble_id)
              and wm.user_id = auth.uid()
              and wm.role = 'guest'
          )
          and (
            public.can_write_bubble(t.bubble_id)
            or exists (
              select 1
              from public.task_assignees ta
              where ta.task_id = t.id
                and ta.user_id = auth.uid()
            )
          )
        )
        or (
          exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = public.workspace_id_for_bubble(t.bubble_id)
              and wm.user_id = auth.uid()
              and wm.role = 'guest'
          )
          and exists (
            select 1
            from public.task_assignees ta
            where ta.task_id = t.id
              and ta.user_id = auth.uid()
          )
        )
        or (
          exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = public.workspace_id_for_bubble(t.bubble_id)
              and wm.user_id = auth.uid()
              and wm.role = 'guest'
          )
          and public.can_write_bubble(t.bubble_id)
          and (
            not exists (select 1 from public.task_assignees ta where ta.task_id = t.id)
            or exists (
              select 1
              from public.task_assignees ta
              where ta.task_id = t.id
                and ta.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

create or replace function public.user_may_update_task_row(_uid uuid, _task public.tasks)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select (
    (
      not public.is_workspace_guest(public.workspace_id_for_bubble(_task.bubble_id))
      and (
        public.can_write_bubble(_task.bubble_id)
        or exists (
          select 1
          from public.task_assignees ta
          where ta.task_id = _task.id
            and ta.user_id = _uid
        )
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(_task.bubble_id))
      and exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = _task.id
          and ta.user_id = _uid
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(_task.bubble_id))
      and public.can_write_bubble(_task.bubble_id)
      and (
        not exists (select 1 from public.task_assignees ta where ta.task_id = _task.id)
        or exists (
          select 1
          from public.task_assignees ta
          where ta.task_id = _task.id
            and ta.user_id = _uid
        )
      )
    )
  );
$$;

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
        )
    )
  );

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_update on public.tasks;

create policy tasks_select on public.tasks
  for select using (
    (
      not public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and (
        public.can_view_bubble(bubble_id)
        or exists (
          select 1
          from public.task_assignees ta
          where ta.task_id = tasks.id
            and ta.user_id = auth.uid()
        )
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = tasks.id
          and ta.user_id = auth.uid()
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and public.can_view_bubble(bubble_id)
      and (
        not exists (select 1 from public.task_assignees ta where ta.task_id = tasks.id)
        or exists (
          select 1
          from public.task_assignees ta
          where ta.task_id = tasks.id
            and ta.user_id = auth.uid()
        )
      )
    )
  );

create policy tasks_update on public.tasks
  for update
  using (
    (
      not public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and (
        public.can_write_bubble(bubble_id)
        or exists (
          select 1
          from public.task_assignees ta
          where ta.task_id = tasks.id
            and ta.user_id = auth.uid()
        )
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = tasks.id
          and ta.user_id = auth.uid()
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(bubble_id))
      and public.can_write_bubble(bubble_id)
      and (
        not exists (select 1 from public.task_assignees ta where ta.task_id = tasks.id)
        or exists (
          select 1
          from public.task_assignees ta
          where ta.task_id = tasks.id
          and ta.user_id = auth.uid()
        )
      )
    )
  )
  with check (
    public.can_write_bubble(bubble_id)
    or (
      exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = tasks.id
          and ta.user_id = auth.uid()
      )
      and bubble_id = public.task_bubble_id(tasks.id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Drop legacy single-assignee column (after policies/helpers no longer reference it)
-- ---------------------------------------------------------------------------

alter table public.tasks
  drop column if exists assigned_to;
