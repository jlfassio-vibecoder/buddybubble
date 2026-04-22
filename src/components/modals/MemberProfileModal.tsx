'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/lib/format-error';
import type { MemberRole } from '@/types/database';
import {
  getWorkspaceMemberProfileForAdminAction,
  upsertWorkspaceMemberNoteAction,
  type WorkspaceMemberProfileForAdmin,
} from '@/app/(dashboard)/app/[workspace_id]/invites/member-profile-actions';
import type { WorkspaceMemberWithProfile } from '@/app/(dashboard)/app/[workspace_id]/invites/member-actions';

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
  trialing: 'Trialing',
};

type Props = {
  workspaceId: string;
  /** Row from the members table — used for instant labels while loading detail. */
  member: WorkspaceMemberWithProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Show family/children names only for Kids / Community workspaces (must pair with server-driven flag). */
  showFamilyNames: boolean;
};

export function MemberProfileModal({
  workspaceId,
  member,
  open,
  onOpenChange,
  showFamilyNames,
}: Props) {
  const [detail, setDetail] = useState<WorkspaceMemberProfileForAdmin | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** Ignore late responses when the modal switches member or closes (avoids stale profile state). */
  const profileSubjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    profileSubjectIdRef.current = member?.user_id ?? null;
  }, [member]);

  const load = useCallback(async () => {
    if (!member) return;
    const subjectUserId = member.user_id;
    setLoading(true);
    setLoadError(null);
    const result = await getWorkspaceMemberProfileForAdminAction({
      workspaceId,
      subjectUserId,
    });
    if (profileSubjectIdRef.current !== subjectUserId) {
      setLoading(false);
      return;
    }
    setLoading(false);
    if ('error' in result) {
      setLoadError(result.error);
      setDetail(null);
      return;
    }
    setDetail(result.profile);
    setNoteDraft(result.profile.note_body ?? '');
    setNoteDirty(false);
  }, [workspaceId, member]);

  useEffect(() => {
    if (!open || !member) {
      setDetail(null);
      setLoadError(null);
      setNoteDraft('');
      setNoteDirty(false);
      setSaveError(null);
      setMessage(null);
      return;
    }
    void load();
  }, [open, member, load]);

  const displayName =
    detail?.full_name?.trim() ||
    member?.full_name?.trim() ||
    detail?.email ||
    member?.email ||
    'Unknown';

  const handleSaveNote = () => {
    if (!member) return;
    setSaveError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await upsertWorkspaceMemberNoteAction({
        workspaceId,
        subjectUserId: member.user_id,
        body: noteDraft,
      });
      if ('error' in result) {
        setSaveError(result.error);
        return;
      }
      setNoteDirty(false);
      setMessage('Notes saved.');
      await load();
    });
  };

  const onClose = (next: boolean) => {
    if (!next) {
      setDetail(null);
      setLoadError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Member profile</DialogTitle>
          <DialogDescription>
            Information they added to their account, plus socialspace notes visible only to owners
            and admins.
          </DialogDescription>
        </DialogHeader>

        {!member ? null : loading && !detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formatUserFacingError(loadError)}
          </p>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-4">
              {member.avatar_url || detail?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail?.avatar_url ?? member.avatar_url ?? ''}
                  alt=""
                  className="size-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{displayName}</p>
                {(detail?.email ?? member.email) ? (
                  <p className="truncate text-sm text-muted-foreground">
                    {detail?.email ?? member.email}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Socialspace role:{' '}
                  <span className="font-medium text-foreground">
                    {ROLE_LABELS[detail?.workspace_role ?? member.role]}
                  </span>
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Their profile
              </h4>
              {detail?.bio ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{detail.bio}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No bio added.</p>
              )}
              {showFamilyNames && (detail?.children_names?.length ?? 0) > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground">Family members</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-foreground">
                    {detail!.children_names.map((n, i) => (
                      <li key={`${n}-${i}`}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Socialspace notes
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Visible only to socialspace owners and admins. Not shown to this member.
              </p>
              <textarea
                value={noteDraft}
                onChange={(e) => {
                  setNoteDraft(e.target.value);
                  setNoteDirty(true);
                  setMessage(null);
                }}
                rows={6}
                maxLength={10000}
                disabled={pending}
                className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                placeholder="Add notes for your team about this member…"
              />
              <p className="mt-0.5 text-right text-xs text-muted-foreground">
                {noteDraft.length.toLocaleString()} / 10,000
              </p>
              {detail?.note_updated_at ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last updated{' '}
                  {new Date(detail.note_updated_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              ) : null}
            </div>

            {saveError ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formatUserFacingError(saveError)}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                {message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => onClose(false)}>
                Close
              </Button>
              <Button
                type="button"
                disabled={pending || !noteDirty}
                onClick={() => void handleSaveNote()}
              >
                {pending ? 'Saving…' : 'Save notes'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
