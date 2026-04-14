'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, Globe, Lock, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-error';
import { canManageWorkspace, resolvePermissions } from '@/lib/permissions';
import type { BubbleMemberRole, MemberRole } from '@/types/database';
import {
  listWorkspaceMembersAction,
  updateMemberRoleAction,
  removeMemberAction,
  type WorkspaceMemberWithProfile,
} from './member-actions';
import {
  listWorkspaceBubbleAccessAction,
  addBubbleMemberAction,
  revokeBubbleAccessAction,
  type WorkspaceBubbleSummary,
  type WorkspaceBubbleMembership,
} from '../bubble-actions';
import { MemberProfileModal } from '@/components/modals/MemberProfileModal';

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
};

const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Full control, billing & deletion rights',
  admin: 'Manage socialspace, members & bubbles',
  member: 'Write access to all public bubbles',
  guest: 'Explicit-access only (assigned bubbles/cards)',
};

/** Stable order for role `<select>` options when unioning assignable roles with the row’s current role. */
const ROLE_SELECT_ORDER: MemberRole[] = ['owner', 'admin', 'member', 'guest'];

function roleSelectOptions(assignable: MemberRole[], current: MemberRole): MemberRole[] {
  const combined = assignable.includes(current) ? assignable : [...assignable, current];
  return ROLE_SELECT_ORDER.filter((r) => combined.includes(r));
}

type Props = {
  workspaceId: string;
  currentUserId: string;
  callerRole: MemberRole;
  /** Show family/children names in member profile modal for Kids / Community workspaces. */
  showFamilyNames: boolean;
};

function effectiveAccessLabel(
  workspaceRole: MemberRole,
  bubbleRole: BubbleMemberRole | null,
  isPrivate: boolean,
): 'Write' | 'View' | 'No access' {
  if (canManageWorkspace(workspaceRole)) return 'Write';
  const { canWrite, canView } = resolvePermissions(workspaceRole, bubbleRole, isPrivate);
  if (canWrite) return 'Write';
  if (canView) return 'View';
  return 'No access';
}

function bubbleAccessSummary(
  workspaceRole: MemberRole,
  bubbles: WorkspaceBubbleSummary[],
  membershipMap: Map<string, BubbleMemberRole>,
): string {
  if (canManageWorkspace(workspaceRole)) return 'All bubbles';
  if (bubbles.length === 0) return '—';

  let writeCount = 0;
  let viewCount = 0;
  for (const bubble of bubbles) {
    const bRole = membershipMap.get(bubble.id) ?? null;
    const { canWrite, canView } = resolvePermissions(workspaceRole, bRole, bubble.is_private);
    if (canWrite) writeCount++;
    else if (canView) viewCount++;
  }

  if (writeCount === 0 && viewCount === 0) return 'No access';
  const parts: string[] = [];
  if (writeCount > 0) parts.push(`Write: ${writeCount}`);
  if (viewCount > 0) parts.push(`View: ${viewCount}`);
  return parts.join(' · ');
}

export function MembersSection({ workspaceId, currentUserId, callerRole, showFamilyNames }: Props) {
  const [members, setMembers] = useState<WorkspaceMemberWithProfile[]>([]);
  const [profileModalMember, setProfileModalMember] = useState<WorkspaceMemberWithProfile | null>(
    null,
  );
  const [bubbles, setBubbles] = useState<WorkspaceBubbleSummary[]>([]);
  const [memberships, setMemberships] = useState<WorkspaceBubbleMembership[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [membersResult, accessResult] = await Promise.all([
      listWorkspaceMembersAction(workspaceId),
      listWorkspaceBubbleAccessAction(workspaceId),
    ]);
    setLoading(false);
    if ('error' in membersResult) {
      setError(membersResult.error);
      return;
    }
    if ('error' in accessResult) {
      setError(accessResult.error);
      return;
    }
    setMembers(membersResult.members);
    setBubbles(accessResult.bubbles);
    setMemberships(accessResult.memberships);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Owners pinned to top; within each tier order is preserved from server (created_at asc)
  const sortedMembers = useMemo(
    () => [
      ...members.filter((m) => m.role === 'owner'),
      ...members.filter((m) => m.role !== 'owner'),
    ],
    [members],
  );

  const changeRole = (userId: string, newRole: MemberRole) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateMemberRoleAction({ workspaceId, targetUserId: userId, newRole });
      if ('error' in result) {
        setError(result.error);
      } else {
        setMessage('Role updated.');
        await load();
      }
    });
  };

  const removeMember = (userId: string) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await removeMemberAction({ workspaceId, targetUserId: userId });
      if ('error' in result) {
        setError(result.error);
      } else {
        setMessage('Member removed.');
        await load();
      }
    });
  };

  const grantBubbleAccess = (targetUserId: string, bubbleId: string, role: BubbleMemberRole) => {
    setError(null);
    setMessage(null);
    // Optimistic update
    setMemberships((prev) => {
      const filtered = prev.filter(
        (m) => !(m.user_id === targetUserId && m.bubble_id === bubbleId),
      );
      return [...filtered, { bubble_id: bubbleId, user_id: targetUserId, role }];
    });
    startTransition(async () => {
      const result = await addBubbleMemberAction({
        workspaceId,
        bubbleId,
        userId: targetUserId,
        role,
      });
      if ('error' in result) {
        setError(result.error);
        await load();
      }
    });
  };

  const revokeAccess = (targetUserId: string, bubbleId: string) => {
    setError(null);
    setMessage(null);
    // Optimistic update
    setMemberships((prev) =>
      prev.filter((m) => !(m.user_id === targetUserId && m.bubble_id === bubbleId)),
    );
    startTransition(async () => {
      const result = await revokeBubbleAccessAction({
        workspaceId,
        bubbleId,
        userId: targetUserId,
      });
      if ('error' in result) {
        setError(result.error);
        await load();
      }
    });
  };

  const assignableRoles: MemberRole[] =
    callerRole === 'owner' ? ['owner', 'admin', 'member', 'guest'] : ['admin', 'member', 'guest'];

  const bubbleMembershipByUser = useMemo(() => {
    const outer = new Map<string, Map<string, BubbleMemberRole>>();
    for (const row of memberships) {
      let inner = outer.get(row.user_id);
      if (!inner) {
        inner = new Map();
        outer.set(row.user_id, inner);
      }
      inner.set(row.bubble_id, row.role);
    }
    return outer;
  }, [memberships]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading members…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Inline help */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">Member</strong> — default write access to
        all non-private bubbles. <strong className="font-medium text-foreground">Guest</strong> — no
        bubble access unless explicitly granted below.{' '}
        <strong className="font-medium text-foreground">Owner / Admin</strong> — full access to all
        bubbles via socialspace role. Expand a row to view and manage per-bubble access.
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formatUserFacingError(error)}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Bubble access</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const displayName = m.full_name?.trim() || m.email || 'Unknown';
              const isLastOwner =
                m.role === 'owner' && members.filter((x) => x.role === 'owner').length === 1;
              const isExpanded = expandedUserId === m.user_id;
              const userBubbleGrants =
                bubbleMembershipByUser.get(m.user_id) ?? new Map<string, BubbleMemberRole>();
              const summary = bubbleAccessSummary(m.role, bubbles, userBubbleGrants);
              const isTargetAdmin = canManageWorkspace(m.role);
              const rowRoleOptions = roleSelectOptions(assignableRoles, m.role);

              return (
                <Fragment key={m.user_id}>
                  {/* Main member row */}
                  <tr
                    className={cn('border-b border-border', isExpanded && 'border-b-0 bg-muted/10')}
                  >
                    {/* Member cell with expand toggle */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedUserId(isExpanded ? null : m.user_id)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          aria-label={
                            isExpanded ? 'Collapse bubble access' : 'Expand bubble access'
                          }
                          title={isExpanded ? 'Hide bubble access' : 'Show bubble access'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4" aria-hidden />
                          ) : (
                            <ChevronRight className="size-4" aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none ring-offset-background hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setProfileModalMember(m)}
                          title="View member profile and notes"
                        >
                          {m.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.avatar_url}
                              alt=""
                              className="size-7 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {displayName}
                              {isSelf ? (
                                <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                              ) : null}
                              {m.role === 'owner' ? (
                                <span
                                  className="ml-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"
                                  title="Owner"
                                >
                                  ★
                                </span>
                              ) : null}
                            </p>
                            {m.email && m.full_name ? (
                              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    </td>

                    {/* Role cell */}
                    <td className="px-4 py-3">
                      <div>
                        <select
                          value={m.role}
                          disabled={
                            pending ||
                            isLastOwner ||
                            (callerRole === 'admin' &&
                              (m.role === 'owner' || m.role === 'admin') &&
                              !isSelf)
                          }
                          onChange={(e) => changeRole(m.user_id, e.target.value as MemberRole)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            isLastOwner
                              ? 'Cannot change role: last owner'
                              : ROLE_DESCRIPTIONS[m.role]
                          }
                        >
                          {rowRoleOptions.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ROLE_DESCRIPTIONS[m.role]}
                        </p>
                      </div>
                    </td>

                    {/* Bubble access summary */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{summary}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={pending || isSelf || isLastOwner}
                        title={
                          isSelf
                            ? 'Cannot remove yourself'
                            : isLastOwner
                              ? 'Cannot remove last owner'
                              : `Remove ${displayName}`
                        }
                        onClick={() => removeMember(m.user_id)}
                      >
                        <UserX className="size-4" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </td>
                  </tr>

                  {/* Expanded bubble access panel */}
                  {isExpanded ? (
                    <tr className="border-b border-border">
                      <td colSpan={4} className="bg-muted/10 px-6 pb-4 pt-0">
                        <div className="overflow-hidden rounded-lg border border-border">
                          {bubbles.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-muted-foreground">
                              No bubbles in this socialspace yet.
                            </p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                                <tr>
                                  <th className="px-4 py-2 text-left">Bubble</th>
                                  <th className="px-4 py-2 text-left">Effective access</th>
                                  <th className="px-4 py-2 text-left">Explicit grant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bubbles.map((bubble) => {
                                  const explicitRole = userBubbleGrants.get(bubble.id) ?? null;
                                  const effective = effectiveAccessLabel(
                                    m.role,
                                    explicitRole,
                                    bubble.is_private,
                                  );

                                  return (
                                    <tr
                                      key={bubble.id}
                                      className="border-b border-border last:border-0"
                                    >
                                      {/* Bubble name */}
                                      <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-1.5">
                                          {bubble.is_private ? (
                                            <Lock
                                              className="size-3.5 shrink-0 text-muted-foreground"
                                              aria-label="Private"
                                            />
                                          ) : (
                                            <Globe
                                              className="size-3.5 shrink-0 text-muted-foreground"
                                              aria-label="Public"
                                            />
                                          )}
                                          <span className="font-medium">{bubble.name}</span>
                                        </div>
                                      </td>

                                      {/* Effective access badge */}
                                      <td className="px-4 py-2.5">
                                        <span
                                          className={cn(
                                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                            effective === 'Write' &&
                                              'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                                            effective === 'View' &&
                                              'bg-blue-500/10 text-blue-700 dark:text-blue-300',
                                            effective === 'No access' &&
                                              'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                                          )}
                                        >
                                          {effective}
                                        </span>
                                      </td>

                                      {/* Grant controls */}
                                      <td className="px-4 py-2.5">
                                        {isTargetAdmin ? (
                                          <span className="text-xs text-muted-foreground">
                                            Full access via socialspace role
                                          </span>
                                        ) : (
                                          <select
                                            value={explicitRole ?? 'none'}
                                            disabled={pending}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (val === 'none') {
                                                revokeAccess(m.user_id, bubble.id);
                                              } else {
                                                grantBubbleAccess(
                                                  m.user_id,
                                                  bubble.id,
                                                  val as BubbleMemberRole,
                                                );
                                              }
                                            }}
                                            className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
                                          >
                                            <option value="none">No explicit grant</option>
                                            <option value="viewer">Viewer</option>
                                            <option value="editor">Editor</option>
                                          </select>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {sortedMembers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No members yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <MemberProfileModal
        workspaceId={workspaceId}
        member={profileModalMember}
        open={profileModalMember !== null}
        onOpenChange={(o) => {
          if (!o) setProfileModalMember(null);
        }}
        showFamilyNames={showFamilyNames}
      />
    </div>
  );
}
