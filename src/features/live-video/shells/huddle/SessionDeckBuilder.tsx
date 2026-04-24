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

export type SessionDeckBuilderProps = {
  state: SessionState;
  className?: string;
};

function ReadonlyDeckTile({
  snapshot,
  workspaceCategory,
  calendarTimezone,
  isCompleted,
  tallCardChrome,
  isActive,
}: {
  snapshot: SessionDeckSnapshot;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string | null;
  isCompleted: boolean;
  tallCardChrome?: boolean;
  isActive?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative w-64 shrink-0 cursor-default select-none rounded-xl transition-[box-shadow]',
        isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
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
      </div>
    </div>
  );
}

function SortableDeckTile({
  snapshot,
  workspaceCategory,
  calendarTimezone,
  isCompleted,
  tallCardChrome,
  isActive,
  onSelect,
  onRemove,
}: {
  snapshot: SessionDeckSnapshot;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string | null;
  isCompleted: boolean;
  tallCardChrome?: boolean;
  isActive: boolean;
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
      className={cn(
        'relative w-64 shrink-0 rounded-xl transition-[box-shadow]',
        isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
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
      </div>
    </div>
  );
}

const stripContainerClass = (selectingFromBoard: boolean) =>
  cn(
    'flex w-full items-center gap-4 overflow-x-auto border-y border-border bg-muted/20 p-4 custom-scrollbar',
    selectingFromBoard ? 'min-h-[min(200px,28vh)]' : 'min-h-[120px]',
  );

export function SessionDeckBuilder({ state, className }: SessionDeckBuilderProps) {
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
  const fallbackSupabase = useMemo(() => createClient(), []);

  const participantDeck = useLiveSessionDeck({
    supabase: runtime?.supabase ?? fallbackSupabase,
    sessionId: runtime?.sessionId ?? '',
    enabled: Boolean(runtime && !runtime.isHost && runtime.sessionId.trim()),
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
    if (!isDeckHostUi) return participantSnapshots;
    return deckContext !== null ? deckContext.deck : scaffoldDeck;
  }, [isDeckHostUi, participantSnapshots, deckContext, scaffoldDeck]);

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
        /** Persisted `live_session_deck_items.id`; participants match on `row.id`. */
        runtime.actions.setActiveDeckItem(snapshot.deckItemId ?? null);
      }
    },
    [runtime, setActiveSnapshotId],
  );

  useEffect(() => {
    if (!runtime?.isHost) return;
    if (!activeSnapshotId) {
      runtime.actions.setActiveDeckItem(null);
      return;
    }
    const snap = deckToRender.find((s) => s.snapshotId === activeSnapshotId);
    runtime.actions.setActiveDeckItem(snap?.deckItemId ?? null);
  }, [runtime, activeSnapshotId, deckToRender]);

  const enterSelectionMode = deckContext?.enterSelectionMode ?? (() => {});
  const selectingFromBoard = Boolean(isDeckHostUi && deckContext?.isSelectingFromBoard);

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

  const participantStatus = !isDeckHostUi ? (
    <div className="px-0.5">
      {participantDeck.loading ? (
        <p className="text-xs text-muted-foreground">Loading queue…</p>
      ) : participantDeck.error ? (
        <p className="text-xs text-destructive" role="alert">
          {participantDeck.error.message}
        </p>
      ) : null}
    </div>
  ) : null;

  if (!isDeckHostUi) {
    return (
      <div className={cn('flex w-full min-h-0 shrink-0 flex-col gap-2', className)}>
        <div className="flex shrink-0 items-baseline justify-between gap-2 px-0.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {stripTitle}
          </h2>
        </div>
        {participantStatus}
        <div className="min-h-0">
          <div className={stripContainerClass(false)}>
            {deckToRender.map((snapshot) => (
              <ReadonlyDeckTile
                key={snapshot.deckRowKey}
                snapshot={snapshot}
                workspaceCategory={workspaceCategory}
                calendarTimezone={calendarTimezone}
                isCompleted={taskColumnIsCompletionStatus(snapshot.task.status, columnDefs)}
                tallCardChrome={false}
                isActive={
                  state.activeDeckItemId != null && state.activeDeckItemId === snapshot.snapshotId
                }
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex w-full min-h-0 shrink-0 flex-col gap-2', className)}>
      <div className="flex shrink-0 items-baseline justify-between gap-2 px-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {stripTitle}
        </h2>
      </div>
      <div className="min-h-0">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            <div className={stripContainerClass(selectingFromBoard)}>
              {deckToRender.map((snapshot) => (
                <SortableDeckTile
                  key={snapshot.deckRowKey}
                  snapshot={snapshot}
                  workspaceCategory={workspaceCategory}
                  calendarTimezone={calendarTimezone}
                  isCompleted={taskColumnIsCompletionStatus(snapshot.task.status, columnDefs)}
                  tallCardChrome={selectingFromBoard}
                  isActive={activeSnapshotId === snapshot.snapshotId}
                  onSelect={() => onHostSelectSnapshot(snapshot)}
                  onRemove={() => removeSnapshot(snapshot.snapshotId)}
                />
              ))}

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
