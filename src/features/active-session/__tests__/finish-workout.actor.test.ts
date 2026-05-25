import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/database';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { createInitialContext } from '../machines/types';
import { createDefaultInput } from './test-utils/fixtures';
import { executeFinishWorkout } from '../actors/finish-workout.actor';

vi.mock('@/lib/task-assignees-db', () => ({
  replaceTaskAssigneesWithUserIds: vi.fn(async () => ({ error: null })),
}));

type TemplateUpdate = {
  metadata: Record<string, unknown>;
  id: string;
  itemType?: string;
};

function createFinishSupabaseMock(options: {
  sourceMetadata?: Json | null;
  logTaskId?: string | null;
  insertedLogId?: string;
}) {
  const templateUpdates: TemplateUpdate[] = [];
  const logUpdates: Array<{ id: string; status: string }> = [];
  const staleDraftDeletes: Array<{ finishedLogId: string }> = [];
  const logInserts: Array<{ item_type: string; status: string }> = [];

  const sourceRow = {
    metadata: options.sourceMetadata ?? { workout_type: 'Strength' },
    program_id: null,
    program_session_key: null,
    scheduled_on: null,
    scheduled_time: null,
    visibility: null,
    task_assignees: [{ user_id: 'user-1' }],
  };

  const supabase = {
    from: vi.fn((table: string) => {
      expect(table).toBe('tasks');
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: sourceRow, error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          let idFilter: string | undefined;
          const isTemplatePatch =
            payload.metadata != null && payload.status == null && payload.bubble_id == null;
          const updateChain = {
            eq: vi.fn((col: string, val: string) => {
              if (col === 'id') {
                idFilter = val;
                if (isTemplatePatch) {
                  return updateChain;
                }
                if (payload.status === 'completed') {
                  logUpdates.push({ id: val, status: String(payload.status) });
                }
                return Promise.resolve({ error: null });
              }
              if (col === 'item_type') {
                templateUpdates.push({
                  metadata: payload.metadata as Record<string, unknown>,
                  id: idFilter ?? '',
                  itemType: val,
                });
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: null });
            }),
          };
          return updateChain;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          logInserts.push({
            item_type: String(payload.item_type),
            status: String(payload.status),
          });
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: options.insertedLogId ?? 'inserted-log-001' },
                error: null,
              })),
            })),
          };
        }),
        delete: vi.fn(() => {
          const deleteChain = {
            eq: vi.fn((_col: string, val: string) => {
              if (_col === 'id' && typeof val === 'string' && val.startsWith('neq-')) {
                return deleteChain;
              }
              return deleteChain;
            }),
            neq: vi.fn((_col: string, finishedLogId: string) => {
              staleDraftDeletes.push({ finishedLogId });
              return Promise.resolve({ error: null });
            }),
          };
          return deleteChain;
        }),
      };
    }),
  } as unknown as SupabaseClient;

  return { supabase, templateUpdates, logUpdates, logInserts, staleDraftDeletes };
}

describe('executeFinishWorkout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T15:30:00.000Z'));
  });

  it('patches source template metadata.last_performed_at on finish_update', async () => {
    const { supabase, templateUpdates, logUpdates, staleDraftDeletes } = createFinishSupabaseMock({
      sourceMetadata: { workout_type: 'Strength', notes: 'Keep' },
      logTaskId: 'existing-log-99',
    });

    const input = createDefaultInput();
    const context = {
      ...createInitialContext(input),
      logTaskId: 'existing-log-99',
      draftLogs: input.draftLogs,
      elapsedSec: 120,
    };

    const sessionVm = buildWorkoutSessionViewModel(input.sourceMetadata);
    const result = await executeFinishWorkout(context, {
      supabase,
      sourceMetadata: input.sourceMetadata,
      sessionVm,
      workoutTitle: input.workoutTitle,
    });

    expect(result).toEqual({ logTaskId: 'existing-log-99', op: 'finish_update' });
    expect(logUpdates).toEqual([{ id: 'existing-log-99', status: 'completed' }]);
    expect(templateUpdates).toHaveLength(1);
    expect(templateUpdates[0]?.id).toBe(input.sourceTaskId);
    expect(templateUpdates[0]?.itemType).toBe('workout');
    expect(templateUpdates[0]?.metadata).toMatchObject({
      workout_type: 'Strength',
      notes: 'Keep',
      last_performed_at: '2026-05-24T15:30:00.000Z',
    });
    expect(staleDraftDeletes).toEqual([{ finishedLogId: 'existing-log-99' }]);
  });

  it('patches source template metadata.last_performed_at on finish_insert', async () => {
    const { supabase, templateUpdates, logInserts, staleDraftDeletes } = createFinishSupabaseMock({
      insertedLogId: 'new-log-55',
    });

    const input = createDefaultInput();
    const context = {
      ...createInitialContext(input),
      logTaskId: null,
      draftLogs: input.draftLogs,
      elapsedSec: 90,
    };

    const sessionVm = buildWorkoutSessionViewModel(input.sourceMetadata);
    const result = await executeFinishWorkout(context, {
      supabase,
      sourceMetadata: input.sourceMetadata,
      sessionVm,
      workoutTitle: input.workoutTitle,
    });

    expect(result).toEqual({ logTaskId: 'new-log-55', op: 'finish_insert' });
    expect(logInserts).toHaveLength(1);
    expect(logInserts[0]?.item_type).toBe('workout_log');
    expect(templateUpdates).toHaveLength(1);
    expect(templateUpdates[0]?.itemType).toBe('workout');
    expect(templateUpdates[0]?.metadata.last_performed_at).toBe('2026-05-24T15:30:00.000Z');
    expect(staleDraftDeletes).toEqual([{ finishedLogId: 'new-log-55' }]);
  });
});
