import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { CustomIntervalConfig } from '@/lib/workout-factory/interval-timer/custom-interval-config';

import { CustomIntervalLaunchDialog } from './CustomIntervalLaunchDialog';

afterEach(() => {
  cleanup();
});

describe('CustomIntervalLaunchDialog', () => {
  it('seeds work/rest/rounds with Classic HIIT defaults when open', () => {
    render(
      <CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={async () => true} />,
    );

    expect((screen.getByTestId('custom-interval-work-input') as HTMLInputElement).value).toBe('30');
    expect((screen.getByTestId('custom-interval-rest-input') as HTMLInputElement).value).toBe('30');
    expect((screen.getByTestId('custom-interval-rounds-input') as HTMLInputElement).value).toBe(
      '8',
    );
    expect((screen.getByTestId('custom-interval-launch') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('calls onConfirm with edited values on Launch without station_names when blank', async () => {
    const onConfirm = vi.fn(async (_config: CustomIntervalConfig) => true);
    render(<CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('custom-interval-work-input'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByTestId('custom-interval-rest-input'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByTestId('custom-interval-rounds-input'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByTestId('custom-interval-launch'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        interval_preset: 'custom',
      });
    });
    expect(onConfirm.mock.calls[0]?.[0]).not.toHaveProperty('station_names');
  });

  it('passes parsed station_names when stations textarea is filled', async () => {
    const onConfirm = vi.fn(async () => true);
    render(<CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('custom-interval-rounds-input'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('custom-interval-stations-input'), {
      target: { value: 'Burpees, Mountain Climbers\nSquats' },
    });
    fireEvent.click(screen.getByTestId('custom-interval-launch'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          rounds: 3,
          station_names: ['Burpees', 'Mountain Climbers', 'Squats'],
          interval_preset: 'custom',
        }),
      );
    });
  });

  it('disables Launch when work is invalid', () => {
    const onConfirm = vi.fn(async () => true);
    render(<CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('custom-interval-work-input'), {
      target: { value: '0' },
    });

    expect((screen.getByTestId('custom-interval-launch') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('custom-interval-launch'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('allows rest_seconds 0', () => {
    render(
      <CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={async () => true} />,
    );

    fireEvent.change(screen.getByTestId('custom-interval-work-input'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByTestId('custom-interval-rest-input'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByTestId('custom-interval-rounds-input'), {
      target: { value: '6' },
    });

    expect((screen.getByTestId('custom-interval-launch') as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(screen.queryByTestId('custom-interval-active-rest-toggle')).toBeNull();
  });

  it('shows Active Rest toggle when rest > 0 and hides textarea until toggled', () => {
    render(
      <CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={async () => true} />,
    );

    expect(screen.getByTestId('custom-interval-active-rest-toggle')).toBeTruthy();
    expect(screen.queryByTestId('custom-interval-active-rest-input')).toBeNull();
  });

  it('disables Launch when Active Rest is on without names', () => {
    const onConfirm = vi.fn(async () => true);
    render(<CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByTestId('custom-interval-active-rest-toggle'));
    expect(screen.getByTestId('custom-interval-active-rest-input')).toBeTruthy();
    expect((screen.getByTestId('custom-interval-launch') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('custom-interval-launch'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('passes rest_mode active and active_rest_exercises on Launch', async () => {
    const onConfirm = vi.fn(async (_config: CustomIntervalConfig) => true);
    render(<CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('custom-interval-work-input'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByTestId('custom-interval-rest-input'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByTestId('custom-interval-rounds-input'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByTestId('custom-interval-active-rest-toggle'));
    fireEvent.change(screen.getByTestId('custom-interval-active-rest-input'), {
      target: { value: 'Jogging' },
    });
    fireEvent.click(screen.getByTestId('custom-interval-launch'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        interval_preset: 'custom',
        rest_mode: 'active',
        active_rest_exercises: ['Jogging'],
      });
    });
  });

  it('omits active rest fields when toggle is turned off after typing', async () => {
    const onConfirm = vi.fn(async (_config: CustomIntervalConfig) => true);
    render(<CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByTestId('custom-interval-active-rest-toggle'));
    fireEvent.change(screen.getByTestId('custom-interval-active-rest-input'), {
      target: { value: 'Jogging' },
    });
    fireEvent.click(screen.getByTestId('custom-interval-active-rest-toggle'));
    fireEvent.click(screen.getByTestId('custom-interval-launch'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        work_seconds: 30,
        rest_seconds: 30,
        rounds: 8,
        interval_preset: 'custom',
      });
    });
    expect(onConfirm.mock.calls[0]?.[0]).not.toHaveProperty('rest_mode');
    expect(onConfirm.mock.calls[0]?.[0]).not.toHaveProperty('active_rest_exercises');
  });

  it('passes station_names and active_rest_exercises together', async () => {
    const onConfirm = vi.fn(async (_config: CustomIntervalConfig) => true);
    render(<CustomIntervalLaunchDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('custom-interval-stations-input'), {
      target: { value: 'Burpees' },
    });
    fireEvent.click(screen.getByTestId('custom-interval-active-rest-toggle'));
    fireEvent.change(screen.getByTestId('custom-interval-active-rest-input'), {
      target: { value: 'Jogging' },
    });
    fireEvent.click(screen.getByTestId('custom-interval-launch'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          station_names: ['Burpees'],
          rest_mode: 'active',
          active_rest_exercises: ['Jogging'],
          interval_preset: 'custom',
        }),
      );
    });
  });

  it('disables inputs and Launch while submitting', () => {
    render(
      <CustomIntervalLaunchDialog
        open
        onOpenChange={() => {}}
        onConfirm={async () => true}
        submitting
      />,
    );

    expect((screen.getByTestId('custom-interval-work-input') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('custom-interval-rest-input') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('custom-interval-rounds-input') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByTestId('custom-interval-stations-input') as HTMLTextAreaElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId('custom-interval-active-rest-toggle') as HTMLInputElement).disabled,
    ).toBe(true);
    expect((screen.getByTestId('custom-interval-cancel') as HTMLButtonElement).disabled).toBe(true);
    const launch = screen.getByTestId('custom-interval-launch') as HTMLButtonElement;
    expect(launch.disabled).toBe(true);
    expect(launch.textContent).toContain('Launching…');
  });

  it('calls onOpenChange(false) on Cancel', () => {
    const onOpenChange = vi.fn();
    render(
      <CustomIntervalLaunchDialog open onOpenChange={onOpenChange} onConfirm={async () => true} />,
    );

    fireEvent.click(screen.getByTestId('custom-interval-cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
