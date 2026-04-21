'use client';

import { useCallback, useMemo, useState } from 'react';
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
import {
  useWorkoutDeckSelectionOptional,
  type SessionDeckSnapshot,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/lib/utils';
import type { WorkspaceCategory } from '@/types/database';

export type SessionDeckBuilderProps = {
  state: SessionState;
  className?: string;
};

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
    id: snapshot.snapshotId,
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

export function SessionDeckBuilder({ state, className }: SessionDeckBuilderProps) {
  const deckContext = useWorkoutDeckSelectionOptional();
  const [scaffoldDeck, setScaffoldDeck] = useState<SessionDeckSnapshot[]>([]);
  /** Prefer context deck whenever the provider is mounted (never mix with scaffold). */
  const deckToRender = deckContext !== null ? deckContext.deck : scaffoldDeck;

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

  const enterSelectionMode = deckContext?.enterSelectionMode ?? (() => {});
  const selectingFromBoard = Boolean(deckContext?.isSelectingFromBoard);

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
        const oldIndex = prevDeck.findIndex((s) => s.snapshotId === activeId);
        const newIndex = prevDeck.findIndex((s) => s.snapshotId === overId);
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

  const ids = useMemo(() => deckToRender.map((s) => s.snapshotId), [deckToRender]);

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
            <div
              className={cn(
                'flex w-full items-center gap-4 overflow-x-auto border-y border-border bg-muted/20 p-4 custom-scrollbar',
                selectingFromBoard ? 'min-h-[min(200px,28vh)]' : 'min-h-[120px]',
              )}
            >
              {deckToRender.map((snapshot) => (
                <SortableDeckTile
                  key={snapshot.snapshotId}
                  snapshot={snapshot}
                  workspaceCategory={workspaceCategory}
                  calendarTimezone={calendarTimezone}
                  isCompleted={taskColumnIsCompletionStatus(snapshot.task.status, columnDefs)}
                  tallCardChrome={selectingFromBoard}
                  isActive={activeSnapshotId === snapshot.snapshotId}
                  onSelect={() => setActiveSnapshotId(snapshot.snapshotId)}
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
