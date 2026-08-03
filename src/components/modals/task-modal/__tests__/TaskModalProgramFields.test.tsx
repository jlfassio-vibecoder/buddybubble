import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalProgramFields } from '@/components/modals/task-modal/TaskModalProgramFields';

const threeDaySchedule = [
  {
    week: 1,
    focus: 'Base · technique',
    days: [
      {
        day: 1,
        name: 'Strength A — Squat',
        workout_type: 'Strength',
        duration_min: 45,
        card_ref: '11111111-1111-4111-8111-111111111111',
      },
      { day: 3, name: 'Conditioning — EMOM' },
      { day: 5, name: 'Strength B — Deadlift' },
    ],
  },
];

const baseProps = {
  canWrite: true,
  workspaceId: 'w1' as string | null,
  taskId: 't1' as string | null,
  aiProgramPersonalizing: false,
  onPersonalizeProgram: () => undefined,
  programGoal: 'Build strength',
  onProgramGoalChange: () => undefined,
  programDurationWeeks: '8',
  onProgramDurationWeeksChange: () => undefined,
  programDaysPerWeek: '3',
  onProgramDaysPerWeekChange: () => undefined,
  programLevel: 'intermediate',
  onProgramLevelChange: () => undefined,
  programCurrentWeek: 0,
  programSchedule: threeDaySchedule,
  onProgramScheduleChange: () => undefined,
  programCapacity: '20',
  onProgramCapacityChange: () => undefined,
  enrolledCount: 2,
  enrollPeople: [
    { id: 'u1', displayName: 'Alex', avatarUrl: null },
    { id: 'u2', displayName: 'Sam', avatarUrl: null },
  ],
  isEnrolled: false,
  onToggleEnroll: () => undefined,
};

describe('TaskModalProgramFields', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders week cards with Mon workout and Rest for missing days', () => {
    render(<TaskModalProgramFields {...baseProps} canWrite={false} />);

    expect(screen.getByTestId('task-modal-program-week-cards')).toBeTruthy();
    expect(screen.getByTestId('task-modal-program-week-1').textContent).toMatch(/Week 1/);
    expect(screen.getByTestId('task-modal-program-week-1').textContent).toMatch(/3 sessions/);
    expect(screen.getByTestId('task-modal-program-week-1').textContent).toMatch(
      /Repeats · 8 weeks/,
    );
    expect(screen.getByTestId('task-modal-program-week-1').textContent).toMatch(/Base · technique/);

    const mon = screen.getByTestId('task-modal-program-sess-1-Mon');
    expect(mon.getAttribute('data-kind')).toBe('workout');
    expect(mon.textContent).toMatch(/Strength A — Squat/);

    const tue = screen.getByTestId('task-modal-program-sess-1-Tue');
    expect(tue.getAttribute('data-kind')).toBe('rest');
    expect(tue.textContent).toMatch(/Rest/);
  });

  it('shows enrollment count and capacity', () => {
    render(<TaskModalProgramFields {...baseProps} />);
    expect(screen.getByTestId('task-modal-program-enroll-count').textContent).toBe('2/20 enrolled');
    expect(screen.getByTestId('task-modal-program-capacity')).toBeTruthy();
  });

  it('adds a week and bumps duration when needed', () => {
    const onSchedule = vi.fn();
    const onDuration = vi.fn();
    render(
      <TaskModalProgramFields
        {...baseProps}
        programDurationWeeks="1"
        onProgramScheduleChange={onSchedule}
        onProgramDurationWeeksChange={onDuration}
      />,
    );
    fireEvent.click(screen.getByTestId('task-modal-program-add-week'));
    expect(onSchedule).toHaveBeenCalled();
    const next = onSchedule.mock.calls[0]![0] as typeof threeDaySchedule;
    expect(next).toHaveLength(2);
    expect(next[1]!.week).toBe(2);
    expect(onDuration).toHaveBeenCalledWith('2');
  });

  it('opens linked workout when card_ref resolves', () => {
    const onOpen = vi.fn();
    render(
      <TaskModalProgramFields
        {...baseProps}
        onOpenLinkedTask={onOpen}
        linkedWorkouts={[
          {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Strength A — Squat',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId('task-modal-program-sess-open-1-Mon'));
    expect(onOpen).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });

  it('disables Enroll when at capacity', () => {
    render(
      <TaskModalProgramFields
        {...baseProps}
        enrolledCount={20}
        programCapacity="20"
        isEnrolled={false}
      />,
    );
    expect(
      (screen.getByTestId('task-modal-program-enroll-toggle') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('hides week cards when schedule is empty but keeps Add week', () => {
    render(
      <TaskModalProgramFields
        {...baseProps}
        canWrite
        programSchedule={[]}
        taskId={null}
        workspaceId={null}
      />,
    );

    expect(screen.queryByTestId('task-modal-program-week-cards')).toBeNull();
    expect(screen.getByTestId('task-modal-program-add-week')).toBeTruthy();
  });
});
