'use client';

import { useMemo } from 'react';
import { Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import type { LiveSessionInvitePayload } from '@/types/live-session-invite';

export type LiveSessionMessageCardProps = {
  messageId: string;
  invite: LiveSessionInvitePayload;
  starterDisplayName: string;
  currentUserId: string | null;
  className?: string;
};

export function LiveSessionMessageCard({
  messageId,
  invite,
  starterDisplayName,
  currentUserId,
  className,
}: LiveSessionMessageCardProps) {
  const activeSession = useLiveVideoStore((s) => s.activeSession);

  const inThisSession = useMemo(() => {
    if (!activeSession) return false;
    return (
      activeSession.sessionId === invite.sessionId &&
      activeSession.channelId === invite.channelId &&
      activeSession.workspaceId === invite.workspaceId
    );
  }, [activeSession, invite.channelId, invite.sessionId, invite.workspaceId]);

  const ended = Boolean(invite.endedAt);
  const joinDisabled = ended || inThisSession;

  const title = invite.mode === 'workout' ? 'Live workout' : 'Live session';

  return (
    <div
      className={cn(
        'mt-2 max-w-sm rounded-xl border border-border bg-muted/40 px-3 py-3 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-lg bg-primary/15 p-1.5 text-primary">
          <Video className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">Started by {starterDisplayName}</p>
          {ended ? (
            <p className="text-xs text-muted-foreground">This session has ended.</p>
          ) : inThisSession ? (
            <p className="text-xs text-muted-foreground">You are in this session.</p>
          ) : null}
          <p className="text-[10px] text-muted-foreground">
            Joining opens the live video dock at the top of the dashboard.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={joinDisabled}
          onClick={() => {
            if (joinDisabled) return;
            const isInviteAuthor = Boolean(currentUserId && currentUserId === invite.hostUserId);
            useLiveVideoStore.getState().joinSession({
              workspaceId: invite.workspaceId,
              sessionId: invite.sessionId,
              channelId: invite.channelId,
              hostUserId: invite.hostUserId,
              mode: invite.mode,
              ...(isInviteAuthor ? { inviteMessageId: messageId } : {}),
            });
          }}
        >
          {ended ? 'Session ended' : inThisSession ? 'Joined' : 'Join session'}
        </Button>
      </div>
    </div>
  );
}
