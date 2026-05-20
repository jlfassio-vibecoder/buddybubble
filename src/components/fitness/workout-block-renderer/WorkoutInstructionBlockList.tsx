'use client';

import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { WorkoutInstructionSection } from '@/components/fitness/workout-block-renderer/WorkoutInstructionSection';

type WorkoutInstructionBlockListProps = {
  section: 'warmup' | 'finisher' | 'cooldown';
  blocks: WorkoutSessionBlockView[];
};

export function WorkoutInstructionBlockList({ section, blocks }: WorkoutInstructionBlockListProps) {
  return (
    <WorkoutInstructionSection
      section={section}
      blocks={blocks}
      data-testid={`instruction-section-${section}`}
    />
  );
}
