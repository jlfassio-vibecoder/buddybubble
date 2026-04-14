-- Phase 1: storefront lead onboarding (see docs/tdd-lead-onboarding.md).
-- workspace_members: member preview window + onboarding lifecycle
-- bubbles: bubble_type for trial vs dm vs standard navigation
-- leads: widen source for storefront_organic / storefront_paid

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------

alter table public.workspace_members
  add column if not exists trial_expires_at timestamptz null;

alter table public.workspace_members
  add column if not exists onboarding_status text not null default 'completed';

alter table public.workspace_members
  drop constraint if exists workspace_members_onboarding_status_check;

alter table public.workspace_members
  add constraint workspace_members_onboarding_status_check
  check (onboarding_status in ('completed', 'trial_active', 'trial_expired'));

comment on column public.workspace_members.trial_expires_at is
  'End of member preview window for storefront soft-trial (socialspace-scoped). Null = no trial.';

comment on column public.workspace_members.onboarding_status is
  'Member onboarding / trial lifecycle: completed (default), trial_active, trial_expired.';

create index if not exists workspace_members_trial_expires_idx
  on public.workspace_members (trial_expires_at)
  where trial_expires_at is not null;

-- ---------------------------------------------------------------------------
-- bubbles
-- ---------------------------------------------------------------------------

alter table public.bubbles
  add column if not exists bubble_type text not null default 'standard';

alter table public.bubbles
  drop constraint if exists bubbles_bubble_type_check;

alter table public.bubbles
  add constraint bubbles_bubble_type_check
  check (bubble_type in ('standard', 'trial', 'dm'));

comment on column public.bubbles.bubble_type is
  'standard: default channels; trial: storefront soft-trial; dm: established 1:1 coach–client. UI filters Member Manager / sidebar.';

-- ---------------------------------------------------------------------------
-- leads.source (invite + storefront)
-- ---------------------------------------------------------------------------

alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (source in (
    'qr', 'link', 'email', 'sms', 'direct',
    'storefront_organic', 'storefront_paid'
  ));

comment on table public.leads is
  'Workspace-scoped leads: invite visitors (/api/leads/track) and storefront soft-trial (/api/leads/storefront-trial). '
  'Rows are written server-side with the service role.';
