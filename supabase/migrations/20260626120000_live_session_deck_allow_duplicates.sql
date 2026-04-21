-- Allow duplicate task_id rows per session deck (host UX) and add a stable PK per row
-- for targeted UPDATE/DELETE when the same task appears multiple times.
--
-- This table is in publication supabase_realtime; UPDATE requires a replica identity
-- before a primary key exists (SQLSTATE 55000 otherwise).

alter table public.live_session_deck_items
  drop constraint if exists live_session_deck_items_session_id_task_id_key;

alter table public.live_session_deck_items
  add column if not exists id uuid default gen_random_uuid();

-- Required for UPDATE while the table publishes changes and has no PK-backed identity yet.
alter table public.live_session_deck_items replica identity full;

update public.live_session_deck_items
set id = gen_random_uuid()
where id is null;

alter table public.live_session_deck_items
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'live_session_deck_items'
      and c.contype = 'p'
  ) then
    alter table public.live_session_deck_items
      add constraint live_session_deck_items_pkey primary key (id);
  end if;
end $$;

-- Use the new primary key for logical replication (lighter than FULL).
alter table public.live_session_deck_items replica identity default;

comment on table public.live_session_deck_items is
  'Ordered workout deck for a live session; session_id matches chat invite metadata.sessionId. Rows are unique by id; duplicate task_id per session is allowed.';
