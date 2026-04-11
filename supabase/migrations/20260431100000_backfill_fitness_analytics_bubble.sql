-- One-off: add the "Analytics" channel to fitness workspaces created before it was added to
-- WORKSPACE_SEED_BY_CATEGORY.fitness (dashboard shows AnalyticsBoard when a bubble named "Analytics" is selected).
--
-- Idempotent: skips workspaces that already have a bubble named "Analytics".

insert into public.bubbles (workspace_id, name, icon)
select w.id, 'Analytics', 'Hash'
from public.workspaces w
where w.category_type = 'fitness'
  and not exists (
    select 1
    from public.bubbles b
    where b.workspace_id = w.id
      and b.name = 'Analytics'
  );
