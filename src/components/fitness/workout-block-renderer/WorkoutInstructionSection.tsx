'use client';

import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { SECTION_LABELS } from '@/components/fitness/workout-block-renderer/workout-block-editor-types';
import { cn } from '@/lib/utils';
import { RequestImageLink } from '@/components/fitness/workout-block-renderer/RequestImageLink';

const SECTION_LABEL = SECTION_LABELS;

export type WorkoutInstructionSectionProps = {
  section: 'warmup' | 'finisher' | 'cooldown';
  blocks: WorkoutSessionBlockView[];
  taskId?: string | null;
  density?: 'full' | 'compact';
  className?: string;
  'data-testid'?: string;
};

export function WorkoutInstructionSection({
  section,
  blocks,
  taskId = null,
  density = 'full',
  className,
  'data-testid': dataTestId,
}: WorkoutInstructionSectionProps) {
  const sectionBlocks = blocks.filter((b) => b.section === section);
  if (sectionBlocks.length === 0) return null;

  const title = SECTION_LABEL[section];
  const compact = density === 'compact';

  return (
    <section
      className={cn('space-y-3', className)}
      data-testid={dataTestId ?? `instruction-section-${section}`}
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2">
        {sectionBlocks.map((block) => (
          <div
            key={block.id}
            className={cn(
              'flex gap-4 rounded-xl ring-1 ring-border/10',
              compact ? 'bg-muted/25 p-2' : 'bg-muted/30 p-3',
            )}
          >
            <div
              className={cn(
                'flex shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
                compact ? 'h-12 w-12' : 'h-16 w-16',
              )}
            >
              Prep
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold text-foreground', compact && 'text-sm')}>
                {block.name}
              </p>
              {block.instructions.length > 0 ? (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {block.instructions.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {taskId ? <RequestImageLink exerciseName={block.name} taskId={taskId} /> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
