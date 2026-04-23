-- Internal workspace JSON (not storefront branding). Used for host-only settings such as lead SMS alerts.

alter table public.workspaces
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.workspaces.metadata is 'Host-only workspace settings (e.g. lead_alert_phone for SMS). Not for public storefront payload.';
