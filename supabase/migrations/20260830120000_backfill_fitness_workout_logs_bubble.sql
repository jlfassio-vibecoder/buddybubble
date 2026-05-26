-- Add the "Workout Logs" channel to fitness workspaces created before it was added to
-- WORKSPACE_SEED_BY_CATEGORY.fitness (Active Session routes workout_log drafts/completions here).
--
-- Idempotent: skips workspaces that already have a bubble named "Workout Logs".

insert into public.bubbles (workspace_id, name, icon)
select w.id, 'Workout Logs', 'Hash'
from public.workspaces w
where w.category_type = 'fitness'
  and not exists (
    select 1
    from public.bubbles b
    where b.workspace_id = w.id
      and b.name = 'Workout Logs'
  );

-- Relocate existing workout_log tasks into the Workout Logs bubble per workspace.
update public.tasks t
set bubble_id = wl.id
from public.bubbles wl
where t.item_type = 'workout_log'
  and wl.name = 'Workout Logs'
  and wl.workspace_id = (
    select b.workspace_id
    from public.bubbles b
    where b.id = t.bubble_id
  )
  and t.bubble_id is distinct from wl.id;
