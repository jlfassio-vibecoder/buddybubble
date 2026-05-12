'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getClassUrl } from '@/lib/class-links';
import { cn } from '@/lib/utils';
import { useManageClassRoster } from '@/hooks/useManageClassRoster';

export type ManageClassRosterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classInstanceId: string;
  workspaceId: string;
  capacity: number | null;
  currentUserId: string | null;
  onChanged?: () => void;
};

const selectClassName = cn(
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none md:text-sm',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
  'dark:bg-input/30 dark:disabled:bg-input/80',
);

export function ManageClassRosterModal({
  open,
  onOpenChange,
  classInstanceId,
  workspaceId,
  capacity,
  currentUserId,
  onChanged,
}: ManageClassRosterModalProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);

  const {
    enrollments,
    candidates,
    loading,
    error,
    addMember,
    removeMember,
    sendInviteEmail,
    mutating,
  } = useManageClassRoster({ classInstanceId, workspaceId });

  const classUrl = useMemo(
    () => getClassUrl(workspaceId, classInstanceId),
    [workspaceId, classInstanceId],
  );

  useEffect(() => {
    if (!open) {
      setSelectedUserId('');
      setActionError(null);
      setSendingUserId(null);
    }
  }, [open]);

  const enrolledCount = useMemo(
    () => enrollments.filter((e) => e.status === 'enrolled').length,
    [enrollments],
  );

  const isFull = useMemo(
    () => capacity !== null && enrolledCount >= capacity,
    [capacity, enrolledCount],
  );

  const addDisabled =
    mutating || loading || candidates.length === 0 || !selectedUserId.trim() || isFull;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <DialogTitle>Manage Roster</DialogTitle>
              <DialogDescription>
                Enrolled: {enrolledCount}
                {capacity != null ? ` / ${capacity}` : ''}
              </DialogDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs"
              title="Copy class link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(classUrl);
                  toast.success('Class link copied to clipboard');
                } catch {
                  toast.error('Could not copy link');
                }
              }}
            >
              <Link2 className="size-3.5" aria-hidden />
              Copy link
            </Button>
          </div>
        </DialogHeader>

        {(error || actionError) && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError ?? error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="roster-add-member">Add member</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <select
              id="roster-add-member"
              className={selectClassName}
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setActionError(null);
              }}
              disabled={mutating || loading || candidates.length === 0 || isFull}
            >
              <option value="">Select a member…</option>
              {candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              className="shrink-0 sm:min-w-[7.5rem]"
              disabled={addDisabled}
              onClick={async () => {
                setActionError(null);
                const res = await addMember(selectedUserId);
                if (!res.ok) {
                  setActionError(res.error ?? 'Could not add member.');
                  return;
                }
                setSelectedUserId('');
                onChanged?.();
              }}
            >
              {isFull ? 'Class full' : 'Add to Class'}
            </Button>
          </div>
        </div>

        <div className="max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto pr-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Enrolled
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading roster…</p>
          ) : enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {enrollments.map((e) => {
                const secondary = [e.role, e.email].filter(Boolean).join(' · ') || 'Member';
                const initial = (e.displayName?.trim()?.[0] ?? '?').toUpperCase();
                const hideRemove = currentUserId != null && e.userId === currentUserId;
                return (
                  <li
                    key={e.enrollmentId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                  >
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                      aria-hidden
                    >
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {e.displayName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{secondary}</div>
                      <div className="text-[11px] capitalize text-muted-foreground">{e.status}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {e.status === 'enrolled' ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                          disabled={mutating || sendingUserId === e.userId}
                          title="Send class link via email"
                          aria-label={`Email class link to ${e.displayName}`}
                          onClick={async () => {
                            setSendingUserId(e.userId);
                            setActionError(null);
                            const res = await sendInviteEmail(e.userId);
                            setSendingUserId(null);
                            if (!res.ok) {
                              toast.error(res.error ?? 'Could not send email.');
                              setActionError(res.error ?? 'Could not send email.');
                              return;
                            }
                            toast.success(`Email sent to ${e.displayName}`);
                          }}
                        >
                          {sendingUserId === e.userId ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Mail className="size-4" aria-hidden />
                          )}
                        </Button>
                      ) : null}
                      {!hideRemove ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={mutating}
                          aria-label={`Remove ${e.displayName}`}
                          onClick={async () => {
                            setActionError(null);
                            const res = await removeMember(e.enrollmentId);
                            if (!res.ok) {
                              setActionError(res.error ?? 'Could not remove member.');
                              return;
                            }
                            onChanged?.();
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
