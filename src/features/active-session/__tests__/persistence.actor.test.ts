import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_TELEMETRY_SCHEMA_VERSION } from '@/lib/workout-factory/session-telemetry';
import { createProductionPersistenceAdapter } from '../actors/persistence.actor';
import { AUTOSAVE_MS, createInitialContext } from '../machines/types';
import { createEditedDraftLogs, createDefaultInput } from './test-utils/fixtures';
import {
  advanceAutosave,
  createMockPersistenceAdapter,
  createStartedTestActor,
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
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    vi.advanceTimersByTime(AUTOSAVE_MS - 1);
    await flushPromises();

    expect(mock.ops).toHaveLength(0);
    expect(getMachineStateValue(actor)).toBe('active.logging');
  });

  it('fires autosave after debounce elapses', async () => {
    const mock = createMockPersistenceAdapter();
    const actor = createStartedTestActor({}, mock);

    actor.send({ type: 'LOGS_CHANGED', draftLogs: createEditedDraftLogs() });
    advanceAutosave(AUTOSAVE_MS);
    await flushPromises();

    expect(mock.ops).toEqual(['insert']);
  });
});

describe('createProductionPersistenceAdapter', () => {
  it('attaches session_telemetry on draft insert metadata', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn((payload: Record<string, unknown>) => {
          captured.push(payload.metadata as Record<string, unknown>);
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'log-draft-telemetry' },
                error: null,
              })),
            })),
          };
        }),
        update: vi.fn(),
      })),
    };

    const input = createDefaultInput();
    const context = {
      ...createInitialContext(input),
      hasUserEdited: true,
      draftLogs: createEditedDraftLogs(),
      elapsedSec: 120,
    };

    const adapter = createProductionPersistenceAdapter({
      supabase: supabase as never,
      getContext: () => context,
      sourceMetadata: input.sourceMetadata,
      sessionVm: input.sessionVm,
      workoutTitle: input.workoutTitle,
    });

    await adapter.insertDraft();

    expect(captured).toHaveLength(1);
    const telemetry = captured[0]?.session_telemetry as Record<string, unknown>;
    expect(telemetry?.schema_version).toBe(SESSION_TELEMETRY_SCHEMA_VERSION);
    expect(telemetry?.session_id).toBe(input.sessionId);
    expect(telemetry?.source_task_id).toBe(input.sourceTaskId);
    expect(telemetry?.elapsed_sec).toBe(120);
  });

  it('attaches session_telemetry on draft update metadata', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn(async () => {
            captured.push(payload.metadata as Record<string, unknown>);
            return { error: null };
          }),
        })),
      })),
    };

    const input = createDefaultInput();
    const context = {
      ...createInitialContext(input),
      logTaskId: 'existing-log-99',
      draftLogs: createEditedDraftLogs(),
      elapsedSec: 180,
    };

    const adapter = createProductionPersistenceAdapter({
      supabase: supabase as never,
      getContext: () => context,
      sourceMetadata: input.sourceMetadata,
      sessionVm: input.sessionVm,
      workoutTitle: input.workoutTitle,
    });

    await adapter.updateDraft('existing-log-99');

    expect(captured).toHaveLength(1);
    const telemetry = captured[0]?.session_telemetry as Record<string, unknown>;
    expect(telemetry?.schema_version).toBe(SESSION_TELEMETRY_SCHEMA_VERSION);
    expect(telemetry?.workout_log_task_id).toBe('existing-log-99');
    expect(telemetry?.elapsed_sec).toBe(180);
  });
});
