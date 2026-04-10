'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Lock, UserMinus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatUserFacingError } from '@/lib/format-error';
import type { BubbleMemberRole } from '@/types/database';
import {
  updateBubbleAction,
  listBubbleMembersAction,
  addBubbleMemberAction,
  updateBubbleMemberRoleAction,
  removeBubbleMemberAction,
  listWorkspaceMembersForBubbleAction,
  type BubbleMemberWithProfile,
  type WorkspaceMemberOption,
} from '@/app/(dashboard)/app/[workspace_id]/bubble-actions';

export type BubbleSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  bubbleId: string;
  bubbleName: string;
  isPrivate: boolean;
  onSaved?: (updates: { name?: string; isPrivate?: boolean }) => void;
};

export function BubbleSettingsModal({
  open,
  onOpenChange,
  workspaceId,
  bubbleId,
  bubbleName: initialName,
  isPrivate: initialIsPrivate,
  onSaved,
}: BubbleSettingsModalProps) {
  const [name, setName] = useState(initialName);
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<BubbleMemberWithProfile[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [addableUsers, setAddableUsers] = useState<WorkspaceMemberOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<BubbleMemberRole>('viewer');

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMemberError(null);
    const [membersResult, usersResult] = await Promise.all([
      listBubbleMembersAction(bubbleId),
      listWorkspaceMembersForBubbleAction(workspaceId, bubbleId),
    ]);
    setMembersLoading(false);
    if ('error' in membersResult) {
      setMemberError(membersResult.error);
    } else {
      setMembers(membersResult.members);
    }
    if ('ok' in usersResult) {
      setAddableUsers(usersResult.members);
      setSelectedUserId(usersResult.members[0]?.user_id ?? '');
    }
  }, [bubbleId, workspaceId]);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setIsPrivate(initialIsPrivate);
    void loadMembers();
  }, [open, initialName, initialIsPrivate, loadMembers]);

  const dirty = name.trim() !== initialName || isPrivate !== initialIsPrivate;

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await updateBubbleAction({
      workspaceId,
      bubbleId,
      name: name.trim(),
      isPrivate,
    });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSaved?.({ name: name.trim(), isPrivate });
    onOpenChange(false);
  };

  const addMember = () => {
    if (!selectedUserId) return;
    setMemberError(null);
    startTransition(async () => {
      const result = await addBubbleMemberAction({
        workspaceId,
        bubbleId,
        userId: selectedUserId,
        role: selectedRole,
      });
      if ('error' in result) {
        setMemberError(result.error);
      } else {
        await loadMembers();
      }
    });
  };

  const changeMemberRole = (memberId: string, newRole: BubbleMemberRole) => {
    setMemberError(null);
    startTransition(async () => {
      const result = await updateBubbleMemberRoleAction({
        workspaceId,
        bubbleId,
        bubbleMemberId: memberId,
        role: newRole,
      });
      if ('error' in result) {
        setMemberError(result.error);
      } else {
        await loadMembers();
      }
    });
  };

  const removeMember = (memberId: string) => {
    setMemberError(null);
    startTransition(async () => {
      const result = await removeBubbleMemberAction({
        workspaceId,
        bubbleId,
        bubbleMemberId: memberId,
      });
      if ('error' in result) {
        setMemberError(result.error);
      } else {
        await loadMembers();
      }
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative z-10 w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">Bubble settings</h2>
            <p className="text-xs text-muted-foreground">Rename, set privacy, and manage access.</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="bubble-name">Name</Label>
            <Input
              id="bubble-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bubble name"
            />
          </div>

          <Separator />

          {/* Privacy */}
          <div className="space-y-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Lock className="size-4 text-muted-foreground" />
                Access
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Private bubbles are hidden from regular members. Only explicit members and
                admins/owners can see them.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <input
                id="bubble-is-private"
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mt-0.5 size-4 rounded border-input"
              />
              <Label htmlFor="bubble-is-private" className="cursor-pointer font-medium">
                Private bubble
              </Label>
            </div>
          </div>

          <Button type="button" size="sm" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>

          {/* Bubble members (always visible so admins can pre-add before making private) */}
          <Separator />

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Explicit access</h3>
              <p className="text-xs text-muted-foreground">
                These workspace members have direct access regardless of privacy. Guests can be
                granted editor access to this bubble here.
              </p>
            </div>

            {memberError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formatUserFacingError(memberError)}
              </div>
            ) : null}

            {/* Add member */}
            {addableUsers.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Add member
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    {addableUsers.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.full_name?.trim() || u.email || u.user_id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Role
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as BubbleMemberRole)}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="editor">Editor — can write tasks</option>
                    <option value="viewer">Viewer — read + message only</option>
                  </select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !selectedUserId}
                  onClick={addMember}
                >
                  Add
                </Button>
              </div>
            ) : null}

            {/* Existing members */}
            {membersLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : members.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Member</th>
                      <th className="px-3 py-2">Access</th>
                      <th className="px-3 py-2 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const display = m.full_name?.trim() || m.email || 'Unknown';
                      return (
                        <tr key={m.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground">{display}</p>
                            {m.email && m.full_name ? (
                              <p className="text-xs text-muted-foreground">{m.email}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={m.role}
                              disabled={pending}
                              onChange={(e) =>
                                changeMemberRole(m.id, e.target.value as BubbleMemberRole)
                              }
                              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                            >
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => removeMember(m.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                              aria-label={`Remove ${display}`}
                            >
                              <UserMinus className="size-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No explicit members yet. All workspace members/admins still have access based on
                their workspace role.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
