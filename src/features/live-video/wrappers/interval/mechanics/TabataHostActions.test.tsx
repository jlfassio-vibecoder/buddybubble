import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import TabataHostActions from '@/features/live-video/wrappers/interval/mechanics/TabataHostActions';
import { buildInitialTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

function makeEngine(overrides: Partial<IntervalSessionEngine> = {}): IntervalSessionEngine {
  return {
    timerPhase: 'setup',
    segmentLabel: 'Get Ready',
    remainingSec: 10,
    totalSec: 10,
    mechanicsState: buildInitialTabataMechanicsState({
      totalRounds: 8,
      workSeconds: 30,
      restSeconds: 30,
    }),
    blockSnapshot: null,
    startTimer: async () => {},
    resetTimer: async () => {},
    ...overrides,
  } as IntervalSessionEngine;
}

afterEach(() => {
  cleanup();
});

describe('TabataHostActions', () => {
  it('renders Start timer and Reset during pre-start setup', () => {
    render(<TabataHostActions engine={makeEngine()} />);
    expect(screen.queryByTestId('tabata-host-prestart-chip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('disables Start timer once work segment begins', () => {
    const workState = {
      ...buildInitialTabataMechanicsState({
        totalRounds: 8,
        workSeconds: 30,
        restSeconds: 30,
      }),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataHostActions engine={makeEngine({ timerPhase: 'work', mechanicsState: workState })} />,
    );
    expect(
      (screen.getByRole('button', { name: 'Start timer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
