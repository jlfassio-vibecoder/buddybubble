import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkoutQueueRegion } from './WorkoutQueueRegion';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';

vi.mock('@/features/live-video/shells/huddle/SessionDeckBuilder', () => ({
  SessionDeckBuilder: ({ isCollapsed }: { isCollapsed?: boolean }) => (
    <div data-testid="deck-builder" data-collapsed={String(Boolean(isCollapsed))} />
  ),
}));

afterEach(() => {
  cleanup();
});

function collapsedAttr(el: HTMLElement): string | null {
  return el.getAttribute('data-collapsed');
}

describe('WorkoutQueueRegion', () => {
  it('starts open in builder lobby and collapsed in live lobby', () => {
    const { rerender } = render(
      <WorkoutQueueRegion
        state={{ ...initialSessionState, phase: 'lobby' }}
        uiMode="builder"
        selectingFromBoard={false}
      />,
    );
    expect(collapsedAttr(screen.getByTestId('deck-builder'))).toBe('false');

    rerender(
      <WorkoutQueueRegion
        state={{ ...initialSessionState, phase: 'lobby' }}
        uiMode="live"
        selectingFromBoard={false}
      />,
    );
    expect(collapsedAttr(screen.getByTestId('deck-builder'))).toBe('true');
  });

  it('allows manual toggle until uiMode changes', () => {
    render(
      <WorkoutQueueRegion
        state={{ ...initialSessionState, phase: 'lobby' }}
        uiMode="live"
        selectingFromBoard={false}
      />,
    );

    expect(collapsedAttr(screen.getByTestId('deck-builder'))).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /show workout queue/i }));
    expect(collapsedAttr(screen.getByTestId('deck-builder'))).toBe('false');
  });
});
