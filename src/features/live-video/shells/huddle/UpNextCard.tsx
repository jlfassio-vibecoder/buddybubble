'use client';

import { useMemo } from 'react';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { metadataFieldsFromParsed, type WorkoutExercise } from '@/lib/item-metadata';
import { cn } from '@/lib/utils';

export type UpNextCardProps = {
  className?: string;
  /** Cap the flattened exercise summary to this many entries (default 6). */
  maxExercises?: number;
};

function pickUpNextSnapshot(
  deck: readonly SessionDeckSnapshot[],
  activeSnapshotId: string | null,
): SessionDeckSnapshot | null {
  if (deck.length === 0) return null;
  if (activeSnapshotId) {
    const active = deck.find((s) => s.snapshotId === activeSnapshotId);
    if (active) return active;
  }
  return deck[0] ?? null;
}

function formatDurationLabel(workoutDurationMin: string): string | null {
  if (!workoutDurationMin) return null;
  const mins = parseInt(workoutDurationMin, 10);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const mm = String(mins).padStart(2, '0');
  return `${mm}:00`;
}

function formatExerciseLine(ex: WorkoutExercise): string | null {
  const name = ex.name?.trim();
  if (!name) return null;
  if (ex.reps !== undefined && ex.reps !== null && String(ex.reps).trim() !== '') {
    return `${ex.reps} ${name}`;
  }
  if (typeof ex.sets === 'number' && ex.sets > 0) {
    return `${ex.sets}× ${name}`;
  }
  if (typeof ex.duration_min === 'number' && ex.duration_min > 0) {
    return `${ex.duration_min} min ${name}`;
  }
  return name;
}

/**
 * Compact "Up next" strip rendered under SessionControls in the live Huddle.
 * Reads the current workout queue via `WorkoutDeckSelectionProvider` and
 * surfaces the active (or first) deck card so the trainer keeps queue
 * visibility while the video stage is the dominant surface.
 */
export function UpNextCard({ className, maxExercises = 6 }: UpNextCardProps) {
  const deckCtx = useWorkoutDeckSelectionOptional();

  const upNext = useMemo(
    () => pickUpNextSnapshot(deckCtx?.deck ?? [], deckCtx?.activeSnapshotId ?? null),
    [deckCtx?.deck, deckCtx?.activeSnapshotId],
  );

  const summary = useMemo(() => {
    if (!upNext) return null;
    const fields = metadataFieldsFromParsed(upNext.task.metadata);
    const title = upNext.task.title?.trim() || 'Untitled workout';
    const duration = formatDurationLabel(fields.workoutDurationMin);
    const exerciseLines = fields.workoutExercises
      .map(formatExerciseLine)
      .filter((s): s is string => Boolean(s));
    const clipped = exerciseLines.slice(0, maxExercises);
    const overflow = exerciseLines.length - clipped.length;
    const exerciseText =
      clipped.length === 0
        ? null
        : overflow > 0
          ? `${clipped.join(' · ')} · +${overflow} more`
          : clipped.join(' · ');
    return { title, duration, exerciseText, workoutType: fields.workoutType?.trim() || null };
  }, [upNext, maxExercises]);

  if (!deckCtx || !upNext || !summary) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground',
          className,
        )}
      >
        No workouts queued — add cards from the board to build a deck.
      </div>
    );
  }

  const typeLabel = summary.workoutType
    ? `${summary.workoutType} — ${summary.title}`
    : summary.title;
  const headlineRight = summary.duration ? ` — ${summary.duration}` : '';

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card/80 px-4 py-3 text-left shadow-sm',
        className,
      )}
      aria-label="Up next workout"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Up next
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
        {typeLabel}
        {headlineRight ? <span className="text-muted-foreground">{headlineRight}</span> : null}
      </p>
      {summary.exerciseText ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{summary.exerciseText}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No exercises listed.</p>
      )}
    </div>
  );
}
