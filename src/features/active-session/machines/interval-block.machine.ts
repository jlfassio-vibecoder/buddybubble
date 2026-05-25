import { assign, enqueueActions, sendParent, setup } from 'xstate';
import { intervalBlockClockActor } from '../actors/interval-block-clock.actor';
import {
  applyIntervalEngineEvent,
  createInitialIntervalBlockContext,
  isEnginePhaseDone,
} from './interval-block-reducer';
import { intervalRowSnapshotKey } from '@/lib/workout-factory/interval-timer/interval-row-snapshot-key';
import type { IntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';
import type { IntervalBlockContext, IntervalBlockEvent } from './interval-block.types';

const CLOCK_ID = 'intervalClock';

function eventNow(event: IntervalBlockEvent): number {
  if ('now' in event && typeof event.now === 'number') return event.now;
  return Date.now();
}

function syncNotifiedRowSnapshotKey({ context }: { context: IntervalBlockContext }) {
  return {
    lastNotifiedRowSnapshotKey: intervalRowSnapshotKey(context.rowSnapshot),
  };
}

export const intervalBlockMachine = setup({
  types: {} as {
    context: IntervalBlockContext;
    events: IntervalBlockEvent;
    input: IntervalBlockInput;
  },
  actors: {
    intervalBlockClock: intervalBlockClockActor,
  },
  guards: {
    isEngineDone: ({ context }) => isEnginePhaseDone(context.engine),
  },
  actions: {
    applyEngine: assign(({ context, event }) => applyIntervalEngineEvent(context, event)),
    notifyParentRowSnapshot: enqueueActions(({ context, enqueue }) => {
      enqueue.assign(syncNotifiedRowSnapshotKey);
      enqueue.sendParent({
        type: 'INTERVAL_SNAPSHOT',
        blockId: context.blockId,
        snapshot: context.rowSnapshot,
      });
    }),
    maybeNotifyParentRowSnapshot: enqueueActions(({ context, enqueue }) => {
      const key = intervalRowSnapshotKey(context.rowSnapshot);
      if (key === context.lastNotifiedRowSnapshotKey) return;
      enqueue.assign(syncNotifiedRowSnapshotKey);
      enqueue.sendParent({
        type: 'INTERVAL_SNAPSHOT',
        blockId: context.blockId,
        snapshot: context.rowSnapshot,
      });
    }),
    notifyComplete: sendParent(({ context }) => ({
      type: 'BLOCK_INTERVAL_COMPLETE',
      blockId: context.blockId,
    })),
  },
}).createMachine({
  id: 'intervalBlock',
  context: ({ input }) => createInitialIntervalBlockContext(input),
  initial: 'idle',
  states: {
    idle: {
      on: {
        START: {
          target: 'running',
          actions: [
            assign(({ context, event }) =>
              applyIntervalEngineEvent(context, { type: 'START', now: eventNow(event) }),
            ),
            'notifyParentRowSnapshot',
          ],
        },
      },
    },
    running: {
      invoke: {
        id: CLOCK_ID,
        src: 'intervalBlockClock',
      },
      on: {
        PAUSE: {
          target: 'paused',
          actions: [
            assign(({ context, event }) =>
              applyIntervalEngineEvent(context, { type: 'PAUSE', now: eventNow(event) }),
            ),
            'notifyParentRowSnapshot',
          ],
        },
        RESET: {
          target: 'idle',
          actions: ['applyEngine', 'notifyParentRowSnapshot'],
        },
        CLOCK_FRAME: {
          actions: ['applyEngine', 'maybeNotifyParentRowSnapshot'],
        },
        LOG_AMRAP_ROUND: {
          actions: 'applyEngine',
        },
      },
      always: {
        guard: 'isEngineDone',
        target: 'completed',
      },
    },
    paused: {
      on: {
        RESUME: {
          target: 'running',
          actions: [
            assign(({ context, event }) =>
              applyIntervalEngineEvent(context, { type: 'RESUME', now: eventNow(event) }),
            ),
            'notifyParentRowSnapshot',
          ],
        },
        RESET: {
          target: 'idle',
          actions: ['applyEngine', 'notifyParentRowSnapshot'],
        },
      },
    },
    completed: {
      entry: ['notifyComplete', 'notifyParentRowSnapshot'],
      on: {
        START: {
          target: 'running',
          actions: [
            assign(({ context, event }) =>
              applyIntervalEngineEvent(context, { type: 'START', now: eventNow(event) }),
            ),
            'notifyParentRowSnapshot',
          ],
        },
        RESET: {
          target: 'idle',
          actions: ['applyEngine', 'notifyParentRowSnapshot'],
        },
      },
    },
  },
});
