-- Phase 4: Buddy agent — atomic RPC for onboarding reply + optional Kanban card.
-- Invoked ONLY by the Edge Function (`buddy-agent-dispatch`) via service_role.
-- Strictly isolated from @Coach / @Organizer (no shared RPC, no shared tables, no shared IDs):
--   * bubble-agent-dispatch -> public.agent_create_card_and_reply
--   * buddy-agent-dispatch  -> public.buddy_create_onboarding_reply (this file)

-- ---------------------------------------------------------------------------
-- RPC: buddy_create_onboarding_reply
--
-- Params follow the Phase 4 spec order exactly (p_parent_id is nullable but
-- appears before p_reply_content). Postgres requires that defaulted parameters
-- come after non-defaulted ones, so we intentionally declare NO defaults; the
-- Edge Function always passes all 7 named arguments (NULL for the optionals).
-- ---------------------------------------------------------------------------

create or replace function public.buddy_create_onboarding_reply(
  p_bubble_id uuid,
  p_buddy_user_id uuid,
  p_parent_id uuid,
  p_reply_content text,
  p_card_title text,
  p_card_desc text,
  p_action_type text
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
  v_card_metadata jsonb;
  v_has_card boolean := false;
  v_title text;
begin
  -- --- Required param validation -----------------------------------------
  if p_bubble_id is null then
    raise exception 'buddy_create_onboarding_reply: p_bubble_id required'
      using errcode = 'P0001';
  end if;

  if p_buddy_user_id is null then
    raise exception 'buddy_create_onboarding_reply: p_buddy_user_id required'
      using errcode = 'P0001';
  end if;

  if coalesce(trim(p_reply_content), '') = '' then
    raise exception 'buddy_create_onboarding_reply: p_reply_content required'
      using errcode = 'P0001';
  end if;

  -- --- Identity check: caller claims to be the active Buddy agent --------
  -- Keeps this RPC safe even if somehow invoked with a non-Buddy user id.
  if not exists (
    select 1
    from public.agent_definitions ad
    where ad.slug = 'buddy'
      and ad.is_active
      and ad.auth_user_id = p_buddy_user_id
  ) then
    raise exception 'buddy_create_onboarding_reply: p_buddy_user_id is not the active Buddy agent'
      using errcode = 'P0001';
  end if;

  -- --- Bubble must exist (cheap guard; service_role bypasses RLS) --------
  if not exists (
    select 1 from public.bubbles b where b.id = p_bubble_id
  ) then
    raise exception 'buddy_create_onboarding_reply: bubble not found'
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
      raise exception 'buddy_create_onboarding_reply: parent message not in bubble'
        using errcode = 'P0001';
    end if;
  end if;

  -- --- Optional Kanban card ----------------------------------------------
  -- Onboarding cards intentionally use generic task fields (item_type='task',
  -- status='todo', priority='medium'). No fitness-specific fields touched.
  v_title := trim(coalesce(p_card_title, ''));
  v_has_card := v_title <> '';

  if v_has_card then
    -- Serialize position computation for concurrent inserts into the same bubble.
    perform 1
    from public.tasks t
    where t.bubble_id = p_bubble_id
    for update;

    select coalesce(max(t.position), 0) + 1
      into v_pos
    from public.tasks t
    where t.bubble_id = p_bubble_id;

    v_card_metadata := jsonb_build_object('source', 'buddy_agent');
    if p_action_type is not null and coalesce(trim(p_action_type), '') <> '' then
      v_card_metadata := v_card_metadata
        || jsonb_build_object('action_type', trim(p_action_type));
    end if;

    insert into public.tasks (
      bubble_id,
      title,
      description,
      status,
      position,
      priority,
      item_type,
      metadata,
      attachments,
      visibility
    )
    values (
      p_bubble_id,
      v_title,
      p_card_desc,
      'todo',
      v_pos,
      'medium',
      'task',
      v_card_metadata,
      '[]'::jsonb,
      'private'
    )
    returning id into v_task_id;
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
    p_buddy_user_id,
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

comment on function public.buddy_create_onboarding_reply is
  'Atomically inserts a Buddy chat reply and an optional onboarding Kanban card; service_role only. Isolated from agent_create_card_and_reply.';

-- Lock the RPC down to service_role only (same posture as agent_create_card_and_reply).
revoke all on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text
) from public;

revoke all on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text
) from authenticated;

revoke all on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text
) from anon;

grant execute on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text
) to service_role;
