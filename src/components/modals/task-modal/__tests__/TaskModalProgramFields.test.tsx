import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TaskModalProgramFields } from '@/components/modals/task-modal/TaskModalProgramFields';

const threeDaySchedule = [
  {
    week: 1,
    days: [
      { day: 1, name: 'Strength A — Squat', workout_type: 'Strength', duration_min: 45 },
      { day: 3, name: 'Conditioning — EMOM' },
      { day: 5, name: 'Strength B — Deadlift' },
    ],
  },
];

describe('TaskModalProgramFields week cards', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders week cards with Mon workout and Rest for missing days', () => {
    render(
      <TaskModalProgramFields
        canWrite={false}
        workspaceId={null}
        taskId={null}
        aiProgramPersonalizing={false}
        onPersonalizeProgram={() => undefined}
        programGoal="Build strength"
        onProgramGoalChange={() => undefined}
        programDurationWeeks="8"
        onProgramDurationWeeksChange={() => undefined}
        programCurrentWeek={0}
        programSchedule={threeDaySchedule}
      />,
    );

    expect(screen.getByTestId('task-modal-program-week-cards')).toBeTruthy();
    expect(screen.getByTestId('task-modal-program-week-1').textContent).toMatch(/Week 1/);
    expect(screen.getByTestId('task-modal-program-week-1').textContent).toMatch(/3 sessions/);
    expect(screen.getByTestId('task-modal-program-week-1').textContent).toMatch(
      /Repeats · 8 weeks/,
    );

    const mon = screen.getByTestId('task-modal-program-sess-1-Mon');
    expect(mon.getAttribute('data-kind')).toBe('workout');
    expect(mon.textContent).toMatch(/Strength A — Squat/);

    const tue = screen.getByTestId('task-modal-program-sess-1-Tue');
    expect(tue.getAttribute('data-kind')).toBe('rest');
    expect(tue.textContent).toMatch(/Rest/);
  });

  it('hides week cards when schedule is empty', () => {
    render(
      <TaskModalProgramFields
        canWrite={false}
        workspaceId={null}
        taskId={null}
        aiProgramPersonalizing={false}
        onPersonalizeProgram={() => undefined}
        programGoal=""
        onProgramGoalChange={() => undefined}
        programDurationWeeks="4"
        onProgramDurationWeeksChange={() => undefined}
        programCurrentWeek={0}
        programSchedule={[]}
      />,
    );

    expect(screen.queryByTestId('task-modal-program-week-cards')).toBeNull();
  });
});
