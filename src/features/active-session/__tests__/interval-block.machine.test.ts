import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assign, createActor, fromCallback, setup } from 'xstate';
import type { TabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import type { EmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';
import { intervalBlockMachine } from '../machines/interval-block.machine';
import type { IntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';

const noopClock = fromCallback(() => () => {});

const testIntervalBlockMachine = intervalBlockMachine.provide({
  actors: {
    intervalBlockClock: noopClock,
  },
});

const absorbParentMachine = setup({}).createMachine({
  id: 'absorbParent',
  on: {
    '*': {},
  },
});

function createTestIntervalActor(input: IntervalBlockInput) {
  const parent = createActor(absorbParentMachine);
  parent.start();
  const actor = createActor(testIntervalBlockMachine, { input, parent });
  actor.start();
  return actor;
}

const tabataInput: IntervalBlockInput = {
  blockId: 'block-tabata',
  format: 'tabata',
  config: {
    prepareMs: 0,
    workMs: 20_000,
    restMs: 10_000,
    totalRounds: 2,
  } satisfies TabataTimerConfig,
};

const emomAlternatingInput: IntervalBlockInput = {
  blockId: 'block-emom',
  format: 'emom',
  config: {
    intervalMs: 60_000,
    intervalSeconds: 60,
    totalRounds: 2,
    alternatingStations: [[0], [1]],
  } satisfies EmomTimerConfig,
};

describe('intervalBlockMachine', () => {
  it('Tabata: single CLOCK_FRAME fast-forwards to completed after background jump', () => {
    const actor = createTestIntervalActor(tabataInput);
    actor.send({ type: 'START', now: 0 });
    expect(actor.getSnapshot().matches('running')).toBe(true);

    actor.send({ type: 'CLOCK_FRAME', now: 90_000 });
    expect(actor.getSnapshot().matches('completed')).toBe(true);
    expect(actor.getSnapshot().context.engine.format).toBe('tabata');
    if (actor.getSnapshot().context.engine.format === 'tabata') {
      expect(actor.getSnapshot().context.engine.state.phase).toBe('done');
    }
  });

  it('Tabata: pause mid-work preserves remaining after resume', () => {
    const actor = createTestIntervalActor(tabataInput);
    actor.send({ type: 'START', now: 0 });
    actor.send({ type: 'PAUSE', now: 5_000 });
    expect(actor.getSnapshot().matches('paused')).toBe(true);

    actor.send({ type: 'RESUME', now: 25_000 });
    expect(actor.getSnapshot().matches('running')).toBe(true);
    actor.send({ type: 'CLOCK_FRAME', now: 40_000 });
    expect(actor.getSnapshot().context.rowSnapshot?.activeSetPhase).toBe('rest');
  });

  it('EMOM alternating: row snapshot includes activeStationIndices for round 0', () => {
    const actor = createTestIntervalActor(emomAlternatingInput);
    actor.send({ type: 'START', now: 0 });
    actor.send({ type: 'CLOCK_FRAME', now: 1_000 });
    expect(actor.getSnapshot().context.rowSnapshot).toEqual({
      roundIndex: 0,
      activeSetPhase: 'work',
      activeStationIndices: [0],
    });
  });

  it('AMRAP: LOG_AMRAP_ROUND increments round count without completing', () => {
    const actor = createTestIntervalActor({
      blockId: 'block-amrap',
      format: 'amrap',
      config: { timeCapMs: 600_000, targetRounds: null },
    });
    actor.send({ type: 'START', now: 0 });
    actor.send({ type: 'LOG_AMRAP_ROUND' });
    expect(actor.getSnapshot().context.amrapRoundCount).toBe(1);
    expect(actor.getSnapshot().matches('running')).toBe(true);
  });

  it('RESET returns to idle with fresh engine state', () => {
    const actor = createTestIntervalActor(tabataInput);
    actor.send({ type: 'START', now: 0 });
    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    if (actor.getSnapshot().context.engine.format === 'tabata') {
      expect(actor.getSnapshot().context.engine.state.phase).toBe('idle');
    }
  });
});

describe('intervalBlockMachine visibility catch-up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Tabata: background then foreground fast-forwards to completed', () => {
    const actor = createTestIntervalActor(tabataInput);
    actor.send({ type: 'START', now: 0 });
    expect(actor.getSnapshot().matches({ running: 'active' })).toBe(true);

    actor.send({ type: 'VISIBILITY', hidden: true });
    expect(actor.getSnapshot().matches({ running: 'backgroundSuspended' })).toBe(true);

    vi.setSystemTime(90_000);
    actor.send({ type: 'VISIBILITY', hidden: false });
    expect(actor.getSnapshot().matches('completed')).toBe(true);
    if (actor.getSnapshot().context.engine.format === 'tabata') {
      expect(actor.getSnapshot().context.engine.state.phase).toBe('done');
    }
  });

  it('EMOM alternating: background catch-up advances to correct round', () => {
    const actor = createTestIntervalActor(emomAlternatingInput);
    actor.send({ type: 'START', now: 0 });
    actor.send({ type: 'VISIBILITY', hidden: true });

    vi.setSystemTime(90_000);
    actor.send({ type: 'VISIBILITY', hidden: false });

    expect(actor.getSnapshot().matches({ running: 'active' })).toBe(true);
    expect(actor.getSnapshot().context.rowSnapshot).toEqual({
      roundIndex: 1,
      activeSetPhase: 'work',
      activeStationIndices: [1],
    });
  });

  it('AMRAP: background catch-up completes when past time cap', () => {
    const actor = createTestIntervalActor({
      blockId: 'block-amrap',
      format: 'amrap',
      config: { timeCapMs: 60_000, targetRounds: null },
    });
    actor.send({ type: 'START', now: 0 });
    actor.send({ type: 'VISIBILITY', hidden: true });

    vi.setSystemTime(90_000);
    actor.send({ type: 'VISIBILITY', hidden: false });

    expect(actor.getSnapshot().matches('completed')).toBe(true);
    if (actor.getSnapshot().context.engine.format === 'amrap') {
      expect(actor.getSnapshot().context.engine.state.phase).toBe('done');
    }
  });

  it('Tabata: mid-phase background refresh does not advance phase', () => {
    const actor = createTestIntervalActor(tabataInput);
    actor.send({ type: 'START', now: 0 });
    vi.setSystemTime(5_000);
    actor.send({ type: 'VISIBILITY', hidden: true });

    vi.setSystemTime(10_000);
    actor.send({ type: 'VISIBILITY', hidden: false });

    expect(actor.getSnapshot().matches({ running: 'active' })).toBe(true);
    expect(actor.getSnapshot().context.rowSnapshot).toEqual({
      roundIndex: 0,
      activeSetPhase: 'work',
    });
    if (actor.getSnapshot().context.engine.format === 'tabata') {
      expect(actor.getSnapshot().context.engine.state.phase).toBe('work');
    }
  });

  it('Tabata: paused interval ignores visibility catch-up', () => {
    const actor = createTestIntervalActor(tabataInput);
    actor.send({ type: 'START', now: 0 });
    actor.send({ type: 'PAUSE', now: 5_000 });
    expect(actor.getSnapshot().matches('paused')).toBe(true);

    vi.setSystemTime(90_000);
    actor.send({ type: 'VISIBILITY', hidden: true });
    actor.send({ type: 'VISIBILITY', hidden: false });

    expect(actor.getSnapshot().matches('paused')).toBe(true);
    if (actor.getSnapshot().context.engine.format === 'tabata') {
      expect(actor.getSnapshot().context.engine.state.phase).toBe('paused');
    }

    actor.send({ type: 'RESUME', now: 90_000 });
    expect(actor.getSnapshot().matches({ running: 'active' })).toBe(true);
    actor.send({ type: 'CLOCK_FRAME', now: 105_000 });
    expect(actor.getSnapshot().context.rowSnapshot?.activeSetPhase).toBe('rest');
  });
});

describe('intervalBlockMachine parent notifications', () => {
  it('CLOCK_FRAME burst during stable work phase does not spam INTERVAL_SNAPSHOT', () => {
    let snapshotCount = 0;
    const parentMachine = setup({}).createMachine({
      on: {
        INTERVAL_SNAPSHOT: {
          actions: () => {
            snapshotCount += 1;
          },
        },
      },
    });

    const parent = createActor(parentMachine);
    parent.start();
    const child = createActor(testIntervalBlockMachine, { input: tabataInput, parent });
    child.start();
    child.send({ type: 'START', now: 0 });
    const afterStart = snapshotCount;
    expect(afterStart).toBe(1);

    for (let i = 0; i < 10; i += 1) {
      child.send({ type: 'CLOCK_FRAME', now: 1_000 + i * 100 });
    }

    expect(snapshotCount).toBe(afterStart);
  });

  it('sendParent BLOCK_INTERVAL_COMPLETE when Tabata finishes', () => {
    const parentMachine = setup({}).createMachine({
      context: { blockId: null as string | null },
      on: {
        BLOCK_INTERVAL_COMPLETE: {
          actions: assign(({ event }) => {
            if (event.type !== 'BLOCK_INTERVAL_COMPLETE') return {};
            return { blockId: event.blockId };
          }),
        },
      },
    });

    const parent = createActor(parentMachine);
    parent.start();
    const child = createActor(testIntervalBlockMachine, { input: tabataInput, parent });
    child.start();
    child.send({ type: 'START', now: 0 });
    child.send({ type: 'CLOCK_FRAME', now: 90_000 });
    expect(parent.getSnapshot().context.blockId).toBe('block-tabata');
  });
});
