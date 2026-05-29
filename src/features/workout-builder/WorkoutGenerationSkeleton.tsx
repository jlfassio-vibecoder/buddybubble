'use client';

import { outlineBlockSummary } from '@/lib/agents/coach/outline-editor-client';
import { cn } from '@/lib/utils';

export type OutlineBlock = Record<string, unknown>;

type WorkoutGenerationSkeletonProps = {
  blocks: OutlineBlock[];
  className?: string;
};

function skeletonRowCount(block: OutlineBlock): number {
  const exercises = Array.isArray(block.exercises) ? block.exercises : [];
  if (exercises.length >= 2) return Math.min(3, exercises.length);
  return 3;
}

function ExerciseRowSkeleton({ index }: { index: number }) {
  return (
    <div
      className="flex gap-4 rounded-xl bg-muted/40 p-3 ring-1 ring-border/15"
      aria-hidden
      data-testid={`workout-generation-skeleton-row-${index}`}
    >
      <div className="size-12 shrink-0 animate-pulse rounded-lg bg-muted-foreground/15" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
        <div className="h-4 w-[68%] max-w-xs animate-pulse rounded bg-muted-foreground/15" />
        <div className="h-3 w-[45%] max-w-[12rem] animate-pulse rounded bg-muted-foreground/10" />
      </div>
    </div>
  );
}

export function WorkoutGenerationSkeleton({ blocks, className }: WorkoutGenerationSkeletonProps) {
  if (blocks.length === 0) {
    return (
      <div
        className={cn('space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3', className)}
        data-testid="workout-generation-skeleton"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <p className="text-xs font-medium text-muted-foreground">Generating workout…</p>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <ExerciseRowSkeleton key={i} index={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3', className)}
      data-testid="workout-generation-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Writing exercises…</p>
        <p className="text-[11px] text-muted-foreground/80">
          {blocks.length} block{blocks.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="space-y-6">
        {blocks.map((block, blockIndex) => {
          const summary = outlineBlockSummary(block);
          const rowCount = skeletonRowCount(block);
          return (
            <section
              key={blockIndex}
              className="space-y-3"
              data-testid="workout-generation-skeleton-block"
            >
              <p className="text-xs font-medium text-foreground">{summary}</p>
              <div className="space-y-2">
                {Array.from({ length: rowCount }, (_, i) => (
                  <ExerciseRowSkeleton key={i} index={blockIndex * 10 + i} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
