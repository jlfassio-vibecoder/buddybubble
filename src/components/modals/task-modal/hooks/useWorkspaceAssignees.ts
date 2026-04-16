'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';

export type WorkspaceAssigneeOption = { user_id: string; label: string };

export function useWorkspaceAssignees(
  open: boolean,
  workspaceId: string,
): WorkspaceAssigneeOption[] {
  const [workspaceMembersForAssign, setWorkspaceMembersForAssign] = useState<
    WorkspaceAssigneeOption[]
  >([]);

  useEffect(() => {
    if (!open || !workspaceId) {
      setWorkspaceMembersForAssign([]);
      return;
    }
    let cancelled = false;
    async function loadAssignees() {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const myId = authUser?.id ?? null;
      const { data } = await supabase
        .from('workspace_members')
        .select('user_id, show_email_to_workspace_members, users ( full_name, email )')
        .eq('workspace_id', workspaceId);
      if (cancelled || !data) return;
      const opts: WorkspaceAssigneeOption[] = [];
      for (const row of data as unknown as Array<{
        user_id: string;
        show_email_to_workspace_members?: boolean;
        users:
          | { full_name: string | null; email: string | null }
          | { full_name: string | null; email: string | null }[]
          | null;
      }>) {
        const u = Array.isArray(row.users) ? row.users[0] : row.users;
        const showPeerEmail =
          myId != null && (row.user_id === myId || row.show_email_to_workspace_members === true);
        const label =
          (u?.full_name && u.full_name.trim()) ||
          (showPeerEmail ? u?.email?.split('@')[0] : undefined)?.trim() ||
          'Member';
        opts.push({ user_id: row.user_id, label });
      }
      opts.sort((a, b) => a.label.localeCompare(b.label));
      setWorkspaceMembersForAssign(opts);
    }
    void loadAssignees();
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  return workspaceMembersForAssign;
}
