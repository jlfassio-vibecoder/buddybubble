'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { useLayoutCommands } from '@/components/layout/layout-command-context';
import { formatUserFacingError } from '@/lib/format-error';
import { classDeckBuilderSessionId } from '@/lib/fitness/class-deck-builder-session-id';
import { dispatchWorkoutDeckTaskFromBoard } from '@/features/live-video/shells/huddle/workout-deck-board-bridge';
import { LiveSessionWorkoutPlayer } from '@/features/live-video/shells/huddle/LiveSessionWorkoutPlayer';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import {
  WorkoutDeckSelectionProvider,
  useWorkoutDeckSelection,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';
import { useUserProfileStore } from '@/store/userProfileStore';
import { cn } from '@/lib/utils';
import type {
  BubbleRow,
  ItemType,
  Json,
  MemberRole,
  TaskRow,
  WorkspaceCategory,
} from '@/types/database';
import type { OpenTaskOptions } from '@/types/open-task-options';
import { toast } from 'sonner';

const WORKOUTS_BUBBLE_NAME = 'Workouts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidClassInstanceIdForDeckBuilder(value: string | null | undefined): boolean {
  const t = value?.trim() ?? '';
  return t.length > 0 && UUID_RE.test(t);
}

export type StandaloneClassDeckBuilderProps = {
  classInstanceId: string;
  workspaceId: string;
  bubbles: BubbleRow[];
  selectedBubbleId: string | null;
  setSelectedBubbleId: (id: string) => void;
  canWriteTasks: boolean;
  onWorkoutDeckPersisted: () => void;
  onClose: () => void;
  onOpenTask: (id: string, opts?: OpenTaskOptions) => void;
  onOpenCreateTask: (opts?: {
    status?: string;
    itemType?: ItemType;
    title?: string;
    workoutDurationMin?: string | null;
    bubbleId?: string | null;
    classEditorInstanceId?: string | null;
    preserveChatCallback?: boolean;
  }) => void;
  onStartWorkout: (task: TaskRow) => void;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string | null;
  boardStripExpandNonce: number;
  calendarStripCollapsed: boolean;
  onExpandCalendarWhenKanbanStripCollapse: () => void;
  onRetractKanbanPanel: () => void;
  buddyBubbleTitle: string;
  workspaceMemberRole: MemberRole;
  guestTaskUserId: string | null;
  className?: string;
};

function StandaloneClassDeckBuilderInner({
  classInstanceId,
  workspaceId,
  bubbles,
  selectedBubbleId,
  setSelectedBubbleId,
  canWriteTasks,
  onWorkoutDeckPersisted,
  onClose,
  onOpenTask,
  onOpenCreateTask,
  onStartWorkout,
  workspaceCategory,
  calendarTimezone,
  boardStripExpandNonce,
  calendarStripCollapsed,
  onExpandCalendarWhenKanbanStripCollapse,
  onRetractKanbanPanel,
  buddyBubbleTitle,
  workspaceMemberRole,
  guestTaskUserId,
  className,
}: StandaloneClassDeckBuilderProps) {
  const supabase = createClient();
  const { focusBoard } = useLayoutCommands();
  const deckCtx = useWorkoutDeckSelection();
  const profileId = useUserProfileStore((s) => s.profile?.id ?? null);
  const [isSavingWorkouts, setIsSavingWorkouts] = useState(false);

  /** Bubble selected when the builder opened (restore on Done). */
  const entryBubbleRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (entryBubbleRef.current !== null) return;
    entryBubbleRef.current = selectedBubbleId;
  }, [selectedBubbleId]);

  const prevSelectingRef = useRef(false);
  const bubbleBeforePickRef = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[StandaloneClassDeckBuilder] Initialized with class instance:', classInstanceId);
    }
  }, [classInstanceId]);

  useEffect(() => {
    const sel = deckCtx.isSelectingFromBoard;
    if (sel && !prevSelectingRef.current) {
      bubbleBeforePickRef.current = selectedBubbleId;
      const workoutsBubble = bubbles.find((b) => b.name === WORKOUTS_BUBBLE_NAME);
      if (workoutsBubble) {
        setSelectedBubbleId(workoutsBubble.id);
      } else {
        toast.error(
          `Add a "${WORKOUTS_BUBBLE_NAME}" channel to pick workout cards from the board.`,
        );
      }
      focusBoard();
    } else if (!sel && prevSelectingRef.current) {
      const back = bubbleBeforePickRef.current;
      if (back != null) {
        setSelectedBubbleId(back);
      }
    }
    prevSelectingRef.current = sel;
  }, [deckCtx.isSelectingFromBoard, selectedBubbleId, bubbles, setSelectedBubbleId, focusBoard]);

  /** Exit Kanban pick mode only — keep builder mounted so the trainer can edit / persist in the player. */
  const handleDonePicking = useCallback(() => {
    deckCtx.exitSelectionMode();
  }, [deckCtx]);

  /** Leave the class deck builder (clears URL param); unsaved exercise edits stay dirty until Save Workouts. */
  const handleCloseBuilder = useCallback(() => {
    deckCtx.exitSelectionMode();
    const back = entryBubbleRef.current;
    if (back != null) {
      setSelectedBubbleId(back);
    }
    onClose();
  }, [deckCtx, onClose, setSelectedBubbleId]);

  /** Persist session exercise overlays and attach deck to the class instance; keeps builder open. */
  const handleSaveWorkouts = useCallback(async () => {
    if (isSavingWorkouts) return;
    setIsSavingWorkouts(true);
    try {
      const ok = await deckCtx.flushDirtySessionMetadata();
      if (!ok) return;

      onWorkoutDeckPersisted();

      if (!profileId) {
        toast.error('Sign in to save class workouts.');
        return;
      }

      const deckSessionId = classDeckBuilderSessionId(classInstanceId);
      const { data: inst, error: fetchErr } = await supabase
        .from('class_instances')
        .select('metadata')
        .eq('id', classInstanceId)
        .maybeSingle();

      if (fetchErr) {
        toast.error(formatUserFacingError(fetchErr));
        return;
      }

      const base =
        inst?.metadata && typeof inst.metadata === 'object' && !Array.isArray(inst.metadata)
          ? { ...(inst.metadata as Record<string, unknown>) }
          : {};
      /** Keep `live_session` when both live and async are enabled on the class. */
      base.async_session = {
        type: 'async_session',
        sessionId: deckSessionId,
        createdAt: new Date().toISOString(),
        hostUserId: profileId,
      };

      const { error: upErr } = await supabase
        .from('class_instances')
        .update({ metadata: base as Json })
        .eq('id', classInstanceId);

      if (upErr) {
        toast.error(formatUserFacingError(upErr));
        return;
      }

      toast.success('Workouts saved');
    } finally {
      setIsSavingWorkouts(false);
    }
  }, [classInstanceId, deckCtx, isSavingWorkouts, onWorkoutDeckPersisted, profileId, supabase]);

  const selecting = deckCtx.isSelectingFromBoard;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-4', className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <SessionHeader
          className="min-w-0 flex-1 border-b-0 pb-0 text-left"
          isSelectingFromBoard={selecting}
          uiMode="builder"
          titleOverride="Class workout deck"
          subtitleOverride={
            selecting
              ? undefined
              : 'Build the queue and exercises for this class. No live video — changes save to this class draft.'
          }
        />
        {selecting ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="shrink-0"
            onClick={handleDonePicking}
          >
            Done Picking
          </Button>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={isSavingWorkouts}
              onClick={handleCloseBuilder}
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="shrink-0"
              disabled={isSavingWorkouts}
              onClick={() => void handleSaveWorkouts()}
            >
              {isSavingWorkouts ? 'Saving…' : 'Save Workouts'}
            </Button>
          </div>
        )}
      </div>

      <SessionDeckBuilder className="min-h-0 min-w-0 shrink-0" state={initialSessionState} />

      {selecting ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <KanbanBoard
            canWrite={canWriteTasks}
            bubbles={bubbles}
            onOpenTask={onOpenTask}
            onOpenCreateTask={onOpenCreateTask}
            onStartWorkout={onStartWorkout}
            workspaceCategory={workspaceCategory}
            calendarTimezone={calendarTimezone}
            boardStripExpandNonce={boardStripExpandNonce}
            calendarStripCollapsed={calendarStripCollapsed}
            onExpandCalendarWhenKanbanStripCollapse={onExpandCalendarWhenKanbanStripCollapse}
            onRetractKanbanPanel={onRetractKanbanPanel}
            buddyBubbleTitle={buddyBubbleTitle}
            workspaceMemberRole={workspaceMemberRole}
            guestTaskUserId={guestTaskUserId}
            workoutSelectionMode
            onTaskSelectedForWorkoutDeck={(task) =>
              dispatchWorkoutDeckTaskFromBoard(task, deckCtx.addTaskToDeck)
            }
          />
        </div>
      ) : (
        <LiveSessionWorkoutPlayer
          className="min-h-0 min-w-0 flex-1"
          workspaceId={workspaceId}
          supabase={supabase}
          canWrite={canWriteTasks}
          onPersistSuccess={onWorkoutDeckPersisted}
          onHostLayoutFocusBoard={focusBoard}
        />
      )}
    </div>
  );
}

/**
 * Video-free workout deck authoring for a class instance. Persists to `live_session_deck_items`
 * with session_id `bb-class-deck:<classInstanceId>`.
 */
export function StandaloneClassDeckBuilder(props: StandaloneClassDeckBuilderProps) {
  const profileId = useUserProfileStore((s) => s.profile?.id ?? null);
  const deckSessionId = classDeckBuilderSessionId(props.classInstanceId);

  if (!profileId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Sign in to edit the class workout deck.
      </div>
    );
  }

  return (
    <WorkoutDeckSelectionProvider
      key={deckSessionId}
      sessionIdOverride={deckSessionId}
      hostUserIdOverride={profileId}
      disableGlobalBoardBridge={false}
    >
      <StandaloneClassDeckBuilderInner {...props} />
    </WorkoutDeckSelectionProvider>
  );
}
