import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { isAgentFilledForDisplay, stampAgentFields } from '@/lib/task-field-provenance';
import { TaskModalWorkoutCanvas } from '@/components/modals/task-modal/TaskModalWorkoutCanvas';

describe('TaskModalWorkoutCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders stats, format pill, and exercise rows from factory metadata', () => {
    const taskMetadata = {
      ...richMetadataWithBlockFormat('emom'),
      duration_min: 45,
    } as Json;

    render(<TaskModalWorkoutCanvas taskMetadata={taskMetadata} />);

    expect(screen.getByTestId('task-modal-workout-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-workout-canvas-stats')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Generated')).toBeTruthy();
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText('min')).toBeTruthy();
    expect(screen.getByText('Target')).toBeTruthy();

    expect(screen.getByTestId('task-modal-workout-canvas-blocks')).toBeTruthy();
    expect(screen.getByText('emom')).toBeTruthy();
    expect(screen.getByText('Goblet Squat')).toBeTruthy();
    expect(screen.getByText('sets')).toBeTruthy();
    expect(screen.getByText('reps')).toBeTruthy();
    expect(screen.queryByTestId('task-modal-workout-block-agent')).toBeNull();
  });

  it('shows empty Coach prompt when metadata has no blocks or flat exercises', () => {
    render(<TaskModalWorkoutCanvas taskMetadata={{ workout_type: 'Strength' } as Json} />);

    expect(screen.getByText(/No blocks yet/)).toBeTruthy();
    expect(screen.getByText('Coach')).toBeTruthy();
    expect(screen.queryByTestId('task-modal-workout-canvas-blocks')).toBeNull();
  });

  it('renders flat exercises as a synthetic Exercises block when factory is absent', () => {
    const taskMetadata = {
      workout_type: 'Custom',
      exercises: [{ name: 'Deadlift', sets: 3, reps: '5', rpe: 8, rest_seconds: 90 }],
    } as Json;

    render(<TaskModalWorkoutCanvas taskMetadata={taskMetadata} />);

    expect(screen.getByTestId('task-modal-workout-canvas-blocks')).toBeTruthy();
    expect(screen.getByText('Exercises')).toBeTruthy();
    expect(screen.getByText('Deadlift')).toBeTruthy();
    expect(screen.getByText('90s')).toBeTruthy();
    expect(screen.getByText('rpe')).toBeTruthy();
  });

  it('shows Coach chrome on block cards when blocks provenance is agent-filled', () => {
    const base = {
      ...richMetadataWithBlockFormat('emom'),
      duration_min: 45,
    };
    const taskMetadata = stampAgentFields(base, ['blocks'], { agentSlug: 'coach' }) as Json;
    const isAgentField = (key: string) => isAgentFilledForDisplay(taskMetadata, key, []);

    render(<TaskModalWorkoutCanvas taskMetadata={taskMetadata} isAgentField={isAgentField} />);

    expect(screen.getAllByTestId('task-modal-workout-block-agent').length).toBeGreaterThan(0);
  });

  it('hides Coach chrome when blocks key is live-demoted', () => {
    const base = {
      ...richMetadataWithBlockFormat('emom'),
      duration_min: 45,
    };
    const taskMetadata = stampAgentFields(base, ['blocks'], { agentSlug: 'coach' }) as Json;
    const isAgentField = (key: string) => isAgentFilledForDisplay(taskMetadata, key, ['blocks']);

    render(<TaskModalWorkoutCanvas taskMetadata={taskMetadata} isAgentField={isAgentField} />);

    expect(screen.queryByTestId('task-modal-workout-block-agent')).toBeNull();
    expect(screen.getAllByTestId('task-modal-workout-block').length).toBeGreaterThan(0);
  });

  it('shows Coach chrome on flat Exercises block when exercises is agent-filled', () => {
    const base = {
      workout_type: 'Custom',
      exercises: [{ name: 'Deadlift', sets: 3, reps: '5' }],
    };
    const taskMetadata = stampAgentFields(base, ['exercises'], { agentSlug: 'coach' }) as Json;
    const isAgentField = (key: string) => isAgentFilledForDisplay(taskMetadata, key, []);

    render(<TaskModalWorkoutCanvas taskMetadata={taskMetadata} isAgentField={isAgentField} />);

    expect(screen.getByTestId('task-modal-workout-block-agent')).toBeTruthy();
  });
});
