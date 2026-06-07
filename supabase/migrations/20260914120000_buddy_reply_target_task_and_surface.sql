-- Phase 1: Buddy replies carry target_task_id so task-comment threads (CRM + storefront)
-- render agent rows. Optional p_surface stashes observability metadata and blocks cards
-- on storefront anonymous turns.

drop function if exists public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text
);

create or replace function public.buddy_create_onboarding_reply(
  p_bubble_id uuid,
  p_buddy_user_id uuid,
  p_parent_id uuid,
  p_reply_content text,
  p_card_title text,
  p_card_desc text,
  p_action_type text,
  p_target_task_id uuid default null,
  p_surface text default null
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
  v_reply_metadata jsonb := jsonb_build_object('source', 'buddy_agent');
begin
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

  if not exists (
    select 1 from public.bubbles b where b.id = p_bubble_id
  ) then
    raise exception 'buddy_create_onboarding_reply: bubble not found'
      using errcode = 'P0001';
  end if;

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

  if p_target_task_id is not null then
    if not exists (
      select 1
      from public.tasks t
      where t.id = p_target_task_id
        and t.bubble_id = p_bubble_id
    ) then
      raise exception 'buddy_create_onboarding_reply: target task not in bubble'
        using errcode = 'P0001';
    end if;
  end if;

  if p_surface is not null and trim(p_surface) <> '' then
    v_reply_metadata := v_reply_metadata || jsonb_build_object('surface', trim(p_surface));
  end if;

  v_title := trim(coalesce(p_card_title, ''));
  v_has_card := v_title <> '';

  -- Storefront anonymous turns must never create Kanban cards in the workspace bubble.
  if coalesce(trim(p_surface), '') = 'storefront' then
    v_has_card := false;
  end if;

  if v_has_card then
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

  insert into public.messages (
    bubble_id,
    user_id,
    content,
    parent_id,
    target_task_id,
    attached_task_id,
    attachments,
    metadata
  )
  values (
    p_bubble_id,
    p_buddy_user_id,
    p_reply_content,
    p_parent_id,
    p_target_task_id,
    v_task_id,
    '[]'::jsonb,
    v_reply_metadata
  )
  returning id into v_reply_id;

  return jsonb_build_object(
    'ok', true,
    'created_task_id', v_task_id,
    'reply_message_id', v_reply_id
  );
end;
$$;

comment on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text, uuid, text
) is
  'Atomically inserts a Buddy chat reply and an optional onboarding Kanban card; service_role only. '
  'When p_target_task_id is set the reply is scoped to that task comment thread. '
  'p_surface=storefront suppresses card creation.';

revoke all on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text, uuid, text
) from public;

revoke all on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text, uuid, text
) from authenticated;

revoke all on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text, uuid, text
) from anon;

grant execute on function public.buddy_create_onboarding_reply(
  uuid, uuid, uuid, text, text, text, text, uuid, text
) to service_role;
