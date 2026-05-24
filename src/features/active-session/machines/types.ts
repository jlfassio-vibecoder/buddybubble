import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import { createNoOpPersistenceAdapter } from '../actors/persistence.actor';
import type { PersistenceAdapter } from '../actors/persistence.actor';

/** Matches WorkoutPlayer `AUTOSAVE_MS`. */
export const AUTOSAVE_MS = 2000;

export type ActiveSessionInput = {
  sessionId: string;
  sourceTaskId: string;
  bubbleId: string;
  workspaceId: string;
  classInstanceId?: string | null;
  draftLogs: SetDraft[][];
  persistenceAdapter?: PersistenceAdapter;
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
};

export type ActiveSessionEvent =
  | { type: 'HYDRATE_DONE'; draftLogs?: SetDraft[][]; logTaskId?: string | null }
  | { type: 'HYDRATE_FAILED'; error: string }
  | { type: 'LOGS_CHANGED'; draftLogs: SetDraft[][] }
  | { type: 'AUTOSAVE_SCHEDULED' }
  | { type: 'AUTOSAVE_STARTED' }
  | { type: 'AUTOSAVE_DONE'; logTaskId: string }
  | { type: 'AUTOSAVE_FAILED'; error: string }
  | { type: 'FINISH' }
  | { type: 'ABANDON' }
  | { type: 'COACH_SENTINEL_SEND' }
  | { type: 'COACH_SENTINEL_FAILED' }
  | { type: 'COACH_SENTINEL_DONE' }
  // Phase 3+ placeholders (not wired in Phase 0)
  | { type: 'VISIBILITY'; hidden: boolean }
  | { type: 'COACH_PATCH' }
  | { type: 'BLOCK_INTERVAL_COMPLETE' };

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
  return {
    ...input,
    persistenceAdapter: input.persistenceAdapter ?? createNoOpPersistenceAdapter(),
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
