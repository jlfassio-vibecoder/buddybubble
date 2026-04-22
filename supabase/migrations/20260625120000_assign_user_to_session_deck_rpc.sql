-- Bulk self-assignment for live session deck participants (bypasses task_assignees RLS insert).
-- Realtime: expose deck item changes to clients subscribed by session_id.

-- ---------------------------------------------------------------------------
-- 1) Realtime publication (idempotent)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_session_deck_items'
  ) then
    alter publication supabase_realtime add table public.live_session_deck_items;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) RPC: assign current user to every task in a session deck
-- ---------------------------------------------------------------------------

create or replace function public.assign_user_to_session_deck(
  p_session_id text,
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'cannot assign for another user';
  end if;

  if p_session_id is null or length(trim(p_session_id)) = 0 then
    raise exception 'invalid session id';
  end if;

  if exists (
    select 1
    from public.live_session_deck_items d
    where d.session_id = p_session_id
      and not public.can_view_bubble(public.get_task_bubble_id(d.task_id))
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.task_assignees (task_id, user_id)
  select d.task_id, p_user_id
  from public.live_session_deck_items d
  where d.session_id = p_session_id
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return coalesce(inserted_count, 0);
end;
$$;

comment on function public.assign_user_to_session_deck(text, uuid) is
  'Participant self-assign: inserts task_assignees for all deck tasks in p_session_id. SECURITY DEFINER; requires auth.uid() = p_user_id and can_view_bubble on each task.';

revoke all on function public.assign_user_to_session_deck(text, uuid) from public;
grant execute on function public.assign_user_to_session_deck(text, uuid) to authenticated;
grant execute on function public.assign_user_to_session_deck(text, uuid) to service_role;
