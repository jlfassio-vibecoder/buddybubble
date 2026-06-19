import type { HTMLAttributes, ReactNode } from 'react';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type WorkoutBlockExerciseRenderContext = {
  block: WorkoutSessionBlockView;
  exercise: Exercise;
  exerciseIndexInBlock: number;
  stationLabel: string | null;
  globalFlatIndex?: number;
};

export type WorkoutBlockListChrome = {
  difficulty?: string;
  /** Coach @conversation brief — shown in card header, not repeated here. */
  cardTitle?: string;
  /** Block/format reasoning derived from parametric outline. */
  structureRationale?: string;
  /** Pre-session intake calibration (phase, anchor, duration, limitations). */
  sessionAdaptations?: string;
};

export type WorkoutBlockListRendererProps = {
  blocks: WorkoutSessionBlockView[];
  chrome?: WorkoutBlockListChrome;
  density?: 'full' | 'compact' | 'inline';
  renderExercise?: (ctx: WorkoutBlockExerciseRenderContext) => ReactNode;
  taskId?: string | null;
  className?: string;
  'data-testid'?: string;
  /** Applied to each main block section (e.g. player `main-block-*` testids). */
  getMainBlockSectionProps?: (block: WorkoutSessionBlockView) => HTMLAttributes<HTMLElement>;
  /** Rendered between block header and exercise list (e.g. interval timer shell). */
  renderMainBlockAfterHeader?: (block: WorkoutSessionBlockView) => ReactNode;
};
