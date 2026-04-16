'use client';

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  ExternalLink,
  GripVertical,
  ListChecks,
  ListTree,
  MessageCircle,
  Pencil,
  Play,
  User,
} from 'lucide-react';
import {
  normalizeItemType,
  type BubbleRow,
  type TaskRow,
  type WorkspaceCategory,
} from '@/types/database';
import { getItemTypeVisual } from '@/lib/item-type-styles';
import { normalizeTaskPriority, type TaskPriority } from '@/lib/task-priority';
import { asComments, asSubtasks } from '@/types/task-modal';
import type { OpenTaskOptions } from '@/components/modals/TaskModal';
import { metadataFieldsFromParsed, parseTaskMetadata } from '@/lib/item-metadata';
import type { KanbanCardDensity } from '@/components/board/kanban-density';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { taskDateFieldLabels } from '@/lib/task-date-labels';
import { scheduledOnRelativeToWorkspaceToday } from '@/lib/workspace-calendar';
import { formatScheduledTimeDisplay } from '@/lib/task-scheduled-time';
import { usePresenceStore, type UserPresence } from '@/store/presenceStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import { CardTabStrip } from '@/components/tasks/card-tab-strip';
import { taskCardCoverPath, useTaskCardCoverUrl } from '@/lib/task-card-cover';

export type KanbanTaskCardProps = {
  task: TaskRow;
  canWrite: boolean;
  bubbles: BubbleRow[];
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  /** Opens the Workout Player directly for workout / workout_log cards. */
  onStartWorkout?: (task: TaskRow) => void;
  /** Controls how much information is shown on the card (board-level setting). */
  density?: KanbanCardDensity;
  /** Workspace template — drives date chip label (Due vs Scheduled). */
  workspaceCategory?: WorkspaceCategory | null;
  /** Workspace calendar timezone for overdue / today styling. */
  calendarTimezone?: string | null;
  /** Done / complete column — calendar & board apply muted + struck title. */
  isCompleted?: boolean;
  className?: string;
  /**
   * Drag handle only — parent attaches `useSortable` listeners here via `ref` + spread props.
   * Omit for read-only lists; pass a decorative node for DragOverlay parity.
   */
  dragHandle?: ReactNode;
  /** Bubble Up (Bubbly); parent loads counts via `useTaskBubbleUps`. */
  bubbleUp?: Omit<TaskBubbleUpControlProps, 'density'>;
  /**
   * When true (main Kanban board only), users can hide the card cover image on the board
   * while keeping title, pills, and description; preference is stored per task in `localStorage`.
   */
  showKanbanCoverToggle?: boolean;
};

const KANBAN_HIDE_COVER_KEY = 'bb.kanban.hideCardCover';

function persistKanbanCoverHidden(taskId: string, hidden: boolean) {
  try {
    if (hidden) {
      localStorage.setItem(`${KANBAN_HIDE_COVER_KEY}.${taskId}`, '1');
    } else {
      localStorage.removeItem(`${KANBAN_HIDE_COVER_KEY}.${taskId}`);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

function readKanbanCoverHiddenFromStorage(taskId: string, enabled: boolean): boolean {
  if (!enabled || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`${KANBAN_HIDE_COVER_KEY}.${taskId}`) === '1';
  } catch {
    return false;
  }
}

function subtaskProgress(task: TaskRow): { done: number; total: number } | null {
  const st = asSubtasks(task.subtasks);
  if (st.length === 0) return null;
  return { done: st.filter((s) => s.done).length, total: st.length };
}

function priorityChip(p: TaskPriority): { label: string; className: string } {
  const base = 'border border-border/40 bg-clip-padding';
  if (p === 'high') {
    return {
      label: 'High',
      className: cn(
        base,
        'border-[color:color-mix(in_srgb,var(--accent-red)_38%,transparent)] bg-[var(--accent-red-bg)] text-[var(--accent-red-text)]',
      ),
    };
  }
  if (p === 'low') {
    return {
      label: 'Low',
      className: cn(
        base,
        'border-[color:color-mix(in_srgb,var(--accent-green)_38%,transparent)] bg-[var(--accent-green-bg)] text-[var(--accent-green-text)]',
      ),
    };
  }
  return {
    label: 'Medium',
    className: cn(
      base,
      'border-[color:color-mix(in_srgb,var(--accent-orange)_38%,transparent)] bg-[var(--accent-orange-bg)] text-[var(--accent-orange-text)]',
    ),
  };
}

function taskRowHasWorkoutViewerContent(task: TaskRow): boolean {
  const kind = normalizeItemType(task.item_type);
  if (kind !== 'workout' && kind !== 'workout_log') return false;
  const meta = parseTaskMetadata(task.metadata);
  if (metadataFieldsFromParsed(meta).workoutExercises.length > 0) return true;
  const o = meta as Record<string, unknown>;
  const ai = o.ai_workout_factory;
  if (!ai || typeof ai !== 'object') return false;
  const ws = (ai as { workout_set?: unknown }).workout_set;
  return ws != null && typeof ws === 'object';
}

function KanbanCardQuickActions({
  variant,
  task,
  commentCount,
  onOpenTask,
  onStartWorkout,
}: {
  variant: 'cover' | 'default';
  task: TaskRow;
  commentCount: number;
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  onStartWorkout?: (task: TaskRow) => void;
}) {
  const cover = variant === 'cover';
  const base =
    'mt-0.5 rounded-md p-1 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  const neutral = cover
    ? 'text-white/85 hover:bg-white/15 hover:text-white'
    : 'text-muted-foreground hover:bg-muted hover:text-foreground';
  const play = cover
    ? 'text-white/85 hover:bg-white/15 hover:text-white'
    : 'text-muted-foreground hover:bg-muted hover:text-primary';
  const showQuickView = Boolean(onOpenTask && taskRowHasWorkoutViewerContent(task));

  return (
    <div
      className="flex shrink-0 items-start justify-end gap-0.5"
      role="toolbar"
      aria-label="Card quick actions"
    >
      {showQuickView ? (
        <button
          type="button"
          className={cn(base, neutral)}
          aria-label="Quick view workout"
          title="Quick view"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenTask?.(task.id, { viewMode: 'full', openWorkoutViewer: true });
          }}
        >
          <ListTree className="size-4" aria-hidden />
        </button>
      ) : null}
      {onStartWorkout && (task.item_type === 'workout' || task.item_type === 'workout_log') ? (
        <button
          type="button"
          className={cn(base, play)}
          aria-label="Open workout player"
          title="Workout player"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onStartWorkout(task);
          }}
        >
          <Play className="size-4" aria-hidden />
        </button>
      ) : null}
      {onOpenTask ? (
        <>
          <button
            type="button"
            className={cn(base, neutral)}
            aria-label="Edit card"
            title="Edit details"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenTask(task.id, { tab: 'details', viewMode: 'full', autoEdit: true });
            }}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className={cn(base, 'relative', neutral)}
            aria-label="Open comments"
            title="Comments"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenTask(task.id, { tab: 'comments', viewMode: 'comments-only' });
            }}
          >
            <MessageCircle className="size-4" aria-hidden />
            {commentCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
                {commentCount > 99 ? '99+' : commentCount}
              </span>
            ) : null}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function KanbanTaskCard({
  task,
  canWrite,
  bubbles,
  onMoveToBubble,
  onOpenTask,
  onStartWorkout,
  density = 'full',
  workspaceCategory = null,
  calendarTimezone = null,
  isCompleted = false,
  className,
  dragHandle,
  bubbleUp,
  showKanbanCoverToggle = false,
}: KanbanTaskCardProps) {
  const subtasks = subtaskProgress(task);
  const itemKind = normalizeItemType(task.item_type);
  const typeVisual = getItemTypeVisual(itemKind);
  const TypeIcon = typeVisual.Icon;
  const pChip = priorityChip(normalizeTaskPriority(task.priority));
  const ymd = task.scheduled_on ? String(task.scheduled_on).slice(0, 10) : null;
  const dateRel = scheduledOnRelativeToWorkspaceToday(ymd, calendarTimezone ?? undefined);
  const dateShort = taskDateFieldLabels(workspaceCategory).short;
  let dateFormatted: string | null = null;
  if (ymd) {
    try {
      dateFormatted = format(parseISO(`${ymd}T12:00:00`), 'MMM d');
    } catch {
      dateFormatted = ymd;
    }
  }
  const timeLabel = formatScheduledTimeDisplay(task.scheduled_time);
  const dateAndTimeLabel =
    dateFormatted && timeLabel ? `${dateFormatted} · ${timeLabel}` : dateFormatted;
  const dateChipClass =
    dateRel === 'past'
      ? 'border-[color:color-mix(in_srgb,var(--accent-red)_40%,transparent)] bg-[var(--accent-red-bg)] text-[var(--accent-red-text)]'
      : dateRel === 'today'
        ? 'border-[color:color-mix(in_srgb,var(--accent-yellow)_40%,transparent)] bg-[var(--accent-yellow-bg)] text-[var(--accent-yellow-text)]'
        : 'border-[color:color-mix(in_srgb,var(--accent-blue)_35%,transparent)] bg-[var(--accent-blue-bg)] text-[var(--accent-blue-text)]';
  const showDescription = density === 'full' || density === 'detailed';
  const showBubble =
    (density === 'full' || density === 'detailed') && canWrite && bubbles.length > 0;
  const showDetailedMeta = density === 'detailed';
  const commentCount = asComments(task.comments).length;

  const openTask = onOpenTask ? () => onOpenTask(task.id, { viewMode: 'full' }) : undefined;

  const presenceUsers = usePresenceStore((s) => s.users);
  const localUserId = useUserProfileStore((s) => s.profile?.id);
  const taskPresencePeers = useMemo(() => {
    const peers: UserPresence[] = [];
    for (const u of presenceUsers.values()) {
      if (u.user_id === localUserId) continue;
      if (u.focus_type === 'task' && u.focus_id === task.id) peers.push(u);
    }
    return peers;
  }, [presenceUsers, localUserId, task.id]);

  const primaryPeer = taskPresencePeers[0];
  const hasPeerPresence = taskPresencePeers.length > 0;

  const kanbanCoverStoragePath = density === 'micro' ? null : taskCardCoverPath(task);
  const [hideCoverOnBoard, setHideCoverOnBoard] = useState(() =>
    readKanbanCoverHiddenFromStorage(task.id, showKanbanCoverToggle),
  );
  useEffect(() => {
    if (!showKanbanCoverToggle) {
      setHideCoverOnBoard(false);
      return;
    }
    try {
      setHideCoverOnBoard(localStorage.getItem(`${KANBAN_HIDE_COVER_KEY}.${task.id}`) === '1');
    } catch {
      setHideCoverOnBoard(false);
    }
  }, [showKanbanCoverToggle, task.id]);

  const coverPathForSignedUrl =
    showKanbanCoverToggle && hideCoverOnBoard ? null : kanbanCoverStoragePath;
  const { url: kanbanCoverUrl, loading: kanbanCoverLoading } =
    useTaskCardCoverUrl(coverPathForSignedUrl);
  const kanbanCoverFailed =
    Boolean(coverPathForSignedUrl) && !kanbanCoverLoading && !kanbanCoverUrl;

  const useCoverHero = Boolean(
    kanbanCoverStoragePath && !kanbanCoverFailed && !(showKanbanCoverToggle && hideCoverOnBoard),
  );
  const peerBadgeLabel =
    hasPeerPresence && primaryPeer
      ? taskPresencePeers.length > 1
        ? `${primaryPeer.name} +${taskPresencePeers.length - 1}`
        : primaryPeer.name
      : '';
  const peerPresenceStyle: CSSProperties | undefined =
    hasPeerPresence && primaryPeer ? { boxShadow: `0 0 0 2px ${primaryPeer.color}` } : undefined;

  const handleOpenKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!openTask) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openTask();
    }
  };

  if (density === 'micro') {
    return (
      <div className="relative">
        <Card
          style={peerPresenceStyle}
          className={cn(
            'border-border/80 border-l-2 shadow-sm ring-1 ring-border/40 transition-shadow hover:shadow-md',
            typeVisual.leftBar,
            typeVisual.surface,
            isCompleted && 'opacity-[0.68]',
            className,
          )}
          size="sm"
        >
          <CardContent className="p-1 px-2">
            <div className="flex min-h-0 items-center gap-1">
              {dragHandle ? (
                <div className="shrink-0 text-muted-foreground [&_button]:-m-0.5 [&_button]:rounded-md [&_button]:p-0.5 [&_button]:hover:bg-muted [&_button]:hover:text-foreground">
                  {dragHandle}
                </div>
              ) : null}
              <div
                className={cn(
                  'min-w-0 flex-1',
                  openTask &&
                    'cursor-pointer rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
                role={openTask ? 'button' : undefined}
                tabIndex={openTask ? 0 : undefined}
                onClick={openTask}
                onKeyDown={handleOpenKeyDown}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <TypeIcon className={cn('size-3 shrink-0', typeVisual.iconText)} aria-hidden />
                  <p
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs font-semibold leading-tight text-foreground',
                      isCompleted && 'line-through decoration-muted-foreground/80',
                    )}
                  >
                    {task.title}
                  </p>
                </div>
              </div>
            </div>
            {onOpenTask || bubbleUp ? (
              <div
                className="mt-1 border-t border-border/60 pt-1"
                data-kanban-no-open
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <CardTabStrip
                  taskId={task.id}
                  onOpenTask={onOpenTask}
                  bubbleUp={bubbleUp}
                  bubblyDensity="micro"
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
        {hasPeerPresence && primaryPeer ? (
          <div
            className="absolute -top-2.5 -right-2 z-10 max-w-[120px] truncate rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: primaryPeer.color }}
            title={taskPresencePeers.map((p) => p.name).join(', ')}
          >
            {peerBadgeLabel}
          </div>
        ) : null}
      </div>
    );
  }

  const innerSpacing = density === 'summary' ? 'space-y-1' : 'space-y-2';

  return (
    <div className="relative">
      <Card
        style={peerPresenceStyle}
        className={cn(
          'border-border/80 border-l-2 shadow-sm ring-1 ring-border/40 transition-shadow hover:shadow-md',
          typeVisual.leftBar,
          typeVisual.surface,
          isCompleted && 'opacity-[0.68]',
          className,
        )}
        size="sm"
      >
        <CardContent
          className={cn('text-sm', density === 'summary' ? 'space-y-1 p-2' : 'space-y-2 p-3')}
        >
          <div className="flex items-start gap-1.5">
            {dragHandle ? (
              <div className="shrink-0 pt-0.5 text-muted-foreground [&_button]:-m-0.5 [&_button]:rounded-md [&_button]:p-0.5 [&_button]:hover:bg-muted [&_button]:hover:text-foreground">
                {dragHandle}
              </div>
            ) : null}

            <div
              className={cn(
                'min-w-0 flex-1',
                !useCoverHero ? innerSpacing : 'space-y-0',
                openTask &&
                  'cursor-pointer rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
              role={openTask ? 'button' : undefined}
              tabIndex={openTask ? 0 : undefined}
              onClick={openTask}
              onKeyDown={handleOpenKeyDown}
            >
              {!useCoverHero ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        'font-semibold leading-snug text-foreground',
                        density === 'summary' ? 'line-clamp-1 text-sm' : 'line-clamp-2',
                        isCompleted && 'line-through decoration-muted-foreground/80',
                      )}
                    >
                      {task.title}
                    </p>
                    {density === 'summary' && (
                      <ExternalLink
                        className="size-3.5 shrink-0 text-primary opacity-80"
                        aria-hidden
                      />
                    )}
                  </div>

                  {showKanbanCoverToggle &&
                  kanbanCoverStoragePath &&
                  !kanbanCoverFailed &&
                  hideCoverOnBoard ? (
                    <div
                      className="-mt-0.5"
                      data-kanban-no-open
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="text-[9px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHideCoverOnBoard(false);
                          persistKanbanCoverHidden(task.id, false);
                        }}
                      >
                        Show background image
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      title={typeVisual.label}
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-medium leading-none',
                        density === 'summary'
                          ? 'px-1 py-0.5 text-[9px] uppercase tracking-wide'
                          : 'text-[10px]',
                        typeVisual.typeChip,
                      )}
                    >
                      <TypeIcon
                        className={cn(
                          'shrink-0 text-current',
                          density === 'summary' ? 'size-2.5' : 'size-3',
                        )}
                        aria-hidden
                      />
                      {density !== 'summary' ? <span>{typeVisual.label}</span> : null}
                    </span>
                    <span
                      title={pChip.label}
                      className={cn(
                        'inline-flex rounded-md border px-1.5 py-0.5 font-medium leading-none',
                        density === 'summary'
                          ? 'text-[9px] uppercase tracking-wide'
                          : 'text-[10px]',
                        pChip.className,
                      )}
                    >
                      {density === 'summary' ? pChip.label.slice(0, 1) : pChip.label}
                    </span>
                    {ymd && dateAndTimeLabel ? (
                      density === 'summary' ? (
                        <span
                          title={`${dateShort}: ${dateAndTimeLabel}`}
                          className={cn(
                            'inline-flex items-center rounded-md border px-1 py-0.5',
                            'text-[9px] font-medium leading-none',
                            dateChipClass,
                          )}
                        >
                          <Calendar className="size-3 shrink-0" aria-hidden />
                        </span>
                      ) : (
                        <span
                          title={dateShort}
                          className={cn(
                            'inline-flex rounded-md border px-1.5 py-0.5 font-medium leading-none',
                            density === 'detailed' ? 'text-[10px]' : 'text-[10px]',
                            dateChipClass,
                          )}
                        >
                          {dateAndTimeLabel}
                        </span>
                      )
                    ) : null}
                  </div>

                  {showDescription && task.description ? (
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
                      {task.description}
                    </p>
                  ) : null}

                  {showDetailedMeta && (subtasks || task.assigned_to) ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {subtasks ? (
                        <span className="inline-flex items-center gap-1">
                          <ListChecks className="size-3 shrink-0" aria-hidden />
                          Subtasks {subtasks.done}/{subtasks.total}
                        </span>
                      ) : null}
                      {task.assigned_to ? (
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3 shrink-0" aria-hidden />
                          Assigned
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="relative overflow-hidden rounded-md">
                    {kanbanCoverLoading && !kanbanCoverUrl ? (
                      <div className="min-h-[88px] animate-pulse bg-muted" aria-hidden />
                    ) : kanbanCoverUrl ? (
                      <>
                        <img
                          src={kanbanCoverUrl}
                          alt=""
                          className="absolute inset-0 h-full min-h-[88px] w-full object-cover"
                        />
                        <div
                          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-black/42 to-black/68"
                          aria-hidden
                        />
                      </>
                    ) : null}
                    <div
                      className={cn(
                        'relative z-10',
                        density === 'summary' ? 'space-y-1 p-1.5' : 'space-y-2 p-2',
                      )}
                    >
                      <KanbanCardQuickActions
                        variant="cover"
                        task={task}
                        commentCount={commentCount}
                        onOpenTask={onOpenTask}
                        onStartWorkout={onStartWorkout}
                      />
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            'font-semibold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
                            density === 'summary' ? 'line-clamp-1 text-sm' : 'line-clamp-2',
                            isCompleted && 'line-through decoration-white/70',
                          )}
                        >
                          {task.title}
                        </p>
                        {density === 'summary' && (
                          <ExternalLink
                            className="size-3.5 shrink-0 text-white opacity-90"
                            aria-hidden
                          />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          title={typeVisual.label}
                          className={cn(
                            'inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-medium leading-none',
                            density === 'summary'
                              ? 'px-1 py-0.5 text-[9px] uppercase tracking-wide'
                              : 'text-[10px]',
                            'border-white/35 bg-black/25 text-white [&_svg]:text-white',
                          )}
                        >
                          <TypeIcon
                            className={cn(
                              'shrink-0 text-current',
                              density === 'summary' ? 'size-2.5' : 'size-3',
                            )}
                            aria-hidden
                          />
                          {density !== 'summary' ? <span>{typeVisual.label}</span> : null}
                        </span>
                        <span
                          title={pChip.label}
                          className={cn(
                            'inline-flex rounded-md border px-1.5 py-0.5 font-medium leading-none',
                            density === 'summary'
                              ? 'text-[9px] uppercase tracking-wide'
                              : 'text-[10px]',
                            'border-white/30 bg-black/20 text-white',
                          )}
                        >
                          {density === 'summary' ? pChip.label.slice(0, 1) : pChip.label}
                        </span>
                        {ymd && dateAndTimeLabel ? (
                          density === 'summary' ? (
                            <span
                              title={`${dateShort}: ${dateAndTimeLabel}`}
                              className={cn(
                                'inline-flex items-center rounded-md border px-1 py-0.5',
                                'text-[9px] font-medium leading-none',
                                'border-white/28 bg-black/20 text-white',
                              )}
                            >
                              <Calendar className="size-3 shrink-0" aria-hidden />
                            </span>
                          ) : (
                            <span
                              title={dateShort}
                              className={cn(
                                'inline-flex rounded-md border px-1.5 py-0.5 font-medium leading-none',
                                'text-[10px]',
                                'border-white/28 bg-black/20 text-white',
                              )}
                            >
                              {dateAndTimeLabel}
                            </span>
                          )
                        ) : null}
                      </div>

                      {showDescription && task.description ? (
                        <p className="line-clamp-3 text-xs leading-relaxed text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                          {task.description}
                        </p>
                      ) : null}

                      {showDetailedMeta && (subtasks || task.assigned_to) ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/85">
                          {subtasks ? (
                            <span className="inline-flex items-center gap-1">
                              <ListChecks className="size-3 shrink-0" aria-hidden />
                              Subtasks {subtasks.done}/{subtasks.total}
                            </span>
                          ) : null}
                          {task.assigned_to ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3 shrink-0" aria-hidden />
                              Assigned
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {showKanbanCoverToggle && kanbanCoverUrl ? (
                    <div
                      className="mt-1"
                      data-kanban-no-open
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="text-[9px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHideCoverOnBoard(true);
                          persistKanbanCoverHidden(task.id, true);
                        }}
                      >
                        Hide image
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {!useCoverHero ? (
              <KanbanCardQuickActions
                variant="default"
                task={task}
                commentCount={commentCount}
                onOpenTask={onOpenTask}
                onStartWorkout={onStartWorkout}
              />
            ) : null}
          </div>

          {showBubble && (
            <div
              className="space-y-1 border-t border-border/60 pt-2"
              data-kanban-no-open
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Bubble
              </label>
              <select
                value={task.bubble_id}
                onChange={(e) => void onMoveToBubble(task.id, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                {bubbles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {onOpenTask || bubbleUp ? (
            <div
              className="mt-2 border-t border-border/60 pt-2"
              data-kanban-no-open
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <CardTabStrip
                taskId={task.id}
                onOpenTask={onOpenTask}
                bubbleUp={bubbleUp}
                bubblyDensity="default"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
      {hasPeerPresence && primaryPeer ? (
        <div
          className="absolute -top-2.5 -right-2 z-10 max-w-[120px] truncate rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
          style={{ backgroundColor: primaryPeer.color }}
          title={taskPresencePeers.map((p) => p.name).join(', ')}
        >
          {peerBadgeLabel}
        </div>
      ) : null}
    </div>
  );
}

/** Decorative grip for drag overlay (no listeners). */
export function KanbanTaskCardDragDecoration() {
  return (
    <span className="inline-flex text-muted-foreground/50" aria-hidden>
      <GripVertical className="size-4" />
    </span>
  );
}
