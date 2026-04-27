-- One-off: ensure every bubble in a fitness workspace has an enabled Coach binding.
-- Fitness creation paths now insert this at bubble create time; this backfills older rows.
-- Idempotent: ON CONFLICT DO NOTHING on (bubble_id, agent_definition_id).

insert into public.bubble_agent_bindings (bubble_id, agent_definition_id, sort_order, enabled)
select b.id, ad.id, 0, true
from public.bubbles b
inner join public.workspaces w on w.id = b.workspace_id and w.category_type = 'fitness'
inner join public.agent_definitions ad on ad.slug = 'coach' and ad.is_active
where not exists (
  select 1
  from public.bubble_agent_bindings bab
  inner join public.agent_definitions ad2 on ad2.id = bab.agent_definition_id
  where bab.bubble_id = b.id
    and bab.enabled
    and ad2.slug = 'coach'
    and ad2.is_active
)
on conflict (bubble_id, agent_definition_id) do nothing;
