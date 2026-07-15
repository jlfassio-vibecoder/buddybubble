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
import type { ParsedIntervalBlockSnapshot } from '@/features/live-video/wrappers/interval/utils/tabata-block-snapshot';

const TABATA_CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

const CIRCUIT_EXERCISES = [
  { name: 'Burpees', sets: 3, reps: 10 },
  { name: 'Mountain Climbers', sets: 3, reps: 10 },
  { name: 'Jump Squats', sets: 3, reps: 10 },
  { name: 'Push-ups', sets: 3, reps: 10 },
];

function circuitBlockSnapshot(): ParsedIntervalBlockSnapshot {
  return {
    origin_task_id: 'task-1',
    title: 'Finisher',
    workout_type: null,
    duration_min: null,
    exercises: CIRCUIT_EXERCISES,
    block_format: 'tabata',
    format_params: {
      rounds: 3,
      work_seconds: 30,
      rest_seconds: 30,
      interval_preset: 'classic_hiit',
    },
  };
}

function makeEngine(
  overrides: {
    timerPhase?: IntervalTimerPhase;
    segmentLabel?: string;
    remainingSec?: number;
    totalSec?: number;
    mechanicsState?: TabataMechanicsState | null;
    blockSnapshot?: ParsedIntervalBlockSnapshot | null;
  } = {},
): IntervalSessionEngine {
  return {
    timerPhase: 'work',
    segmentLabel: 'Work',
    remainingSec: 20,
    totalSec: 20,
    mechanicsState: buildInitialTabataMechanicsState(TABATA_CONFIG),
    blockSnapshot: null,
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

  it('hides subtitle during setup and idle', () => {
    const setupState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'setup' as const,
    };
    const { rerender } = render(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Get Ready', mechanicsState: setupState })}
      />,
    );
    expect(screen.queryByTestId('tabata-overlay-subtitle')).toBeNull();

    const idleState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'idle' as const,
    };
    rerender(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Ready', mechanicsState: idleState })}
      />,
    );
    expect(screen.queryByTestId('tabata-overlay-subtitle')).toBeNull();
  });

  it('shows dynamic subtitle for single-exercise work segment', () => {
    const workState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'work' as const,
      round_index: 3,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          segmentLabel: 'Work',
          mechanicsState: workState,
          blockSnapshot: {
            origin_task_id: 'task-1',
            title: 'Tabata',
            workout_type: null,
            duration_min: null,
            exercises: [{ name: 'Squat', sets: 8, reps: 10 }],
            block_format: 'tabata',
            format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
          },
        })}
      />,
    );
    expect(screen.getByTestId('tabata-overlay-subtitle').textContent).toBe('Round 3 of 8 · Squat');
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

  it('shows host Pause during work when controls enabled', () => {
    const workState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Work', mechanicsState: workState })}
        showHostControls
        canPause
        onPause={vi.fn()}
      />,
    );
    expect(screen.getByTestId('interval-overlay-pause')).toBeTruthy();
    expect(screen.queryByTestId('interval-overlay-resume')).toBeNull();
  });

  it('shows host Resume when paused and hides Pause when finished', () => {
    const pausedState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
      is_paused: true as const,
      elapsed_in_segment: 8,
    };
    const { rerender } = render(
      <TabataTimerOverlay
        engine={makeEngine({ segmentLabel: 'Paused', mechanicsState: pausedState })}
        showHostControls
        canResume
        onResume={vi.fn()}
      />,
    );
    expect(screen.getByTestId('interval-overlay-resume')).toBeTruthy();

    rerender(
      <TabataTimerOverlay
        engine={makeEngine({ timerPhase: 'finished', segmentLabel: 'Complete' })}
        showHostControls={false}
        canPause={false}
        onPause={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('interval-overlay-pause')).toBeNull();
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

  it('falls back to Tabata header when format_params is missing (legacy sessions)', () => {
    const workState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({ blockSnapshot: null, mechanicsState: workState })}
      />,
    );
    expect(screen.getByTestId('tabata-overlay-header-label').textContent).toBe('Tabata');
    expect(screen.getByTestId('tabata-overlay-subtitle').textContent).toBe('Round 1 of 8');
  });

  it('renders Classic HIIT header with dynamic subtitle for single exercise', () => {
    const workState = {
      ...buildInitialTabataMechanicsState({ totalRounds: 8, workSeconds: 30, restSeconds: 30 }),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          mechanicsState: workState,
          blockSnapshot: {
            origin_task_id: 'task-1',
            title: 'Finisher',
            workout_type: null,
            duration_min: null,
            exercises: [{ name: 'Squat', sets: 8, reps: 10 }],
            block_format: 'tabata',
            format_params: {
              rounds: 8,
              work_seconds: 30,
              rest_seconds: 30,
              interval_preset: 'classic_hiit',
            },
          },
        })}
      />,
    );
    expect(screen.getByTestId('tabata-overlay-header-label').textContent).toBe('Classic HIIT');
    expect(screen.getByTestId('tabata-overlay-subtitle').textContent).toBe('Round 1 of 8 · Squat');
  });

  it('renders Intervals header for custom W/R preset parameters', () => {
    const workState = {
      ...buildInitialTabataMechanicsState({ totalRounds: 6, workSeconds: 45, restSeconds: 15 }),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          mechanicsState: workState,
          blockSnapshot: {
            origin_task_id: 'task-1',
            title: 'Finisher',
            workout_type: null,
            duration_min: null,
            exercises: [{ name: 'Squat', sets: 6, reps: 10 }],
            block_format: 'tabata',
            format_params: {
              rounds: 6,
              work_seconds: 45,
              rest_seconds: 15,
              interval_preset: 'custom',
            },
          },
        })}
      />,
    );
    expect(screen.getByTestId('tabata-overlay-header-label').textContent).toBe('Intervals');
    expect(screen.getByTestId('tabata-overlay-subtitle').textContent).toBe('Round 1 of 6 · Squat');
  });

  it('renders dynamic circuit subtitle with active exercise name', () => {
    const workState = {
      ...buildInitialTabataMechanicsState({ totalRounds: 12, workSeconds: 30, restSeconds: 30 }),
      segment: 'work' as const,
      round_index: 2,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          mechanicsState: workState,
          blockSnapshot: circuitBlockSnapshot(),
        })}
      />,
    );
    expect(screen.getByTestId('tabata-overlay-subtitle').textContent).toBe(
      'Round 2 of 12 · Mountain Climbers',
    );
  });

  it('hides circuit subtitle during setup', () => {
    const setupState = {
      ...buildInitialTabataMechanicsState({ totalRounds: 12, workSeconds: 30, restSeconds: 30 }),
      segment: 'setup' as const,
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          mechanicsState: setupState,
          blockSnapshot: circuitBlockSnapshot(),
        })}
      />,
    );
    expect(screen.queryByTestId('tabata-overlay-subtitle')).toBeNull();
  });

  it('shows ACTIVE REST phase and active rest exercise during rest', () => {
    const restState = {
      ...buildInitialTabataMechanicsState({ totalRounds: 6, workSeconds: 45, restSeconds: 15 }),
      segment: 'rest' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:32.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          segmentLabel: 'Rest',
          mechanicsState: restState,
          blockSnapshot: {
            title: 'Custom Interval',
            workout_type: null,
            duration_min: null,
            exercises: [{ name: 'Burpees', sets: 6, reps: 10 }],
            block_format: 'tabata',
            format_params: {
              rounds: 6,
              work_seconds: 45,
              rest_seconds: 15,
              interval_preset: 'custom',
              rest_mode: 'active',
              active_rest_exercises: ['Jogging'],
            },
          },
        })}
      />,
    );
    expect(screen.getByTestId('tabata-overlay-phase-label').textContent).toBe('ACTIVE REST');
    expect(screen.getByTestId('tabata-overlay-subtitle').textContent).toBe(
      'Round 1 of 6 · Jogging',
    );
    expect(screen.getByTestId('tabata-overlay-phase-label').className).toContain('text-amber-300');
  });

  it('keeps REST phase for passive rest without active_rest keys', () => {
    const restState = {
      ...buildInitialTabataMechanicsState(TABATA_CONFIG),
      segment: 'rest' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:32.000Z',
    };
    render(
      <TabataTimerOverlay
        engine={makeEngine({
          segmentLabel: 'Rest',
          mechanicsState: restState,
          blockSnapshot: {
            title: 'Strict Tabata',
            workout_type: null,
            duration_min: null,
            exercises: [{ name: 'Movement', sets: 8, reps: 10 }],
            block_format: 'tabata',
            format_params: {
              rounds: 8,
              work_seconds: 20,
              rest_seconds: 10,
              interval_preset: 'tabata',
            },
          },
        })}
      />,
    );
    expect(screen.getByTestId('tabata-overlay-phase-label').textContent).toBe('REST');
    expect(screen.getByTestId('tabata-overlay-subtitle').textContent).toBe(
      'Round 1 of 8 · Movement',
    );
  });
});
