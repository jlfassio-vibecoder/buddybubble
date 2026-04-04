-- BuddyBubble: multi-tenant Silo schema (workspace isolation via RLS)
-- Apply in Supabase SQL Editor or: supabase db push

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_type text not null check (category_type in ('business', 'kids', 'class')),
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index workspaces_created_by_idx on public.workspaces (created_by);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member', 'guest')),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.bubbles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  icon text,
  created_at timestamptz not null default now()
);

create index bubbles_workspace_id_idx on public.bubbles (workspace_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  bubble_id uuid not null references public.bubbles (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  content text not null default '',
  parent_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create index messages_bubble_created_idx on public.messages (bubble_id, created_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  bubble_id uuid not null references public.bubbles (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  position double precision not null default 0,
  assigned_to uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index tasks_bubble_id_idx on public.tasks (bubble_id);

-- ---------------------------------------------------------------------------
-- Helper functions (RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'admin'
  );
$$;

create or replace function public.can_write_workspace(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('admin', 'member')
  );
$$;

create or replace function public.workspace_id_for_bubble(_bubble_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select b.workspace_id from public.bubbles b where b.id = _bubble_id;
$$;

-- ---------------------------------------------------------------------------
-- Auth: profile row per auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.bubbles enable row level security;
alter table public.messages enable row level security;
alter table public.tasks enable row level security;

-- users: self read/update
create policy users_select_own on public.users
  for select using (id = auth.uid());

create policy users_update_own on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- workspaces
create policy workspaces_select on public.workspaces
  for select using (
    created_by = auth.uid() or public.is_workspace_member(id)
  );

create policy workspaces_insert on public.workspaces
  for insert with check (
    auth.uid() is not null and created_by = auth.uid()
  );

create policy workspaces_update on public.workspaces
  for update using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));

create policy workspaces_delete on public.workspaces
  for delete using (public.is_workspace_admin(id));

-- workspace_members
create policy workspace_members_select on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

create policy workspace_members_insert on public.workspace_members
  for insert with check (
    (user_id = auth.uid() and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.created_by = auth.uid()
    ))
    or public.is_workspace_admin(workspace_id)
  );

create policy workspace_members_update on public.workspace_members
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_members_delete on public.workspace_members
  for delete using (public.is_workspace_admin(workspace_id));

-- bubbles
create policy bubbles_select on public.bubbles
  for select using (public.is_workspace_member(workspace_id));

create policy bubbles_insert on public.bubbles
  for insert with check (public.can_write_workspace(workspace_id));

create policy bubbles_update on public.bubbles
  for update using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

create policy bubbles_delete on public.bubbles
  for delete using (public.can_write_workspace(workspace_id));

-- messages (scope via bubble -> workspace)
create policy messages_select on public.messages
  for select using (
    public.is_workspace_member(public.workspace_id_for_bubble(bubble_id))
  );

create policy messages_insert on public.messages
  for insert with check (
    user_id = auth.uid()
    and public.can_write_workspace(public.workspace_id_for_bubble(bubble_id))
  );

create policy messages_update on public.messages
  for update using (
    user_id = auth.uid()
    and public.can_write_workspace(public.workspace_id_for_bubble(bubble_id))
  )
  with check (
    user_id = auth.uid()
    and public.can_write_workspace(public.workspace_id_for_bubble(bubble_id))
  );

create policy messages_delete on public.messages
  for delete using (
    public.can_write_workspace(public.workspace_id_for_bubble(bubble_id))
    and (user_id = auth.uid() or public.is_workspace_admin(public.workspace_id_for_bubble(bubble_id)))
  );

-- tasks
create policy tasks_select on public.tasks
  for select using (
    public.is_workspace_member(public.workspace_id_for_bubble(bubble_id))
  );

create policy tasks_insert on public.tasks
  for insert with check (
    public.can_write_workspace(public.workspace_id_for_bubble(bubble_id))
  );

create policy tasks_update on public.tasks
  for update using (public.can_write_workspace(public.workspace_id_for_bubble(bubble_id)))
  with check (public.can_write_workspace(public.workspace_id_for_bubble(bubble_id)));

create policy tasks_delete on public.tasks
  for delete using (public.can_write_workspace(public.workspace_id_for_bubble(bubble_id)));

-- ---------------------------------------------------------------------------
-- Realtime: postgres_changes on messages & tasks
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.tasks;

alter table public.messages replica identity full;
alter table public.tasks replica identity full;
