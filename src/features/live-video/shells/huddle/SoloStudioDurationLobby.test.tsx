import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SoloStudioDurationLobby } from './SoloStudioDurationLobby';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SoloStudioDurationLobby', () => {
  it('keeps Enter studio disabled until a duration is selected', () => {
    const onConfirm = vi.fn();
    render(<SoloStudioDurationLobby onConfirm={onConfirm} onCancel={vi.fn()} />);

    const enter = screen.getByTestId('solo-studio-enter') as HTMLButtonElement;
    expect(enter.disabled).toBe(true);
    fireEvent.click(enter);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms with the selected preset', () => {
    const onConfirm = vi.fn();
    render(<SoloStudioDurationLobby onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByTestId('solo-studio-duration-30'));
    const enter = screen.getByTestId('solo-studio-enter') as HTMLButtonElement;
    expect(enter.disabled).toBe(false);
    fireEvent.click(enter);
    expect(onConfirm).toHaveBeenCalledWith(30);
  });

  it('disables Enter when errorMessage is set', () => {
    const onConfirm = vi.fn();
    render(
      <SoloStudioDurationLobby
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        errorMessage="Could not create live session."
        onRetryCreate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('solo-studio-duration-15'));
    expect((screen.getByTestId('solo-studio-enter') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Could not create live session.');
  });
});
