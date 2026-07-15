import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import TabataBillboardOverlay from '@/features/live-video/wrappers/interval/mechanics/TabataBillboardOverlay';
import {
  buildInitialTabataMechanicsState,
  type TabataMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type {
  IntervalSessionEngine,
  IntervalTimerPhase,
} from '@/features/live-video/wrappers/interval/types/interval-engine';
import type { ParsedIntervalBlockSnapshot } from '@/features/live-video/wrappers/interval/utils/tabata-block-snapshot';

const PASSIVE_CONFIG = { totalRounds: 4, workSeconds: 30, restSeconds: 15 };

const PASSIVE_EXERCISES = [
  { name: 'Burpees', sets: 2, reps: 10 },
  { name: 'Push-ups', sets: 2, reps: 10 },
];

function passiveBlockSnapshot(
  overrides?: Partial<ParsedIntervalBlockSnapshot['format_params']>,
): ParsedIntervalBlockSnapshot {
  return {
    origin_task_id: 'task-1',
    title: 'Intervals',
    workout_type: null,
    duration_min: null,
    exercises: PASSIVE_EXERCISES,
    block_format: 'tabata',
    format_params: {
      rounds: 2,
      work_seconds: 30,
      rest_seconds: 15,
      ...overrides,
    },
  };
}

function makeMechanics(
  partial: Partial<TabataMechanicsState> & { segment: TabataMechanicsState['segment'] },
): TabataMechanicsState {
  return {
    ...buildInitialTabataMechanicsState(PASSIVE_CONFIG),
    segment_started_at: '2026-07-15T10:00:00.000Z',
    ...partial,
  };
}

function makeEngine(
  overrides: {
    timerPhase?: IntervalTimerPhase;
    remainingSec?: number;
    totalSec?: number;
    mechanicsState?: TabataMechanicsState | null;
    blockSnapshot?: ParsedIntervalBlockSnapshot | null;
  } = {},
): IntervalSessionEngine {
  return {
    timerPhase: 'work',
    segmentLabel: 'Work',
    remainingSec: 30,
    totalSec: 30,
    mechanicsState: buildInitialTabataMechanicsState(PASSIVE_CONFIG),
    blockSnapshot: passiveBlockSnapshot(),
    ...overrides,
  } as IntervalSessionEngine;
}

afterEach(() => {
  cleanup();
});

describe('TabataBillboardOverlay', () => {
  it('renders nothing for idle mechanics', () => {
    render(
      <TabataBillboardOverlay
        engine={makeEngine({
          mechanicsState: makeMechanics({ segment: 'idle', round_index: 0 }),
        })}
      />,
    );
    expect(screen.queryByTestId('tabata-billboard-overlay')).toBeNull();
  });

  it('renders nothing for done mechanics', () => {
    render(
      <TabataBillboardOverlay
        engine={makeEngine({
          mechanicsState: makeMechanics({ segment: 'done', round_index: 4 }),
        })}
      />,
    );
    expect(screen.queryByTestId('tabata-billboard-overlay')).toBeNull();
  });

  it('shows first exercise name during setup without Next prefix', () => {
    render(
      <TabataBillboardOverlay
        engine={makeEngine({
          totalSec: 10,
          remainingSec: 10,
          mechanicsState: makeMechanics({ segment: 'setup', round_index: 0 }),
        })}
      />,
    );
    expect(screen.getByTestId('tabata-billboard-name').textContent).toBe('Burpees');
    expect(screen.queryByTestId('tabata-billboard-prefix')).toBeNull();
  });

  it('shows work name when elapsed is under 3s', () => {
    render(
      <TabataBillboardOverlay
        engine={makeEngine({
          totalSec: 30,
          remainingSec: 28,
          mechanicsState: makeMechanics({ segment: 'work', round_index: 1 }),
        })}
      />,
    );
    expect(screen.getByTestId('tabata-billboard-name').textContent).toBe('Burpees');
  });

  it('hides work billboard when elapsed is past 3s fade', () => {
    render(
      <TabataBillboardOverlay
        engine={makeEngine({
          totalSec: 30,
          remainingSec: 26,
          mechanicsState: makeMechanics({ segment: 'work', round_index: 1 }),
        })}
      />,
    );
    expect(screen.queryByTestId('tabata-billboard-overlay')).toBeNull();
  });

  it('shows Next prefix and look-ahead name during passive rest', () => {
    render(
      <TabataBillboardOverlay
        engine={makeEngine({
          totalSec: 15,
          remainingSec: 10,
          mechanicsState: makeMechanics({ segment: 'rest', round_index: 1 }),
        })}
      />,
    );
    expect(screen.getByTestId('tabata-billboard-prefix').textContent).toBe('Next:');
    expect(screen.getByTestId('tabata-billboard-name').textContent).toBe('Push-ups');
  });

  it('hides billboard on last passive rest before done', () => {
    render(
      <TabataBillboardOverlay
        engine={makeEngine({
          totalSec: 15,
          remainingSec: 10,
          mechanicsState: makeMechanics({
            segment: 'rest',
            round_index: 4,
            total_rounds: 4,
          }),
        })}
      />,
    );
    expect(screen.queryByTestId('tabata-billboard-overlay')).toBeNull();
  });

  describe('active rest Hi/Low', () => {
    const activeSnapshot = (): ParsedIntervalBlockSnapshot =>
      passiveBlockSnapshot({
        work_seconds: 45,
        rest_seconds: 15,
        rest_mode: 'active',
        active_rest_exercises: ['Jogging'],
      });

    it('shows bare high name on work before 5s fade', () => {
      render(
        <TabataBillboardOverlay
          engine={makeEngine({
            totalSec: 45,
            remainingSec: 41,
            blockSnapshot: {
              ...activeSnapshot(),
              exercises: [{ name: 'Burpees', sets: 4 }],
            },
            mechanicsState: makeMechanics({
              segment: 'work',
              round_index: 1,
              work_seconds: 45,
              rest_seconds: 15,
            }),
          })}
        />,
      );
      expect(screen.getByTestId('tabata-billboard-name').textContent).toBe('Burpees');
      expect(screen.queryByTestId('tabata-billboard-prefix')).toBeNull();
    });

    it('hides work billboard after 5s fade', () => {
      render(
        <TabataBillboardOverlay
          engine={makeEngine({
            totalSec: 45,
            remainingSec: 39,
            blockSnapshot: {
              ...activeSnapshot(),
              exercises: [{ name: 'Burpees', sets: 4 }],
            },
            mechanicsState: makeMechanics({
              segment: 'work',
              round_index: 1,
              work_seconds: 45,
              rest_seconds: 15,
            }),
          })}
        />,
      );
      expect(screen.queryByTestId('tabata-billboard-overlay')).toBeNull();
    });

    it('shows bare low name on rest before 5s fade', () => {
      render(
        <TabataBillboardOverlay
          engine={makeEngine({
            totalSec: 15,
            remainingSec: 11,
            blockSnapshot: {
              ...activeSnapshot(),
              exercises: [{ name: 'Burpees', sets: 4 }],
            },
            mechanicsState: makeMechanics({
              segment: 'rest',
              round_index: 1,
              work_seconds: 45,
              rest_seconds: 15,
            }),
          })}
        />,
      );
      expect(screen.getByTestId('tabata-billboard-name').textContent).toBe('Jogging');
      expect(screen.queryByTestId('tabata-billboard-prefix')).toBeNull();
    });

    it('hides rest billboard after 5s fade', () => {
      render(
        <TabataBillboardOverlay
          engine={makeEngine({
            totalSec: 15,
            remainingSec: 9,
            blockSnapshot: {
              ...activeSnapshot(),
              exercises: [{ name: 'Burpees', sets: 4 }],
            },
            mechanicsState: makeMechanics({
              segment: 'rest',
              round_index: 1,
              work_seconds: 45,
              rest_seconds: 15,
            }),
          })}
        />,
      );
      expect(screen.queryByTestId('tabata-billboard-overlay')).toBeNull();
    });
  });
});
