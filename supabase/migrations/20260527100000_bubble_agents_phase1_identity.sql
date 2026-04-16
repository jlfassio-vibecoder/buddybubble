-- Phase 1: Bubble Agents — identity schema + RLS (structural only).
-- Data: run scripts/provision-agents.ts (pnpm db:provision-agents). Bubble bindings: SQL example at file end.

-- ---------------------------------------------------------------------------
-- 1. public.users: flag for service / bot identities
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists is_agent boolean not null default false;

comment on column public.users.is_agent is
  'True for Bubble Agent identities (paired with public.agent_definitions.auth_user_id).';

-- ---------------------------------------------------------------------------
-- 2. public.agent_definitions (one auth user per definition)
-- ---------------------------------------------------------------------------

create table if not exists public.agent_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  mention_handle text not null,
  display_name text not null,
  auth_user_id uuid not null references public.users (id) on delete restrict,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint agent_definitions_slug_key unique (slug),
  constraint agent_definitions_auth_user_id_key unique (auth_user_id)
);

create index if not exists agent_definitions_is_active_idx
  on public.agent_definitions (is_active)
  where is_active;

comment on table public.agent_definitions is
  'Catalog of Bubble Agents; auth_user_id is messages.user_id when the agent posts.';

comment on column public.agent_definitions.slug is
  'Stable program key (e.g. coach).';

comment on column public.agent_definitions.mention_handle is
  'Token after @ for matching (often same as slug).';

comment on column public.agent_definitions.display_name is
  'Shown in @ mention UI; should match RichMessageComposer mention name (e.g. Coach).';

-- ---------------------------------------------------------------------------
-- 3. public.bubble_agent_bindings
-- ---------------------------------------------------------------------------

create table if not exists public.bubble_agent_bindings (
  id uuid primary key default gen_random_uuid(),
  bubble_id uuid not null references public.bubbles (id) on delete cascade,
  agent_definition_id uuid not null references public.agent_definitions (id) on delete cascade,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint bubble_agent_bindings_bubble_agent_key unique (bubble_id, agent_definition_id)
);

create index if not exists bubble_agent_bindings_bubble_enabled_sort_idx
  on public.bubble_agent_bindings (bubble_id, enabled, sort_order);

comment on table public.bubble_agent_bindings is
  'Which agents are available in which bubble (mentions + future tool bubble_id).';

-- ---------------------------------------------------------------------------
-- 4. RLS: new tables
-- ---------------------------------------------------------------------------

alter table public.agent_definitions enable row level security;
alter table public.bubble_agent_bindings enable row level security;

-- Definitions readable when the viewer can see at least one bubble that binds this agent.
drop policy if exists agent_definitions_select on public.agent_definitions;
create policy agent_definitions_select on public.agent_definitions
  for select using (
    auth.uid() is not null
    and agent_definitions.is_active
    and exists (
      select 1
      from public.bubble_agent_bindings bab
      where bab.agent_definition_id = agent_definitions.id
        and bab.enabled
        and public.can_view_bubble(bab.bubble_id)
    )
  );

drop policy if exists bubble_agent_bindings_select on public.bubble_agent_bindings;
create policy bubble_agent_bindings_select on public.bubble_agent_bindings
  for select using (
    auth.uid() is not null
    and public.can_view_bubble(bubble_id)
  );

drop policy if exists bubble_agent_bindings_insert on public.bubble_agent_bindings;
create policy bubble_agent_bindings_insert on public.bubble_agent_bindings
  for insert with check (
    auth.uid() is not null
    and public.can_write_bubble(bubble_id)
  );

drop policy if exists bubble_agent_bindings_update on public.bubble_agent_bindings;
create policy bubble_agent_bindings_update on public.bubble_agent_bindings
  for update using (
    auth.uid() is not null
    and public.can_write_bubble(bubble_id)
  )
  with check (
    auth.uid() is not null
    and public.can_write_bubble(bubble_id)
  );

drop policy if exists bubble_agent_bindings_delete on public.bubble_agent_bindings;
create policy bubble_agent_bindings_delete on public.bubble_agent_bindings
  for delete using (
    auth.uid() is not null
    and public.can_write_bubble(bubble_id)
  );

-- ---------------------------------------------------------------------------
-- 5. RLS: read agent user rows for chat (no workspace_members row for bots)
-- ---------------------------------------------------------------------------

drop policy if exists users_select_agent_identity_for_workspace_member on public.users;
create policy users_select_agent_identity_for_workspace_member on public.users
  for select using (
    auth.uid() is not null
    and exists (
      select 1
      from public.agent_definitions ad
      join public.bubble_agent_bindings bab on bab.agent_definition_id = ad.id and bab.enabled
      join public.bubbles b on b.id = bab.bubble_id
      where ad.auth_user_id = users.id
        and ad.is_active
        and public.is_workspace_member(b.workspace_id)
    )
  );

-- Bot Auth users and public.agent_definitions rows are provisioned outside migrations
-- (GoTrue + Admin API). See scripts/provision-agents.ts and pnpm db:provision-agents.

-- Example: bind provisioned agents to a bubble (run in SQL Editor after provisioning):
--   insert into public.bubble_agent_bindings (bubble_id, agent_definition_id, sort_order, enabled)
--   select '<your-bubble-uuid>', id, row_number() over (order by slug), true
--   from public.agent_definitions
--   where slug in ('coach', 'organizer')
--   on conflict (bubble_id, agent_definition_id) do nothing;
