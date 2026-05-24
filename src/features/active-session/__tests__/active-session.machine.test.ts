import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS, activeSessionGuards, createInitialContext } from '../machines/types';
import { createDefaultInput, createEditedDraftLogs } from './test-utils/fixtures';
import {
  advanceAutosave,
  createMockPersistenceAdapter,
  createTestActor,
  flushPromises,
  getMachineStateValue,
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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

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
    const actor = createTestActor({}, mock);
    actor.start();

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    actor.send({ type: 'ABANDON' });
    await flushPromises();
    await waitForSessionSettled(actor);

    expect(mock.ops.filter((op) => op === 'insert')).toHaveLength(1);
    expect(['closing', 'completed']).toContain(getMachineStateValue(actor));
  });

  it('sentinel failure allows retry', () => {
    const actor = createTestActor();
    actor.start();

    actor.send({ type: 'COACH_SENTINEL_SEND' });
    expect(actor.getSnapshot().context.sentinelFired).toBe(true);

    actor.send({ type: 'COACH_SENTINEL_FAILED' });
    expect(actor.getSnapshot().context.sentinelFired).toBe(false);
    expect(actor.getSnapshot().context.sentinelFailed).toBe(true);

    actor.send({ type: 'COACH_SENTINEL_SEND' });
    expect(actor.getSnapshot().context.sentinelFired).toBe(true);
  });

  it('surfaces finishError when finalize fails', async () => {
    const mock = createMockPersistenceAdapter({ failUpdate: true });
    const actor = createTestActor({}, mock);
    actor.start();

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    actor.send({ type: 'FINISH' });
    await flushPromises();

    expect(getMachineStateValue(actor)).toBe('active.logging');
    expect(actor.getSnapshot().context.finishError).toBe('update_failed');
  });
});
