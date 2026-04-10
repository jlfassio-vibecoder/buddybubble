/**
 * Shared permission helpers.
 *
 * These are pure functions — no Supabase calls — so they can be used in
 * Server Components, Server Actions, and Client Components alike.
 * The source of truth for enforcement is always Supabase RLS; these helpers
 * drive UI visibility (show/hide buttons, etc.).
 */

import type { MemberRole, BubbleMemberRole } from '@/types/database';

/** Normalize DB / API role strings for permission checks (case-insensitive). */
export function parseMemberRole(raw: string | null | undefined): MemberRole {
  const r = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (r === 'owner' || r === 'admin' || r === 'member' || r === 'guest') return r;
  return 'member';
}

/** Numeric rank: higher = more capability. */
const ROLE_RANK: Record<MemberRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  guest: 1,
};

/** True if `role` is at least as capable as `minimum`. */
export function atLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// ---------------------------------------------------------------------------
// Workspace-level flags
// ---------------------------------------------------------------------------

/** owner/admin/member — can create tasks, write messages, etc. */
export function canWriteWorkspace(role: MemberRole): boolean {
  return atLeast(role, 'member');
}

/** owner/admin — can manage settings, invite members, change roles. */
export function canManageWorkspace(role: MemberRole): boolean {
  return atLeast(role, 'admin');
}

/** owner only — can delete the workspace, transfer ownership. */
export function canDeleteWorkspace(role: MemberRole): boolean {
  return role === 'owner';
}

/** owner only — can promote another user to owner. */
export function canPromoteToOwner(role: MemberRole): boolean {
  return role === 'owner';
}

// ---------------------------------------------------------------------------
// Bubble-level flags
// ---------------------------------------------------------------------------

/**
 * Can the user write (create/edit tasks) inside a specific bubble?
 *
 * @param workspaceRole  The user's workspace-level role.
 * @param bubbleMemberRole  The user's explicit bubble_members.role (if any).
 * @param isBubblePrivate  Whether the bubble has is_private = true.
 */
export function canWriteBubble(
  workspaceRole: MemberRole,
  bubbleMemberRole: BubbleMemberRole | null,
  isBubblePrivate: boolean,
): boolean {
  if (canManageWorkspace(workspaceRole)) return true; // owner/admin always
  if (!isBubblePrivate && canWriteWorkspace(workspaceRole)) return true; // member, non-private
  if (bubbleMemberRole === 'editor') return true; // explicit editor grant
  return false;
}

/**
 * Can the user view (read tasks + send messages in) a bubble?
 *
 * @param workspaceRole  The user's workspace-level role.
 * @param bubbleMemberRole  The user's explicit bubble_members.role (if any).
 * @param isBubblePrivate  Whether the bubble has is_private = true.
 */
export function canViewBubble(
  workspaceRole: MemberRole,
  bubbleMemberRole: BubbleMemberRole | null,
  isBubblePrivate: boolean,
): boolean {
  if (canManageWorkspace(workspaceRole)) return true;
  if (!isBubblePrivate && canWriteWorkspace(workspaceRole)) return true;
  if (bubbleMemberRole !== null) return true; // any bubble_members record grants view
  return false;
}

// ---------------------------------------------------------------------------
// Derived UI flags (convenience bundle)
// ---------------------------------------------------------------------------

export interface PermissionFlags {
  /** Can create/edit/delete tasks in the current bubble (matches `can_write_bubble` RLS). */
  canWriteTasks: boolean;
  /**
   * Can post in chat for the current bubble (matches `messages_insert` / `can_view_bubble` RLS).
   * Differs from task write: viewers may message but not edit tasks.
   */
  canPostMessages: boolean;
  /**
   * Can create new workspace channels/bubbles (matches `bubbles_insert` / `can_write_workspace` RLS).
   * Workspace-level only — not granted by bubble_editor alone.
   */
  canCreateWorkspaceBubble: boolean;
  /** Same as `canWriteTasks` (legacy name). */
  canWrite: boolean;
  /** Can view the current bubble (tasks + messages). */
  canView: boolean;
  /** Is owner or admin — can manage workspace settings and members. */
  isAdmin: boolean;
  /** Is owner — exclusive actions like workspace deletion and role promotion. */
  isOwner: boolean;
  /** Can manage workspace members (invite, change roles, remove). */
  canManageMembers: boolean;
  /** Can manage bubble settings (privacy, bubble_members). */
  canManageBubble: boolean;
}

export function resolvePermissions(
  workspaceRole: MemberRole,
  bubbleMemberRole: BubbleMemberRole | null = null,
  isBubblePrivate: boolean = false,
): PermissionFlags {
  const canWriteTasks = canWriteBubble(workspaceRole, bubbleMemberRole, isBubblePrivate);
  const canViewBubbleFlag = canViewBubble(workspaceRole, bubbleMemberRole, isBubblePrivate);
  return {
    canWriteTasks,
    canPostMessages: canViewBubbleFlag,
    canCreateWorkspaceBubble: canWriteWorkspace(workspaceRole),
    canWrite: canWriteTasks,
    canView: canViewBubbleFlag,
    isAdmin: canManageWorkspace(workspaceRole),
    isOwner: workspaceRole === 'owner',
    canManageMembers: canManageWorkspace(workspaceRole),
    canManageBubble: canManageWorkspace(workspaceRole),
  };
}
