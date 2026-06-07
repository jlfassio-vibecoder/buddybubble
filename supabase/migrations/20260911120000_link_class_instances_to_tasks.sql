-- Link each class_instances row to a parent tasks canvas (item_type = 'class').

alter table public.class_instances
  add column if not exists task_id uuid references public.tasks (id) on delete cascade;

comment on column public.class_instances.task_id is
  'Parent tasks canvas row (item_type = class) for comments, subtasks, activity, bubbly.';

-- Backfill tasks for existing instances (bubble: "Classes" preferred, else earliest bubble).
do $$
declare
  r record;
  new_task_id uuid;
  v_bubble_id uuid;
begin
  for r in
    select
      ci.id as instance_id,
      ci.workspace_id,
      ci.scheduled_at,
      coalesce(ci.visibility, 'private') as visibility,
      co.name,
      co.description
    from public.class_instances ci
    inner join public.class_offerings co on co.id = ci.offering_id
    where ci.task_id is null
  loop
    select coalesce(
      (
        select b.id
        from public.bubbles b
        where b.workspace_id = r.workspace_id
          and b.name = 'Classes'
        limit 1
      ),
      (
        select b.id
        from public.bubbles b
        where b.workspace_id = r.workspace_id
        order by b.created_at asc
        limit 1
      )
    )
    into v_bubble_id;

    if v_bubble_id is null then
      raise exception 'link_class_instances_to_tasks: no bubble for workspace % instance %',
        r.workspace_id, r.instance_id;
    end if;

    insert into public.tasks (
      bubble_id,
      title,
      description,
      item_type,
      visibility,
      scheduled_on,
      scheduled_time,
      status,
      priority,
      position,
      metadata
    )
    values (
      v_bubble_id,
      r.name,
      r.description,
      'class',
      r.visibility,
      (r.scheduled_at at time zone 'UTC')::date,
      (r.scheduled_at at time zone 'UTC')::time,
      'scheduled',
      'medium',
      0,
      jsonb_build_object('class_instance_id', r.instance_id::text)
    )
    returning id into new_task_id;

    update public.class_instances
    set task_id = new_task_id
    where id = r.instance_id;
  end loop;
end $$;

create unique index if not exists class_instances_task_id_unique
  on public.class_instances (task_id)
  where task_id is not null;

alter table public.class_instances
  alter column task_id set not null;
