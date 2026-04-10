'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/lib/format-error';
import type { MemberRole } from '@/types/database';
import {
  listWorkspaceMembersAction,
  updateMemberRoleAction,
  removeMemberAction,
  type WorkspaceMemberWithProfile,
} from './member-actions';

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
};

const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Full control, billing & deletion rights',
  admin: 'Manage workspace, members & bubbles',
  member: 'Write access to all public bubbles',
  guest: 'Explicit-access only (assigned bubbles/cards)',
};

type Props = {
  workspaceId: string;
  currentUserId: string;
  callerRole: MemberRole;
};

export function MembersSection({ workspaceId, currentUserId, callerRole }: Props) {
  const [members, setMembers] = useState<WorkspaceMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listWorkspaceMembersAction(workspaceId);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
    } else {
      setMembers(result.members);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = (userId: string, newRole: MemberRole) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateMemberRoleAction({
        workspaceId,
        targetUserId: userId,
        newRole,
      });
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

  // Roles the caller can assign — owners can assign any role; admins cannot set owner
  const assignableRoles: MemberRole[] =
    callerRole === 'owner' ? ['owner', 'admin', 'member', 'guest'] : ['admin', 'member', 'guest'];

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading members…</p>;
  }

  return (
    <div className="space-y-4">
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
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const displayName = m.full_name?.trim() || m.email || 'Unknown';
              const isLastOwner =
                m.role === 'owner' && members.filter((x) => x.role === 'owner').length === 1;

              return (
                <tr key={m.user_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
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
                        </p>
                        {m.email && m.full_name ? (
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <select
                        value={m.role}
                        disabled={
                          pending ||
                          isLastOwner ||
                          // admins cannot touch other admins/owners
                          (callerRole === 'admin' &&
                            (m.role === 'owner' || m.role === 'admin') &&
                            !isSelf)
                        }
                        onChange={(e) => changeRole(m.user_id, e.target.value as MemberRole)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          isLastOwner ? 'Cannot change role: last owner' : ROLE_DESCRIPTIONS[m.role]
                        }
                      >
                        {assignableRoles.map((r) => (
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
              );
            })}
            {members.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No members yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
