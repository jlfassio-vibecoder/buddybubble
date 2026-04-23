-- Phase 4: Organizer agent — atomic RPC for a reply message + optional meeting-action-item task.
-- Invoked ONLY by the Edge Function (`organizer-agent-dispatch`) via service_role.
-- Strictly isolated from @Coach / @Buddy:
--   * bubble-agent-dispatch    -> public.agent_create_card_and_reply   (fitness workouts)
--   * buddy-agent-dispatch     -> public.buddy_create_onboarding_reply (onboarding)
--   * organizer-agent-dispatch -> public.organizer_create_reply_and_task (THIS FILE — meetings)
--
-- Design notes:
--   * Two write paths in one RPC (reply + optional task) so they commit atomically and there is
--     no "reply posted, task insert failed" partial state. Mirrors the Buddy RPC shape.
--   * The edge function passes NULL task params when Organizer only intended to reply (the
--     common path when ORGANIZER_WRITES_ENABLED is false). The `v_has_task` flag then skips the
--     task insert entirely.
--   * Identity check: `p_organizer_user_id` must resolve to the active Organizer row in
--     `public.agent_definitions`. Defense in depth in case some future caller misuses this RPC.
--   * `task_payload` is split into explicit columns (not jsonb) so the schema is visible in
--     this file and the RPC rejects malformed inputs cheaply before writing anything.

create or replace function public.organizer_create_reply_and_task(
  p_bubble_id uuid,
  p_organizer_user_id uuid,
  p_parent_id uuid,
  p_reply_content text,
  p_task_title text,
  p_task_description text,
  p_task_due_on date,
  p_task_assignee_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_reply_id uuid;
  v_pos double precision;
  v_has_task boolean := false;
  v_title text;
begin
  -- --- Required param validation -----------------------------------------
  if p_bubble_id is null then
    raise exception 'organizer_create_reply_and_task: p_bubble_id required'
      using errcode = 'P0001';
  end if;

  if p_organizer_user_id is null then
    raise exception 'organizer_create_reply_and_task: p_organizer_user_id required'
      using errcode = 'P0001';
  end if;

  if coalesce(trim(p_reply_content), '') = '' then
    raise exception 'organizer_create_reply_and_task: p_reply_content required'
      using errcode = 'P0001';
  end if;

  -- --- Identity check: caller claims to be the active Organizer agent ----
  if not exists (
    select 1
    from public.agent_definitions ad
    where ad.slug = 'organizer'
      and ad.is_active
      and ad.auth_user_id = p_organizer_user_id
  ) then
    raise exception 'organizer_create_reply_and_task: p_organizer_user_id is not the active Organizer agent'
      using errcode = 'P0001';
  end if;

  -- --- Bubble must exist (service_role bypasses RLS; this is a cheap FK guard). -----
  if not exists (
    select 1 from public.bubbles b where b.id = p_bubble_id
  ) then
    raise exception 'organizer_create_reply_and_task: bubble not found'
      using errcode = 'P0001';
  end if;

  -- Parent must exist in the same bubble (messages.parent_id has no cross-bubble FK guard).
  if p_parent_id is not null then
    if not exists (
      select 1
      from public.messages m
      where m.id = p_parent_id
        and m.bubble_id = p_bubble_id
    ) then
      raise exception 'organizer_create_reply_and_task: parent message not in bubble'
        using errcode = 'P0001';
    end if;
  end if;

  -- --- Optional meeting action-item task ---------------------------------
  v_title := trim(coalesce(p_task_title, ''));
  v_has_task := v_title <> '';

  if v_has_task then
    -- Serialize position + assignee writes for this bubble. `FOR UPDATE` on `tasks` alone does
    -- not acquire a lock when the bubble has zero tasks, so concurrent first inserts could pick
    -- the same position; locking the bubble row covers the empty case.
    perform 1
    from public.bubbles b
    where b.id = p_bubble_id
    for update;

    select coalesce(max(t.position), 0) + 1
      into v_pos
    from public.tasks t
    where t.bubble_id = p_bubble_id;

    insert into public.tasks (
      bubble_id,
      title,
      description,
      status,
      position,
      priority,
      item_type,
      scheduled_on,
      metadata,
      attachments,
      visibility
    )
    values (
      p_bubble_id,
      v_title,
      p_task_description,
      'todo',
      v_pos,
      'medium',
      'task',
      p_task_due_on,
      jsonb_build_object('source', 'organizer_agent'),
      '[]'::jsonb,
      'private'
    )
    returning id into v_task_id;

    if p_task_assignee_user_id is not null then
      if not exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = public.workspace_id_for_bubble(p_bubble_id)
          and wm.user_id = p_task_assignee_user_id
      ) then
        raise exception 'organizer_create_reply_and_task: task assignee is not a workspace member'
          using errcode = 'P0001';
      end if;

      insert into public.task_assignees (task_id, user_id)
      values (v_task_id, p_task_assignee_user_id)
      on conflict do nothing;
    end if;
  end if;

  -- --- Reply message ------------------------------------------------------
  insert into public.messages (
    bubble_id,
    user_id,
    content,
    parent_id,
    attached_task_id,
    attachments
  )
  values (
    p_bubble_id,
    p_organizer_user_id,
    p_reply_content,
    p_parent_id,
    v_task_id,
    '[]'::jsonb
  )
  returning id into v_reply_id;

  return jsonb_build_object(
    'ok', true,
    'created_task_id', v_task_id,
    'reply_message_id', v_reply_id
  );
end;
$$;

comment on function public.organizer_create_reply_and_task is
  'Atomically inserts an Organizer chat reply and an optional meeting action-item task; service_role only. Isolated from agent_create_card_and_reply and buddy_create_onboarding_reply.';

-- Lock the RPC down to service_role only (same posture as the other agent RPCs).
revoke all on function public.organizer_create_reply_and_task(
  uuid, uuid, uuid, text, text, text, date, uuid
) from public;

revoke all on function public.organizer_create_reply_and_task(
  uuid, uuid, uuid, text, text, text, date, uuid
) from authenticated;

revoke all on function public.organizer_create_reply_and_task(
  uuid, uuid, uuid, text, text, text, date, uuid
) from anon;

grant execute on function public.organizer_create_reply_and_task(
  uuid, uuid, uuid, text, text, text, date, uuid
) to service_role;
