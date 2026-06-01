import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LiveSessionTopBar } from './LiveSessionTopBar';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';

vi.mock('./SessionHeader', () => ({
  SessionHeader: () => <div data-testid="session-header" />,
}));

vi.mock('./SessionClockMini', () => ({
  SessionClockMini: ({ compact }: { compact?: boolean }) => (
    <div data-testid="session-clock" data-compact={String(Boolean(compact))} />
  ),
}));

vi.mock('./SessionControlsActions', () => ({
  SessionControlsActions: ({ onLeaveDock }: { onLeaveDock?: () => void }) => (
    <div data-testid="session-controls-actions">
      {onLeaveDock ? (
        <button type="button" onClick={onLeaveDock}>
          Exit workout
        </button>
      ) : null}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe('LiveSessionTopBar', () => {
  const baseProps = {
    isSelectingFromBoard: false,
    uiMode: 'live' as const,
    state: initialSessionState,
    actions: {} as never,
  };

  it('renders header, compact center clock, and controls', () => {
    render(<LiveSessionTopBar {...baseProps} />);
    expect(screen.getByTestId('session-header')).toBeTruthy();
    expect(screen.getByTestId('session-clock').getAttribute('data-compact')).toBe('true');
    expect(screen.getByTestId('session-controls-actions')).toBeTruthy();
  });

  it('shows Exit workout when onLeaveDock is provided', () => {
    const onLeaveDock = vi.fn();
    render(<LiveSessionTopBar {...baseProps} onLeaveDock={onLeaveDock} />);
    expect(screen.getByRole('button', { name: /exit workout/i })).toBeTruthy();
  });
});
