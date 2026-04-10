-- Shared admin notes about a workspace member (one row per workspace + subject user).
-- Visible only to workspace owners/admins via RLS — not to members or guests.
-- Idempotent: safe to re-run if the table already exists (e.g. partial apply + retry).

create table if not exists public.workspace_member_notes (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subject_user_id uuid not null references public.users (id) on delete cascade,
  body text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  primary key (workspace_id, subject_user_id)
);

comment on table public.workspace_member_notes is
  'Shared notes about a member, visible only to workspace owners and admins.';

-- Force audit fields server-side so admins cannot spoof attribution via the API.
create or replace function public.set_workspace_member_notes_audit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_workspace_member_notes_audit on public.workspace_member_notes;
create trigger set_workspace_member_notes_audit
  before insert or update on public.workspace_member_notes
  for each row execute procedure public.set_workspace_member_notes_audit();

alter table public.workspace_member_notes enable row level security;

drop policy if exists workspace_member_notes_select on public.workspace_member_notes;
create policy workspace_member_notes_select on public.workspace_member_notes
  for select using (public.is_workspace_admin (workspace_id));

drop policy if exists workspace_member_notes_insert on public.workspace_member_notes;
create policy workspace_member_notes_insert on public.workspace_member_notes
  for insert with check (
    public.is_workspace_admin (workspace_id)
    and auth.uid() is not null
    and updated_by = auth.uid()
  );

drop policy if exists workspace_member_notes_update on public.workspace_member_notes;
create policy workspace_member_notes_update on public.workspace_member_notes
  for update using (public.is_workspace_admin (workspace_id))
  with check (
    public.is_workspace_admin (workspace_id)
    and auth.uid() is not null
    and updated_by = auth.uid()
  );

drop policy if exists workspace_member_notes_delete on public.workspace_member_notes;
create policy workspace_member_notes_delete on public.workspace_member_notes
  for delete using (public.is_workspace_admin (workspace_id));
