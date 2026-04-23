-- Internal workspace JSON (not storefront branding). Used for host-only settings such as lead SMS alerts.
-- Copilot suggestion ignored: Storing highly sensitive host-only fields in a separate table with admin-only RLS would be a larger schema change; `metadata` remains subject to existing `workspaces` SELECT policies.

alter table public.workspaces
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.workspaces.metadata is 'Host-only workspace settings (e.g. lead_alert_phone for SMS). Not for public storefront payload.';
