'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { LiveSessionWorkoutPlayer } from '@/features/live-video/shells/huddle/LiveSessionWorkoutPlayer';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { cn } from '@/lib/utils';

export type PreJoinBuilderProps = {
  className?: string;
  workspaceId: string;
  supabase: SupabaseClient;
  /** Task write permission for deck persistence actions. */
  canWriteTasks?: boolean;
  /** Bumps Kanban/task views after successful Supabase writes from the live workout player. */
  onWorkoutDeckPersisted?: () => void;
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
}: PreJoinBuilderProps) {
  const { state } = useLiveSessionRuntime();
  const { huddle } = useLiveTheaterLayoutPlanContext();
  const { isConnecting, joinChannel, joinError } = useAgoraSession();

  const deckSel = useWorkoutDeckSelectionOptional();
  const selectingFromBoard = Boolean(deckSel?.isSelectingFromBoard);

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

      <LiveSessionWorkoutPlayer
        className="min-h-0 min-w-0 flex-1"
        workspaceId={workspaceId}
        supabase={supabase}
        canWrite={canWriteTasks}
        onPersistSuccess={onWorkoutDeckPersisted}
      />

      <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-end">
        {joinError ? (
          <p className="text-xs text-destructive sm:mr-auto" role="alert">
            {joinError}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          variant="default"
          className="font-semibold"
          onClick={joinChannel}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting…' : 'Join video'}
        </Button>
      </div>
    </div>
  );
}
