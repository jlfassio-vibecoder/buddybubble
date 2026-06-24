import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import TabataTimerOverlay from '@/features/live-video/wrappers/interval/mechanics/TabataTimerOverlay';
import {
  buildInitialTabataMechanicsState,
  type TabataMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type {
  IntervalSessionEngine,
  IntervalTimerPhase,
} from '@/features/live-video/wrappers/interval/types/interval-engine';

const TABATA_CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

function makeEngine(
  overrides: {
    timerPhase?: IntervalTimerPhase;
    segmentLabel?: string;
    remainingSec?: number;
    totalSec?: number;
    mechanicsState?: TabataMechanicsState | null;
  } = {},
): IntervalSessionEngine {
  return {
    timerPhase: 'work',
    segmentLabel: 'Work',
    remainingSec: 20,
    totalSec: 20,
    mechanicsState: buildInitialTabataMechanicsState(TABATA_CONFIG),
    ...overrides,
  } as IntervalSessionEngine;
}

afterEach(() => {
  cleanup();
});

describe('TabataTimerOverlay', () => {
  it('renders Finished when timerPhase is finished', () => {
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          timerPhase: 'finished',
          segmentLabel: 'Complete',
          remainingSec: 0,
        })}
      />,
    );
    expect(screen.getByText('Finished')).toBeTruthy();
  });

  it('hides round label during setup and idle', () => {
    const setupState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'setup' as const,
    };
    const { rerender } = render(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Get Ready', mechanicsState: setupState })}
      />,
    );
    expect(screen.queryByText(/Round \d+ \/ \d+/)).toBeNull();

    const idleState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'idle' as const,
    };
    rerender(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Ready', mechanicsState: idleState })}
      />,
    );
    expect(screen.queryByText(/Round \d+ \/ \d+/)).toBeNull();
  });

  it('shows round label during work', () => {
    const workState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'work' as const,
      round_index: 3,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Work', mechanicsState: workState })}
      />,
    );
    expect(screen.getByText('Round 3 / 8')).toBeTruthy();
  });

  it('formats remainingSec as MM:SS', () => {
    const { rerender } = render(<TabataTimerOverlay engine={makeEngine({ remainingSec: 7 })} />);
    expect(screen.getByText('00:07')).toBeTruthy();

    rerender(<TabataTimerOverlay engine={makeEngine({ remainingSec: 65 })} />);
    expect(screen.getByText('01:05')).toBeTruthy();
  });

  it('exposes aria-live polite on countdown element', () => {
    const { container } = render(<TabataTimerOverlay engine={makeEngine()} />);
    const countdown = container.querySelector('[aria-live="polite"]');
    expect(countdown).not.toBeNull();
    expect(countdown?.textContent).toBe('00:20');
  });

  it('applies work segment accent on phase label', () => {
    const workState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Work', mechanicsState: workState })}
      />,
    );
    const phaseLabel = screen.getByTestId('tabata-overlay-phase-label');
    expect(phaseLabel.className).toContain('text-emerald-300');
  });

  it('applies rest segment accent on phase label', () => {
    const restState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'rest' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:32.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Rest', mechanicsState: restState })}
      />,
    );
    const phaseLabel = screen.getByTestId('tabata-overlay-phase-label');
    expect(phaseLabel.className).toContain('text-amber-300');
  });

  it('renders progress fill at ~50% when half elapsed', () => {
    const workState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          segmentLabel: 'Work',
          remainingSec: 10,
          totalSec: 20,
          mechanicsState: workState,
        })}
      />,
    );
    const fill = screen.getByTestId('tabata-overlay-progress-fill');
    expect(fill.getAttribute('style')).toContain('50%');
  });

  it('renders audio toggle when onToggleAudio is provided', () => {
    const onToggleAudio = vi.fn();
    const { rerender } = render(
      <TabataTimerOverlay
        engine={makeEngine()}
        audioEnabled={true}
        onToggleAudio={onToggleAudio}
      />,
    );
    expect(screen.getByLabelText('Mute timer sounds')).toBeTruthy();

    rerender(
      <TabataTimerOverlay
        engine={makeEngine()}
        audioEnabled={false}
        onToggleAudio={onToggleAudio}
      />,
    );
    expect(screen.getByLabelText('Unmute timer sounds')).toBeTruthy();
  });
});
