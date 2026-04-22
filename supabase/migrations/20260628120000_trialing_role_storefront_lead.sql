-- Storefront Lead separation: introduce `trialing` workspace_members.role.
--
-- Context:
--   We are enforcing a strict separation between the Invitation workflow
--   ("Social Space" — roles: owner/admin/member/guest) and the Storefront
--   Lead workflow ("Workspace" — role: trialing, 3-day Reverse Trial).
--
--   Existing `guest` retains its restricted semantics for explicit-access-only
--   invitees (Social Space). `trialing` is a new role issued only by the
--   storefront intake API and behaves like a full member for the trial window,
--   so the Reverse Trial Kanban/Calendar/Workout surfaces work end-to-end.
--
-- Schema model:
--   `workspace_members.role` is a TEXT column with a CHECK constraint
--   (see supabase/migrations/20260427100000_rbac_granular_permissions.sql),
--   NOT a Postgres ENUM. This migration extends the CHECK and re-creates the
--   two RLS helper SQL functions that enumerate the "member-ish" roles.
--
-- Policies:
--   `tasks_select` / `tasks_update` (latest definitions in
--   20260624120000_live_session_deck_and_task_assignees.sql) do not embed
--   explicit `role in ('member')` predicates — they delegate to
--   `can_view_bubble` / `can_write_bubble` and gate the guest branch on
--   `is_workspace_guest()`. Updating the two helpers below is sufficient for
--   trialing users to get the same task SELECT/UPDATE path as members.
--
--   `is_workspace_guest()` is intentionally NOT widened to include trialing:
--   trialing users should bypass the guest-restricted branch entirely and take
--   the non-guest `can_view_bubble` / `can_write_bubble` path. Leaving the
--   helper narrow is what keeps Social Space guests restricted.

-- ---------------------------------------------------------------------------
-- 1. Extend workspace_members.role CHECK constraint to include 'trialing'
-- ---------------------------------------------------------------------------

alter table public.workspace_members
  drop constraint workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check
    check (role in ('owner', 'admin', 'member', 'guest', 'trialing'));

comment on column public.workspace_members.role is
  'owner: full control + billing; admin: manage workspace/members; member: write access to public bubbles; guest: explicit-access only (Social Space invites); trialing: Storefront Lead reverse-trial (acts like member during trial_expires_at window).';

-- ---------------------------------------------------------------------------
-- 2. Update can_view_bubble to treat trialing users like members
-- ---------------------------------------------------------------------------
-- Owner/admin always; member or trialing if not private; any explicit bubble_member.

create or replace function public.can_view_bubble(_bubble_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_workspace_admin(public.workspace_id_for_bubble(_bubble_id))
    or (
      not (select coalesce(b.is_private, false) from public.bubbles b where b.id = _bubble_id)
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.workspace_id_for_bubble(_bubble_id)
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'member', 'trialing')
      )
    )
    or exists (
      select 1 from public.bubble_members bm
      where bm.bubble_id = _bubble_id
        and bm.user_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Update can_write_bubble to treat trialing users like members
-- ---------------------------------------------------------------------------
-- Owner/admin always; member or trialing for non-private; bubble_member editor.

create or replace function public.can_write_bubble(_bubble_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_workspace_admin(public.workspace_id_for_bubble(_bubble_id))
    or (
      not (select coalesce(b.is_private, false) from public.bubbles b where b.id = _bubble_id)
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.workspace_id_for_bubble(_bubble_id)
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'member', 'trialing')
      )
    )
    or exists (
      select 1 from public.bubble_members bm
      where bm.bubble_id = _bubble_id
        and bm.user_id = auth.uid()
        and bm.role = 'editor'
    );
$$;
