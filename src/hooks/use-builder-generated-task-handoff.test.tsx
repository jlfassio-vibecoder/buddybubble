import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useBuilderGeneratedTaskHandoff } from '@/hooks/use-builder-generated-task-handoff';
import {
  WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY,
  WORKOUT_BUILDER_TASK_HANDOFF_QUERY,
} from '@/lib/workout-builder/build-workout-builder-url';

const { mockReplace, mockOpenTaskModal } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockOpenTaskModal: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/app/ws-1',
  useSearchParams: () =>
    new URLSearchParams({
      [WORKOUT_BUILDER_TASK_HANDOFF_QUERY]: 'task-handoff-1',
      [WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY]: '1',
    }),
}));

function HandoffProbe() {
  useBuilderGeneratedTaskHandoff({ openTaskModal: mockOpenTaskModal });
  return null;
}

describe('useBuilderGeneratedTaskHandoff', () => {
  it('opens task modal with workout viewer and strips handoff params', () => {
    mockOpenTaskModal.mockClear();
    mockReplace.mockClear();

    render(<HandoffProbe />);

    expect(mockOpenTaskModal).toHaveBeenCalledWith('task-handoff-1', {
      tab: 'details',
      viewMode: 'full',
      openWorkoutViewer: true,
    });
    expect(mockReplace).toHaveBeenCalledWith('/app/ws-1', { scroll: false });
  });
});
