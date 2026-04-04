-- Per-workspace Kanban column definitions; task.status stores board_columns.slug for that workspace.
create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  position int not null,
  created_at timestamptz not null default now(),
  constraint board_columns_workspace_slug_unique unique (workspace_id, slug)
);

create index if not exists board_columns_workspace_position_idx
  on public.board_columns (workspace_id, position);

alter table public.board_columns enable row level security;

create policy board_columns_select on public.board_columns
  for select using (public.is_workspace_member(workspace_id));

create policy board_columns_insert on public.board_columns
  for insert with check (public.can_write_workspace(workspace_id));

create policy board_columns_update on public.board_columns
  for update using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

create policy board_columns_delete on public.board_columns
  for delete using (public.can_write_workspace(workspace_id));
