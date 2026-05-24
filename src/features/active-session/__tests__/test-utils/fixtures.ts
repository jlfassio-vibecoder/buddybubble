import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { ActiveSessionInput } from '../../machines/types';

export const TEST_LOG_TASK_ID = 'log-task-001';
export const TEST_SESSION_ID = 'session-001';
export const TEST_SOURCE_TASK_ID = 'source-task-001';
export const TEST_BUBBLE_ID = 'bubble-001';
export const TEST_WORKSPACE_ID = 'workspace-001';

export function createSampleDraftLogs(): SetDraft[][] {
  return [
    [
      {
        weight: '100',
        reps: '5',
        rpe: '8',
        done: true,
      },
    ],
  ];
}

export function createEditedDraftLogs(): SetDraft[][] {
  return [
    [
      {
        weight: '105',
        reps: '5',
        rpe: '8',
        done: true,
      },
    ],
  ];
}

export function createDefaultInput(
  overrides: Partial<ActiveSessionInput> = {},
): ActiveSessionInput {
  return {
    sessionId: TEST_SESSION_ID,
    sourceTaskId: TEST_SOURCE_TASK_ID,
    bubbleId: TEST_BUBBLE_ID,
    workspaceId: TEST_WORKSPACE_ID,
    draftLogs: createSampleDraftLogs(),
    ...overrides,
  };
}
