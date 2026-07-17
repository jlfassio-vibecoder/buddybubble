-- Reverse merge: copy live session deck rows into the class draft namespace
-- (bb-class-deck:<class_instance_id>) so AsyncPlaybackShell / VOD can hydrate them.
-- SECURITY DEFINER: clears+replaces draft rows; gated to workspace owner/admin.

create or replace function public.copy_live_deck_to_class_session(
  p_live_session_id uuid,
  p_class_instance_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_draft_session_id text;
  v_instance_workspace_id uuid;
  v_live_workspace_id uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_live_session_id is null or p_class_instance_id is null then
    raise exception 'live session and class instance are required';
  end if;

  select ci.workspace_id
  into v_instance_workspace_id
  from public.class_instances ci
  where ci.id = p_class_instance_id;

  if v_instance_workspace_id is null then
    raise exception 'class instance not found';
  end if;

  select wm.role
  into v_role
  from public.workspace_members wm
  where wm.workspace_id = v_instance_workspace_id
    and wm.user_id = auth.uid();

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'not authorized';
  end if;

  select ls.workspace_id
  into v_live_workspace_id
  from public.live_sessions ls
  where ls.id = p_live_session_id;

  if not found then
    raise exception 'live session not found';
  end if;

  if v_live_workspace_id is null or v_live_workspace_id is distinct from v_instance_workspace_id then
    raise exception 'live session workspace mismatch';
  end if;

  v_draft_session_id := 'bb-class-deck:' || p_class_instance_id::text;

  -- Serialize concurrent finalize/re-upload for the same class draft.
  perform pg_advisory_xact_lock(8842002, hashtext(v_draft_session_id));

  delete from public.live_session_deck_items d
  where d.session_id = v_draft_session_id;

  insert into public.live_session_deck_items (session_id, task_id, sort_order, session_task_metadata)
  select
    v_draft_session_id,
    d.task_id,
    d.sort_order,
    d.session_task_metadata
  from public.live_session_deck_items d
  where d.session_id = p_live_session_id::text
  order by d.sort_order asc, d.created_at asc;

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

comment on function public.copy_live_deck_to_class_session(uuid, uuid) is
  'Owner/admin reverse merge: replace bb-class-deck:<class_instance_id> deck rows with a copy of the live session deck. Returns inserted row count (0 if live deck empty).';

revoke all on function public.copy_live_deck_to_class_session(uuid, uuid) from public;
grant execute on function public.copy_live_deck_to_class_session(uuid, uuid) to authenticated;
grant execute on function public.copy_live_deck_to_class_session(uuid, uuid) to service_role;
