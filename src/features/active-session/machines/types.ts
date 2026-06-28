import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import type { Json } from '@/types/database';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { ExecutionPatch } from '@/types/execution-patch';
import type { AnyActorRef } from 'xstate';
import type { CoachThreadSnapshot } from '../actors/coach-sync.actor';
import type { FinishWorkoutRunner } from '../actors/finish-workout.actor';
import { createAdapterFinishWorkoutRunner } from '../actors/finish-workout.actor';
import { createNoOpCoachSyncAdapter, type CoachSyncAdapter } from '../actors/coach-sync.actor';
import { createNoOpPersistenceAdapter, type PersistenceAdapter } from '../actors/persistence.actor';
import type { IntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';

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
  ghostLogs?: GhostSetSnapshot[][];
  persistenceAdapter?: PersistenceAdapter;
  finishWorkoutRunner?: FinishWorkoutRunner;
  coachSyncAdapter?: CoachSyncAdapter;
};

export type ActiveSessionContext = ActiveSessionInput & {
  hydrationError: string | null;
  logTaskId: string | null;
  ghostLogs: GhostSetSnapshot[][];
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
  coachSyncAdapter: CoachSyncAdapter;
  intervalBlockRef: AnyActorRef | null;
  activeIntervalBlockId: string | null;
  activeIntervalInput: IntervalBlockInput | null;
  intervalRowSnapshots: Record<string, IntervalRowSnapshot | null>;
  documentHidden: boolean;
};

export type ActiveSessionEvent =
  | {
      type: 'HYDRATE_DONE';
      draftLogs?: SetDraft[][];
      ghostLogs?: GhostSetSnapshot[][];
      logTaskId?: string | null;
    }
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
  | { type: 'COACH_SENTINEL_ALREADY_PRESENT' }
  | { type: 'COACH_SENTINEL_FAILED' }
  | { type: 'COACH_SENTINEL_DONE' }
  | { type: 'COACH_THREAD_SNAPSHOT'; snapshot: CoachThreadSnapshot }
  | { type: 'COACH_TRY_SENTINEL' }
  | { type: 'COACH_RESET' }
  | { type: 'VISIBILITY'; hidden: boolean }
  | { type: 'COACH_PATCH'; patch: ExecutionPatch }
  | { type: 'BLOCK_INTERVAL_COMPLETE'; blockId: string }
  | { type: 'INTERVAL_START'; input: IntervalBlockInput }
  | {
      type: 'INTERVAL_COMMAND';
      blockId: string;
      command: 'PAUSE' | 'RESUME' | 'RESET';
    }
  | { type: 'INTERVAL_LOG_AMRAP_ROUND'; blockId: string }
  | {
      type: 'INTERVAL_SNAPSHOT';
      blockId: string;
      snapshot: IntervalRowSnapshot | null;
    }
  | { type: 'SESSION_TICK'; elapsedSec: number };

export type GuardParams = {
  context: ActiveSessionContext;
  event?: ActiveSessionEvent;
};

export const activeSessionGuards = {
  canFinishImmediately: ({ context }: GuardParams) =>
    !context.autosaveInFlight && !context.pendingInsert && !context.autosaveScheduled,
  finishQueued: ({ context }: GuardParams) => context.finishQueued,
  closeQueued: ({ context }: GuardParams) => context.closeQueued,
  hasIntervalBlockRef: ({ context }: GuardParams) => context.intervalBlockRef != null,
  isActiveIntervalCommand: ({ context, event }: GuardParams) =>
    event?.type === 'INTERVAL_COMMAND' &&
    context.intervalBlockRef != null &&
    context.activeIntervalBlockId === event.blockId,
  isActiveIntervalAmrapLog: ({ context, event }: GuardParams) =>
    event?.type === 'INTERVAL_LOG_AMRAP_ROUND' &&
    context.intervalBlockRef != null &&
    context.activeIntervalBlockId === event.blockId,
};

export function createInitialContext(input: ActiveSessionInput): ActiveSessionContext {
  const persistenceAdapter = input.persistenceAdapter ?? createNoOpPersistenceAdapter();
  const coachSyncAdapter = input.coachSyncAdapter ?? createNoOpCoachSyncAdapter();
  return {
    ...input,
    persistenceAdapter,
    coachSyncAdapter,
    finishWorkoutRunner:
      input.finishWorkoutRunner ?? createAdapterFinishWorkoutRunner(persistenceAdapter),
    hydrationError: null,
    logTaskId: null,
    ghostLogs: input.ghostLogs ?? [],
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
    intervalBlockRef: null,
    activeIntervalBlockId: null,
    activeIntervalInput: null,
    intervalRowSnapshots: {},
    documentHidden: false,
  };
}
