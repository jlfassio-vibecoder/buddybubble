import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { Json } from '@/types/database';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { FinishWorkoutRunner } from '../actors/finish-workout.actor';
import { createAdapterFinishWorkoutRunner } from '../actors/finish-workout.actor';
import { createNoOpPersistenceAdapter, type PersistenceAdapter } from '../actors/persistence.actor';

/** Matches WorkoutPlayer `AUTOSAVE_MS`. */
export const AUTOSAVE_MS = 2000;

export type ActiveSessionInput = {
  sessionId: string;
  sourceTaskId: string;
  bubbleId: string;
  targetBubbleId: string;
  workspaceId: string;
  classInstanceId?: string | null;
  sourceMetadata: Json | null;
  workoutTitle: string;
  sessionVm: WorkoutSessionViewModel;
  draftLogs: SetDraft[][];
  persistenceAdapter?: PersistenceAdapter;
  finishWorkoutRunner?: FinishWorkoutRunner;
};

export type ActiveSessionContext = ActiveSessionInput & {
  hydrationError: string | null;
  logTaskId: string | null;
  pendingInsert: boolean;
  autosaveInFlight: boolean;
  autosaveScheduled: boolean;
  autosaveError: string | null;
  finishError: string | null;
  hasUserEdited: boolean;
  finishQueued: boolean;
  closeQueued: boolean;
  elapsedSec: number;
  startedAt: string;
  sentinelFired: boolean;
  sentinelFailed: boolean;
  persistenceAdapter: PersistenceAdapter;
  finishWorkoutRunner: FinishWorkoutRunner;
};

export type ActiveSessionEvent =
  | { type: 'HYDRATE_DONE'; draftLogs?: SetDraft[][]; logTaskId?: string | null }
  | { type: 'HYDRATE_FAILED'; error: string }
  | { type: 'LOGS_CHANGED'; draftLogs: SetDraft[][] }
  | { type: 'AUTOSAVE_SCHEDULED' }
  | { type: 'AUTOSAVE_STARTED' }
  | { type: 'AUTOSAVE_DONE'; logTaskId: string }
  | { type: 'AUTOSAVE_FAILED'; error: string }
  | { type: 'AUTOSAVE_SKIPPED' }
  | { type: 'FINISH' }
  | { type: 'ABANDON' }
  | { type: 'COACH_SENTINEL_SEND' }
  | { type: 'COACH_SENTINEL_FAILED' }
  | { type: 'COACH_SENTINEL_DONE' }
  // Phase 3+ placeholders (not wired in Phase 0)
  | { type: 'VISIBILITY'; hidden: boolean }
  | { type: 'COACH_PATCH' }
  | { type: 'BLOCK_INTERVAL_COMPLETE' }
  | { type: 'SESSION_TICK'; elapsedSec: number };

export type GuardParams = {
  context: ActiveSessionContext;
};

export const activeSessionGuards = {
  canFinishImmediately: ({ context }: GuardParams) =>
    !context.autosaveInFlight && !context.pendingInsert && !context.autosaveScheduled,
  finishQueued: ({ context }: GuardParams) => context.finishQueued,
  closeQueued: ({ context }: GuardParams) => context.closeQueued,
};

export function createInitialContext(input: ActiveSessionInput): ActiveSessionContext {
  const persistenceAdapter = input.persistenceAdapter ?? createNoOpPersistenceAdapter();
  return {
    ...input,
    persistenceAdapter,
    finishWorkoutRunner:
      input.finishWorkoutRunner ?? createAdapterFinishWorkoutRunner(persistenceAdapter),
    hydrationError: null,
    logTaskId: null,
    pendingInsert: false,
    autosaveInFlight: false,
    autosaveScheduled: false,
    autosaveError: null,
    finishError: null,
    hasUserEdited: false,
    finishQueued: false,
    closeQueued: false,
    elapsedSec: 0,
    startedAt: new Date().toISOString(),
    sentinelFired: false,
    sentinelFailed: false,
  };
}
