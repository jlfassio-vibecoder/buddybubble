import type { TabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import type { AmrapTimerSnapshot } from '@/lib/workout-factory/interval-timer/amrap-timer-engine';

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

/** BlockList → WorkoutPlayerExercisePanel active row contract (Tabata + EMOM + AMRAP). */
export type IntervalRowSnapshot = {
  roundIndex: number;
  activeSetPhase: 'work' | 'rest' | 'prepare' | 'paused';
  /** EMOM alternating only — 0-based exercise indices within block */
  activeStationIndices?: number[];
  /** AMRAP-only — elapsed seconds within the block time cap. */
  elapsedInBlockSec?: number;
};

export function intervalTimerSnapshotToRowSnapshot(
  snapshot: IntervalTimerSnapshot,
): IntervalRowSnapshot | null {
  if (snapshot.phase === 'idle' || snapshot.phase === 'done') return null;
  if (snapshot.phase === 'paused') {
    return { roundIndex: snapshot.roundIndex, activeSetPhase: 'paused' };
  }
  if (snapshot.phase === 'work' || snapshot.phase === 'rest' || snapshot.phase === 'prepare') {
    return { roundIndex: snapshot.roundIndex, activeSetPhase: snapshot.phase };
  }
  return null;
}

export function amrapTimerSnapshotToRowSnapshot(
  snapshot: AmrapTimerSnapshot,
): IntervalRowSnapshot | null {
  if (snapshot.phase === 'idle' || snapshot.phase === 'done') return null;
  return {
    roundIndex: 0,
    activeSetPhase: snapshot.phase === 'paused' ? 'paused' : 'work',
    elapsedInBlockSec: Math.round(snapshot.elapsedMs / 1000),
  };
}
