import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import type { ActiveSessionTaskPayload } from '@/features/active-session/types/session-task';

export const TEST_COACH_BUBBLE_ID = 'bubble-coach-001';
export const TEST_WORKOUT_LOGS_BUBBLE_ID = 'bubble-workout-logs-001';
export const TEST_WORKSPACE_ID = 'ws-test-001';
export const TEST_SOURCE_TASK_ID = 'source-task-001';

export function createSessionTaskFixture(
  overrides: Partial<ActiveSessionTaskPayload> = {},
): ActiveSessionTaskPayload {
  return {
    id: TEST_SOURCE_TASK_ID,
    title: 'Test Workout',
    bubble_id: TEST_COACH_BUBBLE_ID,
    target_bubble_id: TEST_WORKOUT_LOGS_BUBBLE_ID,
    metadata: richMetadataWithBlockFormat('straight_sets') as Json,
    item_type: 'workout',
    ...overrides,
  };
}
