'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ListChecks, Loader2, Play, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { metadataFieldsFromParsed, parseTaskMetadata } from '@/lib/item-metadata';
import { PROGRAM_TEMPLATES, type ProgramTemplate } from '@/lib/fitness/program-templates';
import {
  getProgramDaysForWeek,
  workspaceCalendarWeekYmdBounds,
} from '@/lib/fitness/program-schedule';
import {
  programsBoardCollapsedColumnsStorageKey,
  programsBoardDismissedTemplateIdsStorageKey,
} from '@/lib/layout-collapse-keys';
import { formatUserFacingError } from '@/lib/format-error';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import {
  COLLAPSED_COLUMN_WIDTH_CLASS,
  CollapsedColumnStrip,
} from '@/components/layout/collapsed-column-strip';
import { KanbanColumnHeader } from '@/components/board/kanban-column-header';
import { KanbanTaskCard } from '@/components/board/kanban-task-card';
import { ScheduleProgramStartDialog } from '@/components/fitness/ScheduleProgramStartDialog';
import type { TaskModalTab } from '@/components/modals/TaskModal';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { formatScheduledTimeDisplay, scheduledTimeInputToPgValue } from '@/lib/task-scheduled-time';
import { resolveTaskStatusForScheduleFields } from '@/lib/workspace-calendar';
import { archiveOpenChildWorkoutsForProgram } from '@/lib/fitness/archive-program-child-workouts';
import {
  archiveProgramAndAllChildTasks,
  archiveProgramTaskOnly,
  endProgramKeepingHistory,
  programHasAssociatedData,
} from '@/lib/fitness/remove-program-task';
import { hasOtherActiveProgramForUserInWorkspace } from '@/lib/fitness/active-program-for-user';
import { syncProgramLinkedWorkoutSchedules } from '@/lib/fitness/sync-program-workout-schedules';
import type { BubbleRow, ItemType, Json, TaskRow, WorkspaceCategory } from '@/types/database';
import { useWorkspaceStore } from '@/store/workspaceStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ── Day label helpers ─────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function loadProgramsCollapsedColumnIds(workspaceId: string, bubbleId: string): Set<string> {
  if (!bubbleId || typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(
      programsBoardCollapsedColumnsStorageKey(workspaceId, bubbleId),
    );
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function loadProgramsDismissedTemplateIds(workspaceId: string, bubbleId: string): Set<string> {
  if (!bubbleId || typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(
      programsBoardDismissedTemplateIdsStorageKey(workspaceId, bubbleId),
    );
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

const COL_PROGRAMS = 'programs';
const COL_PLANNED = 'planned';
const COL_THIS_WEEK = 'this_week';
const COL_HISTORY = 'history';
const COL_TEMPLATES = 'templates';

// ── Local types ───────────────────────────────────────────────────────────────

type ProgramTask = {
  id: string;
  title: string;
  status: string | null;
  metadata: Json;
  assigned_to?: string | null;
  scheduled_on?: string | null;
  scheduled_time?: string | null;
  /** Tasks table has no `updated_at`; use `created_at` for ordering when multiple programs are active. */
  created_at?: string | null;
};

function programTaskDerived(task: ProgramTask) {
  const fields = metadataFieldsFromParsed(task.metadata);
  const dw = parseInt(fields.programDurationWeeks, 10) || 0;
  const cw = fields.programCurrentWeek;
  const isFinished = task.status === 'completed' || (dw > 0 && cw > dw);
  const isActiveProgram = !isFinished && (cw > 0 || task.status === 'in_progress');
  return { fields, dw, cw, isFinished, isActiveProgram };
}

// ── Difficulty badge ──────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: ProgramTemplate['difficulty'] }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        difficulty === 'beginner' &&
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200',
        difficulty === 'intermediate' &&
          'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
        difficulty === 'advanced' && 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200',
      )}
    >
      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
    </span>
  );
}

// ── My Program card ───────────────────────────────────────────────────────────

type ProgramCardProps = {
  task: ProgramTask;
  onView: (id: string) => void | undefined;
  onScheduleStart?: (task: ProgramTask) => void;
  onStartWeekOne?: (task: ProgramTask) => Promise<void>;
  onAdvanceWeek?: (task: ProgramTask) => Promise<void>;
  advancing?: boolean;
  onRemove?: (task: ProgramTask) => void | Promise<void>;
  removeDisabled?: boolean;
};

function ProgramCard({
  task,
  onView,
  onScheduleStart,
  onStartWeekOne,
  onAdvanceWeek,
  advancing,
  onRemove,
  removeDisabled,
}: ProgramCardProps) {
  const { fields, dw, cw, isFinished, isActiveProgram } = programTaskDerived(task);
  const progress = dw > 0 ? Math.min(1, cw / dw) : 0;
  const schedTimeLabel = formatScheduledTimeDisplay(task.scheduled_time);

  const statusLabel = isFinished
    ? 'Completed'
    : isActiveProgram
      ? 'In Progress'
      : task.status === 'planned'
        ? 'Planned'
        : task.status === 'scheduled'
          ? 'Scheduled'
          : task.status === 'today'
            ? 'Today'
            : (task.status ?? 'Planned');

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-snug text-foreground">{task.title}</p>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            isFinished
              ? 'bg-primary/15 text-primary'
              : isActiveProgram
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {statusLabel}
        </span>
      </div>

      {fields.programGoal && <p className="text-xs text-muted-foreground">{fields.programGoal}</p>}

      {task.scheduled_on && cw === 0 && (
        <p className="text-xs text-muted-foreground">
          Starts {String(task.scheduled_on).slice(0, 10)}
          {schedTimeLabel ? ` · ${schedTimeLabel}` : ''}
        </p>
      )}

      {dw > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{cw > 0 ? `Week ${cw} of ${dw}` : `${dw} weeks`}</span>
            {cw > 0 && <span>{Math.round(progress * 100)}%</span>}
          </div>
          {cw > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 min-w-0 flex-1 text-xs"
            onClick={() => onView(task.id)}
          >
            View
          </Button>
          {!isFinished && cw === 0 && onScheduleStart && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 min-w-0 flex-1 text-xs"
              disabled={advancing}
              onClick={() => onScheduleStart(task)}
            >
              {task.scheduled_on ? 'Reschedule' : 'Schedule start'}
            </Button>
          )}
        </div>
        {!isFinished && cw === 0 && task.scheduled_on && onStartWeekOne && (
          <Button
            size="sm"
            className="h-7 w-full text-xs"
            disabled={advancing}
            onClick={() => void onStartWeekOne(task)}
          >
            {advancing ? 'Starting…' : 'Start week 1'}
          </Button>
        )}
        {!isFinished && cw > 0 && onAdvanceWeek && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 flex-1 text-xs"
            disabled={advancing}
            onClick={() => void onAdvanceWeek(task)}
          >
            {advancing ? 'Saving…' : `Complete wk ${cw}`}
          </Button>
        )}
        {onRemove && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-full gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            disabled={removeDisabled || advancing}
            onClick={() => void onRemove(task)}
          >
            {removeDisabled ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

type TemplateCardProps = {
  template: ProgramTemplate;
  onStart: (template: ProgramTemplate) => void | Promise<void>;
  starting: boolean;
  onDismissFromBoard?: (template: ProgramTemplate) => void;
  dismissDisabled?: boolean;
};

function TemplateCard({
  template,
  onStart,
  starting,
  onDismissFromBoard,
  dismissDisabled,
}: TemplateCardProps) {
  const firstWeek = template.schedule[0];
  const daysPerWeek = firstWeek?.days.length ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-snug text-foreground">{template.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <DifficultyBadge difficulty={template.difficulty} />
          {onDismissFromBoard ? (
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground outline-none ring-offset-background hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              aria-label="Hide template from board"
              title="Hide from board"
              disabled={dismissDisabled || starting}
              onClick={() => onDismissFromBoard(template)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{template.goal}</p>

      <p className="text-xs text-muted-foreground">
        {template.duration_weeks} weeks · {daysPerWeek} day{daysPerWeek !== 1 ? 's' : ''}/week
      </p>

      {firstWeek && firstWeek.days.length > 0 && (
        <ul className="space-y-0.5">
          {firstWeek.days.map((d) => (
            <li key={d.day} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{DAY_LABELS[d.day - 1]}</span>
              {' — '}
              {d.name}
              {d.duration_min ? ` · ${d.duration_min} min` : ''}
            </li>
          ))}
        </ul>
      )}

      <Button
        size="sm"
        className="mt-auto h-7 gap-1.5 text-xs"
        disabled={starting}
        onClick={() => onStart(template)}
      >
        <Play className="h-3 w-3" aria-hidden />
        {starting ? 'Starting…' : 'Start program'}
      </Button>
    </div>
  );
}

function planDayLogged(dayName: string, workouts: TaskRow[]) {
  const n = dayName.trim().toLowerCase();
  return workouts.some((t) => t.title.trim().toLowerCase() === n);
}

function titleKey(s: string) {
  return s.trim().toLowerCase();
}

/** Prefer a task scheduled this week; else a workspace workout template with the same title as the plan. */
function resolveTaskIdForPlanWorkoutName(
  planName: string,
  weekTasks: TaskRow[],
  workoutTemplates: { id: string; title: string }[],
): string | null {
  const key = titleKey(planName);
  const fromWeek = weekTasks.find((t) => titleKey(t.title) === key);
  if (fromWeek) return fromWeek.id;
  const tpl = workoutTemplates.find((t) => titleKey(t.title) === key);
  return tpl?.id ?? null;
}

// ── ProgramsBoard ─────────────────────────────────────────────────────────────

type Props = {
  workspaceId: string;
  /** The currently selected bubble ID, used to scope the programs query. */
  selectedBubbleId: string;
  /** Bubbles in the workspace (Kanban card bubble mover + parity with main board). */
  bubbles: BubbleRow[];
  /** Workspace template — drives Kanban card date labels and styling. */
  workspaceCategory?: WorkspaceCategory | null;
  /** Workspace calendar TZ — used for “this week” bounds and workout task dates. */
  calendarTimezone?: string | null;
  /** Injected by WorkspaceMainSplit via cloneElement — rendered alongside the board. */
  calendarSlot?: ReactNode;
  /** Bumped when tasks change; triggers a re-fetch. */
  taskViewsNonce?: number;
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
  /** Opens TaskModal in create mode (e.g. new workout template from “This week” plan). */
  onOpenCreateTask?: (opts?: {
    status?: string;
    itemType?: ItemType;
    title?: string;
    workoutDurationMin?: string | null;
    bubbleId?: string | null;
  }) => void;
  canWrite?: boolean;
};

export function ProgramsBoard({
  workspaceId,
  selectedBubbleId,
  bubbles,
  workspaceCategory = null,
  calendarTimezone,
  calendarSlot,
  taskViewsNonce,
  onOpenTask,
  onOpenCreateTask,
  canWrite,
}: Props) {
  const activeWorkspaceRole = useWorkspaceStore((s) => s.activeWorkspace?.role ?? null);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? null);
  const guestProgramsBlocked = activeWorkspaceRole === 'guest' && activeWorkspaceId === workspaceId;

  const [programs, setPrograms] = useState<ProgramTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [scheduleDialogTask, setScheduleDialogTask] = useState<ProgramTask | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [programRemoveDialog, setProgramRemoveDialog] = useState<null | {
    task: ProgramTask;
    variant: 'simple' | 'data';
  }>(null);
  const [programRemoveBusyId, setProgramRemoveBusyId] = useState<string | null>(null);
  const [programRemoveActionPending, setProgramRemoveActionPending] = useState(false);

  const [weekWorkouts, setWeekWorkouts] = useState<TaskRow[]>([]);
  /** `item_type = workout` templates in the workspace — used to open plan rows when nothing is scheduled this week. */
  const [workoutTemplatesForLink, setWorkoutTemplatesForLink] = useState<
    { id: string; title: string }[]
  >([]);
  const [weekWorkoutsLoading, setWeekWorkoutsLoading] = useState(false);
  const [weekWorkoutsError, setWeekWorkoutsError] = useState<string | null>(null);
  const weekWorkoutIds = useMemo(() => weekWorkouts.map((t) => t.id), [weekWorkouts]);
  const { bubbleUpPropsFor } = useTaskBubbleUps(weekWorkoutIds);
  const weekFetchGen = useRef(0);
  /** Auth user — drives “my” active program and This week scope. */
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setViewerUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [collapsedColumnIds, setCollapsedColumnIds] = useState<Set<string>>(() =>
    loadProgramsCollapsedColumnIds(workspaceId, selectedBubbleId),
  );
  const [dismissedTemplateIds, setDismissedTemplateIds] = useState<Set<string>>(() =>
    loadProgramsDismissedTemplateIds(workspaceId, selectedBubbleId),
  );
  const [sortTemplatesByTitle, setSortTemplatesByTitle] = useState(false);
  const [sortPlannedByTitle, setSortPlannedByTitle] = useState(false);
  const [sortProgramsByTitle, setSortProgramsByTitle] = useState(false);
  const [sortHistoryByTitle, setSortHistoryByTitle] = useState(false);

  useEffect(() => {
    setCollapsedColumnIds(loadProgramsCollapsedColumnIds(workspaceId, selectedBubbleId));
  }, [workspaceId, selectedBubbleId]);

  useEffect(() => {
    setDismissedTemplateIds(loadProgramsDismissedTemplateIds(workspaceId, selectedBubbleId));
  }, [workspaceId, selectedBubbleId]);

  const toggleColumnCollapse = useCallback(
    (columnId: string) => {
      setCollapsedColumnIds((prev) => {
        const next = new Set(prev);
        if (next.has(columnId)) next.delete(columnId);
        else next.add(columnId);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              programsBoardCollapsedColumnsStorageKey(workspaceId, selectedBubbleId),
              JSON.stringify([...next]),
            );
          } catch {
            /* ignore quota */
          }
        }
        return next;
      });
    },
    [workspaceId, selectedBubbleId],
  );

  const boardColumnDefs = useBoardColumnDefs(workspaceId);
  const hasTodayBoardColumn = useMemo(
    () => boardColumnDefs?.some((c) => c.id === 'today') ?? false,
    [boardColumnDefs],
  );
  const hasScheduledBoardColumn = useMemo(
    () => boardColumnDefs?.some((c) => c.id === 'scheduled') ?? false,
    [boardColumnDefs],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: tasksErr } = await supabase
      .from('tasks')
      .select('id, title, status, metadata, created_at, scheduled_on, scheduled_time, assigned_to')
      .eq('bubble_id', selectedBubbleId)
      .eq('item_type', 'program')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (tasksErr) {
      setError(formatUserFacingError(tasksErr));
    } else {
      setPrograms((data ?? []) as ProgramTask[]);
    }
    setLoading(false);
  }, [selectedBubbleId]);

  useEffect(() => {
    void load();
  }, [load, taskViewsNonce]);

  const handleProgramRemoveRequest = useCallback(
    async (task: ProgramTask) => {
      if (!canWrite) return;
      setProgramRemoveBusyId(task.id);
      try {
        const supabase = createClient();
        const hasData = await programHasAssociatedData(supabase, task);
        setProgramRemoveDialog({ task, variant: hasData ? 'data' : 'simple' });
      } catch (e) {
        toast.error(formatUserFacingError(e));
      } finally {
        setProgramRemoveBusyId(null);
      }
    },
    [canWrite],
  );

  const handleConfirmSimpleProgramRemove = useCallback(async () => {
    if (!programRemoveDialog || programRemoveDialog.variant !== 'simple') return;
    const taskId = programRemoveDialog.task.id;
    setProgramRemoveActionPending(true);
    try {
      const supabase = createClient();
      const { error } = await archiveProgramTaskOnly(supabase, taskId);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Program removed');
      setProgramRemoveDialog(null);
      await load();
    } finally {
      setProgramRemoveActionPending(false);
    }
  }, [programRemoveDialog, load]);

  const handleProgramDataDelete = useCallback(async () => {
    if (!programRemoveDialog || programRemoveDialog.variant !== 'data') return;
    const taskId = programRemoveDialog.task.id;
    setProgramRemoveActionPending(true);
    try {
      const supabase = createClient();
      const { error } = await archiveProgramAndAllChildTasks(supabase, taskId);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Program and related workouts archived');
      setProgramRemoveDialog(null);
      await load();
    } finally {
      setProgramRemoveActionPending(false);
    }
  }, [programRemoveDialog, load]);

  const handleProgramEndKeepingHistory = useCallback(async () => {
    if (!programRemoveDialog || programRemoveDialog.variant !== 'data') return;
    const task = programRemoveDialog.task;
    setProgramRemoveActionPending(true);
    try {
      const supabase = createClient();
      const { error } = await endProgramKeepingHistory(supabase, task.id, task.metadata);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Program ended; your history is kept');
      setProgramRemoveDialog(null);
      await load();
    } finally {
      setProgramRemoveActionPending(false);
    }
  }, [programRemoveDialog, load]);

  const { planned, inProgress, completed } = useMemo(() => {
    const plannedList: ProgramTask[] = [];
    const inProgressList: ProgramTask[] = [];
    const completedList: ProgramTask[] = [];
    for (const t of programs) {
      const d = programTaskDerived(t);
      if (d.isFinished) completedList.push(t);
      else if (d.cw === 0) plannedList.push(t);
      else if (d.isActiveProgram) inProgressList.push(t);
      else plannedList.push(t);
    }
    return {
      planned: plannedList,
      inProgress: inProgressList,
      completed: completedList,
    };
  }, [programs]);

  /** In-progress program assigned to the signed-in user — drives Plan + This week → On the board. */
  const activeProgramForViewer = useMemo(() => {
    if (!viewerUserId) return null;
    const mine = programs.filter(
      (t) => t.assigned_to === viewerUserId && programTaskDerived(t).isActiveProgram,
    );
    if (mine.length === 0) return null;
    return (
      [...mine].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null
    );
  }, [programs, viewerUserId]);

  /**
   * Drives "This week" (plan + board rows): in-progress program first, else a scheduled program
   * (assigned to viewer, start date set, week 0) so workouts show after scheduling before week 1 starts.
   */
  const programForThisWeek = useMemo(() => {
    if (activeProgramForViewer) return activeProgramForViewer;
    if (!viewerUserId) return null;
    const scheduledOnly = programs.filter((t) => {
      if (t.assigned_to !== viewerUserId) return false;
      const d = programTaskDerived(t);
      if (d.isFinished || d.cw > 0) return false;
      return t.scheduled_on != null && String(t.scheduled_on).trim() !== '';
    });
    if (scheduledOnly.length === 0) return null;
    return (
      [...scheduledOnly].sort((a, b) => {
        const as = String(a.scheduled_on ?? '').slice(0, 10);
        const bs = String(b.scheduled_on ?? '').slice(0, 10);
        if (as !== bs) return as.localeCompare(bs);
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      })[0] ?? null
    );
  }, [activeProgramForViewer, programs, viewerUserId]);

  const programForThisWeekId = programForThisWeek?.id ?? null;

  const reloadWeekWorkouts = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      const showLoading = opts?.showLoading !== false;
      const gen = ++weekFetchGen.current;
      if (!workspaceId) return;
      if (showLoading) {
        setWeekWorkoutsLoading(true);
      }
      setWeekWorkoutsError(null);
      try {
        const supabase = createClient();
        const { data: bubbleRows, error: bErr } = await supabase
          .from('bubbles')
          .select('id')
          .eq('workspace_id', workspaceId);
        if (bErr) throw bErr;
        const bubbleIds = (bubbleRows ?? []).map((r) => r.id as string);
        if (bubbleIds.length === 0) {
          if (gen === weekFetchGen.current) {
            setWeekWorkouts([]);
            setWorkoutTemplatesForLink([]);
          }
          return;
        }
        const { startYmd, endYmd } = workspaceCalendarWeekYmdBounds(calendarTimezone);
        const weekPromise =
          programForThisWeekId != null
            ? supabase
                .from('tasks')
                .select('*')
                .in('bubble_id', bubbleIds)
                .in('item_type', ['workout', 'workout_log'])
                .is('archived_at', null)
                .eq('program_id', programForThisWeekId)
                .gte('scheduled_on', startYmd)
                .lte('scheduled_on', endYmd)
                .order('scheduled_on', { ascending: true })
            : Promise.resolve({ data: [] as TaskRow[], error: null });
        const [weekRes, tplRes] = await Promise.all([
          weekPromise,
          supabase
            .from('tasks')
            .select('id, title')
            .in('bubble_id', bubbleIds)
            .eq('item_type', 'workout')
            .is('archived_at', null)
            .order('created_at', { ascending: false })
            .limit(100),
        ]);
        const tErr = weekRes.error;
        const tplErr = tplRes.error;
        if (tErr) throw tErr;
        if (tplErr) throw tplErr;
        if (gen === weekFetchGen.current) {
          setWeekWorkouts((weekRes.data ?? []) as TaskRow[]);
          setWorkoutTemplatesForLink((tplRes.data ?? []) as { id: string; title: string }[]);
        }
      } catch (e) {
        if (gen === weekFetchGen.current) {
          setWeekWorkoutsError(formatUserFacingError(e));
          setWeekWorkouts([]);
          setWorkoutTemplatesForLink([]);
        }
      } finally {
        if (gen === weekFetchGen.current && showLoading) {
          setWeekWorkoutsLoading(false);
        }
      }
    },
    [workspaceId, calendarTimezone, programForThisWeekId],
  );

  useEffect(() => {
    void reloadWeekWorkouts();
  }, [reloadWeekWorkouts, taskViewsNonce]);

  const moveTaskToBubble = useCallback(
    async (taskId: string, targetBubbleId: string) => {
      if (!canWrite) return;
      const task = weekWorkouts.find((t) => t.id === taskId);
      if (!task || targetBubbleId === task.bubble_id) return;
      const supabase = createClient();
      const { data: existing } = await supabase
        .from('tasks')
        .select('position, archived_at')
        .eq('bubble_id', targetBubbleId)
        .order('position', { ascending: false })
        .limit(40);
      const posRows = (existing ?? []) as { position: number; archived_at?: string | null }[];
      const topActive = posRows.find((r) => !r.archived_at);
      const maxPos = topActive != null ? Number(topActive.position) + 1 : 0;
      const { error } = await supabase
        .from('tasks')
        .update({ bubble_id: targetBubbleId, position: maxPos })
        .eq('id', taskId);
      if (!error) void reloadWeekWorkouts({ showLoading: false });
    },
    [canWrite, weekWorkouts, reloadWeekWorkouts],
  );

  const templatesDisplay = useMemo(() => {
    if (!sortTemplatesByTitle) return PROGRAM_TEMPLATES;
    return [...PROGRAM_TEMPLATES].sort((a, b) => a.title.localeCompare(b.title));
  }, [sortTemplatesByTitle]);

  /** Hide static template cards once a program from that template was AI-personalized (see `source_template_id`). */
  const templateCardsVisible = useMemo(() => {
    const hidden = new Set<string>();
    for (const p of programs) {
      const m = parseTaskMetadata(p.metadata) as Record<string, unknown>;
      if (m.ai_program_personalization && typeof m.source_template_id === 'string') {
        hidden.add(m.source_template_id);
      }
    }
    return templatesDisplay.filter((t) => !hidden.has(t.id) && !dismissedTemplateIds.has(t.id));
  }, [programs, templatesDisplay, dismissedTemplateIds]);

  const dismissTemplateFromBoard = useCallback(
    (tpl: ProgramTemplate) => {
      setDismissedTemplateIds((prev) => {
        const next = new Set(prev);
        next.add(tpl.id);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              programsBoardDismissedTemplateIdsStorageKey(workspaceId, selectedBubbleId),
              JSON.stringify([...next]),
            );
          } catch {
            /* ignore quota */
          }
        }
        return next;
      });
      toast.success('Template hidden from this column');
    },
    [workspaceId, selectedBubbleId],
  );

  const plannedDisplay = useMemo(() => {
    if (!sortPlannedByTitle) return planned;
    return [...planned].sort((a, b) => a.title.localeCompare(b.title));
  }, [planned, sortPlannedByTitle]);

  const programsDisplay = useMemo(() => {
    if (!sortProgramsByTitle) return inProgress;
    return [...inProgress].sort((a, b) => a.title.localeCompare(b.title));
  }, [inProgress, sortProgramsByTitle]);

  const completedDisplay = useMemo(() => {
    if (!sortHistoryByTitle) return completed;
    return [...completed].sort((a, b) => a.title.localeCompare(b.title));
  }, [completed, sortHistoryByTitle]);

  const activePlanDays = useMemo(() => {
    if (!programForThisWeek) return [];
    const { fields, cw } = programTaskDerived(programForThisWeek);
    if (cw < 1) return [];
    return getProgramDaysForWeek(fields.programSchedule, cw);
  }, [programForThisWeek]);

  /** Prefer the seeded “Workouts” BuddyBubble for new workout templates; else current bubble. */
  const workoutsBubbleId = useMemo(
    () => bubbles.find((b) => b.name.trim().toLowerCase() === 'workouts')?.id ?? null,
    [bubbles],
  );

  const handleStartTemplate = useCallback(
    async (tpl: ProgramTemplate) => {
      if (!canWrite) return;
      setStartingId(tpl.id);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error: insertErr } = await supabase
        .from('tasks')
        .insert({
          bubble_id: selectedBubbleId,
          title: tpl.title,
          item_type: 'program',
          status: 'planned',
          assigned_to: user?.id ?? null,
          metadata: {
            goal: tpl.goal,
            duration_weeks: tpl.duration_weeks,
            current_week: 0,
            schedule: tpl.schedule,
            source_template_id: tpl.id,
          },
        })
        .select('id')
        .single();

      setStartingId(null);

      if (insertErr || !data) {
        setError(insertErr ? formatUserFacingError(insertErr) : 'Failed to create program');
        return;
      }

      await load();
      onOpenTask?.((data as { id: string }).id);
    },
    [selectedBubbleId, canWrite, load, onOpenTask],
  );

  const handleSaveProgramSchedule = useCallback(
    async ({
      scheduledOnYmd,
      timeHm,
    }: {
      scheduledOnYmd: string | null;
      timeHm: string | null;
    }) => {
      if (!scheduleDialogTask || !canWrite) return;
      setScheduleSaving(true);
      setError(null);
      try {
        const supabase = createClient();
        const trimmed = scheduledOnYmd?.trim() ?? '';
        if (!trimmed) {
          const { error: clearErr } = await supabase
            .from('tasks')
            .update({
              scheduled_on: null,
              scheduled_time: null,
              status: 'planned',
            })
            .eq('id', scheduleDialogTask.id);
          if (clearErr) {
            setError(formatUserFacingError(clearErr));
            return;
          }
          const syncClear = await syncProgramLinkedWorkoutSchedules({
            supabase,
            programTaskId: scheduleDialogTask.id,
            calendarTimezone,
            hasTodayBoardColumn,
            hasScheduledBoardColumn,
          });
          if (syncClear.error) {
            setError(syncClear.error);
            return;
          }
          await load();
          setScheduleDialogTask(null);
          return;
        }

        const scheduledOnValue = trimmed.slice(0, 10);
        const newTimeHm = scheduledOnValue && timeHm?.trim() ? timeHm.trim().slice(0, 5) : null;
        const scheduledTimePg = newTimeHm ? scheduledTimeInputToPgValue(newTimeHm) : null;

        const effectiveStatus = resolveTaskStatusForScheduleFields({
          currentStatus: scheduleDialogTask.status ?? 'planned',
          scheduledOnYmd: scheduledOnValue,
          calendarTimezone,
          hasTodayBoardColumn,
          hasScheduledBoardColumn,
          itemType: 'program',
        });

        const { error: updateErr } = await supabase
          .from('tasks')
          .update({
            scheduled_on: scheduledOnValue,
            scheduled_time: scheduledOnValue ? scheduledTimePg : null,
            status: effectiveStatus,
          })
          .eq('id', scheduleDialogTask.id);
        if (updateErr) {
          setError(formatUserFacingError(updateErr));
          return;
        }
        const syncSet = await syncProgramLinkedWorkoutSchedules({
          supabase,
          programTaskId: scheduleDialogTask.id,
          calendarTimezone,
          hasTodayBoardColumn,
          hasScheduledBoardColumn,
        });
        if (syncSet.error) {
          setError(syncSet.error);
          return;
        }
        await load();
        setScheduleDialogTask(null);
      } finally {
        setScheduleSaving(false);
      }
    },
    [
      scheduleDialogTask,
      canWrite,
      load,
      calendarTimezone,
      hasTodayBoardColumn,
      hasScheduledBoardColumn,
    ],
  );

  const handleStartWeekOne = useCallback(
    async (task: ProgramTask) => {
      if (!canWrite) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      if (!uid) {
        toast.error('Sign in to start a program.');
        return;
      }
      if (await hasOtherActiveProgramForUserInWorkspace(supabase, workspaceId, uid, task.id)) {
        toast.error('You already have an active program. Please complete or pause it first.');
        return;
      }
      setAdvancingId(task.id);
      try {
        const newMetadata = {
          ...(parseTaskMetadata(task.metadata) as Record<string, unknown>),
          current_week: 1,
        };
        const sched =
          task.scheduled_on != null && String(task.scheduled_on).trim() !== ''
            ? String(task.scheduled_on).slice(0, 10)
            : null;
        const effectiveStatus = resolveTaskStatusForScheduleFields({
          currentStatus: task.status ?? 'planned',
          scheduledOnYmd: sched,
          calendarTimezone,
          hasTodayBoardColumn,
          hasScheduledBoardColumn,
          itemType: 'program',
        });
        const { error: updateErr } = await supabase
          .from('tasks')
          .update({
            metadata: newMetadata,
            status: effectiveStatus,
            assigned_to: task.assigned_to ?? uid,
          })
          .eq('id', task.id);
        if (updateErr) {
          setError(formatUserFacingError(updateErr));
          return;
        }
        await load();
      } finally {
        setAdvancingId(null);
      }
    },
    [canWrite, load, calendarTimezone, hasTodayBoardColumn, hasScheduledBoardColumn, workspaceId],
  );

  const handleAdvanceWeek = useCallback(
    async (task: ProgramTask) => {
      if (!canWrite) return;
      setAdvancingId(task.id);
      const fields = metadataFieldsFromParsed(task.metadata);
      const dw = parseInt(fields.programDurationWeeks, 10) || 0;
      const newWeek = fields.programCurrentWeek + 1;
      const isComplete = dw > 0 && newWeek > dw;
      try {
        const supabase = createClient();
        const newMetadata = {
          ...(parseTaskMetadata(task.metadata) as Record<string, unknown>),
          current_week: newWeek,
        };
        const { error: updateErr } = await supabase
          .from('tasks')
          .update({
            metadata: newMetadata,
            status: isComplete ? 'completed' : 'scheduled',
          })
          .eq('id', task.id);
        if (updateErr) {
          setError(formatUserFacingError(updateErr));
          return;
        }
        if (isComplete) {
          const { error: childErr } = await archiveOpenChildWorkoutsForProgram(supabase, task.id);
          if (childErr) {
            toast.error(childErr);
          }
        }
        await load();
      } finally {
        setAdvancingId(null);
      }
    },
    [canWrite, load],
  );

  const planWeekLabel = programForThisWeek
    ? Math.max(1, programTaskDerived(programForThisWeek).cw)
    : 0;

  const columnShellClass = (columnId: string) => {
    const collapsed = collapsedColumnIds.has(columnId);
    return cn(
      'flex min-w-0 shrink-0 flex-col rounded-xl border border-border/80 bg-card shadow-sm transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none hover:shadow-md',
      collapsed
        ? cn(COLLAPSED_COLUMN_WIDTH_CLASS, 'h-full min-h-[200px] overflow-hidden p-0')
        : cn(
            'h-full min-h-[200px] w-[85vw] snap-center p-2 md:w-auto md:min-w-[min(85vw,20rem)] md:max-w-[22rem] md:snap-none',
          ),
    );
  };

  const thisWeekCount = activePlanDays.length + weekWorkouts.length;

  if (guestProgramsBlocked) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Programs are not available for guest preview accounts.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden bg-muted/30">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <ListChecks className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Programs</h2>
        </div>

        {error && (
          <div className="mx-3 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading programs…
          </div>
        ) : (
          <div
            className={cn(
              'min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain',
              'max-md:snap-x max-md:snap-mandatory max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden',
            )}
          >
            <div className="flex h-full min-h-0 gap-3 p-3">
              {/* 1 — Programs (in progress) */}
              <div className={columnShellClass(COL_PROGRAMS)}>
                {collapsedColumnIds.has(COL_PROGRAMS) ? (
                  <CollapsedColumnStrip
                    title="Programs"
                    expandTitle="Expand column Programs"
                    expandAriaLabel="Expand column Programs"
                    onExpand={() => toggleColumnCollapse(COL_PROGRAMS)}
                    edge="left"
                    variant="card"
                    verticalAlign="top"
                    count={inProgress.length}
                  />
                ) : (
                  <>
                    <KanbanColumnHeader
                      label="Programs"
                      count={inProgress.length}
                      fullTaskCount={inProgress.length}
                      collapsed={false}
                      canAddTask={false}
                      onSortByTitle={
                        inProgress.length >= 2 ? () => setSortProgramsByTitle((v) => !v) : undefined
                      }
                      onToggleCollapse={() => toggleColumnCollapse(COL_PROGRAMS)}
                    />
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
                      {inProgress.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          Nothing in progress yet.
                        </p>
                      ) : (
                        programsDisplay.map((p) => (
                          <ProgramCard
                            key={p.id}
                            task={p}
                            onView={(id) => onOpenTask?.(id)}
                            onAdvanceWeek={canWrite ? handleAdvanceWeek : undefined}
                            advancing={advancingId === p.id}
                            onRemove={canWrite ? handleProgramRemoveRequest : undefined}
                            removeDisabled={programRemoveBusyId === p.id}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 2 — Active programs (queued / not yet started) */}
              <div className={columnShellClass(COL_PLANNED)}>
                {collapsedColumnIds.has(COL_PLANNED) ? (
                  <CollapsedColumnStrip
                    title="Active Programs"
                    expandTitle="Expand column Active Programs"
                    expandAriaLabel="Expand column Active Programs"
                    onExpand={() => toggleColumnCollapse(COL_PLANNED)}
                    edge="left"
                    variant="card"
                    verticalAlign="top"
                    count={planned.length}
                  />
                ) : (
                  <>
                    <KanbanColumnHeader
                      label="Active Programs"
                      count={planned.length}
                      fullTaskCount={planned.length}
                      collapsed={false}
                      canAddTask={!!(canWrite && onOpenCreateTask && !loading)}
                      onAddTask={
                        canWrite && onOpenCreateTask
                          ? () =>
                              onOpenCreateTask({
                                itemType: 'program',
                                bubbleId: selectedBubbleId,
                              })
                          : undefined
                      }
                      onSortByTitle={
                        planned.length >= 2 ? () => setSortPlannedByTitle((v) => !v) : undefined
                      }
                      onToggleCollapse={() => toggleColumnCollapse(COL_PLANNED)}
                    />
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
                      {planned.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          No programs in the queue. Start one from templates.
                        </p>
                      ) : (
                        plannedDisplay.map((p) => (
                          <ProgramCard
                            key={p.id}
                            task={p}
                            onView={(id) => onOpenTask?.(id)}
                            onScheduleStart={canWrite ? (t) => setScheduleDialogTask(t) : undefined}
                            onStartWeekOne={canWrite ? handleStartWeekOne : undefined}
                            onAdvanceWeek={canWrite ? handleAdvanceWeek : undefined}
                            advancing={advancingId === p.id}
                            onRemove={canWrite ? handleProgramRemoveRequest : undefined}
                            removeDisabled={programRemoveBusyId === p.id}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 3 — This week: plan + workouts on the board */}
              <div className={columnShellClass(COL_THIS_WEEK)}>
                {collapsedColumnIds.has(COL_THIS_WEEK) ? (
                  <CollapsedColumnStrip
                    title="This week"
                    expandTitle="Expand column This week"
                    expandAriaLabel="Expand column This week"
                    onExpand={() => toggleColumnCollapse(COL_THIS_WEEK)}
                    edge="left"
                    variant="card"
                    verticalAlign="top"
                    count={thisWeekCount}
                  />
                ) : (
                  <>
                    <KanbanColumnHeader
                      label="This week"
                      count={thisWeekCount}
                      fullTaskCount={thisWeekCount}
                      collapsed={false}
                      canAddTask={false}
                      onToggleCollapse={() => toggleColumnCollapse(COL_THIS_WEEK)}
                    />
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-0.5">
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Plan</p>
                        {!programForThisWeek ? (
                          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                            {viewerUserId
                              ? 'No program assigned to you with a start date, or none in progress. Schedule a program, start week 1, or assign yourself on the program card.'
                              : 'Sign in to see your program plan.'}
                          </p>
                        ) : activePlanDays.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                            No days in the schedule for week {planWeekLabel}.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {activePlanDays.map((d) => {
                              const linkId = resolveTaskIdForPlanWorkoutName(
                                d.name,
                                weekWorkouts,
                                workoutTemplatesForLink,
                              );
                              const canOpenExisting = !!(linkId && onOpenTask);
                              const canCreateBlankWorkout = !!(canWrite && onOpenCreateTask);
                              const canOpenPlan = canOpenExisting || canCreateBlankWorkout;
                              return (
                                <li key={`${d.day}-${d.name}`} className="min-w-0">
                                  <button
                                    type="button"
                                    disabled={!canOpenPlan}
                                    onClick={() => {
                                      if (linkId && onOpenTask) {
                                        onOpenTask(linkId);
                                        return;
                                      }
                                      if (canCreateBlankWorkout) {
                                        onOpenCreateTask?.({
                                          itemType: 'workout',
                                          title: d.name,
                                          workoutDurationMin:
                                            d.duration_min != null ? String(d.duration_min) : null,
                                          bubbleId: workoutsBubbleId ?? selectedBubbleId,
                                        });
                                      }
                                    }}
                                    className={cn(
                                      'flex w-full min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-xs transition-colors',
                                      canOpenPlan
                                        ? 'cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                                        : 'cursor-not-allowed opacity-80',
                                    )}
                                  >
                                    <span className="font-medium text-foreground">
                                      {DAY_LABELS[d.day - 1]}
                                    </span>
                                    <span className="text-muted-foreground">{d.name}</span>
                                    {d.duration_min ? (
                                      <span className="text-muted-foreground">
                                        · {d.duration_min} min
                                      </span>
                                    ) : null}
                                    {planDayLogged(d.name, weekWorkouts) && (
                                      <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                        Logged
                                      </span>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                          On the board
                        </p>
                        {weekWorkoutsError && (
                          <p className="mb-2 text-xs text-destructive">{weekWorkoutsError}</p>
                        )}
                        {weekWorkoutsLoading ? (
                          <p className="text-xs text-muted-foreground">Loading workouts…</p>
                        ) : weekWorkouts.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                            No workouts scheduled this week.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {weekWorkouts.map((t) => (
                              <li key={t.id} className="min-w-0">
                                <KanbanTaskCard
                                  task={t}
                                  canWrite={!!canWrite}
                                  bubbles={bubbles}
                                  onMoveToBubble={moveTaskToBubble}
                                  onOpenTask={onOpenTask}
                                  density="summary"
                                  workspaceCategory={workspaceCategory}
                                  calendarTimezone={calendarTimezone}
                                  isCompleted={taskColumnIsCompletionStatus(t.status ?? '', null)}
                                  bubbleUp={bubbleUpPropsFor(t.id)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 4 — History (completed) */}
              <div className={columnShellClass(COL_HISTORY)}>
                {collapsedColumnIds.has(COL_HISTORY) ? (
                  <CollapsedColumnStrip
                    title="History"
                    expandTitle="Expand column History"
                    expandAriaLabel="Expand column History"
                    onExpand={() => toggleColumnCollapse(COL_HISTORY)}
                    edge="left"
                    variant="card"
                    verticalAlign="top"
                    count={completed.length}
                  />
                ) : (
                  <>
                    <KanbanColumnHeader
                      label="History"
                      count={completed.length}
                      fullTaskCount={completed.length}
                      collapsed={false}
                      canAddTask={false}
                      onSortByTitle={
                        completed.length >= 2 ? () => setSortHistoryByTitle((v) => !v) : undefined
                      }
                      onToggleCollapse={() => toggleColumnCollapse(COL_HISTORY)}
                    />
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
                      {completed.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          No completed programs yet.
                        </p>
                      ) : (
                        completedDisplay.map((p) => (
                          <ProgramCard
                            key={p.id}
                            task={p}
                            onView={(id) => onOpenTask?.(id)}
                            advancing={false}
                            onRemove={canWrite ? handleProgramRemoveRequest : undefined}
                            removeDisabled={programRemoveBusyId === p.id}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 5 — Templates */}
              <div className={columnShellClass(COL_TEMPLATES)}>
                {collapsedColumnIds.has(COL_TEMPLATES) ? (
                  <CollapsedColumnStrip
                    title="Templates"
                    expandTitle="Expand column Program templates"
                    expandAriaLabel="Expand column Program templates"
                    onExpand={() => toggleColumnCollapse(COL_TEMPLATES)}
                    edge="left"
                    variant="card"
                    verticalAlign="top"
                    count={templateCardsVisible.length}
                  />
                ) : (
                  <>
                    <KanbanColumnHeader
                      label="Program templates"
                      count={templateCardsVisible.length}
                      fullTaskCount={templateCardsVisible.length}
                      collapsed={false}
                      canAddTask={false}
                      onSortByTitle={
                        templateCardsVisible.length >= 2
                          ? () => setSortTemplatesByTitle((v) => !v)
                          : undefined
                      }
                      onToggleCollapse={() => toggleColumnCollapse(COL_TEMPLATES)}
                    />
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
                      {templateCardsVisible.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          {PROGRAM_TEMPLATES.length === 0
                            ? 'No program templates.'
                            : 'No templates in this column. You can hide cards you don’t need; personalized templates also hide while a matching program exists.'}
                        </p>
                      ) : (
                        templateCardsVisible.map((tpl) => (
                          <TemplateCard
                            key={tpl.id}
                            template={tpl}
                            onStart={handleStartTemplate}
                            starting={startingId === tpl.id}
                            onDismissFromBoard={dismissTemplateFromBoard}
                          />
                        ))
                      )}
                      {!canWrite && (
                        <p className="text-xs text-muted-foreground">
                          You need editor access to start a program.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={programRemoveDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            if (programRemoveActionPending) return;
            setProgramRemoveDialog(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {programRemoveDialog?.variant === 'simple' ? (
            <>
              <DialogHeader>
                <DialogTitle>Remove program?</DialogTitle>
                <DialogDescription>
                  This archives the program card. You can start again from templates anytime.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={programRemoveActionPending}
                  onClick={() => setProgramRemoveDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={programRemoveActionPending}
                  onClick={() => void handleConfirmSimpleProgramRemove()}
                >
                  {programRemoveActionPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Removing…
                    </>
                  ) : (
                    'Remove'
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : programRemoveDialog?.variant === 'data' ? (
            <>
              <DialogHeader>
                <DialogTitle>Remove program?</DialogTitle>
                <DialogDescription>
                  This program has saved data. Delete archives the program and all linked workouts,
                  or end the program now and keep your history (open workouts are archived;
                  completed work stays).
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={programRemoveActionPending}
                    onClick={() => setProgramRemoveDialog(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={programRemoveActionPending}
                    onClick={() => void handleProgramEndKeepingHistory()}
                  >
                    {programRemoveActionPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    End program and keep data
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full sm:ml-0 sm:w-auto"
                  disabled={programRemoveActionPending}
                  onClick={() => void handleProgramDataDelete()}
                >
                  {programRemoveActionPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Delete all data
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ScheduleProgramStartDialog
        open={scheduleDialogTask != null}
        onOpenChange={(open) => {
          if (!open) setScheduleDialogTask(null);
        }}
        task={scheduleDialogTask}
        calendarTimezone={calendarTimezone}
        saving={scheduleSaving}
        onSave={handleSaveProgramSchedule}
      />

      {calendarSlot ?? null}
    </div>
  );
}
