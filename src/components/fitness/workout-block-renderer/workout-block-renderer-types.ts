import type { HTMLAttributes, ReactNode } from 'react';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { ResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import type { ExerciseCueRequestV1 } from '@/lib/agents/coach/exercise-cue-request';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type SaveToMyNotesArgs = {
  resolutionKey: string;
  exerciseName: string;
  dictionaryId: string | null;
  patch: WorkoutCuePatch;
};

export type WorkoutCueEditProps = {
  canWriteCue?: boolean;
  onCueSave?: (key: string, patch: WorkoutCuePatch) => void;
  onCueDraftChange?: (key: string, patch: WorkoutCuePatch) => void;
  onCueCancel?: (key: string) => void;
  /** M3: open Coach chat to generate missing cues. */
  onAskCoachForCues?: (payload: ExerciseCueRequestV1) => void;
  /** M4: persist micro-edits to user_exercise_notes. */
  onSaveToMyNotes?: (args: SaveToMyNotesArgs) => Promise<void>;
  injuriesOnFile?: boolean;
};

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
  /** Resolved exercise cues for view-mode accordion (M1). */
  cuesByKey?: Record<string, ResolvedCueBundle>;
  /** When true, cue toggles stay hidden until resolution completes. */
  cuesLoading?: boolean;
} & WorkoutCueEditProps;
