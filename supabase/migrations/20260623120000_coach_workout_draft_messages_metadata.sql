-- Coach workout drafts: message-level metadata + draft insert RPC + finalize RPC.
-- Edge function stops calling agent_update_task_and_reply for workout revisions (handled in app).

alter table public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.messages.metadata is
  'App-defined JSON (e.g. coach_draft: proposed title/description/metadata before user finalizes to tasks).';

-- Aligns with public.tasks_update USING (see 20260521100000_storefront_trial_phase2_guest_tasks_rls.sql).
-- Copilot suggestion ignored: _uid is the subject of assigned_to checks; can_write_bubble / is_workspace_guest mirror tasks_update RLS and intentionally use auth.uid() like the referenced migration, not membership inlined by _uid.
create or replace function public.user_may_update_task_row(_uid uuid, _task public.tasks)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select (
    (
      not public.is_workspace_guest(public.workspace_id_for_bubble(_task.bubble_id))
      and (
        public.can_write_bubble(_task.bubble_id)
        or _task.assigned_to = _uid
      )
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(_task.bubble_id))
      and _task.assigned_to = _uid
    )
    or (
      public.is_workspace_guest(public.workspace_id_for_bubble(_task.bubble_id))
      and public.can_write_bubble(_task.bubble_id)
      and (_task.assigned_to is null or _task.assigned_to = _uid)
    )
  );
$$;

comment on function public.user_may_update_task_row(uuid, public.tasks) is
  'Whether _uid may UPDATE this tasks row (mirrors tasks_update RLS USING).';

-- Service role only: insert agent reply with coach draft; does NOT mutate tasks.
create or replace function public.agent_insert_coach_workout_draft_reply(
  p_trigger_message_id uuid,
  p_thread_id uuid,
  p_agent_auth_user_id uuid,
  p_invoker_user_id uuid,
  p_target_task_id uuid,
  p_reply_text text,
  p_proposed_title text default null,
  p_proposed_description text default null,
  p_proposed_metadata jsonb default '{}'::jsonb
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
    v_msg.bubble_id,
    p_agent_auth_user_id,
    coalesce(p_reply_text, ''),
    p_thread_id,
    v_msg.target_task_id,
    p_target_task_id,
    '[]'::jsonb,
    jsonb_build_object(
      'coach_draft',
      jsonb_build_object(
        'status', 'pending',
        'proposed_title', to_jsonb(v_title),
        'proposed_description', to_jsonb(v_desc),
        'proposed_metadata', v_meta,
        'target_task_id', to_jsonb(p_target_task_id::text)
      )
    )
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

comment on function public.agent_insert_coach_workout_draft_reply is
  'Agent inserts thread reply with coach_draft in messages.metadata; does not update tasks. service_role only.';

revoke all on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) from public;
revoke all on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) from authenticated;
revoke all on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) from anon;

grant execute on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) to service_role;

-- Finalize: merge draft into tasks + mark message accepted (authenticated users).
create or replace function public.apply_workout_draft(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages%rowtype;
  v_task public.tasks%rowtype;
  v_draft jsonb;
  v_status text;
  v_target uuid;
  v_new_title text;
  v_new_desc text;
  v_prop_meta jsonb;
  v_merged_meta jsonb;
begin
  if v_uid is null then
    raise exception 'apply_workout_draft: not authenticated' using errcode = 'P0001';
  end if;

  select m.*
    into strict v_msg
  from public.messages m
  where m.id = p_message_id
  for update;

  v_draft := v_msg.metadata->'coach_draft';
  if v_draft is null or jsonb_typeof(v_draft) <> 'object' then
    raise exception 'apply_workout_draft: no coach draft on message' using errcode = 'P0001';
  end if;

  v_status := v_draft->>'status';
  if v_status is distinct from 'pending' then
    raise exception 'apply_workout_draft: draft is not pending' using errcode = 'P0001';
  end if;

  v_target := (v_draft->>'target_task_id')::uuid;
  if v_target is null then
    raise exception 'apply_workout_draft: missing target_task_id' using errcode = 'P0001';
  end if;

  -- Definer bypasses messages RLS: require this row to reference the draft target (and same bubble below).
  if not (
    v_msg.attached_task_id is not distinct from v_target
    or v_msg.target_task_id is not distinct from v_target
  ) then
    raise exception 'apply_workout_draft: message not scoped to target task' using errcode = 'P0001';
  end if;

  select t.*
    into strict v_task
  from public.tasks t
  where t.id = v_target
  for update;

  if v_msg.bubble_id is distinct from v_task.bubble_id then
    raise exception 'apply_workout_draft: bubble mismatch' using errcode = 'P0001';
  end if;

  if not public.user_may_update_task_row(v_uid, v_task) then
    raise exception 'apply_workout_draft: forbidden' using errcode = 'P0001';
  end if;

  v_new_title := case
    when v_draft ? 'proposed_title'
      and v_draft->'proposed_title' is not null
      and jsonb_typeof(v_draft->'proposed_title') = 'string'
      and length(trim(v_draft#>>'{proposed_title}')) > 0
    then trim(v_draft#>>'{proposed_title}')
    else v_task.title
  end;

  v_new_desc := case
    when v_draft ? 'proposed_description'
      and v_draft->'proposed_description' is not null
      and jsonb_typeof(v_draft->'proposed_description') = 'string'
    then nullif(trim(v_draft#>>'{proposed_description}'), '')
    else v_task.description
  end;

  v_prop_meta := coalesce(v_draft->'proposed_metadata', '{}'::jsonb);
  v_merged_meta := coalesce(v_task.metadata::jsonb, '{}'::jsonb) || v_prop_meta;

  update public.tasks
  set
    title = v_new_title,
    description = coalesce(v_new_desc, v_task.description),
    metadata = v_merged_meta
  where id = v_target;

  insert into public.task_activity_log (task_id, user_id, action_type, payload)
  values (
    v_target,
    v_uid,
    'coach_draft_applied',
    jsonb_build_object(
      'message_id', p_message_id,
      'source', 'apply_workout_draft'
    )
  );

  update public.messages
  set metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{coach_draft}',
    coalesce(metadata->'coach_draft', '{}'::jsonb)
      || jsonb_build_object(
        'status', 'accepted',
        'accepted_at', to_jsonb(now()::text),
        'accepted_by', to_jsonb(v_uid::text)
      ),
    true
  )
  where id = p_message_id;

  return jsonb_build_object(
    'ok', true,
    'updated_task_id', v_target,
    'message_id', p_message_id
  );
end;
$$;

comment on function public.apply_workout_draft(uuid) is
  'Merge coach_draft from messages.metadata into tasks (title, description, metadata); mark draft accepted.';

revoke all on function public.apply_workout_draft(uuid) from public;
revoke all on function public.apply_workout_draft(uuid) from anon;
grant execute on function public.apply_workout_draft(uuid) to authenticated;
grant execute on function public.apply_workout_draft(uuid) to service_role;
