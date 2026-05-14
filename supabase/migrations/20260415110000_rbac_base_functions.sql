-- RBAC base: bubble visibility/write helpers + their schema prerequisites.
--
-- These objects originally lived in `20260427100000_rbac_granular_permissions.sql`,
-- but `20260416000000_normalize_task_collections_and_unified_chat.sql` (which runs
-- *before* April 27 in filename order) calls `public.can_write_bubble` /
-- `public.can_view_bubble`. Pre-MVP we are rewriting history rather than carrying
-- a stub: the schema additions and function definitions that the April 16 file
-- needs are moved here, in their final form, ahead of April 16.
--
-- Counterparts removed from `20260427100000`: `bubbles.is_private` column,
-- `bubble_members` table + RLS, `can_view_bubble`, `can_write_bubble`. Section
-- numbers in that file's header comment continue to refer to the historical layout.

-- ---------------------------------------------------------------------------
-- 1. Add is_private to bubbles
-- ---------------------------------------------------------------------------

alter table public.bubbles
  add column if not exists is_private boolean not null default false;

comment on column public.bubbles.is_private is
  'When true, only owners/admins and explicit bubble_members can see this bubble.';

-- ---------------------------------------------------------------------------
-- 2. bubble_members junction table
-- ---------------------------------------------------------------------------

create table if not exists public.bubble_members (
  id         uuid        primary key default gen_random_uuid(),
  bubble_id  uuid        not null references public.bubbles (id) on delete cascade,
  user_id    uuid        not null references public.users (id) on delete cascade,
  role       text        not null default 'viewer'
               check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (bubble_id, user_id)
);

create index if not exists bubble_members_bubble_id_idx on public.bubble_members (bubble_id);
create index if not exists bubble_members_user_id_idx   on public.bubble_members (user_id);

comment on table public.bubble_members is
  'Per-bubble access grants. editor: can create/edit tasks + message. viewer: read tasks + message only.';

-- ---------------------------------------------------------------------------
-- 3. RLS for bubble_members
-- ---------------------------------------------------------------------------

alter table public.bubble_members enable row level security;

drop policy if exists bubble_members_select on public.bubble_members;
drop policy if exists bubble_members_insert_admin on public.bubble_members;
drop policy if exists bubble_members_update_admin on public.bubble_members;
drop policy if exists bubble_members_delete_admin on public.bubble_members;

-- Admins/owners see all members of their bubbles; users see their own records.
create policy bubble_members_select on public.bubble_members
  for select using (
    public.is_workspace_admin(
      (select workspace_id from public.bubbles where id = bubble_id)
    )
    or user_id = auth.uid()
  );

create policy bubble_members_insert_admin on public.bubble_members
  for insert with check (
    public.is_workspace_admin(
      (select workspace_id from public.bubbles where id = bubble_id)
    )
  );

create policy bubble_members_update_admin on public.bubble_members
  for update
  using (public.is_workspace_admin(
    (select workspace_id from public.bubbles where id = bubble_id)
  ))
  with check (public.is_workspace_admin(
    (select workspace_id from public.bubbles where id = bubble_id)
  ));

create policy bubble_members_delete_admin on public.bubble_members
  for delete using (
    public.is_workspace_admin(
      (select workspace_id from public.bubbles where id = bubble_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. can_view_bubble: owner/admin always; member if not private; any explicit bubble_member
--    NOTE: uses SECURITY DEFINER so the internal bubbles/bubble_members queries bypass RLS.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_bubble(_bubble_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    -- workspace owner/admin bypass
    public.is_workspace_admin(public.workspace_id_for_bubble(_bubble_id))
    -- workspace member can see non-private bubbles
    or (
      not (select coalesce(b.is_private, false) from public.bubbles b where b.id = _bubble_id)
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.workspace_id_for_bubble(_bubble_id)
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'member')
      )
    )
    -- explicit bubble_member grant (editor or viewer — any role sees the bubble)
    or exists (
      select 1 from public.bubble_members bm
      where bm.bubble_id = _bubble_id
        and bm.user_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- 5. can_write_bubble: owner/admin always; member for non-private; bubble_member with editor role
-- ---------------------------------------------------------------------------

create or replace function public.can_write_bubble(_bubble_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    -- workspace owner/admin bypass
    public.is_workspace_admin(public.workspace_id_for_bubble(_bubble_id))
    -- workspace member (non-private bubbles only)
    or (
      not (select coalesce(b.is_private, false) from public.bubbles b where b.id = _bubble_id)
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.workspace_id_for_bubble(_bubble_id)
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'member')
      )
    )
    -- explicit bubble_member with editor role
    or exists (
      select 1 from public.bubble_members bm
      where bm.bubble_id = _bubble_id
        and bm.user_id = auth.uid()
        and bm.role = 'editor'
    );
$$;
