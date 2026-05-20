'use client';

import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { WorkoutMetadataPreview } from '@/components/fitness/workout-block-renderer';
import { formatUserFacingError } from '@/lib/format-error';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import type { Database, Json } from '@/types/database';
import { cn } from '@/lib/utils';

const LIVE_SESSION_JOIN_MAX_ATTEMPTS = 8;
const LIVE_SESSION_JOIN_RETRY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Host has not created `live_sessions` yet — `live_session_participants.session_id` FK. */
function isLiveSessionForeignKeyViolation(
  err: { code?: string; message?: string } | null,
): boolean {
  if (!err) return false;
  if (err.code === '23503') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('foreign key') && m.includes('live_session');
}

export type ParticipantPreJoinSummaryProps = {
  className?: string;
  sessionId: string;
  localUserId: string;
  /** Display name stored on `live_session_participants` (matches dock `resolvedDisplayName`). */
  displayName: string;
  supabase: SupabaseClient<Database>;
  /** Agora `joinChannel` after successful deck assignment RPC. */
  onJoin: () => void | Promise<void>;
  /** Shown under the CTA when Agora fails to connect (same pattern as `PreJoinBuilder`). */
  joinError?: string | null;
  /** Closes the live-video dock for this user only (does not end the shared session). */
  onLeaveDock?: () => void;
};

/**
 * Read-only pre-join surface for participants: live deck from Supabase + Join runs bulk
 * `task_assignees` assignment then `onJoin` (video).
 */
export function ParticipantPreJoinSummary({
  className,
  sessionId,
  localUserId,
  displayName,
  supabase,
  onJoin,
  joinError = null,
  onLeaveDock,
}: ParticipantPreJoinSummaryProps) {
  const {
    rows,
    loading,
    error: deckError,
  } = useLiveSessionDeck({
    supabase,
    sessionId,
    enabled: Boolean(sessionId.trim()),
  });

  const [assigning, setAssigning] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [waitingForHost, setWaitingForHost] = useState(false);

  const handleJoin = useCallback(async () => {
    if (!localUserId.trim() || !sessionId.trim()) {
      toast.error('Missing session or user.');
      return;
    }
    const name = displayName.trim() || localUserId;
    setWaitingForHost(false);
    setRegistering(true);
    try {
      const agoraUid = String(agoraUidFromUuid(localUserId));
      for (let attempt = 0; attempt < LIVE_SESSION_JOIN_MAX_ATTEMPTS; attempt++) {
        const { error: joinErr } = await supabase.rpc('live_session_participant_join', {
          p_session_id: sessionId,
          p_display_name: name,
          p_agora_uid: agoraUid,
          p_role: 'participant',
        });
        if (!joinErr) {
          break;
        }
        const retryable =
          isLiveSessionForeignKeyViolation(joinErr) && attempt < LIVE_SESSION_JOIN_MAX_ATTEMPTS - 1;
        if (retryable) {
          await sleep(LIVE_SESSION_JOIN_RETRY_MS);
          continue;
        }
        if (
          isLiveSessionForeignKeyViolation(joinErr) &&
          attempt === LIVE_SESSION_JOIN_MAX_ATTEMPTS - 1
        ) {
          setWaitingForHost(true);
          return;
        }
        toast.error(formatUserFacingError(joinErr));
        return;
      }

      setAssigning(true);
      const { error: rpcError } = await supabase.rpc('assign_user_to_session_deck', {
        p_session_id: sessionId,
        p_user_id: localUserId,
      });
      if (rpcError) {
        toast.error(formatUserFacingError(rpcError));
        return;
      }
      await onJoin();
    } catch (e) {
      toast.error(formatUserFacingError(e));
    } finally {
      setAssigning(false);
      setRegistering(false);
    }
  }, [displayName, localUserId, onJoin, sessionId, supabase]);

  const busy = assigning || registering;

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-1 flex-col gap-4 p-4', className)}>
      <header className="border-b border-border pb-3 text-center sm:text-left">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          Workout queue
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Review the exercises below. When you join, you will be assigned to every card in this
          queue so you can log sets during the session.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {loading ? (
          <p className="text-center text-xs text-muted-foreground">Loading queue…</p>
        ) : deckError ? (
          <p className="text-center text-xs text-destructive" role="alert">
            {deckError.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
            No workouts in the queue yet. Wait for the host to add cards.
          </p>
        ) : (
          rows.map((row) => {
            const task = row.tasks;
            if (!task) {
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                >
                  Card unavailable (task {row.task_id})
                </div>
              );
            }
            const title = task.title?.trim() || 'Untitled card';
            return (
              <div
                key={row.id}
                className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm"
              >
                <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
                <WorkoutMetadataPreview
                  metadata={task.metadata as Json}
                  density="compact"
                  className="mt-2"
                  emptyMessage="No exercises listed on card."
                />
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-end">
        {waitingForHost ? (
          <p
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground sm:mr-auto"
            role="status"
          >
            The host session is still starting. Wait a few seconds, then tap Join video to try
            again.
          </p>
        ) : null}
        {joinError ? (
          <p className="text-xs text-destructive sm:mr-auto" role="alert">
            {joinError}
          </p>
        ) : null}
        {onLeaveDock ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="font-semibold sm:mr-auto"
            onClick={onLeaveDock}
          >
            Exit workout
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          variant="default"
          className="font-semibold"
          onClick={() => void handleJoin()}
          disabled={busy || loading || Boolean(deckError)}
        >
          {registering ? 'Joining…' : assigning ? 'Saving…' : 'Join video'}
        </Button>
      </div>
    </div>
  );
}
