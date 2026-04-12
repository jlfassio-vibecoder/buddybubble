'use client';

import { useEffect, useMemo, useState } from 'react';
import { eachDayOfInterval, endOfWeek, parseISO, startOfWeek, subDays } from 'date-fns';
import { Activity, Calendar, Flame, Timer } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { CALENDAR_WEEK_OPTIONS } from '@/lib/calendar-view-range';
import { formatUserFacingError } from '@/lib/format-error';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';
import { Label } from '@/components/ui/label';
import type { Json } from '@/types/database';

type WorkoutTask = {
  id: string;
  title: string;
  status: string | null;
  created_at: string;
  /** Calendar date of the workout; analytics bucket by this (aligned with calendar / `scheduled_on`). */
  scheduled_on: string | null;
  metadata: Json;
  program_id?: string | null;
  assigned_to?: string | null;
};

type WorkoutMeta = { workout_type?: string; duration_min?: number };

type ProgramOption = { id: string; title: string };

/**
 * Workspace calendar day (YYYY-MM-DD) for when the workout belongs — matches calendar month dots
 * (`scheduled_on` date string) with fallback to `created_at` when unset.
 */
function workoutOccurrenceYmd(t: WorkoutTask, timeZone: string): string {
  const raw = t.scheduled_on?.trim();
  if (raw) {
    const s = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) return getCalendarDateInTimeZone(timeZone, new Date(ms));
  }
  return getCalendarDateInTimeZone(timeZone, new Date(t.created_at));
}

/** Previous calendar day as YYYY-MM-DD in `timeZone`, for streak walks. */
function calendarPrevYmd(timeZone: string, ymd: string): string {
  const d = subDays(parseISO(`${ymd}T12:00:00`), 1);
  return getCalendarDateInTimeZone(timeZone, d);
}

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
};

function StatCard({ icon, label, value, sub }: StatCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="tabular-nums text-3xl font-bold text-foreground">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Monday-first labels, aligned with `CALENDAR_WEEK_OPTIONS` / calendar views. */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isCompletedWorkoutStatus(status: string | null): boolean {
  return status === 'done' || status === 'completed';
}

type Props = {
  workspaceId: string;
  /** Workspace IANA timezone for bucketing (same as calendar rail). */
  calendarTimezone?: string | null;
  /** Injected by WorkspaceMainSplit via cloneElement — rendered alongside the board. */
  calendarSlot?: React.ReactNode;
  /** Bumped when tasks change so analytics re-fetches. */
  taskViewsNonce?: number;
};

export function AnalyticsBoard({
  workspaceId,
  calendarTimezone,
  calendarSlot,
  taskViewsNonce,
}: Props) {
  const [authReady, setAuthReady] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<WorkoutTask[]>([]);
  const [programListLoading, setProgramListLoading] = useState(true);
  const [workoutsLoading, setWorkoutsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setViewerUserId(data.user?.id ?? null);
        setAuthReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPrograms() {
      if (!workspaceId || !viewerUserId) {
        if (!cancelled) {
          setProgramOptions([]);
          setProgramListLoading(false);
        }
        return;
      }
      if (!cancelled) setProgramListLoading(true);
      const supabase = createClient();
      const { data: bubbles, error: bubblesErr } = await supabase
        .from('bubbles')
        .select('id')
        .eq('workspace_id', workspaceId);
      if (cancelled) return;
      if (bubblesErr || !bubbles?.length) {
        setProgramOptions([]);
        setLoadError(bubblesErr ? formatUserFacingError(bubblesErr) : null);
        setProgramListLoading(false);
        return;
      }
      const bubbleIds = bubbles.map((b) => b.id as string);
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, created_at')
        .in('bubble_id', bubbleIds)
        .eq('item_type', 'program')
        .eq('assigned_to', viewerUserId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        setProgramOptions([]);
        setLoadError(formatUserFacingError(error));
        setProgramListLoading(false);
        return;
      }
      setProgramOptions(
        (data ?? []).map((r) => ({
          id: (r as { id: string }).id,
          title: (r as { title: string }).title,
        })),
      );
      setLoadError(null);
      setProgramListLoading(false);
    }
    void loadPrograms();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, viewerUserId, taskViewsNonce]);

  useEffect(() => {
    if (programOptions.length === 0) {
      setSelectedProgramId(null);
      return;
    }
    setSelectedProgramId((prev) =>
      prev && programOptions.some((p) => p.id === prev) ? prev : programOptions[0].id,
    );
  }, [programOptions]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkouts() {
      if (!workspaceId || !viewerUserId || !selectedProgramId) {
        if (!cancelled) {
          setTasks([]);
          setWorkoutsLoading(false);
        }
        return;
      }
      setWorkoutsLoading(true);
      const supabase = createClient();
      const { data: bubbles, error: bubblesErr } = await supabase
        .from('bubbles')
        .select('id')
        .eq('workspace_id', workspaceId);
      if (bubblesErr) {
        if (!cancelled) {
          setTasks([]);
          setLoadError(formatUserFacingError(bubblesErr));
          setWorkoutsLoading(false);
        }
        return;
      }
      if (!bubbles?.length) {
        if (!cancelled) {
          setTasks([]);
          setWorkoutsLoading(false);
        }
        return;
      }
      const bubbleIds = bubbles.map((b) => b.id as string);
      const { data, error: tasksErr } = await supabase
        .from('tasks')
        .select('id, title, status, created_at, scheduled_on, metadata, program_id, assigned_to')
        .in('bubble_id', bubbleIds)
        .in('item_type', ['workout', 'workout_log'])
        .eq('program_id', selectedProgramId)
        .eq('assigned_to', viewerUserId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (!cancelled) {
        if (tasksErr) {
          setTasks([]);
          setLoadError(formatUserFacingError(tasksErr));
        } else {
          setTasks((data ?? []) as WorkoutTask[]);
          setLoadError(null);
        }
        setWorkoutsLoading(false);
      }
    }
    void loadWorkouts();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, viewerUserId, selectedProgramId, taskViewsNonce]);

  const completed = useMemo(() => tasks.filter((t) => isCompletedWorkoutStatus(t.status)), [tasks]);

  const { sessionsThisWeek, sessionsThisMonth, weekMinutes, totalMinutes, streak, weekDayCounts } =
    useMemo(() => {
      const now = new Date();
      const tz = calendarTimezone?.trim() || 'UTC';

      const todayYmd = getCalendarDateInTimeZone(tz, now);
      const monthPrefix = todayYmd.slice(0, 7);

      const anchor = parseISO(`${todayYmd}T12:00:00`);
      const weekStartDate = startOfWeek(anchor, CALENDAR_WEEK_OPTIONS);
      const weekEndDate = endOfWeek(anchor, CALENDAR_WEEK_OPTIONS);
      const weekYmds = eachDayOfInterval({ start: weekStartDate, end: weekEndDate }).map((d) =>
        getCalendarDateInTimeZone(tz, d),
      );
      const weekYmdSet = new Set(weekYmds);

      const taskYmd = (t: WorkoutTask) => workoutOccurrenceYmd(t, tz);

      const completedDaySet = new Set(completed.map((t) => taskYmd(t)));

      const thisWeek = completed.filter((t) => weekYmdSet.has(taskYmd(t)));
      const thisMonth = completed.filter((t) => taskYmd(t).startsWith(monthPrefix));

      const minOf = (arr: WorkoutTask[]) =>
        arr.reduce((sum, t) => sum + ((t.metadata as WorkoutMeta)?.duration_min ?? 0), 0);

      let streak = 0;
      let checkYmd = todayYmd;
      while (completedDaySet.has(checkYmd)) {
        streak++;
        checkYmd = calendarPrevYmd(tz, checkYmd);
      }

      const weekDayCounts = weekYmds.map(
        (ymd) => completed.filter((t) => taskYmd(t) === ymd).length,
      );

      return {
        sessionsThisWeek: thisWeek.length,
        sessionsThisMonth: thisMonth.length,
        weekMinutes: minOf(thisWeek),
        totalMinutes: minOf(completed),
        streak,
        weekDayCounts,
      };
    }, [completed, calendarTimezone]);

  const maxDayCount = Math.max(1, ...weekDayCounts);

  const recentSessions = useMemo(() => {
    const tz = calendarTimezone?.trim() || 'UTC';
    return [...completed]
      .sort((a, b) => {
        const yA = workoutOccurrenceYmd(a, tz);
        const yB = workoutOccurrenceYmd(b, tz);
        if (yA !== yB) return yB.localeCompare(yA);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 5);
  }, [completed, calendarTimezone]);

  const formatMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

  if (!authReady) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading analytics…
      </div>
    );
  }

  if (!viewerUserId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Sign in to view analytics.
      </div>
    );
  }

  if (programListLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading analytics…
      </div>
    );
  }

  if (loadError && programOptions.length === 0 && !programListLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-destructive" role="alert">
          {loadError}
        </p>
        <p className="text-xs text-muted-foreground">
          Check your connection and try refreshing the page.
        </p>
      </div>
    );
  }

  if (programOptions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">Fitness Analytics</h2>
          </div>
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No programs assigned to you in this workspace. Assign yourself on a program card, or
            start one from the Programs board.
          </p>
        </div>
        {calendarSlot ?? null}
      </div>
    );
  }

  if (workoutsLoading || !selectedProgramId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">Fitness Analytics</h2>
          </div>
          <div className="min-w-0 space-y-1.5 sm:max-w-xs sm:shrink-0">
            <Label htmlFor="analytics-program">Program</Label>
            <select
              id="analytics-program"
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value || null)}
            >
              {programOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Metrics are for workouts linked to this program and assigned to you.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            icon={<Calendar className="h-4 w-4" />}
            label="This week"
            value={sessionsThisWeek}
            sub={weekMinutes > 0 ? formatMinutes(weekMinutes) : 'sessions'}
          />
          <StatCard
            icon={<Activity className="h-4 w-4" />}
            label="This month"
            value={sessionsThisMonth}
            sub="sessions"
          />
          <StatCard
            icon={<Flame className="h-4 w-4" />}
            label="Streak"
            value={streak}
            sub={streak === 1 ? 'day' : 'days'}
          />
          <StatCard
            icon={<Timer className="h-4 w-4" />}
            label="Total time"
            value={totalMinutes > 0 ? formatMinutes(totalMinutes) : '—'}
            sub="logged"
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sessions this week
          </p>
          <div className="flex h-16 items-end gap-2">
            {weekDayCounts.map((count, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-primary/80 transition-all"
                  style={{
                    height: count > 0 ? `${Math.max(4, (count / maxDayCount) * 52)}px` : '0px',
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{DAY_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {recentSessions.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent sessions
            </p>
            <ul className="space-y-2">
              {recentSessions.map((t) => {
                const meta = t.metadata as WorkoutMeta | null;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-foreground">{t.title}</span>
                    <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      {meta?.workout_type ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {meta.workout_type}
                        </span>
                      ) : null}
                      {meta?.duration_min ? (
                        <span className="text-xs">{meta.duration_min} min</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No completed workouts yet for this program. Mark workouts as Done or Completed on your
            board to see analytics here.
          </div>
        )}
      </div>

      {calendarSlot ?? null}
    </div>
  );
}
