'use client';

import { useMemo } from 'react';
import type { Json } from '@/types/database';
import { WorkoutMetadataPreview } from '@/components/fitness/workout-block-renderer';
import {
  formatFlatExerciseLine,
  formatRichWorkoutStripSummary,
} from '@/lib/workout-factory/format-block-summary-line';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { cn } from '@/lib/utils';

export type SessionDeckWorkoutSummaryProps = {
  metadata: Json | Record<string, unknown> | null | undefined;
  mode: 'strip' | 'compact';
  taskId?: string | null;
  className?: string;
  maxStripExercises?: number;
};

function deckHasWorkoutPreview(vm: ReturnType<typeof buildWorkoutSessionViewModel>): boolean {
  if (vm.source === 'rich') {
    return vm.blocks.some((b) => b.exercises.length > 0 || b.instructions.length > 0);
  }
  return vm.flatExercises.length > 0;
}

export function SessionDeckWorkoutSummary({
  metadata,
  mode,
  taskId = null,
  className,
  maxStripExercises = 4,
}: SessionDeckWorkoutSummaryProps) {
  const vm = useMemo(() => buildWorkoutSessionViewModel(metadata ?? {}), [metadata]);

  const showPreview = useMemo(() => deckHasWorkoutPreview(vm), [vm]);

  const stripText = useMemo(() => {
    if (mode !== 'strip' || !showPreview) return null;
    if (vm.source === 'rich' && vm.blocks.length > 0) {
      return formatRichWorkoutStripSummary(vm.blocks, {
        maxBlocks: 3,
        flatExercises: vm.flatExercises,
        maxFlatExercises: maxStripExercises,
      });
    }
    const lines = vm.flatExercises
      .map(formatFlatExerciseLine)
      .filter((s): s is string => Boolean(s));
    const clipped = lines.slice(0, maxStripExercises);
    const overflow = lines.length - clipped.length;
    if (clipped.length === 0) return null;
    return overflow > 0 ? `${clipped.join(' · ')} · +${overflow} more` : clipped.join(' · ');
  }, [mode, showPreview, vm, maxStripExercises]);

  if (!showPreview) return null;

  if (mode === 'compact') {
    return (
      <WorkoutMetadataPreview
        metadata={metadata as Json}
        density="compact"
        taskId={taskId}
        maxHeightClass="max-h-32 overflow-y-auto"
        className={cn('mt-1.5 text-xs text-muted-foreground', className)}
        data-testid="session-deck-workout-preview"
      />
    );
  }

  if (!stripText) return null;

  return (
    <p
      className={cn('mt-1.5 line-clamp-2 text-xs text-muted-foreground', className)}
      data-testid="session-deck-workout-strip"
    >
      {stripText}
    </p>
  );
}
