-- Phase M3: persist Coach `workout_cues_patch` on agent reply metadata.

do $drop_create$
declare
  stmt text;
begin
  for stmt in
    select format(
      'drop function if exists %I.%I(%s) cascade',
      n.nspname,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)
    )
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'agent_create_card_and_reply',
        'agent_insert_coach_workout_draft_reply',
        'agent_update_task_and_reply'
      )
  loop
    execute stmt;
  end loop;
end;
$drop_create$;


create or replace function public.agent_create_card_and_reply(
  p_trigger_message_id uuid,
  p_thread_id uuid,
  p_agent_auth_user_id uuid,
  p_invoker_user_id uuid,
  p_reply_text text,
  p_create_card boolean default true,
  p_task_title text default null,
  p_task_description text default null,
  p_task_type text default 'task',
  p_task_status text default 'todo',
  p_seed_task_comment_text text default null,
  p_execution_patch jsonb default null,
  p_personal_cues jsonb default null,
  p_task_modal_intake_patch jsonb default null,
  p_card_action jsonb default null,
  p_coach_workout_outline jsonb default null,
  p_workout_cues_patch jsonb default null
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
  v_thread_root uuid;
  v_meta jsonb;
  v_written int;
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
    and m.parent_id = p_thread_id
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

  v_thread_root := coalesce(v_msg.parent_id, v_msg.id);
  if p_thread_id is distinct from v_thread_root then
    raise exception 'agent_create_card_and_reply: p_thread_id must equal thread root (coalesce(parent_id, id) of trigger message)'
      using errcode = 'P0001';
  end if;

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

  v_written := public.apply_personal_cues_for_user(
    p_invoker_user_id,
    p_agent_auth_user_id,
    coalesce(p_personal_cues, '[]'::jsonb)
  );

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
      case
        when p_coach_workout_outline is not null
          and jsonb_typeof(p_coach_workout_outline) = 'array'
          and jsonb_array_length(p_coach_workout_outline) > 0
        then jsonb_build_object('coach_workout_outline', p_coach_workout_outline)
        else '{}'::jsonb
      end,
      '[]'::jsonb,
      'private'
    )
    returning id into v_task_id;

    if p_seed_task_comment_text is not null and length(trim(p_seed_task_comment_text)) > 0 then
      insert into public.messages (
        bubble_id,
        user_id,
        content,
        parent_id,
        target_task_id,
        attached_task_id,
        attachments,
        thread_subject_user_id
      )
      values (
        v_msg.bubble_id,
        p_agent_auth_user_id,
        trim(p_seed_task_comment_text),
        null,
        v_task_id,
        null,
        '[]'::jsonb,
        v_msg.thread_subject_user_id
      );
    end if;
  else
    v_task_id := null;
  end if;

  v_meta := '{}'::jsonb;

  if p_execution_patch is not null
    and jsonb_typeof(p_execution_patch) = 'array'
    and jsonb_array_length(p_execution_patch) > 0
  then
    v_meta := v_meta || jsonb_build_object('execution_patch', p_execution_patch);
  end if;

  if p_personal_cues is not null
    and jsonb_typeof(p_personal_cues) = 'array'
    and jsonb_array_length(p_personal_cues) > 0
  then
    v_meta := v_meta || jsonb_build_object('personal_cues_patch', p_personal_cues);
  end if;

  if p_task_modal_intake_patch is not null
    and jsonb_typeof(p_task_modal_intake_patch) = 'object'
    and p_task_modal_intake_patch <> '{}'::jsonb
  then
    v_meta := v_meta || jsonb_build_object('task_modal_intake_patch', p_task_modal_intake_patch);
  end if;

  if p_card_action is not null
    and jsonb_typeof(p_card_action) = 'object'
    and p_card_action <> '{}'::jsonb
  then
    v_meta := v_meta || jsonb_build_object('card_action', p_card_action);
  end if;

  if p_workout_cues_patch is not null
    and jsonb_typeof(p_workout_cues_patch) = 'object'
    and p_workout_cues_patch <> '{}'::jsonb
  then
    v_meta := v_meta || jsonb_build_object('workout_cues_patch', p_workout_cues_patch);
  end if;

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
    v_task_id,
    '[]'::jsonb,
    v_meta,
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
    'reply_message_id', v_reply_id,
    'personal_cues_written', v_written
  );
end;
$$;

comment on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Agent reply with optional Kanban task; optional p_execution_patch, p_personal_cues, p_task_modal_intake_patch, p_card_action, p_workout_cues_patch, and p_coach_workout_outline; seeds tasks.metadata.coach_workout_outline at INSERT when outline array non-empty; service_role only.';

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from authenticated;
revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from anon;
grant execute on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;


create or replace function public.agent_insert_coach_workout_draft_reply(
  p_trigger_message_id uuid,
  p_thread_id uuid,
  p_agent_auth_user_id uuid,
  p_invoker_user_id uuid,
  p_target_task_id uuid,
  p_reply_text text,
  p_proposed_title text default null,
  p_proposed_description text default null,
  p_proposed_metadata jsonb default '{}'::jsonb,
  p_execution_patch jsonb default null,
  p_personal_cues jsonb default null,
  p_task_modal_intake_patch jsonb default null,
  p_card_action jsonb default null,
  p_workout_cues_patch jsonb default null
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
  v_meta jsonb;
  v_has_meta boolean;
  v_reply_meta jsonb;
  v_written int;
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
    raise exception 'agent_insert_coach_workout_draft_reply: p_thread_id must equal thread root'
      using errcode = 'P0001';
  end if;

  if v_msg.user_id is distinct from p_invoker_user_id then
    raise exception 'agent_insert_coach_workout_draft_reply: invoker mismatch'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.agent_definitions ad
    where ad.is_active
      and ad.auth_user_id = v_msg.user_id
  ) then
    raise exception 'agent_insert_coach_workout_draft_reply: trigger author is an agent'
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
    raise exception 'agent_insert_coach_workout_draft_reply: agent not bound to bubble'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.tasks t
    where t.id = p_target_task_id
      and t.bubble_id = v_msg.bubble_id
  ) then
    raise exception 'agent_insert_coach_workout_draft_reply: target task not in bubble'
      using errcode = 'P0001';
  end if;

  v_written := public.apply_personal_cues_for_user(
    p_invoker_user_id,
    p_agent_auth_user_id,
    coalesce(p_personal_cues, '[]'::jsonb)
  );

  v_title := nullif(trim(coalesce(p_proposed_title, '')), '');
  v_desc := nullif(trim(coalesce(p_proposed_description, '')), '');
  v_meta := coalesce(p_proposed_metadata, '{}'::jsonb);
  v_has_meta := v_meta <> '{}'::jsonb
    and (
      (v_meta ? 'exercises' and jsonb_typeof(v_meta->'exercises') = 'array' and jsonb_array_length(v_meta->'exercises') > 0)
      or (v_meta ? 'workout_type' and nullif(trim(v_meta->>'workout_type'), '') is not null)
      or (v_meta ? 'duration_min' and (v_meta->'duration_min') is not null)
    );

  if v_title is null and v_desc is null and not v_has_meta then
    raise exception 'agent_insert_coach_workout_draft_reply: draft must include title, description, or structured workout fields'
      using errcode = 'P0001';
  end if;

  -- Compose reply metadata: coach_draft + independent sibling merges. Building
  -- in a local variable (vs. nested `||` + `case` chain) keeps each optional
  -- payload independent so a missing payload cannot swallow a sibling.
  v_reply_meta := jsonb_build_object(
    'coach_draft',
    jsonb_build_object(
      'status', 'pending',
      'proposed_title', to_jsonb(v_title),
      'proposed_description', to_jsonb(v_desc),
      'proposed_metadata', v_meta,
      'target_task_id', to_jsonb(p_target_task_id::text)
    )
  );

  if p_execution_patch is not null
    and jsonb_typeof(p_execution_patch) = 'array'
    and jsonb_array_length(p_execution_patch) > 0
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('execution_patch', p_execution_patch);
  end if;

  if p_personal_cues is not null
    and jsonb_typeof(p_personal_cues) = 'array'
    and jsonb_array_length(p_personal_cues) > 0
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('personal_cues_patch', p_personal_cues);
  end if;

  if p_task_modal_intake_patch is not null
    and jsonb_typeof(p_task_modal_intake_patch) = 'object'
    and p_task_modal_intake_patch <> '{}'::jsonb
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('task_modal_intake_patch', p_task_modal_intake_patch);
  end if;

  if p_card_action is not null
    and jsonb_typeof(p_card_action) = 'object'
    and p_card_action <> '{}'::jsonb
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('card_action', p_card_action);
  end if;

  if p_workout_cues_patch is not null
    and jsonb_typeof(p_workout_cues_patch) = 'object'
    and p_workout_cues_patch <> '{}'::jsonb
  then
    v_reply_meta := v_reply_meta || jsonb_build_object('workout_cues_patch', p_workout_cues_patch);
  end if;

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
    'reply_message_id', v_reply_id,
    'personal_cues_written', v_written
  );
end;
$$;



-- Phase M3: persist Coach workout_cues_patch on agent_update_task_and_reply reply metadata.

drop function if exists public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb
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
  p_workout_cues_patch jsonb default null
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

  if v_title is null and v_desc is null and v_new_meta is null and v_reply_meta = '{}'::jsonb then
    raise exception 'agent_update_task_and_reply: at least one of p_new_title, p_new_description, non-empty p_new_metadata, p_card_action, or p_outline_draft_applied, or p_workout_cues_patch must be provided'
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
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb
) is
  'Agent updates an existing task (title, description, optional shallow metadata merge) + inserts thread reply with optional p_card_action, p_outline_draft_applied, and p_workout_cues_patch on reply metadata; idempotent per trigger+agent; service_role only.';

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb
) from public;

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb
) from authenticated;

revoke all on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb
) from anon;

grant execute on function public.agent_update_task_and_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb
) to service_role;
