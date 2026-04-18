-- agent_create_card_and_reply: optional card (p_create_card), tasks.item_type via p_task_type.
--
-- Drop EVERY overload of this name in public (avoids 42725 from wrong guessed signatures).
-- Then create exactly one 9-arg jsonb function. COMMENT/REVOKE/GRANT must include the full arg list.
--
-- Verification after apply:
--   select pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'agent_create_card_and_reply';

do $dropall$
declare
  stmt text;
begin
  for stmt in
    select format(
      'drop function if exists %I.%I(%s)',
      n.nspname,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)
    )
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'agent_create_card_and_reply'
  loop
    execute stmt;
  end loop;
end;
$dropall$;

create or replace function public.agent_create_card_and_reply(
  p_trigger_message_id uuid,
  p_agent_auth_user_id uuid,
  p_invoker_user_id uuid,
  p_reply_text text,
  p_create_card boolean default true,
  p_task_title text default null,
  p_task_description text default null,
  p_task_type text default 'task',
  p_task_status text default 'todo'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages%rowtype;
  v_task_id uuid;
  v_reply_id uuid;
  v_pos double precision;
  v_existing_task uuid;
  v_existing_reply uuid;
  v_orphan_reply uuid;
  v_orphan_task uuid;
  v_item_type text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_trigger_message_id::text || ':' || p_agent_auth_user_id::text, 0)
  );

  select r.created_task_id, r.reply_message_id
    into v_existing_task, v_existing_reply
  from public.agent_message_runs r
  where r.trigger_message_id = p_trigger_message_id
    and r.agent_auth_user_id = p_agent_auth_user_id;

  if v_existing_reply is not null then
    return jsonb_build_object(
      'ok', true,
      'deduped', true,
      'created_task_id', v_existing_task,
      'reply_message_id', v_existing_reply
    );
  end if;

  select m.id, m.attached_task_id
    into v_orphan_reply, v_orphan_task
  from public.messages m
  where m.user_id = p_agent_auth_user_id
    and m.parent_id = p_trigger_message_id
    and m.attached_task_id is not null
  order by m.created_at desc
  limit 1;

  if v_orphan_reply is not null then
    insert into public.agent_message_runs (
      trigger_message_id,
      agent_auth_user_id,
      created_task_id,
      reply_message_id
    )
    values (
      p_trigger_message_id,
      p_agent_auth_user_id,
      v_orphan_task,
      v_orphan_reply
    )
    on conflict (trigger_message_id, agent_auth_user_id) do update set
      created_task_id = excluded.created_task_id,
      reply_message_id = excluded.reply_message_id;

    return jsonb_build_object(
      'ok', true,
      'deduped', true,
      'created_task_id', v_orphan_task,
      'reply_message_id', v_orphan_reply
    );
  end if;

  select m.*
    into strict v_msg
  from public.messages m
  where m.id = p_trigger_message_id
  for update;

  if v_msg.user_id is distinct from p_invoker_user_id then
    raise exception 'agent_create_card_and_reply: invoker mismatch'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.agent_definitions ad
    where ad.is_active
      and ad.auth_user_id = v_msg.user_id
  ) then
    raise exception 'agent_create_card_and_reply: trigger author is an agent'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.bubble_agent_bindings bab
    join public.agent_definitions ad on ad.id = bab.agent_definition_id
    where bab.bubble_id = v_msg.bubble_id
      and bab.enabled
      and ad.is_active
      and ad.auth_user_id = p_agent_auth_user_id
  ) then
    raise exception 'agent_create_card_and_reply: agent not bound to bubble'
      using errcode = 'P0001';
  end if;

  if p_create_card then
    if coalesce(trim(p_task_title), '') = '' then
      raise exception 'agent_create_card_and_reply: task title required'
        using errcode = 'P0001';
    end if;

    v_item_type := lower(coalesce(nullif(trim(p_task_type), ''), 'task'));
    if v_item_type not in (
      'task',
      'event',
      'experience',
      'idea',
      'memory',
      'workout',
      'workout_log',
      'program'
    ) then
      raise exception 'agent_create_card_and_reply: invalid p_task_type for tasks.item_type'
        using errcode = 'P0001';
    end if;

    perform 1
    from public.tasks t
    where t.bubble_id = v_msg.bubble_id
    for update;

    select coalesce(max(t.position), 0) + 1
      into v_pos
    from public.tasks t
    where t.bubble_id = v_msg.bubble_id;

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
      v_msg.bubble_id,
      p_task_title,
      p_task_description,
      coalesce(nullif(trim(p_task_status), ''), 'todo'),
      v_pos,
      'medium',
      v_item_type,
      '{}'::jsonb,
      '[]'::jsonb,
      'private'
    )
    returning id into v_task_id;
  else
    v_task_id := null;
  end if;

  insert into public.messages (
    bubble_id,
    user_id,
    content,
    parent_id,
    target_task_id,
    attached_task_id,
    attachments
  )
  values (
    v_msg.bubble_id,
    p_agent_auth_user_id,
    coalesce(p_reply_text, ''),
    v_msg.id,
    v_msg.target_task_id,
    v_task_id,
    '[]'::jsonb
  )
  returning id into v_reply_id;

  insert into public.agent_message_runs (
    trigger_message_id,
    agent_auth_user_id,
    created_task_id,
    reply_message_id
  )
  values (
    p_trigger_message_id,
    p_agent_auth_user_id,
    v_task_id,
    v_reply_id
  )
  on conflict (trigger_message_id, agent_auth_user_id) do update set
    created_task_id = excluded.created_task_id,
    reply_message_id = excluded.reply_message_id;

  return jsonb_build_object(
    'ok', true,
    'deduped', false,
    'created_task_id', v_task_id,
    'reply_message_id', v_reply_id
  );
end;
$$;

comment on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, text, boolean, text, text, text, text
) is
  'Agent reply with optional Kanban task; p_task_type maps to tasks.item_type; service_role only.';

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, text, boolean, text, text, text, text
) from public;

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, text, boolean, text, text, text, text
) from authenticated;

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, text, boolean, text, text, text, text
) from anon;

grant execute on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, text, boolean, text, text, text, text
) to service_role;
