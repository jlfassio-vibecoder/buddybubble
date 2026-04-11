'use client';

import { useEffect, useMemo, useState } from 'react';
import { startOfWeek } from 'date-fns';
import { Activity, Calendar, Flame, Timer } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { CALENDAR_WEEK_OPTIONS } from '@/lib/calendar-view-range';
import { formatUserFacingError } from '@/lib/format-error';
import type { Json } from '@/types/database';

type WorkoutTask = {
  id: string;
  title: string;
  status: string | null;
  created_at: string;
  metadata: Json;
};

type WorkoutMeta = { workout_type?: string; duration_min?: number };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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

type Props = {
  workspaceId: string;
  /** Injected by WorkspaceMainSplit via cloneElement — rendered alongside the board. */
  calendarSlot?: React.ReactNode;
  /** Bumped when tasks change so analytics re-fetches. */
  taskViewsNonce?: number;
};

export function AnalyticsBoard({ workspaceId, calendarSlot, taskViewsNonce }: Props) {
  const [tasks, setTasks] = useState<WorkoutTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      const supabase = createClient();

      const { data: bubbles, error: bubblesErr } = await supabase
        .from('bubbles')
        .select('id')
        .eq('workspace_id', workspaceId);

      if (bubblesErr) {
        if (!cancelled) {
          setTasks([]);
          setLoadError(formatUserFacingError(bubblesErr));
          setLoading(false);
        }
        return;
      }

      if (!bubbles?.length) {
        if (!cancelled) {
          setTasks([]);
          setLoading(false);
        }
        return;
      }

      const bubbleIds = bubbles.map((b) => b.id as string);

      const { data, error: tasksErr } = await supabase
        .from('tasks')
        .select('id, title, status, created_at, metadata')
        .in('bubble_id', bubbleIds)
        .in('item_type', ['workout', 'workout_log'])
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!cancelled) {
        if (tasksErr) {
          setTasks([]);
          setLoadError(formatUserFacingError(tasksErr));
        } else {
          setTasks((data ?? []) as WorkoutTask[]);
        }
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, taskViewsNonce]);

  const completed = useMemo(() => tasks.filter((t) => t.status === 'completed'), [tasks]);

  const { sessionsThisWeek, sessionsThisMonth, weekMinutes, totalMinutes, streak, weekDayCounts } =
    useMemo(() => {
      const now = new Date();

      const weekStart = startOfWeek(now, CALENDAR_WEEK_OPTIONS);
      weekStart.setHours(0, 0, 0, 0);

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const completedDaySet = new Set(completed.map((t) => dayKey(new Date(t.created_at))));

      const thisWeek = completed.filter((t) => new Date(t.created_at) >= weekStart);
      const thisMonth = completed.filter((t) => new Date(t.created_at) >= monthStart);

      const minOf = (arr: WorkoutTask[]) =>
        arr.reduce((sum, t) => sum + ((t.metadata as WorkoutMeta)?.duration_min ?? 0), 0);

      // Streak: consecutive days with at least one completed workout, ending today
      let streak = 0;
      const check = new Date(now);
      check.setHours(0, 0, 0, 0);
      while (completedDaySet.has(dayKey(check))) {
        streak++;
        check.setDate(check.getDate() - 1);
      }

      // Per-day counts for this ISO week (Mon–Sun)
      const weekDayCounts = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const key = dayKey(day);
        return completed.filter((t) => dayKey(new Date(t.created_at)) === key).length;
      });

      return {
        sessionsThisWeek: thisWeek.length,
        sessionsThisMonth: thisMonth.length,
        weekMinutes: minOf(thisWeek),
        totalMinutes: minOf(completed),
        streak,
        weekDayCounts,
      };
    }, [completed]);

  const maxDayCount = Math.max(1, ...weekDayCounts);
  const recentSessions = completed.slice(0, 5);

  const formatMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading analytics…
      </div>
    );
  }

  if (loadError) {
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

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      {/* Main analytics panel */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Fitness Analytics</h2>
        </div>

        {/* Stat cards */}
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

        {/* Weekly bar chart */}
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

        {/* Recent sessions */}
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
            No completed workouts yet. Mark workouts as Completed on your board to see analytics
            here.
          </div>
        )}
      </div>

      {/* Calendar slot injected by WorkspaceMainSplit */}
      {calendarSlot ?? null}
    </div>
  );
}
