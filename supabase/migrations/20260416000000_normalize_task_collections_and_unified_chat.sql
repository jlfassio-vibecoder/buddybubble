-- Normalize task JSON collections into first-class tables + unify task comments onto `public.messages`.
-- Companion app / React changes are intentionally NOT included here.

-- ---------------------------------------------------------------------------
-- 0. Helper: same effective write surface as `tasks` for child rows (subtasks, activity rows).
--     Uses SECURITY INVOKER so the inner `tasks` scan is still subject to `tasks` RLS.
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
            or t.assigned_to = auth.uid()
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
          and t.assigned_to = auth.uid()
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
          and (t.assigned_to is null or t.assigned_to = auth.uid())
        )
      )
  );
$$;

comment on function public.can_mutate_task_linked_rows(uuid) is
  'True when auth.uid() may insert/update/delete rows tied to this task id (aligned with `tasks` write semantics, including workspace guests).';

-- ---------------------------------------------------------------------------
-- 1. `public.task_subtasks`
-- ---------------------------------------------------------------------------

create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  position double precision not null default 0
);

create index if not exists task_subtasks_task_id_position_idx
  on public.task_subtasks (task_id, position);

create index if not exists task_subtasks_task_id_created_idx
  on public.task_subtasks (task_id, created_at);

comment on table public.task_subtasks is
  'Subtasks for a Kanban/task row; migrated from legacy `tasks.subtasks` JSONB.';

alter table public.task_subtasks enable row level security;

-- Read: any row whose parent task passes `tasks_select` (RLS on `tasks` applies inside EXISTS).
drop policy if exists task_subtasks_select on public.task_subtasks;
drop policy if exists task_subtasks_insert on public.task_subtasks;
drop policy if exists task_subtasks_update on public.task_subtasks;
drop policy if exists task_subtasks_delete on public.task_subtasks;

create policy task_subtasks_select on public.task_subtasks
  for select using (
    exists (select 1 from public.tasks t where t.id = task_subtasks.task_id)
  );

create policy task_subtasks_insert on public.task_subtasks
  for insert with check (public.can_mutate_task_linked_rows(task_id));

create policy task_subtasks_update on public.task_subtasks
  for update
  using (public.can_mutate_task_linked_rows(task_id))
  with check (public.can_mutate_task_linked_rows(task_id));

create policy task_subtasks_delete on public.task_subtasks
  for delete using (public.can_mutate_task_linked_rows(task_id));

-- ---------------------------------------------------------------------------
-- 2. `public.task_activity_log`
-- ---------------------------------------------------------------------------

create table if not exists public.task_activity_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_log_task_id_created_idx
  on public.task_activity_log (task_id, created_at desc);

comment on table public.task_activity_log is
  'Append-only style activity for a task; migrated from legacy `tasks.activity_log` JSONB.';

alter table public.task_activity_log enable row level security;

drop policy if exists task_activity_log_select on public.task_activity_log;
drop policy if exists task_activity_log_insert on public.task_activity_log;

create policy task_activity_log_select on public.task_activity_log
  for select using (
    exists (select 1 from public.tasks t where t.id = task_activity_log.task_id)
  );

create policy task_activity_log_insert on public.task_activity_log
  for insert with check (public.can_mutate_task_linked_rows(task_id));

-- No UPDATE/DELETE policies: treat as append-only at the SQL layer (service role for maintenance).

-- ---------------------------------------------------------------------------
-- 3. `public.messages`: `target_task_id` (task-scoped / unified comments)
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists target_task_id uuid references public.tasks (id) on delete cascade;

comment on column public.messages.target_task_id is
  'When set, this message is scoped as a comment on the given task (same row may still require `bubble_id` = that task''s bubble for channel routing).';

create index if not exists messages_target_task_created_idx
  on public.messages (target_task_id, created_at)
  where target_task_id is not null;

-- Keep `bubble_id` aligned with the referenced task when posting task comments.
create or replace function public.messages_target_task_bubble_match()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.target_task_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.tasks t
    where t.id = new.target_task_id
      and t.bubble_id = new.bubble_id
  ) then
    raise exception 'messages.target_task_id requires messages.bubble_id to match tasks.bubble_id for that task';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_target_task_bubble_match on public.messages;
create trigger messages_target_task_bubble_match
  before insert or update of bubble_id, target_task_id
  on public.messages
  for each row
  execute procedure public.messages_target_task_bubble_match();

-- ---------------------------------------------------------------------------
-- 4. RLS on `messages`: extend bubble-only rules so task-scoped rows work for
--    guests who can see an assigned task without full bubble visibility.
--
--    Bubble-scoped chat is still governed by `can_view_bubble(bubble_id)` / insert checks.
--    When `target_task_id` is set, visibility and author mutations also succeed when the
--    nested `select ... from tasks` passes `tasks` RLS (same effective rule as "access to
--    parent task"). This is strictly broader than bubble-only where task visibility exceeds
--    bubble visibility (e.g. workspace guests assigned to a card).
-- ---------------------------------------------------------------------------

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

create policy messages_select on public.messages
  for select using (
    public.can_view_bubble(bubble_id)
    or (
      target_task_id is not null
      and exists (select 1 from public.tasks t where t.id = messages.target_task_id)
    )
  );

create policy messages_insert on public.messages
  for insert with check (
    user_id = auth.uid()
    and (
      public.can_view_bubble(bubble_id)
      or (
        target_task_id is not null
        and exists (
          select 1
          from public.tasks t
          where t.id = target_task_id
            and t.bubble_id = bubble_id
        )
      )
    )
  );

create policy messages_update on public.messages
  for update
  using (
    user_id = auth.uid()
    and (
      public.can_view_bubble(bubble_id)
      or (
        target_task_id is not null
        and exists (
          select 1
          from public.tasks t
          where t.id = target_task_id
            and t.bubble_id = bubble_id
        )
      )
    )
  )
  with check (
    user_id = auth.uid()
    and (
      public.can_view_bubble(bubble_id)
      or (
        target_task_id is not null
        and exists (
          select 1
          from public.tasks t
          where t.id = target_task_id
            and t.bubble_id = bubble_id
        )
      )
    )
  );

create policy messages_delete on public.messages
  for delete using (
    (
      public.can_view_bubble(bubble_id)
      and (
        user_id = auth.uid()
        or public.is_workspace_admin(public.workspace_id_for_bubble(bubble_id))
      )
    )
    or (
      target_task_id is not null
      and user_id = auth.uid()
      and exists (
        select 1
        from public.tasks t
        where t.id = target_task_id
          and t.bubble_id = bubble_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Data backfill from legacy JSON columns (best-effort; safe to re-run)
-- ---------------------------------------------------------------------------

insert into public.task_subtasks (id, task_id, title, completed, created_at, position)
select
  case
    when coalesce(trim(elem->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (trim(elem->>'id'))::uuid
    else gen_random_uuid()
  end,
  tk.id,
  coalesce(nullif(trim(elem->>'title'), ''), '(untitled)'),
  coalesce((elem->>'done')::boolean, false),
  coalesce((elem->>'created_at')::timestamptz, tk.created_at, now()),
  coalesce((elem->>'position')::double precision, 0)
from public.tasks tk
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(tk.subtasks) = 'array' then tk.subtasks else '[]'::jsonb end
) as elem
where jsonb_typeof(tk.subtasks) = 'array'
  and jsonb_array_length(tk.subtasks) > 0
on conflict (id) do nothing;

insert into public.task_activity_log (id, task_id, user_id, action_type, payload, created_at)
select
  case
    when coalesce(trim(elem->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (trim(elem->>'id'))::uuid
    else gen_random_uuid()
  end,
  tk.id,
  case
    when nullif(trim(elem->>'user_id'), '') is null then null
    when trim(elem->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (trim(elem->>'user_id'))::uuid
    else null
  end,
  coalesce(nullif(trim(elem->>'type'), ''), 'unknown'),
  jsonb_strip_nulls(
    jsonb_build_object(
      'message', elem->>'message',
      'field', elem->>'field',
      'from', elem->>'from',
      'to', elem->>'to'
    )
  ),
  coalesce((elem->>'at')::timestamptz, tk.created_at, now())
from public.tasks tk
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(tk.activity_log) = 'array' then tk.activity_log else '[]'::jsonb end
) as elem
where jsonb_typeof(tk.activity_log) = 'array'
  and jsonb_array_length(tk.activity_log) > 0
on conflict (id) do nothing;

-- Legacy task comments -> unified messages (task-scoped). Preserves ids when non-conflicting.
insert into public.messages (
  id,
  bubble_id,
  user_id,
  content,
  parent_id,
  created_at,
  attachments,
  attached_task_id,
  target_task_id
)
select
  case
    when coalesce(trim(elem->>'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (trim(elem->>'id'))::uuid
    else gen_random_uuid()
  end,
  tk.bubble_id,
  (elem->>'user_id')::uuid,
  coalesce(elem->>'body', ''),
  null,
  coalesce((elem->>'created_at')::timestamptz, tk.created_at, now()),
  '[]'::jsonb,
  null,
  tk.id
from public.tasks tk
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(tk.comments) = 'array' then tk.comments else '[]'::jsonb end
) as elem
where jsonb_typeof(tk.comments) = 'array'
  and jsonb_array_length(tk.comments) > 0
  and coalesce(trim(elem->>'user_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Drop legacy JSON columns on `tasks`
-- ---------------------------------------------------------------------------

alter table public.tasks drop column if exists comments;
alter table public.tasks drop column if exists subtasks;
alter table public.tasks drop column if exists activity_log;

-- ---------------------------------------------------------------------------
-- 7. Realtime (optional but matches existing `messages` / `tasks` publication usage)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.task_subtasks;
alter publication supabase_realtime add table public.task_activity_log;

alter table public.task_subtasks replica identity full;
alter table public.task_activity_log replica identity full;
