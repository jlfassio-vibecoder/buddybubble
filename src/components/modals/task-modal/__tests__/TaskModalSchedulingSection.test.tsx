import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalSchedulingSection } from '@/components/modals/task-modal/TaskModalSchedulingSection';

const dateLabels = {
  primary: 'Date',
  short: 'Date',
  helper: '',
};

describe('TaskModalSchedulingSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows Ends controls only for event', () => {
    const { rerender } = render(
      <TaskModalSchedulingSection
        itemType="task"
        dateLabels={dateLabels}
        scheduledOn="2026-08-01"
        onScheduledOnChange={() => undefined}
        scheduledTime="10:00"
        onScheduledTimeChange={() => undefined}
        canWrite
        eventEnds=""
        onEventEndsChange={() => undefined}
      />,
    );
    expect(screen.queryByTestId('task-modal-event-ends-date')).toBeNull();

    rerender(
      <TaskModalSchedulingSection
        itemType="event"
        dateLabels={dateLabels}
        scheduledOn="2026-08-01"
        onScheduledOnChange={() => undefined}
        scheduledTime="10:00"
        onScheduledTimeChange={() => undefined}
        canWrite
        eventEnds="2026-08-01T12:00"
        onEventEndsChange={() => undefined}
      />,
    );
    expect(screen.getByTestId('task-modal-event-ends-date')).toBeTruthy();
    expect(screen.getByTestId('task-modal-event-ends-time')).toBeTruthy();
    expect((screen.getByTestId('task-modal-event-ends-date') as HTMLInputElement).value).toBe(
      '2026-08-01',
    );
  });

  it('surfaces soft error when ends is before or equal to start', () => {
    render(
      <TaskModalSchedulingSection
        itemType="event"
        dateLabels={dateLabels}
        scheduledOn="2026-08-01"
        onScheduledOnChange={() => undefined}
        scheduledTime="12:00"
        onScheduledTimeChange={() => undefined}
        canWrite
        eventEnds="2026-08-01T11:00"
        onEventEndsChange={() => undefined}
      />,
    );
    expect(screen.getByTestId('task-modal-event-ends-soft-error')).toBeTruthy();
  });

  it('combines Ends date/time into metadata.ends shape', () => {
    const onEnds = vi.fn();
    render(
      <TaskModalSchedulingSection
        itemType="event"
        dateLabels={dateLabels}
        scheduledOn="2026-08-01"
        onScheduledOnChange={() => undefined}
        scheduledTime="10:00"
        onScheduledTimeChange={() => undefined}
        canWrite
        eventEnds=""
        onEventEndsChange={onEnds}
      />,
    );
    fireEvent.change(screen.getByTestId('task-modal-event-ends-date'), {
      target: { value: '2026-08-02' },
    });
    expect(onEnds).toHaveBeenCalledWith('2026-08-02T00:00');
  });
});
