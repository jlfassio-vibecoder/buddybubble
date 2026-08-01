import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Json } from '@/types/database';
import { TaskModalWorkoutLogCanvas } from '@/components/modals/task-modal/TaskModalWorkoutLogCanvas';
import { WORKOUT_LOG_IN_PROGRESS_STATUS } from '@/lib/workout-log-task-state';

const baseProps = {
  canWrite: true,
  taskId: 'log-1' as string | null,
  scheduledOn: '2026-07-22',
  scheduledTime: '07:30',
  workoutType: 'Strength',
  onWorkoutTypeChange: () => undefined,
  workoutDurationMin: '45',
  onWorkoutDurationMinChange: () => undefined,
  workoutLogSessionRpe: '7',
  onWorkoutLogSessionRpeChange: () => undefined,
  workoutLogCompletion: '90',
  onWorkoutLogCompletionChange: () => undefined,
  workoutLogMood: '',
  onWorkoutLogMoodChange: () => undefined,
  workoutExercises: [] as [],
  workoutUnitSystem: 'metric' as const,
};

describe('TaskModalWorkoutLogCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders session stats, performed echoes, and log summary', () => {
    const taskMetadata = {
      session_rpe: 7,
      completion: 90,
      duration_min: 45,
      exercises: [
        {
          name: 'Back Squat',
          sets: 3,
          reps: '5',
          pr: true,
          set_logs: [
            { set: 1, done: true },
            { set: 2, done: true },
            { set: 3, done: true },
          ],
        },
      ],
    } as Json;

    render(
      <TaskModalWorkoutLogCanvas
        {...baseProps}
        status="completed"
        workoutExercises={[
          {
            name: 'Back Squat',
            sets: 3,
            reps: '5',
            pr: true,
            set_logs: [
              { set: 1, done: true },
              { set: 2, done: true },
              { set: 3, done: true },
            ],
          },
        ]}
        taskMetadata={taskMetadata}
      />,
    );

    expect(screen.getByTestId('task-modal-workout-log-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-workout-log-performed-on').textContent).toMatch(
      /2026-07-22/,
    );
    expect(screen.getByTestId('task-modal-workout-log-start-time').textContent).toMatch(/07:30/);
    expect(screen.getByTestId('task-modal-workout-log-stat-duration').textContent).toMatch(/45/);
    expect(screen.getByTestId('task-modal-workout-log-stat-session-rpe').textContent).toMatch(/7/);
    expect(screen.getByTestId('task-modal-workout-log-stat-completion').textContent).toMatch(/90%/);
    expect(screen.getByTestId('task-modal-workout-log-read')).toBeTruthy();
    expect(screen.getByText('Back Squat')).toBeTruthy();
    expect(screen.getByTestId('workout-read-exercise-pr')).toBeTruthy();
    expect(screen.queryByTestId('task-modal-workout-log-continue')).toBeNull();
  });

  it('shows — for empty performed fields and missing RPE/completion', () => {
    render(
      <TaskModalWorkoutLogCanvas
        {...baseProps}
        canWrite={false}
        taskId={null}
        status="completed"
        scheduledOn=""
        scheduledTime=""
        workoutType=""
        workoutDurationMin="30"
        workoutLogSessionRpe=""
        workoutLogCompletion=""
        workoutLogMood=""
        taskMetadata={{}}
      />,
    );

    expect(screen.getByTestId('task-modal-workout-log-performed-on').textContent).toMatch(/—/);
    expect(screen.getByTestId('task-modal-workout-log-start-time').textContent).toMatch(/—/);
    expect(screen.getByTestId('task-modal-workout-log-stat-duration').textContent).toMatch(/30/);
    expect(screen.getByTestId('task-modal-workout-log-stat-session-rpe').textContent).toMatch(/—/);
    expect(screen.getByTestId('task-modal-workout-log-stat-completion').textContent).toMatch(/—/);
    expect(screen.getByTestId('task-modal-workout-log-read')).toBeTruthy();
  });

  it('shows Continue session for in-progress log with source_task_id and calls handler', () => {
    const onContinue = vi.fn();
    render(
      <TaskModalWorkoutLogCanvas
        {...baseProps}
        status={WORKOUT_LOG_IN_PROGRESS_STATUS}
        taskMetadata={{ source_task_id: '11111111-1111-1111-1111-111111111111' } as Json}
        onContinueSession={onContinue}
      />,
    );

    expect(screen.getByTestId('task-modal-workout-log-continue')).toBeTruthy();
    fireEvent.click(screen.getByTestId('task-modal-workout-log-continue-btn'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('hides Continue session when source_task_id is missing', () => {
    render(
      <TaskModalWorkoutLogCanvas
        {...baseProps}
        status={WORKOUT_LOG_IN_PROGRESS_STATUS}
        taskMetadata={{} as Json}
        onContinueSession={() => undefined}
      />,
    );

    expect(screen.queryByTestId('task-modal-workout-log-continue')).toBeNull();
  });

  it('hides Continue session for completed logs even with source_task_id', () => {
    render(
      <TaskModalWorkoutLogCanvas
        {...baseProps}
        status="completed"
        taskMetadata={{ source_task_id: '11111111-1111-1111-1111-111111111111' } as Json}
        onContinueSession={() => undefined}
      />,
    );

    expect(screen.queryByTestId('task-modal-workout-log-continue')).toBeNull();
  });
});
