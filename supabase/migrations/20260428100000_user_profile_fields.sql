-- Add bio and children_names (family members) to the users table.
--
-- bio             — free-text self-description; shown to workspace peers.
-- children_names  — string[] jsonb; used by caregivers in Kids/Community workspaces.
--
-- Both columns are covered by the existing users_update_own and
-- users_select_workspace_peers RLS policies (they already SELECT / UPDATE *).
-- No policy changes required.

alter table public.users
  add column if not exists bio text,
  add column if not exists children_names jsonb not null default '[]'::jsonb;

comment on column public.users.bio is
  'Optional self-description shown to workspace peers.';

comment on column public.users.children_names is
  'Account-level family/children names for Kids and Community workspace caregivers. '
  'Shape: string[]. Validated in application layer (max 8 names, 64 chars each).';

-- GIN index enables future jsonb_array_elements_text queries (e.g. find all
-- caregivers of a child named "Alex"). Low cost at current table sizes.
create index if not exists users_children_names_gin
  on public.users using gin (children_names);
