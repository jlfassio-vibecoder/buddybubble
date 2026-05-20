import type { ReactNode } from 'react';
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
  setTitle?: string;
  setDescription?: string;
  sessionTitle?: string;
  sessionDescription?: string;
  cardTitle?: string;
};

export type WorkoutBlockListRendererProps = {
  blocks: WorkoutSessionBlockView[];
  chrome?: WorkoutBlockListChrome;
  density?: 'full' | 'compact' | 'inline';
  renderExercise?: (ctx: WorkoutBlockExerciseRenderContext) => ReactNode;
  taskId?: string | null;
  className?: string;
  'data-testid'?: string;
};
