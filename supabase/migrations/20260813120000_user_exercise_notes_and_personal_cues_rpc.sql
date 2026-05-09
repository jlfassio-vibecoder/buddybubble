-- User-scoped personal exercise cues (Coach mid-workout) + merge into agent reply RPCs.
-- Cues persist across workouts for the same exercise_dictionary row; tasks.metadata is untouched.

-- ---------------------------------------------------------------------------
-- Table + RLS + Realtime
-- ---------------------------------------------------------------------------

create table if not exists public.user_exercise_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_dictionary_id uuid not null references public.exercise_dictionary (id) on delete cascade,
  instructions text,
  form_cues text,
  tips text,
  injury_prevention_tips text,
  updated_by_agent_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_exercise_notes_user_exercise_unique unique (user_id, exercise_dictionary_id)
);

comment on table public.user_exercise_notes is
  'Per-user coaching text for a catalog exercise; written by Coach agent (service_role RPC only).';

create index if not exists user_exercise_notes_user_id_idx
  on public.user_exercise_notes (user_id);

create or replace function public.user_exercise_notes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_exercise_notes_set_updated_at on public.user_exercise_notes;
create trigger user_exercise_notes_set_updated_at
  before update on public.user_exercise_notes
  for each row
  execute function public.user_exercise_notes_set_updated_at();

alter table public.user_exercise_notes enable row level security;

create policy user_exercise_notes_select_own
  on public.user_exercise_notes
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.user_exercise_notes to authenticated;
grant all on table public.user_exercise_notes to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_exercise_notes'
  ) then
    alter publication supabase_realtime add table public.user_exercise_notes;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merge helper: apply resolved cue rows (Edge validates shape)
-- Max 8000 chars per field after merge; append keeps the tail on overflow.
-- ---------------------------------------------------------------------------

create or replace function public.apply_personal_cues_for_user(
  p_user_id uuid,
  p_agent_auth_user_id uuid,
  p_cues jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_el jsonb;
  v_dict uuid;
  v_mode text;
  v_instr text;
  v_form text;
  v_tips text;
  v_inj text;
  v_old_instr text;
  v_old_form text;
  v_old_tips text;
  v_old_inj text;
  v_new_instr text;
  v_new_form text;
  v_new_tips text;
  v_new_inj text;
  v_sep text := E'\n';
  v_count int := 0;
  v_cap int := 8000;
begin
  if p_cues is null or jsonb_typeof(p_cues) <> 'array' or jsonb_array_length(p_cues) = 0 then
    return 0;
  end if;

  for v_el in select * from jsonb_array_elements(p_cues)
  loop
    if jsonb_typeof(v_el) <> 'object' then
      continue;
    end if;

    begin
      v_dict := (v_el->>'exercise_dictionary_id')::uuid;
    exception
      when others then
        continue;
    end;

    if v_dict is null then
      continue;
    end if;

    v_mode := lower(coalesce(nullif(trim(v_el->>'mode'), ''), 'append'));
    if v_mode not in ('append', 'replace') then
      v_mode := 'append';
    end if;

    v_instr := case when v_el ? 'instructions' and v_el->'instructions' is not null
      and jsonb_typeof(v_el->'instructions') = 'string'
      then nullif(trim(v_el#>>'{instructions}'), '') end;
    v_form := case when v_el ? 'form_cues' and v_el->'form_cues' is not null
      and jsonb_typeof(v_el->'form_cues') = 'string'
      then nullif(trim(v_el#>>'{form_cues}'), '') end;
    v_tips := case when v_el ? 'tips' and v_el->'tips' is not null
      and jsonb_typeof(v_el->'tips') = 'string'
      then nullif(trim(v_el#>>'{tips}'), '') end;
    v_inj := case when v_el ? 'injury_prevention_tips' and v_el->'injury_prevention_tips' is not null
      and jsonb_typeof(v_el->'injury_prevention_tips') = 'string'
      then nullif(trim(v_el#>>'{injury_prevention_tips}'), '') end;

    if v_instr is null and v_form is null and v_tips is null and v_inj is null then
      continue;
    end if;

    select u.instructions, u.form_cues, u.tips, u.injury_prevention_tips
      into v_old_instr, v_old_form, v_old_tips, v_old_inj
    from public.user_exercise_notes u
    where u.user_id = p_user_id
      and u.exercise_dictionary_id = v_dict;

    if v_mode = 'replace' then
      v_new_instr := coalesce(v_instr, v_old_instr);
      v_new_form := coalesce(v_form, v_old_form);
      v_new_tips := coalesce(v_tips, v_old_tips);
      v_new_inj := coalesce(v_inj, v_old_inj);
    else
      -- append: only touch fields present in patch
      v_new_instr := v_old_instr;
      v_new_form := v_old_form;
      v_new_tips := v_old_tips;
      v_new_inj := v_old_inj;
      if v_instr is not null then
        v_new_instr :=
          case
            when coalesce(v_old_instr, '') = '' then v_instr
            else v_old_instr || v_sep || v_instr
          end;
      end if;
      if v_form is not null then
        v_new_form :=
          case
            when coalesce(v_old_form, '') = '' then v_form
            else v_old_form || v_sep || v_form
          end;
      end if;
      if v_tips is not null then
        v_new_tips :=
          case
            when coalesce(v_old_tips, '') = '' then v_tips
            else v_old_tips || v_sep || v_tips
          end;
      end if;
      if v_inj is not null then
        v_new_inj :=
          case
            when coalesce(v_old_inj, '') = '' then v_inj
            else v_old_inj || v_sep || v_inj
          end;
      end if;
    end if;

    if length(coalesce(v_new_instr, '')) > v_cap then
      v_new_instr := right(coalesce(v_new_instr, ''), v_cap);
    end if;
    if length(coalesce(v_new_form, '')) > v_cap then
      v_new_form := right(coalesce(v_new_form, ''), v_cap);
    end if;
    if length(coalesce(v_new_tips, '')) > v_cap then
      v_new_tips := right(coalesce(v_new_tips, ''), v_cap);
    end if;
    if length(coalesce(v_new_inj, '')) > v_cap then
      v_new_inj := right(coalesce(v_new_inj, ''), v_cap);
    end if;

    insert into public.user_exercise_notes (
      user_id,
      exercise_dictionary_id,
      instructions,
      form_cues,
      tips,
      injury_prevention_tips,
      updated_by_agent_user_id
    )
    values (
      p_user_id,
      v_dict,
      v_new_instr,
      v_new_form,
      v_new_tips,
      v_new_inj,
      p_agent_auth_user_id
    )
    on conflict (user_id, exercise_dictionary_id) do update set
      instructions = excluded.instructions,
      form_cues = excluded.form_cues,
      tips = excluded.tips,
      injury_prevention_tips = excluded.injury_prevention_tips,
      updated_by_agent_user_id = excluded.updated_by_agent_user_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.apply_personal_cues_for_user(uuid, uuid, jsonb) is
  'Service-role helper: merge personal cue jsonb into user_exercise_notes for p_user_id.';

revoke all on function public.apply_personal_cues_for_user(uuid, uuid, jsonb) from public;
revoke all on function public.apply_personal_cues_for_user(uuid, uuid, jsonb) from anon;
revoke all on function public.apply_personal_cues_for_user(uuid, uuid, jsonb) from authenticated;
grant execute on function public.apply_personal_cues_for_user(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Drop overloads: agent_create_card_and_reply, agent_insert_coach_workout_draft_reply
-- ---------------------------------------------------------------------------

do $drop_create$
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
$drop_create$;

do $drop_draft$
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
      and p.proname = 'agent_insert_coach_workout_draft_reply'
  loop
    execute stmt;
  end loop;
end;
$drop_draft$;

-- ---------------------------------------------------------------------------
-- agent_create_card_and_reply (+ p_personal_cues)
-- ---------------------------------------------------------------------------

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
  p_personal_cues jsonb default null
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
      '{}'::jsonb,
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
    v_task_id,
    '[]'::jsonb,
    v_meta
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
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb
) is
  'Agent reply with optional Kanban task; optional p_execution_patch and p_personal_cues on reply metadata; applies cues to user_exercise_notes; service_role only.';

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb
) from public;
revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb
) from authenticated;
revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb
) from anon;
grant execute on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text, jsonb, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- agent_insert_coach_workout_draft_reply (+ p_personal_cues)
-- ---------------------------------------------------------------------------

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
  p_personal_cues jsonb default null
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
    (
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
      || case
        when p_execution_patch is not null
          and jsonb_typeof(p_execution_patch) = 'array'
          and jsonb_array_length(p_execution_patch) > 0
        then jsonb_build_object('execution_patch', p_execution_patch)
        else '{}'::jsonb
      end
      || case
        when p_personal_cues is not null
          and jsonb_typeof(p_personal_cues) = 'array'
          and jsonb_array_length(p_personal_cues) > 0
        then jsonb_build_object('personal_cues_patch', p_personal_cues)
        else '{}'::jsonb
      end
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
    'reply_message_id', v_reply_id,
    'personal_cues_written', v_written
  );
end;
$$;

comment on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) is
  'Agent inserts coach_draft reply; optional execution_patch and personal_cues_patch in metadata; applies cues to user_exercise_notes; service_role only.';

revoke all on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) from public;
revoke all on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) from authenticated;
revoke all on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) from anon;
grant execute on function public.agent_insert_coach_workout_draft_reply(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) to service_role;
