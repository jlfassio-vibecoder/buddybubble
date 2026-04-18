-- Batch lookup for Kanban extract cache-aside (service_role RPC only).
-- Tie-break per normalized name: published first, then newest updated_at.

create or replace function public.exercise_dictionary_lookup_by_names(p_names text[])
returns setof public.exercise_dictionary
language sql
stable
set search_path = public
as $$
  select distinct on (lower(trim(d.name)))
    d.*
  from public.exercise_dictionary d
  inner join unnest(p_names) as q(raw_name)
    on lower(trim(d.name)) = lower(trim(q.raw_name))
    and trim(d.name) <> ''
    and trim(q.raw_name) <> ''
  where d.status in ('published', 'pending')
  order by
    lower(trim(d.name)),
    case when d.status = 'published' then 0 else 1 end,
    d.updated_at desc nulls last;
$$;

comment on function public.exercise_dictionary_lookup_by_names(text[]) is
  'Returns at most one exercise_dictionary row per distinct normalized name in p_names; prefers published over pending, then newest updated_at.';

revoke all on function public.exercise_dictionary_lookup_by_names(text[]) from public;
grant execute on function public.exercise_dictionary_lookup_by_names(text[]) to service_role;
