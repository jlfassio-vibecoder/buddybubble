'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  fetchInvitesBootstrapClient,
  type InvitesBootstrapOk,
} from '@/lib/fetch-invites-bootstrap-client';
import { InvitesClient } from '@/app/(dashboard)/app/[workspace_id]/invites/invites-client';
import { ThemeScope } from '@/components/theme/ThemeScope';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { WorkspaceCategory } from '@/types/database';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Matches dashboard `ThemeScope` so portaled dialog content gets the same CSS variables. */
  themeCategory: WorkspaceCategory | string | null | undefined;
  /** When true, open on Pending approvals if there are pending join requests. */
  preferPendingTab?: boolean;
  /** After closing this dialog, open Create BuddyBubble (members who cannot manage invites). */
  onRequestCreateOwnWorkspace?: () => void;
};

export function PeopleInvitesModal({
  open,
  onOpenChange,
  workspaceId,
  themeCategory,
  preferPendingTab = false,
  onRequestCreateOwnWorkspace,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [boot, setBoot] = useState<InvitesBootstrapOk | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setBoot(null);
    setForbidden(false);
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (!open || !workspaceId) {
      if (!open) reset();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setForbidden(false);
    setLoadError(null);
    setBoot(null);

    const supabase = createClient();
    void fetchInvitesBootstrapClient(supabase, workspaceId).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.ok) {
        setBoot(r);
        return;
      }
      if (r.reason === 'forbidden') {
        setForbidden(true);
        return;
      }
      if (r.reason === 'not_signed_in' || r.reason === 'not_member') {
        setLoadError('You do not have access to invites for this workspace.');
        return;
      }
      setLoadError(r.message ?? 'Could not load invites.');
    });

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, reset]);

  const initialSegment =
    preferPendingTab && boot && boot.initialWaitingRows.length > 0 ? 'pending' : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={cn(
          'flex h-[min(90vh,880px)] max-h-[90vh] w-[min(100vw-1.5rem,42rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh]',
          /* Portal is outside dashboard ThemeScope — strip :root token shell; inner scope paints. */
          'border-0 bg-transparent shadow-none',
        )}
      >
        <ThemeScope category={themeCategory}>
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
            {loading ? (
              <>
                <DialogTitle className="sr-only">People & invites</DialogTitle>
                <div className="flex flex-1 items-center justify-center bg-background p-8 text-sm text-muted-foreground">
                  Loading…
                </div>
              </>
            ) : forbidden ? (
              <div className="flex flex-col gap-4 bg-card p-6">
                <DialogHeader className="text-left">
                  <DialogTitle>People & invites</DialogTitle>
                  <DialogDescription>
                    Only owners and admins can manage invites and pending join requests in{' '}
                    <span className="font-medium text-foreground">this</span> workspace. You can
                    still create your own BuddyBubble where you are the owner and can invite others.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  {onRequestCreateOwnWorkspace ? (
                    <Button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        queueMicrotask(() => onRequestCreateOwnWorkspace());
                      }}
                    >
                      Create BuddyBubble
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : loadError ? (
              <div className="flex flex-col gap-4 bg-card p-6">
                <DialogHeader className="text-left">
                  <DialogTitle>People & invites</DialogTitle>
                  <DialogDescription className="text-destructive">{loadError}</DialogDescription>
                </DialogHeader>
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            ) : boot ? (
              <>
                <DialogTitle className="sr-only">People & invites</DialogTitle>
                <InvitesClient
                  workspaceId={workspaceId}
                  workspaceName={boot.workspaceName}
                  initialInvites={boot.initialInvites}
                  initialWaitingRows={boot.initialWaitingRows}
                  currentUserId={boot.currentUserId}
                  callerRole={boot.callerRole}
                  showFamilyNames={themeCategory === 'kids' || themeCategory === 'community'}
                  embedded
                  initialSegment={initialSegment}
                  onRequestClose={() => onOpenChange(false)}
                />
              </>
            ) : null}
          </div>
        </ThemeScope>
      </DialogContent>
    </Dialog>
  );
}
