-- Join time per membership; used for /app fallback when bb_last_workspace is missing or invalid.
alter table public.workspace_members
  add column if not exists created_at timestamptz not null default now();

create index if not exists workspace_members_user_created_at_idx
  on public.workspace_members (user_id, created_at desc);
