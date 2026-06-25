import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { TabataFormatParamsEditor } from '@/components/fitness/TabataFormatParamsEditor';
import { applyIntervalPreset } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';

afterEach(() => {
  cleanup();
});

describe('TabataFormatParamsEditor', () => {
  it('applies Classic HIIT preset when chip is clicked', () => {
    const onChange = vi.fn();
    render(<TabataFormatParamsEditor params={applyIntervalPreset('tabata')} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('tabata-preset-classic_hiit'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        work_seconds: 30,
        rest_seconds: 30,
        interval_preset: 'classic_hiit',
      }),
    );
  });

  it('recalculates rest when work changes with locked ratio', () => {
    const onChange = vi.fn();
    render(
      <TabataFormatParamsEditor
        params={{ ...applyIntervalPreset('classic_hiit'), interval_preset: 'custom' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId('tabata-ratio-select'), { target: { value: '1:1' } });
    fireEvent.change(screen.getByTestId('tabata-work-input'), { target: { value: '40' } });

    const lastCall = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastCall.work_seconds).toBe(40);
    expect(lastCall.rest_seconds).toBe(40);
  });

  it('marks custom when rest is edited manually', () => {
    const onChange = vi.fn();
    render(
      <TabataFormatParamsEditor params={applyIntervalPreset('classic_hiit')} onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId('tabata-rest-unlock'));
    fireEvent.change(screen.getByTestId('tabata-rest-input'), { target: { value: '25' } });

    const lastCall = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastCall.rest_seconds).toBe(25);
    expect(lastCall.interval_preset).toBe('custom');
  });

  it('shows duration preview for tabata 20/10 x 8', () => {
    render(<TabataFormatParamsEditor params={applyIntervalPreset('tabata')} onChange={vi.fn()} />);

    const preview = screen.getByTestId('tabata-params-preview');
    expect(preview.textContent).toContain('Tabata · 8 Rounds (20/10s)');
    expect(preview.textContent).toContain('total');
    expect(preview.textContent).toContain('GET READY');
  });

  it('does not emit NaN when work input is temporarily invalid', () => {
    const onChange = vi.fn();
    render(
      <TabataFormatParamsEditor params={applyIntervalPreset('classic_hiit')} onChange={onChange} />,
    );

    fireEvent.change(screen.getByTestId('tabata-work-input'), { target: { value: '-' } });

    const lastCall = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Number.isNaN(lastCall.work_seconds)).toBe(false);
  });
});
