import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import EmomTimerOverlay from '@/features/live-video/wrappers/interval/mechanics/EmomTimerOverlay';
import {
  buildInitialEmomMechanicsState,
  type EmomMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import type {
  IntervalSessionEngine,
  IntervalTimerPhase,
} from '@/features/live-video/wrappers/interval/types/interval-engine';

const EMOM_CONFIG = { totalMinutes: 12, intervalSeconds: 60 };

function makeEngine(
  overrides: {
    timerPhase?: IntervalTimerPhase;
    segmentLabel?: string;
    remainingSec?: number;
    totalSec?: number;
    mechanicsState?: EmomMechanicsState | null;
  } = {},
): IntervalSessionEngine {
  return {
    timerPhase: 'work',
    segmentLabel: 'Work',
    remainingSec: 60,
    totalSec: 60,
    mechanicsState: buildInitialEmomMechanicsState(EMOM_CONFIG),
    ...overrides,
  } as IntervalSessionEngine;
}

afterEach(() => {
  cleanup();
});

describe('EmomTimerOverlay', () => {
  it('renders Finished when timerPhase is finished', () => {
    render(
      <EmomTimerOverlay
        engine={makeEngine({
          timerPhase: 'finished',
          segmentLabel: 'Complete',
          remainingSec: 0,
        })}
      />,
    );
    expect(screen.getByText('Finished')).toBeTruthy();
  });

  it('hides minute label during setup and idle', () => {
    const setupState = {
      ...buildInitialEmomMechanicsState(EMOM_CONFIG),
      segment: 'setup' as const,
    };
    const { rerender } = render(
      <EmomTimerOverlay
        engine={makeEngine({ segmentLabel: 'Get Ready', mechanicsState: setupState })}
      />,
    );
    expect(screen.queryByText(/Minute \d+ of \d+/)).toBeNull();

    const idleState = {
      ...buildInitialEmomMechanicsState(EMOM_CONFIG),
      segment: 'idle' as const,
    };
    rerender(
      <EmomTimerOverlay
        engine={makeEngine({ segmentLabel: 'Ready', mechanicsState: idleState })}
      />,
    );
    expect(screen.queryByText(/Minute \d+ of \d+/)).toBeNull();
  });

  it('shows minute label during active minute', () => {
    const minuteState = {
      ...buildInitialEmomMechanicsState(EMOM_CONFIG),
      segment: 'minute' as const,
      minute_index: 3,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <EmomTimerOverlay
        engine={makeEngine({ segmentLabel: 'Work', mechanicsState: minuteState })}
      />,
    );
    expect(screen.getByText('Minute 3 of 12')).toBeTruthy();
  });

  it('formats remainingSec as MM:SS', () => {
    const { rerender } = render(<EmomTimerOverlay engine={makeEngine({ remainingSec: 7 })} />);
    expect(screen.getByText('00:07')).toBeTruthy();

    rerender(<EmomTimerOverlay engine={makeEngine({ remainingSec: 65 })} />);
    expect(screen.getByText('01:05')).toBeTruthy();
  });

  it('exposes aria-live polite on countdown element', () => {
    const { container } = render(<EmomTimerOverlay engine={makeEngine()} />);
    const countdown = container.querySelector('[aria-live="polite"]');
    expect(countdown).not.toBeNull();
    expect(countdown?.textContent).toBe('01:00');
  });

  it('applies minute segment accent on phase label', () => {
    const minuteState = {
      ...buildInitialEmomMechanicsState(EMOM_CONFIG),
      segment: 'minute' as const,
      minute_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <EmomTimerOverlay
        engine={makeEngine({ segmentLabel: 'Work', mechanicsState: minuteState })}
      />,
    );
    const phaseLabel = screen.getByTestId('emom-overlay-phase-label');
    expect(phaseLabel.className).toContain('text-emerald-300');
  });

  it('applies setup segment accent on phase label', () => {
    const setupState = {
      ...buildInitialEmomMechanicsState(EMOM_CONFIG),
      segment: 'setup' as const,
      minute_index: 0,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    render(
      <EmomTimerOverlay
        engine={makeEngine({ segmentLabel: 'Get Ready', mechanicsState: setupState })}
      />,
    );
    const phaseLabel = screen.getByTestId('emom-overlay-phase-label');
    expect(phaseLabel.className).toContain('text-sky-300');
  });

  it('renders progress fill at ~50% when half elapsed', () => {
    const minuteState = {
      ...buildInitialEmomMechanicsState(EMOM_CONFIG),
      segment: 'minute' as const,
      minute_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <EmomTimerOverlay
        engine={makeEngine({
          segmentLabel: 'Work',
          remainingSec: 30,
          totalSec: 60,
          mechanicsState: minuteState,
        })}
      />,
    );
    const fill = screen.getByTestId('emom-overlay-progress-fill');
    expect(fill.getAttribute('style')).toContain('50%');
  });

  it('shows host Pause during minute when controls enabled', () => {
    const minuteState = {
      ...buildInitialEmomMechanicsState(EMOM_CONFIG),
      segment: 'minute' as const,
      minute_index: 2,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <EmomTimerOverlay
        engine={makeEngine({ segmentLabel: 'Work', mechanicsState: minuteState })}
        showHostControls
        canPause
        onPause={vi.fn()}
      />,
    );
    expect(screen.getByTestId('interval-overlay-pause')).toBeTruthy();
  });

  it('renders audio toggle when onToggleAudio is provided', () => {
    const onToggleAudio = vi.fn();
    const { rerender } = render(
      <EmomTimerOverlay engine={makeEngine()} audioEnabled={true} onToggleAudio={onToggleAudio} />,
    );
    expect(screen.getByLabelText('Mute timer sounds')).toBeTruthy();

    rerender(
      <EmomTimerOverlay engine={makeEngine()} audioEnabled={false} onToggleAudio={onToggleAudio} />,
    );
    expect(screen.getByLabelText('Unmute timer sounds')).toBeTruthy();
  });
});
