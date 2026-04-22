'use client';

import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { metadataFieldsFromParsed, type WorkoutExercise } from '@/lib/item-metadata';
import { formatUserFacingError } from '@/lib/format-error';
import type { Database } from '@/types/database';
import { cn } from '@/lib/utils';

function formatExerciseLine(ex: WorkoutExercise): string | null {
  const name = ex.name?.trim();
  if (!name) return null;
  if (ex.reps !== undefined && ex.reps !== null && String(ex.reps).trim() !== '') {
    return `${ex.reps} ${name}`;
  }
  if (typeof ex.sets === 'number' && ex.sets > 0) {
    return `${ex.sets}× ${name}`;
  }
  if (typeof ex.duration_min === 'number' && ex.duration_min > 0) {
    return `${ex.duration_min} min ${name}`;
  }
  return name;
}

export type ParticipantPreJoinSummaryProps = {
  className?: string;
  sessionId: string;
  localUserId: string;
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

  const handleJoin = useCallback(async () => {
    if (!localUserId.trim() || !sessionId.trim()) {
      toast.error('Missing session or user.');
      return;
    }
    setAssigning(true);
    try {
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
    }
  }, [localUserId, onJoin, sessionId, supabase]);

  const busy = assigning;

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
            const fields = metadataFieldsFromParsed(task.metadata);
            const exerciseLines = fields.workoutExercises
              .map(formatExerciseLine)
              .filter((s): s is string => Boolean(s));
            const title = task.title?.trim() || 'Untitled card';
            return (
              <div
                key={row.id}
                className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm"
              >
                <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
                {exerciseLines.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                    {exerciseLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No exercises listed on card.</p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-end">
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
          {assigning ? 'Saving…' : 'Join video'}
        </Button>
      </div>
    </div>
  );
}
