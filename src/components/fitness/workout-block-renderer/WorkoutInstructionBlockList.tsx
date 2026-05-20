'use client';

import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

const SECTION_LABEL: Record<string, string> = {
  warmup: 'Warm-up',
  finisher: 'Finisher',
  cooldown: 'Cool down',
};

type WorkoutInstructionBlockListProps = {
  section: 'warmup' | 'finisher' | 'cooldown';
  blocks: WorkoutSessionBlockView[];
};

export function WorkoutInstructionBlockList({ section, blocks }: WorkoutInstructionBlockListProps) {
  const sectionBlocks = blocks.filter((b) => b.section === section);
  if (sectionBlocks.length === 0) return null;

  const title = SECTION_LABEL[section] ?? section;

  return (
    <section className="space-y-3" data-testid={`instruction-section-${section}`}>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2">
        {sectionBlocks.map((block) => (
          <div
            key={block.id}
            className="flex gap-4 rounded-xl bg-muted/30 p-3 ring-1 ring-border/10"
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prep
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{block.name}</p>
              {block.instructions.length > 0 ? (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {block.instructions.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
