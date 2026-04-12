'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ListChecks, Play } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { metadataFieldsFromParsed, parseTaskMetadata } from '@/lib/item-metadata';
import { PROGRAM_TEMPLATES, type ProgramTemplate } from '@/lib/fitness/program-templates';
import {
  getProgramDaysForWeek,
  workspaceCalendarWeekYmdBounds,
} from '@/lib/fitness/program-schedule';
import { formatUserFacingError } from '@/lib/format-error';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import { KanbanTaskCard } from '@/components/board/kanban-task-card';
import type { TaskModalTab } from '@/components/modals/TaskModal';
import type { BubbleRow, ItemType, Json, TaskRow, WorkspaceCategory } from '@/types/database';

// ── Day label helpers ─────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Local types ───────────────────────────────────────────────────────────────

type ProgramTask = {
  id: string;
  title: string;
  status: string | null;
  metadata: Json;
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

// ── Column header (Kanban-style count) ─────────────────────────────────────────

function BoardColumnHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex min-w-0 items-center gap-2">
      <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

// ── My Program card ───────────────────────────────────────────────────────────

type ProgramCardProps = {
  task: ProgramTask;
  onView: (id: string) => void | undefined;
  onBegin?: (task: ProgramTask) => Promise<void>;
  onAdvanceWeek?: (task: ProgramTask) => Promise<void>;
  advancing?: boolean;
};

function ProgramCard({ task, onView, onBegin, onAdvanceWeek, advancing }: ProgramCardProps) {
  const { fields, dw, cw, isFinished, isActiveProgram } = programTaskDerived(task);
  const progress = dw > 0 ? Math.min(1, cw / dw) : 0;

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

      <div className="mt-auto flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-xs"
          onClick={() => onView(task.id)}
        >
          View
        </Button>
        {!isFinished && cw === 0 && onBegin && (
          <Button
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={advancing}
            onClick={() => void onBegin(task)}
          >
            {advancing ? 'Starting…' : 'Begin'}
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
      </div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

type TemplateCardProps = {
  template: ProgramTemplate;
  onStart: (template: ProgramTemplate) => void | Promise<void>;
  starting: boolean;
};

function TemplateCard({ template, onStart, starting }: TemplateCardProps) {
  const firstWeek = template.schedule[0];
  const daysPerWeek = firstWeek?.days.length ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-snug text-foreground">{template.title}</p>
        <DifficultyBadge difficulty={template.difficulty} />
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
  const [programs, setPrograms] = useState<ProgramTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const [weekWorkouts, setWeekWorkouts] = useState<TaskRow[]>([]);
  /** `item_type = workout` templates in the workspace — used to open plan rows when nothing is scheduled this week. */
  const [workoutTemplatesForLink, setWorkoutTemplatesForLink] = useState<
    { id: string; title: string }[]
  >([]);
  const [weekWorkoutsLoading, setWeekWorkoutsLoading] = useState(false);
  const [weekWorkoutsError, setWeekWorkoutsError] = useState<string | null>(null);
  const weekFetchGen = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: tasksErr } = await supabase
      .from('tasks')
      .select('id, title, status, metadata, created_at')
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
        const [weekRes, tplRes] = await Promise.all([
          supabase
            .from('tasks')
            .select('*')
            .in('bubble_id', bubbleIds)
            .in('item_type', ['workout', 'workout_log'])
            .is('archived_at', null)
            .gte('scheduled_on', startYmd)
            .lte('scheduled_on', endYmd)
            .order('scheduled_on', { ascending: true }),
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
    [workspaceId, calendarTimezone],
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

  const { planned, inProgress, completed, activeProgram } = useMemo(() => {
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
    const activeCandidates = programs.filter((t) => programTaskDerived(t).isActiveProgram);
    // Multiple in-progress programs: "This week" plan uses the task with latest `created_at` (no `updated_at` on tasks).
    const chosen =
      activeCandidates.length === 0
        ? null
        : ([...activeCandidates].sort((a, b) =>
            (b.created_at ?? '').localeCompare(a.created_at ?? ''),
          )[0] ?? null);
    return {
      planned: plannedList,
      inProgress: inProgressList,
      completed: completedList,
      activeProgram: chosen,
    };
  }, [programs]);

  const activePlanDays = useMemo(() => {
    if (!activeProgram) return [];
    const { fields, cw } = programTaskDerived(activeProgram);
    if (cw < 1) return [];
    return getProgramDaysForWeek(fields.programSchedule, cw);
  }, [activeProgram]);

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
      const { data, error: insertErr } = await supabase
        .from('tasks')
        .insert({
          bubble_id: selectedBubbleId,
          title: tpl.title,
          item_type: 'program',
          status: 'planned',
          metadata: {
            goal: tpl.goal,
            duration_weeks: tpl.duration_weeks,
            current_week: 0,
            schedule: tpl.schedule,
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

  const handleBeginProgram = useCallback(
    async (task: ProgramTask) => {
      if (!canWrite) return;
      setAdvancingId(task.id);
      try {
        const supabase = createClient();
        const newMetadata = {
          ...(parseTaskMetadata(task.metadata) as Record<string, unknown>),
          current_week: 1,
        };
        const { error: updateErr } = await supabase
          .from('tasks')
          .update({ metadata: newMetadata, status: 'scheduled' })
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
    [canWrite, load],
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
        await load();
      } finally {
        setAdvancingId(null);
      }
    },
    [canWrite, load],
  );

  const activeWeekNum = activeProgram ? programTaskDerived(activeProgram).cw : 0;

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
              {/* 1 — Templates */}
              <div className="flex h-full w-[85vw] shrink-0 snap-center flex-col md:w-auto md:min-w-[min(85vw,20rem)] md:max-w-[22rem] md:snap-none">
                <BoardColumnHeader title="Program templates" count={PROGRAM_TEMPLATES.length} />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
                  {PROGRAM_TEMPLATES.map((tpl) => (
                    <TemplateCard
                      key={tpl.id}
                      template={tpl}
                      onStart={handleStartTemplate}
                      starting={startingId === tpl.id}
                    />
                  ))}
                  {!canWrite && (
                    <p className="text-xs text-muted-foreground">
                      You need editor access to start a program.
                    </p>
                  )}
                </div>
              </div>

              {/* 2 — Planned */}
              <div className="flex h-full w-[85vw] shrink-0 snap-center flex-col md:w-auto md:min-w-[min(85vw,20rem)] md:max-w-[22rem] md:snap-none">
                <BoardColumnHeader title="Planned" count={planned.length} />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
                  {planned.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      No programs in the queue. Start one from templates.
                    </p>
                  ) : (
                    planned.map((p) => (
                      <ProgramCard
                        key={p.id}
                        task={p}
                        onView={(id) => onOpenTask?.(id)}
                        onBegin={canWrite ? handleBeginProgram : undefined}
                        onAdvanceWeek={canWrite ? handleAdvanceWeek : undefined}
                        advancing={advancingId === p.id}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* 3 — In progress (+ completed) */}
              <div className="flex h-full w-[85vw] shrink-0 snap-center flex-col md:w-auto md:min-w-[min(85vw,20rem)] md:max-w-[22rem] md:snap-none">
                <BoardColumnHeader title="In progress" count={inProgress.length} />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
                  {inProgress.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Nothing in progress yet.
                    </p>
                  ) : (
                    inProgress.map((p) => (
                      <ProgramCard
                        key={p.id}
                        task={p}
                        onView={(id) => onOpenTask?.(id)}
                        onBegin={canWrite ? handleBeginProgram : undefined}
                        onAdvanceWeek={canWrite ? handleAdvanceWeek : undefined}
                        advancing={advancingId === p.id}
                      />
                    ))
                  )}

                  {completed.length > 0 && (
                    <>
                      <h4 className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Completed
                      </h4>
                      {completed.map((p) => (
                        <ProgramCard
                          key={p.id}
                          task={p}
                          onView={(id) => onOpenTask?.(id)}
                          advancing={false}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* 4 — This week: plan + workouts on the board */}
              <div className="flex h-full w-[85vw] shrink-0 snap-center flex-col md:w-auto md:min-w-[min(85vw,20rem)] md:max-w-[22rem] md:snap-none">
                <BoardColumnHeader
                  title="This week"
                  count={activePlanDays.length + weekWorkouts.length}
                />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-0.5">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Plan</p>
                    {!activeProgram ? (
                      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        Begin a program to see this week&apos;s plan.
                      </p>
                    ) : activeWeekNum < 1 ? (
                      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        Start your program to see this week&apos;s plan.
                      </p>
                    ) : activePlanDays.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No days in the schedule for week {activeWeekNum}.
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
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">On the board</p>
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
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {calendarSlot ?? null}
    </div>
  );
}
