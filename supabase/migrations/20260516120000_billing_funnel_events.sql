-- Billing checkout funnel + Stripe webhook diagnostics (insert via service role from Next.js only).
-- RLS enabled with no policies → PostgREST denies anon/authenticated; service_role bypasses RLS.

create table if not exists public.billing_funnel_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  billing_attempt_id uuid,
  workspace_id uuid references public.workspaces (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  environment text not null,
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  source text not null check (source in ('client', 'server')),
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  client_session_id text,
  stripe_event_id text
);

create unique index if not exists billing_funnel_events_stripe_event_id_uidx
  on public.billing_funnel_events (stripe_event_id)
  where stripe_event_id is not null;

create index if not exists billing_funnel_events_workspace_created_idx
  on public.billing_funnel_events (workspace_id, created_at desc);

create index if not exists billing_funnel_events_user_created_idx
  on public.billing_funnel_events (user_id, created_at desc);

create index if not exists billing_funnel_events_attempt_idx
  on public.billing_funnel_events (billing_attempt_id);

create index if not exists billing_funnel_events_event_key_created_idx
  on public.billing_funnel_events (event_key, created_at desc);

alter table public.billing_funnel_events enable row level security;

comment on table public.billing_funnel_events is
  'Checkout funnel + billing diagnostics; written by Next API routes using the service role.';
