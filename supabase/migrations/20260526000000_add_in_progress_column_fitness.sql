-- Fitness workspaces: add Kanban "In Progress" column for workout_log drafts (status = in_progress).
-- Idempotent: skips workspaces that already have slug in_progress.

with fitness_missing as (
  select w.id as workspace_id
  from public.workspaces w
  where w.category_type = 'fitness'
    and not exists (
      select 1
      from public.board_columns bc
      where bc.workspace_id = w.id
        and bc.slug = 'in_progress'
    )
)
update public.board_columns bc
set position = bc.position + 1
from fitness_missing fm
where bc.workspace_id = fm.workspace_id
  and bc.slug in ('completed', 'vault')
  and bc.position >= 3;

with fitness_missing as (
  select w.id as workspace_id
  from public.workspaces w
  where w.category_type = 'fitness'
    and not exists (
      select 1
      from public.board_columns bc
      where bc.workspace_id = w.id
        and bc.slug = 'in_progress'
    )
)
insert into public.board_columns (workspace_id, name, slug, position)
select fm.workspace_id, 'In Progress', 'in_progress', 3
from fitness_missing fm;
