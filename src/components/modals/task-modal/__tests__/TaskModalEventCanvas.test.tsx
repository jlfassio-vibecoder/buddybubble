import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalEventCanvas } from '@/components/modals/task-modal/TaskModalEventCanvas';

describe('TaskModalEventCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders RSVP count, spots left, bring chips, and people initials', () => {
    render(
      <TaskModalEventCanvas
        canWrite
        eventGoing="12"
        onEventGoingChange={() => undefined}
        eventCapacity="30"
        onEventCapacityChange={() => undefined}
        eventGoingPeople={['RS', 'TL', 'JF', 'MK', 'you', 'AB']}
        onEventGoingPeopleChange={() => undefined}
        eventBring={['Water', 'Trail shoes']}
        onEventBringChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('task-modal-event-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-event-rsvp-going').textContent).toBe('12 going');
    expect(screen.getByTestId('task-modal-event-rsvp').textContent).toMatch(/18 spots left/);
    expect(screen.getByTestId('task-modal-event-rsvp-progress')).toBeTruthy();
    expect(screen.getByTestId('task-modal-event-rsvp-avatar-overflow').textContent).toBe('+1');
    expect(screen.getByTestId('task-modal-event-bring').textContent).toMatch(/Water/);
    expect(screen.getByTestId('task-modal-event-people').textContent).toMatch(/RS/);
  });

  it('shows unlimited spots and empty card when unset', () => {
    render(
      <TaskModalEventCanvas
        canWrite={false}
        eventGoing=""
        onEventGoingChange={() => undefined}
        eventCapacity=""
        onEventCapacityChange={() => undefined}
        eventGoingPeople={[]}
        onEventGoingPeopleChange={() => undefined}
        eventBring={[]}
        onEventBringChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('task-modal-event-rsvp-going').textContent).toBe('0 going');
    expect(screen.getByTestId('task-modal-event-rsvp').textContent).toMatch(/Unlimited spots/);
    expect(screen.queryByTestId('task-modal-event-rsvp-progress')).toBeNull();
    expect(screen.getByTestId('task-modal-event-bring-empty')).toBeTruthy();
  });

  it('adds a bring chip via Add', () => {
    const onBring = vi.fn();
    render(
      <TaskModalEventCanvas
        canWrite
        eventGoing="0"
        onEventGoingChange={() => undefined}
        eventCapacity=""
        onEventCapacityChange={() => undefined}
        eventGoingPeople={[]}
        onEventGoingPeopleChange={() => undefined}
        eventBring={['Water']}
        onEventBringChange={onBring}
      />,
    );

    fireEvent.change(screen.getByLabelText('Add item…'), { target: { value: 'Layers' } });
    fireEvent.click(screen.getByTestId('task-modal-event-bring-add'));
    expect(onBring).toHaveBeenCalledWith(['Water', 'Layers']);
  });
});
