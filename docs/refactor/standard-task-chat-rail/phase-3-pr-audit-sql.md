# Phase 3 — PR audit SQL (paste results into PR description)

Run in **Supabase SQL editor** or `psql` against the target project (staging/prod as appropriate).  
Phase 0 baseline counts and known gaps: [phase-0-discovery-and-decisions.md](./phase-0-discovery-and-decisions.md) §3b (Query D — **2 `task` bubbles + 2 `workout` bubbles** without coach binding).

## Audit A — `coach` row active

```sql
select slug, is_active
from public.agent_definitions
where slug = 'coach';
```

## Audit B — Coach binding coverage per `item_type`

Run once per `item_type` that maps to `coach` in §3c (`task`, `event`, `experience`, `idea`, `memory`, `workout`, `workout_log`, `program`). Replace `$item_type` each run.

```sql
with bt as (
  select distinct bubble_id, item_type
  from public.tasks
  where archived_at is null
    and item_type = $item_type::text
)
select
  $item_type::text as item_type,
  count(distinct bt.bubble_id)::int as bubbles_with_type,
  count(distinct case when bab.bubble_id is not null then bt.bubble_id end)::int as bubbles_with_coach_binding
from bt
left join public.bubble_agent_bindings bab
  on bab.bubble_id = bt.bubble_id
  and bab.agent_definition_id = (select id from public.agent_definitions where slug = 'coach');
```

## Audit C — Coach `config` (routing / `excludeOnMentionOf`)

```sql
select slug, config
from public.agent_definitions
where slug = 'coach';
```

## `class` mapping

§3c maps `class` → **no** default slug (`null` in app). No binding audit required for default routing; document **N/A** in the PR table for coach-binding counts.
