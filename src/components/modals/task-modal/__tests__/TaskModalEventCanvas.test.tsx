import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalEventCanvas } from '@/components/modals/task-modal/TaskModalEventCanvas';

const baseProps = {
  canWrite: true,
  eventCapacity: '30',
  onEventCapacityChange: () => undefined,
  eventBring: ['Water', 'Trail shoes'] as string[],
  onEventBringChange: () => undefined,
  eventCost: 'Free',
  onEventCostChange: () => undefined,
  goingCount: 12,
  rsvpPeople: [
    { id: '1', displayName: 'Riley S', avatarUrl: null },
    { id: '2', displayName: 'Taylor L', avatarUrl: null },
    { id: '3', displayName: 'Jordan F', avatarUrl: null },
    { id: '4', displayName: 'Morgan K', avatarUrl: null },
    { id: '5', displayName: 'You', avatarUrl: null },
    { id: '6', displayName: 'Alex B', avatarUrl: null },
  ],
  isGoing: false,
  onToggleGoing: () => undefined,
};

describe('TaskModalEventCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders ledger RSVP count, spots left, bring chips, and avatar overflow', () => {
    render(<TaskModalEventCanvas {...baseProps} />);

    expect(screen.getByTestId('task-modal-event-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-event-cost')).toBeTruthy();
    expect(screen.getByTestId('task-modal-event-rsvp-going').textContent).toBe('12 going');
    expect(screen.getByTestId('task-modal-event-rsvp').textContent).toMatch(/18 spots left/);
    expect(screen.getByTestId('task-modal-event-rsvp-progress')).toBeTruthy();
    expect(screen.getByTestId('task-modal-event-rsvp-avatar-overflow').textContent).toBe('+1');
    expect(screen.getByTestId('task-modal-event-bring').textContent).toMatch(/Water/);
    expect(screen.getByTestId('task-modal-event-im-going').textContent).toMatch(/I’m going/);
    expect(screen.queryByTestId('task-modal-event-going-input')).toBeNull();
    expect(screen.queryByTestId('task-modal-event-people')).toBeNull();
  });

  it('shows unlimited spots and Not going when enrolled', () => {
    render(
      <TaskModalEventCanvas
        {...baseProps}
        canWrite={false}
        eventCapacity=""
        goingCount={0}
        rsvpPeople={[]}
        isGoing
        eventBring={[]}
        eventCost=""
      />,
    );

    expect(screen.getByTestId('task-modal-event-rsvp-going').textContent).toBe('0 going');
    expect(screen.getByTestId('task-modal-event-rsvp').textContent).toMatch(/Unlimited spots/);
    expect(screen.queryByTestId('task-modal-event-rsvp-progress')).toBeNull();
    expect(screen.getByTestId('task-modal-event-bring-empty')).toBeTruthy();
    expect(screen.getByTestId('task-modal-event-im-going').textContent).toMatch(/Not going/);
  });

  it('adds a bring chip via Add', () => {
    const onBring = vi.fn();
    render(
      <TaskModalEventCanvas
        {...baseProps}
        goingCount={0}
        rsvpPeople={[]}
        eventBring={['Water']}
        onEventBringChange={onBring}
        eventCapacity=""
        eventCost=""
      />,
    );

    fireEvent.change(screen.getByLabelText('Add item…'), { target: { value: 'Layers' } });
    fireEvent.click(screen.getByTestId('task-modal-event-bring-add'));
    expect(onBring).toHaveBeenCalledWith(['Water', 'Layers']);
  });

  it('disables I’m going when at capacity or create-mode disabled', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <TaskModalEventCanvas
        {...baseProps}
        goingCount={30}
        rsvpPeople={[]}
        eventCapacity="30"
        onToggleGoing={onToggle}
      />,
    );
    expect((screen.getByTestId('task-modal-event-im-going') as HTMLButtonElement).disabled).toBe(
      true,
    );

    rerender(
      <TaskModalEventCanvas
        {...baseProps}
        goingCount={2}
        rsvpPeople={[]}
        goingDisabled
        onToggleGoing={onToggle}
      />,
    );
    expect((screen.getByTestId('task-modal-event-im-going') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('toggles I’m going when enabled', () => {
    const onToggle = vi.fn();
    render(
      <TaskModalEventCanvas
        {...baseProps}
        goingCount={2}
        rsvpPeople={[]}
        onToggleGoing={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('task-modal-event-im-going'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
