import type { AmrapTimerEngineState } from '@/lib/workout-factory/interval-timer/amrap-timer-engine';
import type { EmomTimerEngineState } from '@/lib/workout-factory/interval-timer/emom-timer-engine';
import type { IntervalTimerEngineState } from '@/lib/workout-factory/interval-timer/types';

export type IntervalEngineState =
  | { format: 'tabata'; state: IntervalTimerEngineState }
  | { format: 'emom'; state: EmomTimerEngineState }
  | { format: 'amrap'; state: AmrapTimerEngineState };

export function enginesEqual(a: IntervalEngineState, b: IntervalEngineState): boolean {
  if (a.format !== b.format) return false;
  if (a.format === 'tabata' && b.format === 'tabata') {
    return (
      a.state.phase === b.state.phase &&
      a.state.roundIndex === b.state.roundIndex &&
      a.state.pausedAtMs === b.state.pausedAtMs &&
      a.state.phaseAnchorMs === b.state.phaseAnchorMs
    );
  }
  if (a.format === 'emom' && b.format === 'emom') {
    return (
      a.state.phase === b.state.phase &&
      a.state.roundIndex === b.state.roundIndex &&
      a.state.pausedAtMs === b.state.pausedAtMs &&
      a.state.phaseAnchorMs === b.state.phaseAnchorMs
    );
  }
  if (a.format === 'amrap' && b.format === 'amrap') {
    return (
      a.state.phase === b.state.phase &&
      a.state.pausedAtMs === b.state.pausedAtMs &&
      a.state.phaseAnchorMs === b.state.phaseAnchorMs
    );
  }
  return false;
}
