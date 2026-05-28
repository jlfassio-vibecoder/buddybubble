import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkoutBuilderShell } from '@/features/workout-builder/WorkoutBuilderShell';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/workout-builder/useWorkoutBuilderTaskHost', () => ({
  useWorkoutBuilderTaskHost: () => ({
    taskId: 'task-1',
    bubbleId: 'bubble-1',
    title: 'Leg day',
    loading: false,
    error: null,
    canWrite: true,
    canPostMessages: true,
    workoutHashExerciseNames: [],
    outlineEditor: {
      draftBlocks: [],
      outlineUiState: 'empty',
      validationDrops: [],
      isOutlineConfirmed: false,
      canRunIntake: false,
      expandedBlockIdx: null,
      setExpandedBlockIdx: vi.fn(),
      localError: null,
      isGenerating: false,
      addFromCatalog: vi.fn(),
      addInstructionBlock: vi.fn(),
      updateBlock: vi.fn(),
      removeBlock: vi.fn(),
      reorderBlocks: vi.fn(),
      saveDraft: vi.fn(),
      confirmStructure: vi.fn(),
      editStructure: vi.fn(),
      retryStructure: vi.fn(),
      applyCoachPatch: vi.fn(() => true),
      hasFactory: false,
      title: 'Leg day',
      description: '',
      setDraftBlocks: vi.fn(),
    },
    loadTask: vi.fn(),
  }),
}));

vi.mock('@/lib/feature-flags/standardTaskChatRail', () => ({
  isStandardTaskChatRailEnabled: () => true,
}));

vi.mock('@/components/fitness/WorkoutOutlinePanel', () => ({
  WorkoutOutlinePanel: () => <div data-testid="workout-outline-panel" />,
}));

vi.mock('@/components/chat/StandardTaskChatRail', () => ({
  StandardTaskChatRail: () => <div data-testid="standard-task-chat-rail" />,
}));

describe('WorkoutBuilderShell', () => {
  it('renders outline panel and chat rail', () => {
    render(
      <WorkoutBuilderShell
        workspaceId="ws-1"
        task={{
          id: 'task-1',
          title: 'Leg day',
          description: '',
          bubble_id: 'bubble-1',
          metadata: {},
          item_type: 'workout',
          memberRole: 'member',
        }}
      />,
    );
    expect(screen.getByText('Leg day')).toBeTruthy();
    expect(screen.getByTestId('workout-outline-panel')).toBeTruthy();
    expect(screen.getByTestId('standard-task-chat-rail')).toBeTruthy();
  });
});
