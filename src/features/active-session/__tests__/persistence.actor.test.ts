import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS } from '../machines/types';
import { createEditedDraftLogs } from './test-utils/fixtures';
import {
  advanceAutosave,
  createMockPersistenceAdapter,
  createTestActor,
  flushPromises,
  getMachineStateValue,
} from './test-utils/mock-persistence';

describe('persistence actor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire autosave before debounce elapses', async () => {
    const mock = createMockPersistenceAdapter();
    const actor = createTestActor({}, mock);
    actor.start();

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    vi.advanceTimersByTime(AUTOSAVE_MS - 1);
    await flushPromises();

    expect(mock.ops).toHaveLength(0);
    expect(getMachineStateValue(actor)).toBe('active.logging');
  });

  it('fires autosave after debounce elapses', async () => {
    const mock = createMockPersistenceAdapter();
    const actor = createTestActor({}, mock);
    actor.start();

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    expect(mock.ops).toEqual(['insert']);
  });
});
