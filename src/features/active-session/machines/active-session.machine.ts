import { assign, sendTo, setup } from 'xstate';
import { coachSyncActor, type CoachThreadSnapshot } from '../actors/coach-sync.actor';
import { finishWorkoutActor } from '../actors/finish-workout.actor';
import { persistenceActor } from '../actors/persistence.actor';
import { applyExecutionPatchToDraftLogs } from '@/lib/workout-factory/workout-log-mutations';
import {
  activeSessionGuards,
  createInitialContext,
  type ActiveSessionContext,
  type ActiveSessionEvent,
  type ActiveSessionInput,
} from './types';

const PERSISTENCE_ID = 'persistence';
const COACH_SYNC_ID = 'coachSync';

function persistenceSnapshot(context: ActiveSessionContext) {
  return {
    logTaskId: context.logTaskId,
    pendingInsert: context.pendingInsert,
  };
}

export const activeSessionMachine = setup({
  types: {} as {
    context: ActiveSessionContext;
    events: ActiveSessionEvent;
    input: ActiveSessionInput;
  },
  guards: activeSessionGuards,
  actors: {
    persistence: persistenceActor,
    finishWorkout: finishWorkoutActor,
    coachSync: coachSyncActor,
  },
  actions: {
    assignHydrateDone: assign(({ event, context }) => {
      if (event.type !== 'HYDRATE_DONE') return {};
      return {
        draftLogs: event.draftLogs ?? context.draftLogs,
        logTaskId: event.logTaskId ?? context.logTaskId,
      };
    }),
    assignHydrateFailed: assign(({ event }) => {
      if (event.type !== 'HYDRATE_FAILED') return {};
      return { hydrationError: event.error };
    }),
    assignLogsChanged: assign(({ event }) => {
      if (event.type !== 'LOGS_CHANGED') return {};
      return { draftLogs: event.draftLogs, hasUserEdited: true };
    }),
    markAutosaveScheduled: assign({ autosaveScheduled: true }),
    assignLogTaskIdFromAutosave: assign(({ event }) => {
      if (event.type !== 'AUTOSAVE_DONE') return {};
      return {
        logTaskId: event.logTaskId,
        pendingInsert: false,
        autosaveInFlight: false,
        autosaveScheduled: false,
        autosaveError: null,
      };
    }),
    assignAutosaveSkipped: assign({
      autosaveInFlight: false,
      pendingInsert: false,
      autosaveScheduled: false,
      autosaveError: null,
    }),
    assignAutosaveFailed: assign(({ event }) => {
      if (event.type !== 'AUTOSAVE_FAILED') return {};
      return {
        autosaveInFlight: false,
        pendingInsert: false,
        autosaveScheduled: false,
        autosaveError: event.error,
      };
    }),
    setAutosaveInFlight: assign({
      autosaveInFlight: true,
      autosaveScheduled: false,
      pendingInsert: ({ context }) => context.logTaskId == null,
    }),
    queueFinish: assign({ finishQueued: true }),
    clearFinishQueue: assign({ finishQueued: false }),
    queueClose: assign({ closeQueued: true }),
    clearCloseQueue: assign({ closeQueued: false }),
    clearFinishError: assign({ finishError: null }),
    assignFinishError: assign(({ event }) => {
      const raw =
        event && typeof event === 'object' && 'error' in event
          ? (event as { error: unknown }).error
          : null;
      const message =
        raw instanceof Error ? raw.message : raw != null ? String(raw) : 'finish_failed';
      return { finishError: message };
    }),
    markSentinelFired: assign({ sentinelFired: true, sentinelFailed: false }),
    markSentinelFailed: assign({ sentinelFired: false, sentinelFailed: true }),
    markSentinelDone: assign({ sentinelFailed: false }),
    applyCoachPatch: assign(({ context, event }) => {
      if (event.type !== 'COACH_PATCH') return {};
      return {
        draftLogs: applyExecutionPatchToDraftLogs(context.draftLogs, event.patch),
        hasUserEdited: true,
      };
    }),
    scheduleAutosave: sendTo(PERSISTENCE_ID, ({ context }) => ({
      type: 'SCHEDULE_AUTOSAVE',
      ...persistenceSnapshot(context),
    })),
    flushAutosave: sendTo(PERSISTENCE_ID, ({ context }) => ({
      type: 'FLUSH_AUTOSAVE',
      ...persistenceSnapshot(context),
    })),
    forwardCoachThreadSnapshot: sendTo(COACH_SYNC_ID, ({ event }) => ({
      type: 'THREAD_SNAPSHOT',
      snapshot: (event as { type: 'COACH_THREAD_SNAPSHOT'; snapshot: CoachThreadSnapshot })
        .snapshot,
    })),
    forwardCoachTrySentinel: sendTo(COACH_SYNC_ID, { type: 'TRY_SENTINEL' }),
    forwardCoachReset: sendTo(COACH_SYNC_ID, { type: 'RESET' }),
  },
}).createMachine({
  id: 'activeSession',
  context: ({ input }) => createInitialContext(input),
  initial: 'hydrating',
  states: {
    hydrating: {
      on: {
        HYDRATE_DONE: {
          target: 'active',
          actions: [
            'assignHydrateDone',
            assign(({ context }) => ({
              startedAt: context.startedAt || new Date().toISOString(),
            })),
          ],
        },
        HYDRATE_FAILED: {
          target: 'closing',
          actions: 'assignHydrateFailed',
        },
      },
    },
    active: {
      on: {
        SESSION_TICK: {
          actions: assign(({ event }) => {
            if (event.type !== 'SESSION_TICK') return {};
            return { elapsedSec: event.elapsedSec };
          }),
        },
        AUTOSAVE_SCHEDULED: { actions: 'markAutosaveScheduled' },
        COACH_THREAD_SNAPSHOT: { actions: 'forwardCoachThreadSnapshot' },
        COACH_TRY_SENTINEL: { actions: 'forwardCoachTrySentinel' },
        COACH_RESET: { actions: 'forwardCoachReset' },
      },
      invoke: [
        {
          id: PERSISTENCE_ID,
          src: 'persistence',
          input: ({ context }) => ({ adapter: context.persistenceAdapter }),
        },
        {
          id: COACH_SYNC_ID,
          src: 'coachSync',
          input: ({ context }) => ({ adapter: context.coachSyncAdapter }),
        },
      ],
      initial: 'logging',
      states: {
        logging: {
          on: {
            LOGS_CHANGED: {
              actions: ['assignLogsChanged', 'scheduleAutosave'],
            },
            AUTOSAVE_STARTED: {
              target: 'autosaving',
              actions: 'setAutosaveInFlight',
            },
            FINISH: [
              {
                guard: 'canFinishImmediately',
                target: '#activeSession.finishing',
                actions: 'clearFinishError',
              },
              {
                actions: ['queueFinish', 'flushAutosave'],
              },
            ],
            ABANDON: {
              actions: ['queueClose', 'flushAutosave'],
            },
            COACH_SENTINEL_SEND: { actions: 'markSentinelFired' },
            COACH_SENTINEL_FAILED: { actions: 'markSentinelFailed' },
            COACH_SENTINEL_DONE: { actions: 'markSentinelDone' },
            COACH_PATCH: { actions: ['applyCoachPatch', 'scheduleAutosave'] },
          },
        },
        autosaving: {
          on: {
            COACH_PATCH: { actions: ['applyCoachPatch', 'scheduleAutosave'] },
            AUTOSAVE_DONE: [
              {
                guard: 'finishQueued',
                target: '#activeSession.finishing',
                actions: ['assignLogTaskIdFromAutosave', 'clearFinishQueue', 'clearFinishError'],
              },
              {
                guard: 'closeQueued',
                target: '#activeSession.closing',
                actions: ['assignLogTaskIdFromAutosave', 'clearCloseQueue'],
              },
              {
                target: 'logging',
                actions: 'assignLogTaskIdFromAutosave',
              },
            ],
            AUTOSAVE_SKIPPED: [
              {
                guard: 'finishQueued',
                target: '#activeSession.finishing',
                actions: ['assignAutosaveSkipped', 'clearFinishQueue', 'clearFinishError'],
              },
              {
                guard: 'closeQueued',
                target: '#activeSession.closing',
                actions: ['assignAutosaveSkipped', 'clearCloseQueue'],
              },
              {
                target: 'logging',
                actions: 'assignAutosaveSkipped',
              },
            ],
            AUTOSAVE_FAILED: [
              {
                guard: 'finishQueued',
                target: 'logging',
                actions: ['assignAutosaveFailed', 'clearFinishQueue'],
              },
              {
                guard: 'closeQueued',
                target: '#activeSession.closing',
                actions: ['assignAutosaveFailed', 'clearCloseQueue'],
              },
              {
                target: 'logging',
                actions: 'assignAutosaveFailed',
              },
            ],
            FINISH: { actions: 'queueFinish' },
            ABANDON: { actions: ['queueClose', 'flushAutosave'] },
          },
        },
      },
    },
    finishing: {
      invoke: {
        id: 'finishWorkout',
        src: 'finishWorkout',
        input: ({ context }) => ({
          context,
          finishWorkoutRunner: context.finishWorkoutRunner,
        }),
        onDone: {
          target: 'closing',
          actions: [
            assign(({ event }) => ({
              logTaskId: event.output.logTaskId,
              finishError: null,
            })),
            'clearFinishQueue',
          ],
        },
        onError: {
          target: 'active.logging',
          actions: 'assignFinishError',
        },
      },
    },
    closing: {
      always: { target: 'completed' },
    },
    completed: {
      type: 'final',
    },
  },
});
