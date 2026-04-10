-- Backfill workspace creator rows to role = 'owner'.
--
-- RBAC migration 20260427100000 added 'owner' to workspace_members.role but did not migrate
-- existing data. Creators were inserted as 'admin' (see createWorkspaceCore). This aligns
-- workspace_members with workspaces.created_by for all existing workspaces.
--
-- Only updates rows where the member is the workspace creator and still 'admin' (idempotent
-- if re-run after partial apply).

update public.workspace_members wm
set role = 'owner'
from public.workspaces w
where w.id = wm.workspace_id
  and w.created_by = wm.user_id
  and wm.role = 'admin';
