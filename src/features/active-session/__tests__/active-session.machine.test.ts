import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS, activeSessionGuards, createInitialContext } from '../machines/types';
import {
  createDefaultInput,
  createEditedDraftLogs,
  createSampleDraftLogs,
} from './test-utils/fixtures';
import {
  advanceAutosave,
  createMockPersistenceAdapter,
  createStartedTestActor,
  createTestActor,
  flushPromises,
  getMachineStateValue,
  startHydratedActor,
  waitForSessionSettled,
} from './test-utils/mock-persistence';

describe('persistence actor debounce (via machine)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounce coalesces rapid LOGS_CHANGED into a single insert', async () => {
    const mock = createMockPersistenceAdapter();
    const actor = createStartedTestActor({}, mock);

    expect(getMachineStateValue(actor)).toBe('active.logging');

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    vi.advanceTimersByTime(500);
    actor.send({
      type: 'LOGS_CHANGED',
      draftLogs: [[{ weight: '110', reps: '5', rpe: '8', done: true }]],
    });

    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    expect(mock.ops.filter((op) => op === 'insert')).toHaveLength(1);
  });
});

describe('activeSessionMachine guards', () => {
  it('assigns ghostLogs from HYDRATE_DONE', () => {
    const actor = createTestActor();
    actor.start();
    const ghostLogs = [[{ weight: '200', reps: '5', rpe: '8' }]];
    actor.send({
      type: 'HYDRATE_DONE',
      draftLogs: createSampleDraftLogs(),
      ghostLogs,
      logTaskId: null,
    });
    expect(actor.getSnapshot().context.ghostLogs).toEqual(ghostLogs);
    expect(getMachineStateValue(actor)).toBe('active.logging');
  });

  it('canFinishImmediately is false while autosave is scheduled', () => {
    const context = createInitialContext(createDefaultInput());
    context.autosaveScheduled = true;
    expect(activeSessionGuards.canFinishImmediately({ context })).toBe(false);
  });

  it('canFinishImmediately is false while autosave is in flight', () => {
    const context = createInitialContext(createDefaultInput());
    context.autosaveInFlight = true;
    expect(activeSessionGuards.canFinishImmediately({ context })).toBe(false);
  });
});

describe('activeSessionMachine concurrency lock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('FINISH during autosaving does not enter finishing until AUTOSAVE_DONE', async () => {
    const mock = createMockPersistenceAdapter({ blockInsertUntilResolved: true });
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    expect(getMachineStateValue(actor)).toBe('active.autosaving');
    expect(actor.getSnapshot().context.finishQueued).toBe(false);

    actor.send({ type: 'FINISH' });
    expect(getMachineStateValue(actor)).toBe('active.autosaving');
    expect(actor.getSnapshot().context.finishQueued).toBe(true);

    mock.resolveInsert();
    await flushPromises();
    await waitForSessionSettled(actor);

    expect(['closing', 'completed']).toContain(getMachineStateValue(actor));
    expect(mock.ops).toEqual(['insert', 'update']);
    expect(actor.getSnapshot().context.logTaskId).toBe('log-draft-001');
  });

  it('blocks duplicate INSERT when insert is already pending', async () => {
    const mock = createMockPersistenceAdapter({ blockInsertUntilResolved: true });
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    actor.send({ type: 'FINISH' });
    await flushPromises();

    expect(mock.ops.filter((op) => op === 'insert')).toHaveLength(1);

    mock.resolveInsert();
    await flushPromises();
    await vi.runAllTimersAsync();
  });

  it('FINISH after debounced autosave uses logTaskId from AUTOSAVE_DONE', async () => {
    const mock = createMockPersistenceAdapter({ logTaskId: 'log-draft-002' });
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();
    await vi.runAllTimersAsync();

    expect(getMachineStateValue(actor)).toBe('active.logging');
    expect(actor.getSnapshot().context.logTaskId).toBe('log-draft-002');

    actor.send({ type: 'FINISH' });
    await flushPromises();
    await waitForSessionSettled(actor);

    expect(mock.ops).toEqual(['insert', 'update']);
    expect(actor.getSnapshot().context.logTaskId).toBe('log-draft-002');
    expect(['closing', 'completed']).toContain(getMachineStateValue(actor));
  });

  it('fail-stops finish when autosave fails while finish is queued', async () => {
    const mock = createMockPersistenceAdapter({ failInsert: true });
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    actor.send({ type: 'FINISH' });
    await flushPromises();

    expect(getMachineStateValue(actor)).toBe('active.logging');
    expect(actor.getSnapshot().context.finishQueued).toBe(false);
    expect(actor.getSnapshot().context.autosaveError).toBe('insert_failed');
    expect(mock.ops).toEqual(['insert']);
  });

  it('fast-path FINISH from idle logging skips autosave when nothing is pending', async () => {
    const mock = createMockPersistenceAdapter();
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'FINISH' });
    await flushPromises();
    await waitForSessionSettled(actor);

    expect(mock.ops).toEqual(['insert']);
    expect(['closing', 'completed']).toContain(getMachineStateValue(actor));
  });
});

describe('activeSessionMachine V1 scenario replay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('autosave INSERT then FINISH produces insert + finish_update without orphan draft', async () => {
    const mock = createMockPersistenceAdapter({ logTaskId: 'log-draft-100' });
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();
    await vi.runAllTimersAsync();

    actor.send({ type: 'FINISH' });
    await flushPromises();
    await waitForSessionSettled(actor);

    expect(mock.ops).toEqual(['insert', 'update']);
    expect(actor.getSnapshot().context.logTaskId).toBe('log-draft-100');
  });

  it('concurrent FINISH + debounced autosave waits for autosave before finalize', async () => {
    const mock = createMockPersistenceAdapter({ blockInsertUntilResolved: true });
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    actor.send({ type: 'FINISH' });
    await flushPromises();

    expect(getMachineStateValue(actor)).toBe('active.autosaving');
    expect(mock.ops).toHaveLength(1);

    mock.resolveInsert();
    await flushPromises();
    await waitForSessionSettled(actor);

    expect(mock.ops).toEqual(['insert', 'update']);
  });

  it('ABANDON mid-session flushes once without duplicate insert', async () => {
    const mock = createMockPersistenceAdapter();
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    actor.send({ type: 'ABANDON' });
    await flushPromises();
    await waitForSessionSettled(actor);

    expect(mock.ops.filter((op) => op === 'insert')).toHaveLength(1);
    expect(['closing', 'completed']).toContain(getMachineStateValue(actor));
  });

  it('sentinel failure allows retry', () => {
    const actor = createStartedTestActor();

    actor.send({ type: 'COACH_SENTINEL_SEND' });
    expect(actor.getSnapshot().context.sentinelFired).toBe(true);

    actor.send({ type: 'COACH_SENTINEL_FAILED' });
    expect(actor.getSnapshot().context.sentinelFired).toBe(false);
    expect(actor.getSnapshot().context.sentinelFailed).toBe(true);

    actor.send({ type: 'COACH_SENTINEL_SEND' });
    expect(actor.getSnapshot().context.sentinelFired).toBe(true);
  });

  it('COACH_PATCH updates draftLogs, marks edited, and schedules autosave', async () => {
    const mock = createMockPersistenceAdapter();
    const actor = createStartedTestActor({}, mock);

    actor.send({
      type: 'COACH_PATCH',
      patch: [{ exerciseIndex: 0, setIndex: 0, weight: '200' }],
    });

    expect(actor.getSnapshot().context.draftLogs[0][0].weight).toBe('200');
    expect(actor.getSnapshot().context.hasUserEdited).toBe(true);

    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    expect(mock.ops).toEqual(['insert']);
  });

  it('surfaces finishError when finalize fails', async () => {
    const mock = createMockPersistenceAdapter({ failUpdate: true });
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    actor.send({ type: 'FINISH' });
    await flushPromises();

    expect(getMachineStateValue(actor)).toBe('active.logging');
    expect(actor.getSnapshot().context.finishError).toBe('update_failed');
  });

  it('INTERVAL_START spawns child and FINISH clears intervalBlockRef', async () => {
    const actor = createStartedTestActor();

    actor.send({
      type: 'INTERVAL_START',
      input: {
        blockId: 'block-tabata',
        format: 'tabata',
        config: {
          prepareMs: 0,
          workMs: 20_000,
          restMs: 10_000,
          totalRounds: 2,
        },
      },
    });

    expect(actor.getSnapshot().context.intervalBlockRef).not.toBeNull();
    expect(actor.getSnapshot().context.activeIntervalBlockId).toBe('block-tabata');

    actor.send({ type: 'FINISH' });
    await flushPromises();

    expect(actor.getSnapshot().context.intervalBlockRef).toBeNull();
    expect(actor.getSnapshot().context.activeIntervalBlockId).toBeNull();
  });
});
