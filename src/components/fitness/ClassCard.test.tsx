import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ClassInstance } from '@/lib/fitness/class-providers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/ws',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/classes/hooks/useClassEnrollment', () => ({
  useClassEnrollment: () => ({
    enroll: vi.fn(),
    waitlist: vi.fn(),
    unenroll: vi.fn(),
    isMutating: false,
    error: null,
  }),
}));

vi.mock('@/store/liveVideoStore', () => ({
  useLiveVideoStore: Object.assign(
    (selector: (s: { activeSession: null }) => unknown) => selector({ activeSession: null }),
    { getState: () => ({ joinSession: vi.fn(), activeSession: null }) },
  ),
}));

vi.mock('@/store/userProfileStore', () => ({
  useUserProfileStore: (selector: (s: { profile: { id: string } }) => unknown) =>
    selector({ profile: { id: 'host-1' } }),
}));

import { ClassCard } from './ClassCard';

function makeInstance(overrides: Partial<ClassInstance> = {}): ClassInstance {
  const future = new Date();
  future.setDate(future.getDate() + 3);
  return {
    id: 'ci-1',
    offering_id: 'off-1',
    workspace_id: 'ws-1',
    scheduled_at: future.toISOString(),
    capacity: 5,
    status: 'available',
    instructor_notes: null,
    task_id: 'task-1',
    visibility: 'private',
    metadata: {},
    offering: {
      id: 'off-1',
      workspace_id: 'ws-1',
      name: 'Wednesday morning boot camp',
      description: null,
      duration_min: 45,
      location: 'Online',
      metadata: {},
    },
    enrollment_count: 0,
    deck_workout_count: 0,
    my_enrollment_status: null,
    my_enrollment_id: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('ClassCard Workout Builder deck badge', () => {
  const todayYmd = new Date().toISOString().slice(0, 10);

  it('shows deck count badge when deck_workout_count >= 1', () => {
    render(
      <ClassCard
        classInstance={makeInstance({ deck_workout_count: 3 })}
        todayYmd={todayYmd}
        canManageClasses
        onOpenClassEditor={vi.fn()}
      />,
    );

    expect(screen.getByTestId('class-deck-workout-count').textContent).toBe('3');
    expect(screen.getByRole('button', { name: /Workout Builder, 3 workouts/i })).toBeTruthy();
  });

  it('hides deck count badge when deck_workout_count is 0', () => {
    render(
      <ClassCard
        classInstance={makeInstance({ deck_workout_count: 0 })}
        todayYmd={todayYmd}
        canManageClasses
        onOpenClassEditor={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('class-deck-workout-count')).toBeNull();
    expect(screen.getByRole('button', { name: /^Workout Builder$/i })).toBeTruthy();
  });
});
