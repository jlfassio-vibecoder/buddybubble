'use client';

import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

export interface AmrapEmbedExerciseSectionProps {
  engine: AmrapSessionEngine;
}

/** Placeholder for exercise list (P6). */
export default function AmrapEmbedExerciseSection(_props: AmrapEmbedExerciseSectionProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80">
      Exercise section (coming soon)
    </div>
  );
}
