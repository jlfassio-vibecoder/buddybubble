'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { KanbanTaskCard } from '@/components/board/kanban-task-card';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { useLiveSessionRuntimeOptional } from '@/features/live-video/theater/live-session-runtime-context';
import {
  useWorkoutDeckSelectionOptional,
  type SessionDeckSnapshot,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { cloneJsonMetadata } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { createClient } from '@utils/supabase/client';
import { cn } from '@/lib/utils';
import type { WorkspaceCategory } from '@/types/database';
import { useLayoutCommands } from '@/components/layout/layout-command-context';
import { SessionDeckWorkoutSummary } from '@/features/live-video/shells/huddle/SessionDeckWorkoutSummary';

export type SessionDeckBuilderProps = {
  state: SessionState;
  className?: string;
  /** When true, strip yields zero intrinsic height so parent grid collapse can animate. */
  isCollapsed?: boolean;
  /**
   * Class async playback: show the hydrated draft deck as read-only tiles; clicking selects the
   * active card for `ParticipantWorkoutLogger` (no reorder/remove).
   */
  asyncMemberReadOnlyQueue?: boolean;
  /** Required when `asyncMemberReadOnlyQueue` — `bb-class-deck:<classInstanceId>`. */
  asyncQueueSessionId?: string | null;
  selectedAsyncDeckItemId?: string | null;
  onAsyncSelectDeckItem?: (deckItemId: string | null) => void;
  /**
   * Solo Studio teleprompter: estimated parent card key (`deckItemId ?? snapshotId`).
   * Visual only — does not mutate host selection.
   */
  estimatedActiveDeckItemId?: string | null;
};

function teleprompterParentId(snapshot: SessionDeckSnapshot): string {
  return snapshot.deckItemId ?? snapshot.snapshotId;
}

function teleprompterRingClass(
  isActive: boolean | undefined,
  isTeleprompterFocus: boolean,
): string {
  if (isActive) return 'ring-2 ring-primary ring-offset-2 ring-offset-background';
  if (isTeleprompterFocus) return 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background';
  return '';
}

function ReadonlyDeckTile({
  snapshot,
  workspaceCategory,
  calendarTimezone,
  isCompleted,
  tallCardChrome,
  isActive,
  isTeleprompterFocus,
  onSelect,
}: {
  snapshot: SessionDeckSnapshot;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string | null;
  isCompleted: boolean;
  tallCardChrome?: boolean;
  isActive?: boolean;
  isTeleprompterFocus?: boolean;
  /** When set, tile is a button (async member picks active card for logging). */
  onSelect?: () => void;
}) {
  const summaryMode = tallCardChrome ? 'compact' : 'strip';
  const card = (
    <div
      data-teleprompter-deck-id={teleprompterParentId(snapshot)}
      className={cn(
        'relative w-64 shrink-0 rounded-xl transition-[box-shadow]',
        onSelect ? 'cursor-pointer select-none' : 'cursor-default select-none',
        teleprompterRingClass(isActive, Boolean(isTeleprompterFocus)),
      )}
    >
      <div className="rounded-xl">
        <KanbanTaskCard
          task={snapshot.task}
          canWrite={false}
          bubbles={[]}
          onMoveToBubble={() => {}}
          density="summary"
          workspaceCategory={workspaceCategory}
          calendarTimezone={calendarTimezone}
          isCompleted={isCompleted}
          className={cn(
            'overflow-hidden',
            tallCardChrome ? 'max-h-[min(480px,55vh)]' : 'max-h-[min(280px,40vh)]',
          )}
        />
        <SessionDeckWorkoutSummary
          metadata={snapshot.task.metadata}
          mode={summaryMode}
          taskId={null}
          className="px-0.5"
        />
      </div>
    </div>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className="relative shrink-0 rounded-xl border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
      >
        {card}
      </button>
    );
  }

  return card;
}

function SortableDeckTile({
  snapshot,
  workspaceCategory,
  calendarTimezone,
  isCompleted,
  tallCardChrome,
  isActive,
  isTeleprompterFocus,
  onSelect,
  onRemove,
}: {
  snapshot: SessionDeckSnapshot;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string | null;
  isCompleted: boolean;
  tallCardChrome?: boolean;
  isActive: boolean;
  isTeleprompterFocus?: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: snapshot.deckRowKey,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-teleprompter-deck-id={teleprompterParentId(snapshot)}
      className={cn(
        'relative w-64 shrink-0 rounded-xl transition-[box-shadow]',
        teleprompterRingClass(isActive, Boolean(isTeleprompterFocus)),
      )}
    >
      <button
        type="button"
        className="absolute right-1 top-1 z-10 rounded-md bg-background/90 p-1 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
        aria-label="Remove from deck"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3.5" />
      </button>
      <div
        role="button"
        tabIndex={0}
        className="cursor-pointer rounded-xl"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
      >
        <KanbanTaskCard
          task={snapshot.task}
          canWrite={false}
          bubbles={[]}
          onMoveToBubble={() => {}}
          density="summary"
          workspaceCategory={workspaceCategory}
          calendarTimezone={calendarTimezone}
          isCompleted={isCompleted}
          className={cn(
            'overflow-hidden',
            tallCardChrome ? 'max-h-[min(480px,55vh)]' : 'max-h-[min(280px,40vh)]',
          )}
          dragHandle={
            <button
              type="button"
              className="cursor-grab touch-none active:cursor-grabbing"
              aria-label="Drag to reorder deck"
              {...listeners}
              {...attributes}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="size-4" />
            </button>
          }
        />
        <SessionDeckWorkoutSummary
          metadata={snapshot.task.metadata}
          mode={tallCardChrome ? 'compact' : 'strip'}
          taskId={null}
          className="px-0.5"
        />
      </div>
    </div>
  );
}

const stripContainerClass = (selectingFromBoard: boolean, isCollapsed?: boolean) => {
  if (isCollapsed) {
    return 'flex w-full min-h-0 overflow-hidden opacity-0 border-0 p-0';
  }
  return cn(
    'flex w-full items-center gap-4 overflow-x-auto border-y border-border bg-muted/20 p-4 custom-scrollbar',
    selectingFromBoard ? 'min-h-[min(200px,28vh)]' : 'min-h-[120px]',
  );
};

export function SessionDeckBuilder({
  state,
  className,
  isCollapsed = false,
  asyncMemberReadOnlyQueue = false,
  asyncQueueSessionId = null,
  selectedAsyncDeckItemId = null,
  onAsyncSelectDeckItem,
  estimatedActiveDeckItemId = null,
}: SessionDeckBuilderProps) {
  const { focusBoard } = useLayoutCommands();
  const runtime = useLiveSessionRuntimeOptional();
  /**
   * `LiveSessionRuntimeProvider` is always mounted in the dashboard with `sessionId: ''` when
   * idle, so `runtime.isHost` is false even though the user is not in a participant role. Only
   * treat them as a live-session participant when a real session id exists and they are not host.
   */
  const liveSessionActive = Boolean(runtime?.sessionId?.trim());
  const isLiveSessionParticipant = Boolean(runtime && liveSessionActive && !runtime.isHost);
  /** Editable host queue (DnD + board picker): not a joined non-host participant. */
  const isDeckHostUi = !isLiveSessionParticipant;
  const isAsyncMemberQueue = Boolean(
    asyncMemberReadOnlyQueue && (asyncQueueSessionId?.trim() ?? '').length > 0,
  );
  /** Host builder / live host strip — never async member playback strip. */
  const showHostDeckUi = isDeckHostUi && !isAsyncMemberQueue;
  const fallbackSupabase = useMemo(() => createClient(), []);

  const participantDeck = useLiveSessionDeck({
    supabase: runtime?.supabase ?? fallbackSupabase,
    sessionId: runtime?.sessionId ?? '',
    enabled: Boolean(runtime && !runtime.isHost && runtime.sessionId.trim()),
  });

  // Copilot suggestion ignored: async member tiles come from provider-hydrated deck; this hook only supplies loading/error for the same session id—merging into one source would be a larger refactor.
  const asyncQueueDeck = useLiveSessionDeck({
    supabase: runtime?.supabase ?? fallbackSupabase,
    sessionId: asyncQueueSessionId?.trim() ?? '',
    enabled: isAsyncMemberQueue,
  });

  const participantSnapshots = useMemo((): SessionDeckSnapshot[] => {
    return participantDeck.rows
      .filter((row) => row.tasks != null)
      .map((row) => ({
        deckRowKey: row.id,
        snapshotId: row.id,
        deckItemId: row.id,
        originTaskId: row.task_id,
        task: row.tasks!,
        baselineMetadata: cloneJsonMetadata(row.tasks!.metadata),
        dirty: false,
      }));
  }, [participantDeck.rows]);

  const deckContext = useWorkoutDeckSelectionOptional();
  const [scaffoldDeck, setScaffoldDeck] = useState<SessionDeckSnapshot[]>([]);

  const deckToRender = useMemo(() => {
    if (isAsyncMemberQueue) return deckContext?.deck ?? [];
    if (!isDeckHostUi) return participantSnapshots;
    return deckContext !== null ? deckContext.deck : scaffoldDeck;
  }, [isAsyncMemberQueue, deckContext, isDeckHostUi, participantSnapshots, scaffoldDeck]);

  const applyDeckOrder = useCallback(
    (updater: (prev: SessionDeckSnapshot[]) => SessionDeckSnapshot[]) => {
      if (deckContext !== null) {
        deckContext.setDeckOrder(updater);
      } else {
        setScaffoldDeck(updater);
      }
    },
    [deckContext],
  );

  const setActiveSnapshotId = deckContext?.setActiveSnapshotId ?? (() => {});
  const removeSnapshot = deckContext?.removeSnapshot ?? (() => {});
  const activeSnapshotId = deckContext?.activeSnapshotId ?? null;

  const onHostSelectSnapshot = useCallback(
    (snapshot: SessionDeckSnapshot) => {
      setActiveSnapshotId(snapshot.snapshotId);
      if (runtime?.isHost) {
        focusBoard();
        /** Persisted `live_session_deck_items.id`; participants match on `row.id`. */
        runtime.actions.setActiveDeckItem(snapshot.deckItemId ?? null);
      }
    },
    [focusBoard, runtime, setActiveSnapshotId],
  );

  useEffect(() => {
    if (isAsyncMemberQueue) return;
    if (!runtime?.isHost) return;
    if (!activeSnapshotId) {
      runtime.actions.setActiveDeckItem(null);
      return;
    }
    const snap = deckToRender.find((s) => s.snapshotId === activeSnapshotId);
    runtime.actions.setActiveDeckItem(snap?.deckItemId ?? null);
  }, [isAsyncMemberQueue, runtime, activeSnapshotId, deckToRender]);

  const enterSelectionMode = deckContext?.enterSelectionMode ?? (() => {});
  const selectingFromBoard = Boolean(showHostDeckUi && deckContext?.isSelectingFromBoard);

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const workspaceId = activeWorkspace?.id ?? null;
  const workspaceCategory = activeWorkspace?.category_type ?? null;
  const calendarTimezone = activeWorkspace?.calendar_timezone ?? null;
  const columnDefs = useBoardColumnDefs(workspaceId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      applyDeckOrder((prevDeck) => {
        const oldIndex = prevDeck.findIndex((s) => s.deckRowKey === activeId);
        const newIndex = prevDeck.findIndex((s) => s.deckRowKey === overId);
        if (oldIndex < 0 || newIndex < 0) return prevDeck;
        return arrayMove(prevDeck, oldIndex, newIndex);
      });
    },
    [applyDeckOrder],
  );

  const uiMode = useMemo(
    () => (state.globalStartedAt != null || state.status !== 'idle' ? 'live' : 'builder'),
    [state.globalStartedAt, state.status],
  );

  const stripTitle = uiMode === 'live' ? 'Up next' : 'Workout queue';

  const ids = useMemo(() => deckToRender.map((s) => s.deckRowKey), [deckToRender]);

  const participantStatus = !showHostDeckUi ? (
    <div className="px-0.5">
      {(isAsyncMemberQueue ? asyncQueueDeck.loading : participantDeck.loading) ? (
        <p className="text-xs text-muted-foreground">Loading queue…</p>
      ) : (isAsyncMemberQueue ? asyncQueueDeck.error : participantDeck.error) ? (
        <p className="text-xs text-destructive" role="alert">
          {(isAsyncMemberQueue ? asyncQueueDeck.error : participantDeck.error)?.message}
        </p>
      ) : null}
    </div>
  ) : null;

  if (!showHostDeckUi) {
    return (
      <div
        className={cn(
          'flex w-full min-h-0 flex-col',
          !isCollapsed && 'shrink-0 gap-2',
          isCollapsed && 'min-h-0 gap-0',
          className,
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-baseline justify-between gap-2 px-0.5',
            isCollapsed && 'hidden',
          )}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {stripTitle}
          </h2>
        </div>
        {isCollapsed ? null : participantStatus}
        <div className="min-h-0">
          <div
            data-testid="session-deck-strip-container"
            className={stripContainerClass(false, isCollapsed)}
          >
            {deckToRender.map((snapshot) => {
              const parentId = teleprompterParentId(snapshot);
              const isActive = isAsyncMemberQueue
                ? selectedAsyncDeckItemId != null && selectedAsyncDeckItemId === snapshot.snapshotId
                : state.activeDeckItemId != null && state.activeDeckItemId === snapshot.snapshotId;
              return (
                <ReadonlyDeckTile
                  key={snapshot.deckRowKey}
                  snapshot={snapshot}
                  workspaceCategory={workspaceCategory}
                  calendarTimezone={calendarTimezone}
                  isCompleted={taskColumnIsCompletionStatus(snapshot.task.status, columnDefs)}
                  tallCardChrome={false}
                  isActive={isActive}
                  isTeleprompterFocus={
                    estimatedActiveDeckItemId != null && estimatedActiveDeckItemId === parentId
                  }
                  onSelect={
                    isAsyncMemberQueue
                      ? () => onAsyncSelectDeckItem?.(snapshot.deckItemId ?? snapshot.snapshotId)
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full min-h-0 flex-col',
        !isCollapsed && 'shrink-0 gap-2',
        isCollapsed && 'min-h-0 gap-0',
        className,
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-baseline justify-between gap-2 px-0.5',
          isCollapsed && 'hidden',
        )}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {stripTitle}
        </h2>
      </div>
      <div className="min-h-0">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            <div
              data-testid="session-deck-strip-container"
              className={stripContainerClass(selectingFromBoard, isCollapsed)}
            >
              {deckToRender.map((snapshot) => {
                const parentId = teleprompterParentId(snapshot);
                const isActive = activeSnapshotId === snapshot.snapshotId;
                return (
                  <SortableDeckTile
                    key={snapshot.deckRowKey}
                    snapshot={snapshot}
                    workspaceCategory={workspaceCategory}
                    calendarTimezone={calendarTimezone}
                    isCompleted={taskColumnIsCompletionStatus(snapshot.task.status, columnDefs)}
                    tallCardChrome={selectingFromBoard}
                    isActive={isActive}
                    isTeleprompterFocus={
                      estimatedActiveDeckItemId != null && estimatedActiveDeckItemId === parentId
                    }
                    onSelect={() => onHostSelectSnapshot(snapshot)}
                    onRemove={() => removeSnapshot(snapshot.snapshotId)}
                  />
                );
              })}

              <button
                type="button"
                className={cn(
                  'flex w-64 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:bg-muted/50',
                  selectingFromBoard
                    ? 'min-h-[min(200px,45vh)] self-stretch'
                    : 'h-full min-h-[100px]',
                )}
                title={
                  selectingFromBoard
                    ? 'Scroll the Kanban into view and clear the highlighted deck tile'
                    : undefined
                }
                onClick={() => {
                  if (runtime?.isHost) {
                    focusBoard();
                  }
                  if (selectingFromBoard) {
                    setActiveSnapshotId(null);
                    queueMicrotask(() => {
                      document
                        .querySelector('[data-workspace-kanban-stage]')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }
                  enterSelectionMode();
                }}
              >
                <span className="text-sm font-medium">
                  {selectingFromBoard ? 'Go to board & add more' : '+ Add from Board'}
                </span>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
