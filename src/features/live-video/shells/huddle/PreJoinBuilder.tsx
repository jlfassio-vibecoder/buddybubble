'use client';

import { useCallback, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { LiveSessionWorkoutPlayer } from '@/features/live-video/shells/huddle/LiveSessionWorkoutPlayer';
import { LiveDeckExerciseInjector } from '@/features/live-video/shells/huddle/LiveDeckExerciseInjector';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { cn } from '@/lib/utils';
import { useLayoutCommands } from '@/components/layout/layout-command-context';

export type PreJoinBuilderProps = {
  className?: string;
  workspaceId: string;
  supabase: SupabaseClient;
  /** Task write permission for deck persistence actions. */
  canWriteTasks?: boolean;
  /** Bumps Kanban/task views after successful Supabase writes from the live workout player. */
  onWorkoutDeckPersisted?: () => void;
  /** Host: marks chat/card/class invite ended in DB (same as `LiveSessionView` kill switch). */
  onEndSession?: () => void | Promise<void>;
  /** Closes the live-video dock for this user only (does not end the shared session). */
  onLeaveDock?: () => void;
  /** Host deck pick mode: embedded Workouts Kanban (from `dashboard-shell` via dock). */
  boardSelectionPanel?: ReactNode;
  /** Workouts bubble id for custom exercise injector (from `dashboard-shell`). */
  workoutsBubbleId?: string | null;
};

/**
 * Pre-join "Workout Builder" surface. Content-first column (queue + exercise editor)
 * plus a prominent Join CTA. Intentionally omits the video stage and SessionControls:
 * the trainer reviews / edits the deck before tapping Join.
 */
export function PreJoinBuilder({
  className,
  workspaceId,
  supabase,
  canWriteTasks = false,
  onWorkoutDeckPersisted,
  onEndSession,
  onLeaveDock,
  boardSelectionPanel,
  workoutsBubbleId,
}: PreJoinBuilderProps) {
  const { state, actions, isHost } = useLiveSessionRuntime();
  const { huddle } = useLiveTheaterLayoutPlanContext();
  const { isConnecting, joinChannel, joinError } = useAgoraSession();
  const { focusBoard } = useLayoutCommands();

  const deckSel = useWorkoutDeckSelectionOptional();
  const selectingFromBoard = Boolean(deckSel?.isSelectingFromBoard);

  const handleExitWorkout = useCallback(async () => {
    if (!isHost) {
      onLeaveDock?.();
      return;
    }
    actions.endSession();
    try {
      if (onEndSession) await onEndSession();
    } catch (error) {
      console.error('Failed to end session in DB', error);
    } finally {
      onLeaveDock?.();
    }
  }, [actions, isHost, onEndSession, onLeaveDock]);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-1 flex-col gap-4 p-4',
        huddle.useLegacySelectionScrollClamp &&
          selectingFromBoard &&
          'max-h-[min(72vh,680px)] overflow-y-auto',
        className,
      )}
    >
      <SessionHeader isSelectingFromBoard={selectingFromBoard} uiMode="builder" />

      <SessionDeckBuilder className="min-h-0 min-w-0 shrink-0" state={state} />

      {selectingFromBoard && boardSelectionPanel ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {boardSelectionPanel}
        </div>
      ) : (
        <LiveSessionWorkoutPlayer
          className="min-h-0 min-w-0 flex-1"
          workspaceId={workspaceId}
          supabase={supabase}
          canWrite={canWriteTasks}
          onPersistSuccess={onWorkoutDeckPersisted}
          onHostLayoutFocusBoard={isHost ? focusBoard : undefined}
        />
      )}

      <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {joinError ? (
            <p className="text-xs text-destructive" role="alert">
              {joinError}
            </p>
          ) : null}
          {onLeaveDock ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="font-semibold"
              onClick={() => void handleExitWorkout()}
            >
              Exit workout
            </Button>
          ) : null}
          {isHost ? (
            <LiveDeckExerciseInjector
              workspaceId={workspaceId}
              workoutsBubbleId={workoutsBubbleId ?? null}
              canWrite={Boolean(canWriteTasks)}
              disabled={selectingFromBoard}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectingFromBoard && deckSel ? (
            <Button
              type="button"
              size="lg"
              variant="default"
              className="font-semibold"
              onClick={() => deckSel.exitSelectionMode()}
            >
              Save to Workout
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            variant="default"
            className="font-semibold"
            onClick={joinChannel}
            disabled={isConnecting || selectingFromBoard}
          >
            {isConnecting ? 'Connecting…' : 'Join video'}
          </Button>
        </div>
      </div>
    </div>
  );
}
