import type { TabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';

export type IntervalTimerPhase = 'idle' | 'prepare' | 'work' | 'rest' | 'done' | 'paused';

export type IntervalTimerConfig = TabataTimerConfig;

export type IntervalTimerEngineState = {
  config: IntervalTimerConfig;
  phase: IntervalTimerPhase;
  /** 0-based; indexes WORK phase within totalRounds */
  roundIndex: number;
  phaseAnchorMs: number | null;
  pausedTotalMs: number;
  pausedAtMs: number | null;
  /** Phase to restore on resume */
  pausedFromPhase: 'prepare' | 'work' | 'rest' | null;
};

export type IntervalTimerSnapshot = {
  phase: IntervalTimerPhase;
  roundIndex: number;
  remainingMs: number;
  phaseDurationMs: number;
  isRunning: boolean;
  isPaused: boolean;
  totalRounds: number;
  displayRound: number;
};

export type IntervalTimerAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'reset' }
  | { type: 'tick'; now: number };
