-- V2: Coach updates an existing Kanban task from chat (Edge invokes with service_role only).

create or replace function public.agent_update_task_and_reply(
  p_trigger_message_id uuid,
  p_thread_id uuid,
  p_agent_auth_user_id uuid,
  p_invoker_user_id uuid,
  p_target_task_id uuid,
  p_reply_text text,
  p_new_title text default null,
  p_new_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages%rowtype;
  v_reply_id uuid;
  v_existing_reply uuid;
  v_existing_task uuid;
  v_thread_root uuid;
  v_title text;
  v_desc text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_trigger_message_id::text || ':' || p_agent_auth_user_id::text, 0)
  );

  select r.reply_message_id, r.created_task_id
    into v_existing_reply, v_existing_task
  from public.agent_message_runs r
  where r.trigger_message_id = p_trigger_message_id
    and r.agent_auth_user_id = p_agent_auth_user_id;

  if v_existing_reply is not null then
    return jsonb_build_object(
      'ok', true,
      'deduped', true,
      'updated_task_id', coalesce(v_existing_task, p_target_task_id),
      'reply_message_id', v_existing_reply
    );
  end if;

  select m.*
    into strict v_msg
  from public.messages m
  where m.id = p_trigger_message_id
  for update;

  v_thread_root := coalesce(v_msg.parent_id, v_msg.id);
  if p_thread_id is distinct from v_thread_root then
    raise exception 'agent_update_task_and_reply: p_thread_id must equal thread root (coalesce(parent_id, id) of trigger message)'
      using errcode = 'P0001';
  end if;

  if v_msg.user_id is distinct from p_invoker_user_id then
    raise exception 'agent_update_task_and_reply: invoker mismatch'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.agent_definitions ad
    where ad.is_active
      and ad.auth_user_id = v_msg.user_id
  ) then
    raise exception 'agent_update_task_and_reply: trigger author is an agent'
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
    raise exception 'agent_update_task_and_reply: agent not bound to bubble'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.tasks t
    where t.id = p_target_task_id
      and t.bubble_id = v_msg.bubble_id
  ) then
    raise exception 'agent_update_task_and_reply: target task not in bubble'
      using errcode = 'P0001';
  end if;

  v_title := nullif(trim(coalesce(p_new_title, '')), '');
  v_desc := nullif(trim(coalesce(p_new_description, '')), '');

  if v_title is null and v_desc is null then
    raise exception 'agent_update_task_and_reply: at least one of p_new_title or p_new_description must be non-empty'
      using errcode = 'P0001';
  end if;

  perform 1
  from public.tasks t
  where t.id = p_target_task_id
    and t.bubble_id = v_msg.bubble_id
  for update;

  update public.tasks
  set
    title = coalesce(v_title, title),
    description = coalesce(v_desc, description)
  where id = p_target_task_id;

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
    p_thread_id,
    v_msg.target_task_id,
    p_target_task_id,
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
    p_target_task_id,
    v_reply_id
  )
  on conflict (trigger_message_id, agent_auth_user_id) do update set
    created_task_id = excluded.created_task_id,
    reply_message_id = excluded.reply_message_id;

  return jsonb_build_object(
    'ok', true,
    'deduped', false,
    'updated_task_id', p_target_task_id,
    'reply_message_id', v_reply_id
  );
end;
$$;

comment on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) is
  'Agent updates an existing task in the bubble + inserts thread reply; idempotent per trigger+agent; service_role only.';

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) from public;

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) from authenticated;

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) from anon;

grant execute on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) to service_role;
