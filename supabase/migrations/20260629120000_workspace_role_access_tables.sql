-- Trial & Member Access: normalized tables for granular per-role permissions.
--
-- Part of the Social Space / Workspace separation: owners of paid workspace
-- categories (business / fitness) can scope what `trialing` and `member` roles
-- can do (AI, live video, analytics, etc.) and which bubbles those roles land
-- in by default, without touching baseline Kanban/Workout/chat RLS.
--
-- Design notes:
--   * Rejected JSONB on `workspaces` in favor of strict relational tables so we
--     get referential integrity (bubble CASCADE on delete), indexable lookups,
--     and future per-flag audit history.
--   * `role` is free-text to mirror `workspace_members.role` (TEXT + CHECK).
--     We constrain the same set here so a future role addition only requires
--     updating the CHECK on `workspace_members` and these tables in lockstep.
--   * Feature keys are free-text to avoid a migration for every new feature;
--     the UI / API layer owns the canonical key list.

-- ---------------------------------------------------------------------------
-- 1. workspace_role_feature_flags
-- ---------------------------------------------------------------------------

create table public.workspace_role_feature_flags (
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  role         text        not null
                 check (role in ('owner', 'admin', 'member', 'guest', 'trialing')),
  feature_key  text        not null check (length(feature_key) between 1 and 64),
  is_enabled   boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, role, feature_key)
);

create index workspace_role_feature_flags_workspace_idx
  on public.workspace_role_feature_flags (workspace_id);

comment on table public.workspace_role_feature_flags is
  'Per-role, per-feature allow list (e.g. ai, live_video, analytics) scoped to a workspace. '
  'Enforced by API/Server Actions on top of RLS baselines.';
comment on column public.workspace_role_feature_flags.feature_key is
  'App-owned feature identifier (e.g. "ai", "live_video", "analytics"). Free-text to avoid migrations per new feature.';

-- ---------------------------------------------------------------------------
-- 2. workspace_role_default_bubbles
-- ---------------------------------------------------------------------------
-- Bubbles that new members of a given role should be auto-joined to (or
-- surfaced by default). Pure allow-list; RLS on bubbles/bubble_members still
-- governs actual read/write.

create table public.workspace_role_default_bubbles (
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  role         text        not null
                 check (role in ('owner', 'admin', 'member', 'guest', 'trialing')),
  bubble_id    uuid        not null references public.bubbles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, role, bubble_id)
);

create index workspace_role_default_bubbles_workspace_idx
  on public.workspace_role_default_bubbles (workspace_id);
create index workspace_role_default_bubbles_bubble_idx
  on public.workspace_role_default_bubbles (bubble_id);

comment on table public.workspace_role_default_bubbles is
  'Per-role default bubble allow list for a workspace (e.g. trialing lands in selected bubbles). '
  'ON DELETE CASCADE on bubble_id guarantees integrity when a bubble is removed.';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
-- SELECT: any workspace member may read the policy (UI needs visibility).
-- INSERT/UPDATE/DELETE: owner or admin only, via is_workspace_admin() helper
-- (defined in 20260427100000_rbac_granular_permissions.sql; owner + admin).

alter table public.workspace_role_feature_flags enable row level security;
alter table public.workspace_role_default_bubbles enable row level security;

-- feature flags ------------------------------------------------------------

create policy workspace_role_feature_flags_select
  on public.workspace_role_feature_flags
  for select using (public.is_workspace_member(workspace_id));

create policy workspace_role_feature_flags_insert
  on public.workspace_role_feature_flags
  for insert with check (public.is_workspace_admin(workspace_id));

create policy workspace_role_feature_flags_update
  on public.workspace_role_feature_flags
  for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_role_feature_flags_delete
  on public.workspace_role_feature_flags
  for delete using (public.is_workspace_admin(workspace_id));

-- default bubbles ----------------------------------------------------------

create policy workspace_role_default_bubbles_select
  on public.workspace_role_default_bubbles
  for select using (public.is_workspace_member(workspace_id));

create policy workspace_role_default_bubbles_insert
  on public.workspace_role_default_bubbles
  for insert with check (public.is_workspace_admin(workspace_id));

create policy workspace_role_default_bubbles_update
  on public.workspace_role_default_bubbles
  for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_role_default_bubbles_delete
  on public.workspace_role_default_bubbles
  for delete using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger for feature flags
-- ---------------------------------------------------------------------------

create or replace function public.tg_workspace_role_feature_flags_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspace_role_feature_flags_touch_updated_at
  before update on public.workspace_role_feature_flags
  for each row
  execute function public.tg_workspace_role_feature_flags_touch_updated_at();
