-- System Analytics Sprint 1: workspace_ai_events + stripe_plan_catalog + RLS tier gating.
-- Product IDs are seeded separately (see 20260528120001_stripe_plan_catalog_seed.sql).
-- Retain workspace_ai_events for 12 months; cleanup job to be added in V2.

-- ── 1. Stripe plan catalog (env-portable product → plan_key mapping) ─────────

create table if not exists public.stripe_plan_catalog (
  stripe_product_id text        primary key,
  plan_key          text        not null,
  created_at        timestamptz not null default now()
);

comment on table public.stripe_plan_catalog is
  'Maps Stripe product IDs to internal plan keys. Seed rows per environment; RLS helpers join here — never hardcode prod_ IDs in functions.';

alter table public.stripe_plan_catalog enable row level security;

create policy "Authenticated users can read stripe plan catalog"
  on public.stripe_plan_catalog
  for select
  to authenticated
  using (true);

-- ── 2. workspace_ai_events ───────────────────────────────────────────────────

create table if not exists public.workspace_ai_events (
  id                uuid        primary key default gen_random_uuid(),
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  bubble_id         uuid        references public.bubbles(id) on delete set null,
  task_id           uuid        references public.tasks(id) on delete set null,
  actor_user_id     uuid        references auth.users(id) on delete set null,
  agent_slug        text        not null,
  surface           text,
  event_type        text        not null
    check (event_type in (
      'success',
      'error_truncated',
      'error_attestation',
      'error_parse',
      'error_shape',
      'error_http',
      'error_timeout',
      'error_auth',
      'error_other'
    )),
  error_kind        text,
  prompt_tokens     int,
  completion_tokens int,
  thoughts_tokens   int,
  latency_ms        int,
  model             text,
  request_id        text,
  metadata          jsonb       not null default '{}',
  created_at        timestamptz not null default now()
);

comment on table public.workspace_ai_events is
  'AI generation observability for premium-tier workspace admins. One row per agent-dispatch Vertex attempt (success or classified error). Retain 12 months; archive/delete older rows via scheduled job.';

create index if not exists workspace_ai_events_workspace_created
  on public.workspace_ai_events (workspace_id, created_at desc);

create index if not exists workspace_ai_events_workspace_type_created
  on public.workspace_ai_events (workspace_id, event_type, created_at desc);

create index if not exists workspace_ai_events_task_id
  on public.workspace_ai_events (task_id);

create index if not exists workspace_ai_events_request_id
  on public.workspace_ai_events (request_id);

-- ── 3. Tier gate helper ──────────────────────────────────────────────────────

create or replace function public.workspace_has_system_analytics_access(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_subscriptions ws
    join public.stripe_plan_catalog spc
      on spc.stripe_product_id = ws.stripe_product_id
    where ws.workspace_id = p_workspace_id
      and ws.status in ('trialing', 'active')
      and spc.plan_key in ('studio', 'studio_pro', 'coach_pro')
  );
$$;

comment on function public.workspace_has_system_analytics_access(uuid) is
  'True when workspace has trialing/active subscription on studio, studio_pro, or coach_pro (via stripe_plan_catalog).';

grant execute on function public.workspace_has_system_analytics_access(uuid) to authenticated;
grant execute on function public.workspace_has_system_analytics_access(uuid) to service_role;

-- ── 4. RLS on workspace_ai_events ────────────────────────────────────────────

alter table public.workspace_ai_events enable row level security;

create policy "Premium workspace admins can read system analytics"
  on public.workspace_ai_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_ai_events.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
    and public.workspace_has_system_analytics_access(workspace_ai_events.workspace_id)
  );

create policy "Admins can read all system analytics"
  on public.workspace_ai_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_admin = true
    )
  );

-- No INSERT/UPDATE/DELETE policies — service role writes from Edge only.
