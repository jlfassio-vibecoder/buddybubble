'use client';

import type { SetLogEntry } from '@/lib/item-metadata';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import { formatExercisePrescriptionLineFromFactory } from '@/lib/workout-factory/format-exercise-prescription-line';
import { formatSetLogLine } from '@/lib/workout-factory/format-set-log-line';
import type { UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';
import { RequestImageLink } from '@/components/fitness/workout-block-renderer/RequestImageLink';
import { WorkoutExerciseThumbnail } from '@/components/fitness/workout-block-renderer/WorkoutExerciseThumbnail';

export type WorkoutReadExerciseRowProps = {
  name: string;
  metaLine: string | null;
  notes?: string | null;
  thumbnailUrl?: string | null;
  taskId?: string | null;
  exerciseQuery?: string;
  stationLabel?: string | null;
  density?: 'full' | 'compact';
  /** Per-set performance from workout_log (read-only). */
  setLogs?: SetLogEntry[];
  unitSystem?: UnitSystem;
};

export function WorkoutReadExerciseRow({
  name,
  metaLine,
  notes,
  thumbnailUrl = null,
  taskId = null,
  exerciseQuery,
  stationLabel,
  density = 'full',
  setLogs,
  unitSystem = 'metric',
}: WorkoutReadExerciseRowProps) {
  const compact = density === 'compact';
  const showRequest = !thumbnailUrl;
  const loggedSets = setLogs ?? [];

  return (
    <div
      className={cn(
        'flex gap-4 rounded-xl ring-1 ring-border/15 transition-colors',
        compact ? 'bg-muted/30 p-2' : 'bg-muted/40 p-3 hover:bg-muted/55',
      )}
    >
      <WorkoutExerciseThumbnail src={thumbnailUrl} alt={name} compact={compact} />
      <div className="min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          {stationLabel ? (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {stationLabel}
            </span>
          ) : null}
          <h4 className={cn('font-semibold leading-snug text-foreground', compact && 'text-sm')}>
            {name}
          </h4>
        </div>
        {metaLine ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{metaLine}</span>
          </div>
        ) : null}
        {notes?.trim() ? (
          <p
            className={cn(
              'mt-1.5 text-xs leading-relaxed text-muted-foreground',
              compact ? 'line-clamp-1' : 'line-clamp-2',
            )}
          >
            {notes.trim()}
          </p>
        ) : null}
        {loggedSets.length > 0 ? (
          <ul className="mt-2 space-y-0.5 border-t border-border/40 pt-2">
            {loggedSets.map((entry) => (
              <li key={entry.set} className="text-xs text-muted-foreground">
                {formatSetLogLine(entry, unitSystem)}
              </li>
            ))}
          </ul>
        ) : null}
        {showRequest ? (
          <RequestImageLink exerciseName={name} exerciseQuery={exerciseQuery} taskId={taskId} />
        ) : null}
      </div>
    </div>
  );
}

export function WorkoutReadExerciseRowFromFactory({
  ex,
  taskId = null,
  stationLabel,
  density = 'full',
}: {
  ex: Exercise;
  taskId?: string | null;
  stationLabel?: string | null;
  density?: 'full' | 'compact';
}) {
  const metaLine = formatExercisePrescriptionLineFromFactory(ex);
  const notes = ex.coachNotes?.trim() ?? '';

  return (
    <WorkoutReadExerciseRow
      name={ex.exerciseName}
      metaLine={metaLine}
      notes={notes || null}
      thumbnailUrl={null}
      taskId={taskId}
      exerciseQuery={ex.exerciseQuery}
      stationLabel={stationLabel}
      density={density}
    />
  );
}
