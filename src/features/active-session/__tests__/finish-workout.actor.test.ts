import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { createInitialContext } from '../machines/types';
import { createDefaultInput } from './test-utils/fixtures';
import { executeFinishWorkout } from '../actors/finish-workout.actor';
import { createFinishSupabaseMock } from './test-utils/supabase-tasks-mock';

vi.mock('@/lib/task-assignees-db', () => ({
  replaceTaskAssigneesWithUserIds: vi.fn(async () => ({ error: null })),
}));

describe('executeFinishWorkout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T15:30:00.000Z'));
  });

  it('patches source template metadata.last_performed_at on finish_update', async () => {
    const { supabase, templateUpdates, logUpdates, staleDraftDeletes } = createFinishSupabaseMock({
      sourceMetadata: { workout_type: 'Strength', notes: 'Keep' },
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
    expect(logInserts[0]?.status).toBe('completed');
    expect(logInserts[0]?.bubble_id).toBe(input.targetBubbleId);
    expect(templateUpdates).toHaveLength(1);
    expect(templateUpdates[0]?.itemType).toBe('workout');
    expect(templateUpdates[0]?.metadata.last_performed_at).toBe('2026-05-24T15:30:00.000Z');
    expect(staleDraftDeletes).toEqual([{ finishedLogId: 'new-log-55' }]);
  });
});
