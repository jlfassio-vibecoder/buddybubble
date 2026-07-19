-- Collapse any leftover agent_update_task_and_reply overloads into a single
-- signature that includes p_proposed_workout_metadata.
--
-- PostgREST fails Coach rail updates with PGRST202 / "could not find the function"
-- when the Edge client sends p_proposed_workout_metadata but the live DB still has
-- only the 12-arg cues signature (or multiple ambiguous overloads).

drop function if exists public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) cascade;

drop function if exists public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) cascade;

drop function if exists public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb
) cascade;

drop function if exists public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) cascade;

drop function if exists public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb
) cascade;

drop function if exists public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) cascade;

create or replace function public.agent_update_task_and_reply(
  p_trigger_message_id uuid,
  p_thread_id uuid,
  p_agent_auth_user_id uuid,
  p_invoker_user_id uuid,
  p_target_task_id uuid,
  p_reply_text text,
  p_new_title text default null,
  p_new_description text default null,
  p_new_metadata jsonb default null,
  p_card_action jsonb default null,
  p_outline_draft_applied jsonb default null,
  p_workout_cues_patch jsonb default null,
  p_proposed_workout_metadata jsonb default null
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
  v_new_meta jsonb;
  v_reply_meta jsonb;
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

  v_new_meta :=
    case
      when p_new_metadata is null then null::jsonb
      when jsonb_typeof(p_new_metadata) <> 'object' then null::jsonb
      when p_new_metadata = 'null'::jsonb then null::jsonb
      when p_new_metadata = '{}'::jsonb then null::jsonb
      else p_new_metadata
    end;

  v_reply_meta := '{}'::jsonb;
  if p_card_action is not null
    and jsonb_typeof(p_card_action) = 'object'
    and p_card_action <> '{}'::jsonb
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('card_action', p_card_action);
  end if;

  if p_outline_draft_applied is not null
    and jsonb_typeof(p_outline_draft_applied) = 'object'
    and p_outline_draft_applied <> '{}'::jsonb
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('outline_draft_applied', p_outline_draft_applied);
  end if;

  if p_workout_cues_patch is not null
    and jsonb_typeof(p_workout_cues_patch) = 'object'
    and p_workout_cues_patch <> '{}'::jsonb
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('workout_cues_patch', p_workout_cues_patch);
  end if;

  if p_proposed_workout_metadata is not null
    and jsonb_typeof(p_proposed_workout_metadata) = 'object'
    and p_proposed_workout_metadata <> '{}'::jsonb
  then
    v_reply_meta := v_reply_meta || jsonb_build_object(
      'proposed_workout_metadata',
      p_proposed_workout_metadata
    );
  end if;

  if v_title is null and v_desc is null and v_new_meta is null and v_reply_meta = '{}'::jsonb then
    raise exception 'agent_update_task_and_reply: at least one of p_new_title, p_new_description, non-empty p_new_metadata, p_card_action, p_outline_draft_applied, p_workout_cues_patch, or p_proposed_workout_metadata must be provided'
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
    description = coalesce(v_desc, description),
    metadata = case
      when v_new_meta is null then metadata
      else coalesce(metadata, '{}'::jsonb) || v_new_meta
    end
  where id = p_target_task_id;

  insert into public.messages (
    bubble_id,
    user_id,
    content,
    parent_id,
    target_task_id,
    attached_task_id,
    attachments,
    metadata,
    thread_subject_user_id
  )
  values (
    v_msg.bubble_id,
    p_agent_auth_user_id,
    coalesce(p_reply_text, ''),
    p_thread_id,
    v_msg.target_task_id,
    p_target_task_id,
    '[]'::jsonb,
    v_reply_meta,
    v_msg.thread_subject_user_id
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
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Single signature: task title/description/metadata update + reply with optional card_action, outline_draft_applied, workout_cues_patch, proposed_workout_metadata; service_role only.';

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from authenticated;

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from anon;

grant execute on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

-- Nudge PostgREST schema cache after signature change (no-op if NOTIFY unavailable).
notify pgrst, 'reload schema';
