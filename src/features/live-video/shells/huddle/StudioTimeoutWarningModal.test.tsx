import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudioTimeoutWarningModal } from './StudioTimeoutWarningModal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StudioTimeoutWarningModal', () => {
  it('shows countdown copy and stay action', () => {
    const onStay = vi.fn();
    render(
      <StudioTimeoutWarningModal open warningReason="idle" secondsLeft={27} onStay={onStay} />,
    );

    expect(screen.getByTestId('studio-timeout-warning-modal')).toBeTruthy();
    expect(screen.getByText(/Are you still there/i)).toBeTruthy();
    expect(screen.getByText(/27/)).toBeTruthy();
    expect(screen.getByText(/Session will close automatically/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId('studio-timeout-stay'));
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  it('shows overtime subtitle when reason is overtime', () => {
    render(
      <StudioTimeoutWarningModal open warningReason="overtime" secondsLeft={10} onStay={vi.fn()} />,
    );
    expect(screen.getByText(/estimated session time \(plus buffer\) has ended/i)).toBeTruthy();
  });
});
