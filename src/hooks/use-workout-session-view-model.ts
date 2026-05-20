'use client';

import { useMemo } from 'react';
import type { Json } from '@/types/database';
import {
  buildWorkoutSessionViewModel,
  type WorkoutSessionBlockView,
  type WorkoutSessionSource,
  type WorkoutSessionViewModel,
} from '@/lib/workout-factory/workout-session-view-model';

export function useWorkoutSessionViewModel(
  metadata: Json | null | undefined,
): WorkoutSessionViewModel {
  return useMemo(() => buildWorkoutSessionViewModel(metadata ?? {}), [metadata]);
}

export type { WorkoutSessionViewModel, WorkoutSessionBlockView, WorkoutSessionSource };
