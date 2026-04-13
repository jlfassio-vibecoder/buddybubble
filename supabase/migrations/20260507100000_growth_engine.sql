-- Growth Engine: analytics_events table + is_admin flag on users
--
-- Data retention: raw events are retained for 12 months.
-- A scheduled job (V2) should delete rows older than 12 months.
-- Example: DELETE FROM analytics_events WHERE created_at < now() - interval '12 months';

-- ── 1. Add is_admin flag to users ───────────────────────────────────────────
-- Used to guard the /admin/growth founder dashboard.
-- Only set manually by a Supabase admin; no UI to toggle in V1.

alter table public.users
  add column if not exists is_admin boolean not null default false;

-- ── 2. analytics_events table ───────────────────────────────────────────────

create table if not exists public.analytics_events (
  id           uuid        primary key default gen_random_uuid(),
  event_type   text        not null,
  workspace_id uuid        references public.workspaces(id) on delete set null,
  user_id      uuid        references auth.users(id) on delete set null,
  lead_id      uuid        references public.leads(id) on delete set null,
  session_id   text,
  path         text,
  metadata     jsonb       not null default '{}',
  created_at   timestamptz not null default now()
);

comment on table public.analytics_events is
  'First-party analytics. All funnel, feature-gate, and navigation events.
   Retain for 12 months; archive/delete older rows via scheduled job.';

-- ── 3. Indexes ───────────────────────────────────────────────────────────────

create index if not exists analytics_events_workspace_created
  on public.analytics_events (workspace_id, created_at desc);

create index if not exists analytics_events_type_created
  on public.analytics_events (event_type, created_at desc);

create index if not exists analytics_events_user_created
  on public.analytics_events (user_id, created_at desc);

create index if not exists analytics_events_session
  on public.analytics_events (session_id);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

alter table public.analytics_events enable row level security;

-- Workspace owners can read events for their own workspaces.
create policy "Workspace owners can read their analytics"
  on public.analytics_events
  for select
  using (
    workspace_id is not null
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = analytics_events.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- Internal admins can read all events (uses the is_admin flag on users).
create policy "Admins can read all analytics"
  on public.analytics_events
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.is_admin = true
    )
  );

-- No direct client inserts — all writes go through the service role API.
-- (No INSERT policy = only service role can write.)
