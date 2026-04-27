-- Semi-private fitness (and future) chat: per-thread subject + RLS.
-- 1) bubbles.message_visibility: workspace_public | subject_threads
-- 2) messages.thread_subject_user_id: partition key for subject_threads (inherit via trigger)
-- 3) RLS: replace blanket messages_select with visibility-aware policies

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.bubbles
  add column if not exists message_visibility text not null default 'workspace_public';

alter table public.bubbles
  drop constraint if exists bubbles_message_visibility_check;

alter table public.bubbles
  add constraint bubbles_message_visibility_check
  check (message_visibility in ('workspace_public', 'subject_threads'));

comment on column public.bubbles.message_visibility is
  'workspace_public: any bubble viewer may read all messages (legacy). subject_threads: RLS restricts by messages.thread_subject_user_id.';

alter table public.messages
  add column if not exists thread_subject_user_id uuid references public.users (id) on delete restrict;

comment on column public.messages.thread_subject_user_id is
  'Member/workspace-participant key for semi-private channels: thread root subject; replies inherit. Owner/admin may read all subjects in the bubble.';

create index if not exists messages_bubble_thread_subject_created_idx
  on public.messages (bubble_id, thread_subject_user_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Fitness Workouts bubble → subject_threads
-- ---------------------------------------------------------------------------

update public.bubbles b
set message_visibility = 'subject_threads'
from public.workspaces w
where b.workspace_id = w.id
  and w.category_type = 'fitness'
  and lower(trim(b.name)) = 'workouts';

-- ---------------------------------------------------------------------------
-- 3. Backfill messages.thread_subject_user_id (all bubbles)
-- ---------------------------------------------------------------------------

update public.messages m
set thread_subject_user_id = m.user_id
where m.thread_subject_user_id is null
  and m.parent_id is null;

do $$
declare
  n bigint;
begin
  loop
    update public.messages c
    set thread_subject_user_id = p.thread_subject_user_id
    from public.messages p
    where c.parent_id = p.id
      and c.thread_subject_user_id is null
      and p.thread_subject_user_id is not null;
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
end;
$$;

-- Any stragglers (broken parent chains): fall back to author
update public.messages m
set thread_subject_user_id = m.user_id
where m.thread_subject_user_id is null;

alter table public.messages
  alter column thread_subject_user_id set not null;

-- ---------------------------------------------------------------------------
-- 4. Trigger: inherit subject from parent; default root; admin-only subject change
-- ---------------------------------------------------------------------------

create or replace function public.messages_thread_subject_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_parent_subject uuid;
begin
  if tg_op not in ('INSERT', 'UPDATE') then
    return new;
  end if;

  if new.parent_id is not null then
    select m.thread_subject_user_id
      into v_parent_subject
    from public.messages m
    where m.id = new.parent_id;

    if found and v_parent_subject is not null then
      new.thread_subject_user_id := v_parent_subject;
    end if;
  end if;

  if new.thread_subject_user_id is null then
    new.thread_subject_user_id := new.user_id;
  end if;

  if tg_op = 'UPDATE'
     and new.thread_subject_user_id is distinct from old.thread_subject_user_id
     and not public.is_workspace_admin(public.workspace_id_for_bubble(new.bubble_id)) then
    new.thread_subject_user_id := old.thread_subject_user_id;
  end if;

  return new;
end;
$fn$;

drop trigger if exists messages_thread_subject_guard_ins on public.messages;
drop trigger if exists messages_thread_subject_guard_upd on public.messages;

create trigger messages_thread_subject_guard_ins
  before insert on public.messages
  for each row
  execute procedure public.messages_thread_subject_guard();

create trigger messages_thread_subject_guard_upd
  before update on public.messages
  for each row
  execute procedure public.messages_thread_subject_guard();

comment on function public.messages_thread_subject_guard() is
  'Sets messages.thread_subject_user_id from parent thread root; defaults null to user_id; only owner/admin may change subject on UPDATE.';

-- ---------------------------------------------------------------------------
-- 5. Helper for RLS
-- ---------------------------------------------------------------------------

create or replace function public.get_bubble_message_visibility(p_bubble_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select b.message_visibility
  from public.bubbles b
  where b.id = p_bubble_id;
$$;

comment on function public.get_bubble_message_visibility(uuid) is
  'Returns bubbles.message_visibility for RLS (security definer so policies can read bubble row consistently).';

-- ---------------------------------------------------------------------------
-- 6. RLS: messages
-- ---------------------------------------------------------------------------

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

-- SELECT: public bubbles — unchanged semantics
create policy messages_select_workspace_public on public.messages
  for select using (
    public.can_view_bubble(bubble_id)
    and public.get_bubble_message_visibility(bubble_id) = 'workspace_public'
  );

-- SELECT: subject_threads — own subject or workspace owner/admin
create policy messages_select_subject_threads on public.messages
  for select using (
    public.can_view_bubble(bubble_id)
    and public.get_bubble_message_visibility(bubble_id) = 'subject_threads'
    and (
      thread_subject_user_id = (select auth.uid())
      or public.is_workspace_admin(public.workspace_id_for_bubble(bubble_id))
    )
  );

-- INSERT
create policy messages_insert on public.messages
  for insert with check (
    user_id = (select auth.uid())
    and public.can_view_bubble(bubble_id)
    and (
      public.get_bubble_message_visibility(bubble_id) = 'workspace_public'
      or (
        public.get_bubble_message_visibility(bubble_id) = 'subject_threads'
        and (
          thread_subject_user_id = (select auth.uid())
          or (
            public.is_workspace_admin(public.workspace_id_for_bubble(bubble_id))
            and exists (
              select 1
              from public.workspace_members wm
              where wm.workspace_id = public.workspace_id_for_bubble(bubble_id)
                and wm.user_id = thread_subject_user_id
            )
          )
        )
      )
    )
  );

-- UPDATE (author-only semantics preserved; subject immutability enforced by trigger)
create policy messages_update on public.messages
  for update
  using (
    user_id = (select auth.uid())
    and public.can_view_bubble(bubble_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.can_view_bubble(bubble_id)
  );

-- DELETE
create policy messages_delete on public.messages
  for delete using (
    public.can_view_bubble(bubble_id)
    and (
      user_id = (select auth.uid())
      or public.is_workspace_admin(public.workspace_id_for_bubble(bubble_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 7. agent_create_card_and_reply: seed task comment must carry trigger thread subject
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
  p_seed_task_comment_text text default null
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
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text
) is
  'Agent reply with optional Kanban task; p_thread_id = Slack thread root for parent_id; optional p_seed_task_comment_text inserts task-scoped coach note; service_role only.';

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text
) from public;

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text
) from authenticated;

revoke all on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text
) from anon;

grant execute on function public.agent_create_card_and_reply(
  uuid, uuid, uuid, uuid, text, boolean, text, text, text, text, text
) to service_role;
