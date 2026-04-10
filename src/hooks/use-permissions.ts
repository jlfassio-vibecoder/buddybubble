import { useMemo } from 'react';
import type { MemberRole, BubbleMemberRole } from '@/types/database';
import { resolvePermissions, type PermissionFlags } from '@/lib/permissions';

/**
 * Derives UI permission flags from the user's workspace role and optional
 * bubble-level membership.  Re-computes only when inputs change.
 *
 * Usage:
 *   const perms = usePermissions(role);
 *   const perms = usePermissions(role, bubbleMemberRole, bubble.is_private);
 * Exposes canWriteTasks, canPostMessages, canCreateWorkspaceBubble (see PermissionFlags).
 */
export function usePermissions(
  workspaceRole: MemberRole,
  bubbleMemberRole: BubbleMemberRole | null = null,
  isBubblePrivate: boolean = false,
): PermissionFlags {
  return useMemo(
    () => resolvePermissions(workspaceRole, bubbleMemberRole, isBubblePrivate),
    [workspaceRole, bubbleMemberRole, isBubblePrivate],
  );
}
