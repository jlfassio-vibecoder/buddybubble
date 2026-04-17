-- Denormalized task comment totals + per-user last viewed for Kanban badges / unread.

-- ---------------------------------------------------------------------------
-- 1. Columns on `public.tasks`
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists comment_count integer not null default 0,
  add column if not exists last_task_comment_at timestamptz;

comment on column public.tasks.comment_count is
  'Count of `messages` rows with `target_task_id = tasks.id` (roots and thread replies). Maintained by trigger.';

comment on column public.tasks.last_task_comment_at is
  'Latest `messages.created_at` for rows with `target_task_id = tasks.id`; maintained by trigger.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'tasks'
      and c.conname = 'tasks_comment_count_non_negative'
  ) then
    alter table public.tasks
      add constraint tasks_comment_count_non_negative check (comment_count >= 0);
  end if;
end $$;

-- One-time backfill before triggers.
update public.tasks t
set
  comment_count = coalesce(s.cnt, 0),
  last_task_comment_at = s.mx
from (
  select
    m.target_task_id as task_id,
    count(*)::integer as cnt,
    max(m.created_at) as mx
  from public.messages m
  where m.target_task_id is not null
  group by m.target_task_id
) s
where t.id = s.task_id;

update public.tasks t
set comment_count = 0, last_task_comment_at = null
where not exists (
  select 1 from public.messages m where m.target_task_id = t.id
)
  and (t.comment_count <> 0 or t.last_task_comment_at is not null);

-- ---------------------------------------------------------------------------
-- 2. Maintain `comment_count` / `last_task_comment_at` from `messages`
-- ---------------------------------------------------------------------------

create or replace function public.messages_maintain_task_comment_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.target_task_id is not null then
      update public.tasks
      set
        comment_count = comment_count + 1,
        last_task_comment_at = greatest(
          coalesce(last_task_comment_at, new.created_at),
          new.created_at
        )
      where id = new.target_task_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.target_task_id is not null then
      update public.tasks
      set
        comment_count = greatest(0, comment_count - 1),
        last_task_comment_at = (
          select max(m.created_at)
          from public.messages m
          where m.target_task_id = old.target_task_id
        )
      where id = old.target_task_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.target_task_id is distinct from new.target_task_id then
      if old.target_task_id is not null then
        update public.tasks
        set
          comment_count = greatest(0, comment_count - 1),
          last_task_comment_at = (
            select max(m.created_at)
            from public.messages m
            where m.target_task_id = old.target_task_id
          )
        where id = old.target_task_id;
      end if;
      if new.target_task_id is not null then
        update public.tasks
        set
          comment_count = comment_count + 1,
          last_task_comment_at = greatest(
            coalesce(last_task_comment_at, new.created_at),
            new.created_at
          )
        where id = new.target_task_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

comment on function public.messages_maintain_task_comment_stats() is
  'Keeps `tasks.comment_count` and `tasks.last_task_comment_at` in sync with task-scoped `messages` (`target_task_id`).';

drop trigger if exists messages_maintain_task_comment_stats_ins on public.messages;
create trigger messages_maintain_task_comment_stats_ins
  after insert on public.messages
  for each row
  execute procedure public.messages_maintain_task_comment_stats();

drop trigger if exists messages_maintain_task_comment_stats_del on public.messages;
create trigger messages_maintain_task_comment_stats_del
  after delete on public.messages
  for each row
  execute procedure public.messages_maintain_task_comment_stats();

drop trigger if exists messages_maintain_task_comment_stats_tgt on public.messages;
create trigger messages_maintain_task_comment_stats_tgt
  after update of target_task_id on public.messages
  for each row
  execute procedure public.messages_maintain_task_comment_stats();

revoke all on function public.messages_maintain_task_comment_stats() from public;

-- ---------------------------------------------------------------------------
-- 3. `public.user_task_views`
-- ---------------------------------------------------------------------------

create table if not exists public.user_task_views (
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create index if not exists user_task_views_task_id_idx
  on public.user_task_views (task_id);

comment on table public.user_task_views is
  'Per-user last time task comments were viewed; drives Kanban unread badges with `tasks.last_task_comment_at`.';

alter table public.user_task_views enable row level security;

drop policy if exists user_task_views_select on public.user_task_views;
drop policy if exists user_task_views_insert on public.user_task_views;
drop policy if exists user_task_views_update on public.user_task_views;
drop policy if exists user_task_views_delete on public.user_task_views;

create policy user_task_views_select on public.user_task_views
  for select using (user_id = auth.uid());

create policy user_task_views_insert on public.user_task_views
  for insert with check (user_id = auth.uid());

create policy user_task_views_update on public.user_task_views
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_task_views_delete on public.user_task_views
  for delete using (user_id = auth.uid());

create or replace function public.user_task_views_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_task_views_set_updated_at on public.user_task_views;
create trigger user_task_views_set_updated_at
  before insert or update on public.user_task_views
  for each row
  execute procedure public.user_task_views_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RPC: batched unread counts for current user
-- ---------------------------------------------------------------------------

create or replace function public.task_comment_unread_counts(p_task_ids uuid[])
returns table (task_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id as task_id,
    (
      select count(*)::bigint
      from public.messages m
      where m.target_task_id = t.id
        and m.user_id <> auth.uid()
        and m.created_at > coalesce(
          (
            select v.last_viewed_at
            from public.user_task_views v
            where v.user_id = auth.uid()
              and v.task_id = t.id
          ),
          '-infinity'::timestamptz
        )
    ) as unread_count
  from public.tasks t
  where t.id = any (p_task_ids);
$$;

comment on function public.task_comment_unread_counts(uuid[]) is
  'Unread task-scoped message count per task for `auth.uid()` (excludes own messages; uses `user_task_views.last_viewed_at`).';

grant execute on function public.task_comment_unread_counts(uuid[]) to authenticated;
