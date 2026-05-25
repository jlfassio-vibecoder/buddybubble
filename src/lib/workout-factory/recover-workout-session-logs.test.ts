import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  recoverWorkoutSessionLogs,
  shouldRestoreInProgressDraft,
} from './recover-workout-session-logs';

const exercises: WorkoutExercise[] = [{ name: 'Squat', sets: 2, reps: 5, weight: 135 }];
const logBubbleId = 'bubble-logs';
const sourceTaskId = 'source-001';

const completedHistMeta = {
  source_task_id: sourceTaskId,
  exercises: [
    {
      name: 'Squat',
      set_logs: [
        { weight: 225, reps: 8, rpe: 7 },
        { weight: 235, reps: 6, rpe: 8 },
      ],
    },
  ],
};

type QueryResult = {
  data: { id?: string; metadata?: unknown; created_at?: string } | null;
  error: null;
};

function createTasksQueryMock(handlers: {
  completed?: QueryResult;
  inProgress?: QueryResult;
}): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      expect(table).toBe('tasks');
      const state: { status?: string } = {};
      const chain = {
        eq: vi.fn((_col: string, val: string) => {
          if (_col === 'status') state.status = val;
          return chain;
        }),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (state.status === 'completed') {
            return handlers.completed ?? { data: null, error: null };
          }
          if (state.status === 'in_progress') {
            return handlers.inProgress ?? { data: null, error: null };
          }
          return { data: null, error: null };
        }),
      };
      return { select: vi.fn(() => chain) };
    }),
  } as unknown as SupabaseClient;
}

describe('recoverWorkoutSessionLogs', () => {
  it('v2-ghost fresh session returns blank draftLogs and ghost matrix from completed log', async () => {
    const supabase = createTasksQueryMock({
      completed: {
        data: { metadata: completedHistMeta, created_at: '2026-05-24T10:00:00.000Z' },
        error: null,
      },
      inProgress: { data: null, error: null },
    });

    const result = await recoverWorkoutSessionLogs({
      supabase,
      logBubbleId,
      sourceTaskId,
      exercises,
      blocks: [],
      mode: 'v2-ghost',
    });

    expect(result.logTaskId).toBeNull();
    expect(result.draftLogs).toHaveLength(1);
    expect(result.draftLogs[0]).toEqual([
      { weight: '', reps: '', rpe: '', done: false },
      { weight: '', reps: '', rpe: '', done: false },
    ]);
    expect(result.ghostLogs[0][0]).toEqual({ weight: '225', reps: '8', rpe: '7' });
    expect(result.ghostLogs[0][1]).toEqual({ weight: '235', reps: '6', rpe: '8' });
  });

  it('v1-prefill merges historical values into draftLogs', async () => {
    const supabase = createTasksQueryMock({
      completed: {
        data: { metadata: completedHistMeta, created_at: '2026-05-24T10:00:00.000Z' },
        error: null,
      },
      inProgress: { data: null, error: null },
    });

    const result = await recoverWorkoutSessionLogs({
      supabase,
      logBubbleId,
      sourceTaskId,
      exercises,
      blocks: [],
      mode: 'v1-prefill',
    });

    expect(result.draftLogs[0][0].weight).toBe('225');
    expect(result.draftLogs[0][0].reps).toBe('8');
    expect(result.draftLogs[0][0].done).toBe(false);
    expect(result.ghostLogs[0][0]).toEqual({ weight: '225', reps: '8', rpe: '7' });
  });

  it('restores in-progress draft_logs when draft is newer than the latest completed log', async () => {
    const draftLogs = [[{ weight: '100', reps: '5', rpe: '8', done: true }]];
    const supabase = createTasksQueryMock({
      completed: {
        data: { metadata: completedHistMeta, created_at: '2026-05-24T10:00:00.000Z' },
        error: null,
      },
      inProgress: {
        data: {
          id: 'draft-log-42',
          created_at: '2026-05-24T11:00:00.000Z',
          metadata: { draft_logs: draftLogs, source_task_id: sourceTaskId },
        },
        error: null,
      },
    });

    const result = await recoverWorkoutSessionLogs({
      supabase,
      logBubbleId,
      sourceTaskId,
      exercises,
      blocks: [],
    });

    expect(result.logTaskId).toBe('draft-log-42');
    expect(result.draftLogs).toEqual(draftLogs);
    expect(result.ghostLogs[0][0]).toEqual({ weight: '225', reps: '8', rpe: '7' });
  });

  it('v2-ghost ignores stale in_progress draft when a newer completed log exists', async () => {
    const staleDraftLogs = [[{ weight: '40', reps: '10', rpe: '8', done: true }]];
    const supabase = createTasksQueryMock({
      completed: {
        data: { metadata: completedHistMeta, created_at: '2026-05-25T09:00:00.000Z' },
        error: null,
      },
      inProgress: {
        data: {
          id: 'stale-draft',
          created_at: '2026-05-24T08:00:00.000Z',
          metadata: { draft_logs: staleDraftLogs, source_task_id: sourceTaskId },
        },
        error: null,
      },
    });

    const result = await recoverWorkoutSessionLogs({
      supabase,
      logBubbleId,
      sourceTaskId,
      exercises,
      blocks: [],
      mode: 'v2-ghost',
    });

    expect(result.logTaskId).toBeNull();
    expect(result.draftLogs[0][0]).toEqual({
      weight: '',
      reps: '',
      rpe: '',
      done: false,
    });
    expect(result.ghostLogs[0][0]).toEqual({ weight: '225', reps: '8', rpe: '7' });
  });
});

describe('shouldRestoreInProgressDraft', () => {
  it('always restores for v1-prefill', () => {
    expect(
      shouldRestoreInProgressDraft(
        'v1-prefill',
        '2026-05-24T08:00:00.000Z',
        '2026-05-25T09:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('skips stale v2 draft when completed log is newer', () => {
    expect(
      shouldRestoreInProgressDraft(
        'v2-ghost',
        '2026-05-24T08:00:00.000Z',
        '2026-05-25T09:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('restores v2 draft when it is newer than the latest completed log', () => {
    expect(
      shouldRestoreInProgressDraft(
        'v2-ghost',
        '2026-05-25T10:00:00.000Z',
        '2026-05-25T09:00:00.000Z',
      ),
    ).toBe(true);
  });
});
