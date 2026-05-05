-- Idempotent copy of class draft deck rows (bb-class-deck:<instance_id>) into an active live session_id.
-- SECURITY INVOKER: RLS on live_session_deck_items / tasks governs who may read/write.

create or replace function public.copy_class_deck_to_live_session(
  p_class_instance_id uuid,
  p_live_session_id text
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_draft_session_id text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_live_session_id is null or length(trim(p_live_session_id)) = 0 then
    return 0;
  end if;

  v_draft_session_id := 'bb-class-deck:' || p_class_instance_id::text;

  -- Serialize concurrent host retries (tab close / double effect) for the same live session.
  perform pg_advisory_xact_lock(8842001, hashtext(trim(p_live_session_id)));

  if exists (
    select 1
    from public.live_session_deck_items d
    where d.session_id = trim(p_live_session_id)
    limit 1
  ) then
    -- Sentinel so callers can log idempotent skip vs “0 draft rows copied”.
    return -1;
  end if;

  insert into public.live_session_deck_items (session_id, task_id, sort_order, session_task_metadata)
  select
    trim(p_live_session_id),
    d.task_id,
    d.sort_order,
    d.session_task_metadata
  from public.live_session_deck_items d
  where d.session_id = v_draft_session_id
  order by d.sort_order asc, d.created_at asc;

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

comment on function public.copy_class_deck_to_live_session(uuid, text) is
  'Host merge: copy draft class deck rows from bb-class-deck:<class_instance_id> into p_live_session_id once. Returns inserted row count (0 if no draft), or -1 if live session already had deck rows (idempotent skip).';

revoke all on function public.copy_class_deck_to_live_session(uuid, text) from public;
grant execute on function public.copy_class_deck_to_live_session(uuid, text) to authenticated;
grant execute on function public.copy_class_deck_to_live_session(uuid, text) to service_role;
