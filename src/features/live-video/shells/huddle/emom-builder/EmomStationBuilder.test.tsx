import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { EmomStationBuilder } from '@/features/live-video/shells/huddle/emom-builder/EmomStationBuilder';

describe('EmomStationBuilder', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists Rest first then exercise options', () => {
    render(
      <EmomStationBuilder
        stations={[
          {
            is_rest: false,
            exercise_index: 0,
            target_type: 'reps',
            target_value: null,
          },
        ]}
        exerciseOptions={[
          { index: 0, label: 'Row' },
          { index: 1, label: 'Kettlebell Swing' },
        ]}
        totalMinutes={12}
        canWrite
        hasRestInCycle={false}
        onStationsChange={() => {}}
      />,
    );

    const select = screen.getAllByRole('combobox')[0]!;
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options[0]).toBe('Rest');
    expect(options).toContain('Row');
    expect(options).toContain('Kettlebell Swing');
  });

  it('shows cycle helper without requiring stations.length === totalMinutes', () => {
    render(
      <EmomStationBuilder
        stations={[
          { is_rest: false, exercise_index: 0, target_type: 'reps', target_value: 10 },
          { is_rest: false, exercise_index: 1, target_type: 'reps', target_value: 10 },
          { is_rest: true },
        ]}
        exerciseOptions={[
          { index: 0, label: 'Row' },
          { index: 1, label: 'Swing' },
        ]}
        totalMinutes={12}
        canWrite
        hasRestInCycle
        onStationsChange={() => {}}
      />,
    );
    expect(screen.getByText(/3 stations repeat to fill 12 minutes/i)).toBeTruthy();
  });

  it('adds a rest station when there are no exercise options', () => {
    const onStationsChange = vi.fn();
    render(
      <EmomStationBuilder
        stations={[]}
        exerciseOptions={[]}
        totalMinutes={10}
        canWrite
        hasRestInCycle={false}
        onStationsChange={onStationsChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add station to cycle' }));
    expect(onStationsChange).toHaveBeenCalledWith([{ is_rest: true }]);
  });
});
