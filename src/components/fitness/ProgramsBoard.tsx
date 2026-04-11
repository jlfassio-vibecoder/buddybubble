'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ListChecks, Play, Trophy } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import { PROGRAM_TEMPLATES, type ProgramTemplate } from '@/lib/fitness/program-templates';
import { formatUserFacingError } from '@/lib/format-error';
import type { Json } from '@/types/database';

// ── Day label helpers ─────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Local types ───────────────────────────────────────────────────────────────

type ProgramTask = {
  id: string;
  title: string;
  status: string | null;
  metadata: Json;
};

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
        difficulty === 'advanced' &&
          'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200',
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
};

function ProgramCard({ task, onView }: ProgramCardProps) {
  const fields = metadataFieldsFromParsed(task.metadata);
  const dw = parseInt(fields.programDurationWeeks, 10) || 0;
  const cw = fields.programCurrentWeek;
  const progress = dw > 0 ? Math.min(1, cw / dw) : 0;

  const statusLabel =
    task.status === 'completed'
      ? 'Completed'
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
            task.status === 'completed'
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {statusLabel}
        </span>
      </div>

      {fields.programGoal && (
        <p className="text-xs text-muted-foreground">{fields.programGoal}</p>
      )}

      {dw > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {cw > 0 ? `Week ${cw} of ${dw}` : `${dw} weeks`}
            </span>
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

      <Button
        size="sm"
        variant="outline"
        className="mt-auto h-7 text-xs"
        onClick={() => onView(task.id)}
      >
        View program
      </Button>
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

// ── ProgramsBoard ─────────────────────────────────────────────────────────────

type Props = {
  workspaceId: string;
  /** The currently selected bubble ID, used to scope the programs query. */
  selectedBubbleId: string;
  /** Injected by WorkspaceMainSplit via cloneElement — rendered alongside the board. */
  calendarSlot?: ReactNode;
  /** Bumped when tasks change; triggers a re-fetch. */
  taskViewsNonce?: number;
  onOpenTask?: (taskId: string) => void;
  canWrite?: boolean;
};

export function ProgramsBoard({
  workspaceId: _workspaceId,
  selectedBubbleId,
  calendarSlot,
  taskViewsNonce,
  onOpenTask,
  canWrite,
}: Props) {
  const [programs, setPrograms] = useState<ProgramTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: tasksErr } = await supabase
      .from('tasks')
      .select('id, title, status, metadata')
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

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Programs</h2>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading programs…
          </div>
        ) : (
          <>
            {/* My Programs */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">My Programs</h3>
                {programs.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                    {programs.length}
                  </span>
                )}
              </div>

              {programs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No programs yet. Start one from the templates below.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {programs.map((p) => (
                    <ProgramCard key={p.id} task={p} onView={(id) => onOpenTask?.(id)} />
                  ))}
                </div>
              )}
            </section>

            {/* Program Templates */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-muted-foreground" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">Program Templates</h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {PROGRAM_TEMPLATES.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    onStart={handleStartTemplate}
                    starting={startingId === tpl.id}
                  />
                ))}
              </div>

              {!canWrite && (
                <p className="text-xs text-muted-foreground">
                  You need editor access to start a program.
                </p>
              )}
            </section>
          </>
        )}
      </div>

      {/* Calendar slot injected by WorkspaceMainSplit */}
      {calendarSlot ?? null}
    </div>
  );
}
