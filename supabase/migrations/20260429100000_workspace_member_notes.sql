-- Shared admin notes about a workspace member (one row per workspace + subject user).
-- Visible only to workspace owners/admins via RLS — not to members or guests.

create table public.workspace_member_notes (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subject_user_id uuid not null references public.users (id) on delete cascade,
  body text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  primary key (workspace_id, subject_user_id)
);

comment on table public.workspace_member_notes is
  'Shared notes about a member, visible only to workspace owners and admins.';

alter table public.workspace_member_notes enable row level security;

create policy workspace_member_notes_select on public.workspace_member_notes
  for select using (public.is_workspace_admin (workspace_id));

create policy workspace_member_notes_insert on public.workspace_member_notes
  for insert with check (public.is_workspace_admin (workspace_id));

create policy workspace_member_notes_update on public.workspace_member_notes
  for update using (public.is_workspace_admin (workspace_id))
  with check (public.is_workspace_admin (workspace_id));

create policy workspace_member_notes_delete on public.workspace_member_notes
  for delete using (public.is_workspace_admin (workspace_id));
